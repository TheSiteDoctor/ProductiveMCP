/**
 * Task template MCP tools
 *
 * Templates are JSON files describing a reusable set of task lists and
 * (nested) tasks — e.g. the standard delivery tickets for a new project.
 * Applying a template creates the whole structure in a target project.
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Task,
  TaskList,
  Board,
  CreateTaskPayload,
  CreateTaskListPayload,
} from "../types.js";
import {
  formatResponse,
  truncateResponse,
  markdownToHtml,
} from "../utils/formatting.js";
import {
  ListTaskTemplatesSchema,
  GetTaskTemplateSchema,
  ApplyTaskTemplateSchema,
  type TaskTemplate,
  type TemplateTask,
} from "../schemas/template.js";
import {
  loadTemplates,
  loadTemplate,
  resolveVariables,
  substituteTemplate,
  countTasks,
  totalEstimateMinutes,
  getTemplatesDir,
} from "../utils/templates.js";
import { resolveLabelOptionIds } from "./tasks.js";
import {
  CUSTOM_FIELD_IDS,
  TASK_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
} from "../constants.js";

/** Format minutes as a compact human-readable duration (e.g. "1h 30m"). */
function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * List available task templates
 */
export async function listTaskTemplates(
  args: z.infer<typeof ListTaskTemplatesSchema>,
): Promise<string> {
  const { templates, errors } = loadTemplates();

  const summaries = templates.map(({ template, filePath }) => ({
    name: template.name,
    title: template.title,
    description: template.description,
    task_lists: template.task_lists.length,
    tasks: countTasks(template),
    total_estimate_minutes: totalEstimateMinutes(template),
    variables: (template.variables || []).map((v) => v.name),
    file: filePath,
  }));

  const result = formatResponse(
    { templates: summaries, errors },
    args.response_format,
    () => {
      const lines: string[] = [
        `# Task Templates (${summaries.length})`,
        "",
        `Directory: ${getTemplatesDir()}`,
        "",
      ];
      if (summaries.length === 0) {
        lines.push("No templates found.");
      }
      for (const s of summaries) {
        lines.push(`## ${s.title} (\`${s.name}\`)`);
        if (s.description) lines.push(s.description);
        lines.push(
          `- ${s.task_lists} task list(s), ${s.tasks} task(s), estimate ${formatMinutes(s.total_estimate_minutes)}`,
        );
        if (s.variables.length > 0) {
          lines.push(`- Variables: ${s.variables.join(", ")}`);
        }
        lines.push("");
      }
      if (errors.length > 0) {
        lines.push("## Load errors", "");
        for (const err of errors) lines.push(`- ${err}`);
      }
      return lines.join("\n");
    },
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single template, showing its structure and variables
 */
export async function getTaskTemplate(
  args: z.infer<typeof GetTaskTemplateSchema>,
): Promise<string> {
  const { template } = loadTemplate(args.template);

  const result = formatResponse(template, args.response_format, () => {
    const lines: string[] = [
      `# ${template.title} (\`${template.name}\`)`,
      "",
    ];
    if (template.description) lines.push(template.description, "");

    const variables = template.variables || [];
    if (variables.length > 0) {
      lines.push("## Variables", "");
      for (const v of variables) {
        const parts = [`\`${v.name}\``];
        if (v.description) parts.push(`— ${v.description}`);
        if (v.default !== undefined) parts.push(`(default: "${v.default}")`);
        lines.push(`- ${parts.join(" ")}`);
      }
      lines.push("");
    }

    lines.push(
      `## Structure (${countTasks(template)} tasks, estimate ${formatMinutes(totalEstimateMinutes(template))})`,
      "",
    );

    const renderTask = (task: TemplateTask, depth: number): void => {
      const indent = "  ".repeat(depth);
      const extras: string[] = [];
      if (task.milestone) extras.push("Milestone");
      if (task.estimate_minutes) {
        extras.push(formatMinutes(task.estimate_minutes));
      }
      if (task.task_type) extras.push(task.task_type);
      if (task.priority) extras.push(task.priority);
      const suffix = extras.length > 0 ? ` _(${extras.join(", ")})_` : "";
      lines.push(`${indent}- ${task.title}${suffix}`);
      for (const sub of task.subtasks || []) renderTask(sub, depth + 1);
    };

    for (const list of template.task_lists) {
      lines.push(`### ${list.name}`, "");
      for (const task of list.tasks) renderTask(task, 0);
      lines.push("");
    }

    return lines.join("\n");
  });

  return truncateResponse(result, args.response_format);
}

interface AppliedTaskResult {
  title: string;
  task_list: string;
  depth: number;
  status: "created" | "failed" | "skipped";
  task_id?: string;
  url?: string;
  error?: string;
}

interface AppliedListResult {
  name: string;
  task_list_id?: string;
  reused: boolean;
  error?: string;
}

/**
 * Apply a template to a project: create its task lists (or reuse existing
 * ones with the same name) and every task and subtask within them.
 */
export async function applyTaskTemplate(
  client: ProductiveClient,
  args: z.infer<typeof ApplyTaskTemplateSchema>,
): Promise<string> {
  const { template: rawTemplate } = loadTemplate(args.template);
  const values = resolveVariables(rawTemplate, args.variables);
  const template = substituteTemplate(rawTemplate, values);

  if (args.dry_run) {
    return dryRunReport(template, values, args);
  }

  // Fetch active task lists once so same-named lists can be reused
  const existingLists = new Map<string, string>(); // lowercase name → id
  if (args.reuse_existing_task_lists) {
    const response = await client.get<JSONAPIResponse>("/task_lists", {
      "filter[project_id]": args.project_id,
      "filter[status]": "1",
    });
    const lists = Array.isArray(response.data)
      ? response.data
      : [response.data];
    for (const list of lists) {
      const taskList = list as TaskList;
      const name = taskList.attributes?.name;
      if (name && taskList.id && !existingLists.has(name.toLowerCase())) {
        existingLists.set(name.toLowerCase(), taskList.id);
      }
    }
  }

  // Board is only needed when a task list has to be created
  let boardId: string | undefined = args.board_id;
  const getBoardId = async (): Promise<string> => {
    if (boardId) return boardId;
    const response = await client.get<JSONAPIResponse>("/boards", {
      "filter[project_id]": args.project_id,
    });
    const boards = Array.isArray(response.data)
      ? response.data
      : [response.data];
    if (boards.length === 0) {
      throw new Error(
        "Project has no boards. Please create a board first in Productive.",
      );
    }
    boardId = (boards[0] as Board).id;
    return boardId;
  };

  const listResults: AppliedListResult[] = [];
  const taskResults: AppliedTaskResult[] = [];
  const today = new Date();

  const createOneTask = async (
    task: TemplateTask,
    taskListId: string,
    taskListName: string,
    parentTaskId: string | undefined,
    depth: number,
  ): Promise<void> => {
    let createdId: string | undefined;
    try {
      const payload: CreateTaskPayload = {
        data: {
          type: "tasks",
          attributes: { title: task.title },
          relationships: {
            project: { data: { type: "projects", id: args.project_id } },
            task_list: { data: { type: "task_lists", id: taskListId } },
          },
        },
      };

      if (task.description) {
        payload.data.attributes.description = markdownToHtml(task.description);
      }
      if (task.estimate_minutes !== undefined) {
        payload.data.attributes.initial_estimate = task.estimate_minutes;
      }
      if (task.due_in_days !== undefined) {
        const due = new Date(today);
        due.setDate(due.getDate() + task.due_in_days);
        payload.data.attributes.due_date = due.toISOString().slice(0, 10);
      }
      if (task.milestone) {
        payload.data.attributes.type_id = 3;
      }

      if (parentTaskId && payload.data.relationships) {
        payload.data.relationships.parent_task = {
          data: { type: "tasks", id: parentTaskId },
        };
      }
      if (args.default_assignee_id && payload.data.relationships) {
        payload.data.relationships.assignee = {
          data: { type: "people", id: args.default_assignee_id },
        };
      }

      // Custom fields: only set what the template specifies and the org has
      // configured — an unconfigured option is skipped, not an error, so a
      // template stays portable across organisations.
      const customFields: Record<string, string | string[]> = {};
      if (task.task_type && TASK_TYPE_OPTIONS[task.task_type]) {
        customFields[CUSTOM_FIELD_IDS.TASK_TYPE] =
          TASK_TYPE_OPTIONS[task.task_type];
      }
      if (task.priority && PRIORITY_OPTIONS[task.priority]) {
        customFields[CUSTOM_FIELD_IDS.PRIORITY] =
          PRIORITY_OPTIONS[task.priority];
      }
      if (task.labels && task.labels.length > 0 && CUSTOM_FIELD_IDS.LABELS) {
        const optionIds = await resolveLabelOptionIds(client, task.labels);
        if (optionIds.length > 0) {
          customFields[CUSTOM_FIELD_IDS.LABELS] = optionIds;
        }
      }
      if (Object.keys(customFields).length > 0) {
        payload.data.attributes.custom_fields = customFields;
      }

      const response = await client.post<JSONAPIResponse>("/tasks", payload);
      const data = Array.isArray(response.data)
        ? response.data[0]
        : response.data;
      createdId = (data as Task).id;

      taskResults.push({
        title: task.title,
        task_list: taskListName,
        depth,
        status: "created",
        task_id: createdId,
        url: `https://app.productive.io/${client.getOrgId()}/tasks/${createdId}`,
      });
      console.error(`✓ Created task: ${task.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      taskResults.push({
        title: task.title,
        task_list: taskListName,
        depth,
        status: "failed",
        error: message,
      });
      console.error(`✗ Failed task: ${task.title} - ${message}`);
    }

    for (const sub of task.subtasks || []) {
      if (createdId) {
        await createOneTask(sub, taskListId, taskListName, createdId, depth + 1);
      } else {
        markSkipped(sub, taskListName, depth + 1, "Parent task was not created");
      }
    }
  };

  const markSkipped = (
    task: TemplateTask,
    taskListName: string,
    depth: number,
    reason: string,
  ): void => {
    taskResults.push({
      title: task.title,
      task_list: taskListName,
      depth,
      status: "skipped",
      error: reason,
    });
    for (const sub of task.subtasks || []) {
      markSkipped(sub, taskListName, depth + 1, reason);
    }
  };

  // Titles already present in a reused list, so re-applying a template (or
  // stacking add-on templates that share a task) doesn't create duplicates.
  const fetchExistingTaskTitles = async (
    taskListId: string,
  ): Promise<Set<string>> => {
    const titles = new Set<string>();
    let pageNumber = 1;
    const pageSize = 200;
    while (true) {
      const response = await client.get<JSONAPIResponse>("/tasks", {
        "filter[task_list_id]": taskListId,
        "page[number]": pageNumber,
        "page[size]": pageSize,
      });
      const items = Array.isArray(response.data)
        ? response.data
        : [response.data];
      for (const item of items) {
        const title = (item as Task)?.attributes?.title;
        if (title) titles.add(title.toLowerCase());
      }
      const totalCount = response.meta?.total_count;
      if (totalCount && pageNumber * pageSize < totalCount) {
        pageNumber++;
      } else {
        break;
      }
    }
    return titles;
  };

  for (const list of template.task_lists) {
    let taskListId = args.reuse_existing_task_lists
      ? existingLists.get(list.name.toLowerCase())
      : undefined;
    const reused = taskListId !== undefined;

    if (!taskListId) {
      try {
        const payload: CreateTaskListPayload = {
          data: {
            type: "task_lists",
            attributes: { name: list.name },
            relationships: {
              project: { data: { type: "projects", id: args.project_id } },
              board: { data: { type: "boards", id: await getBoardId() } },
            },
          },
        };
        const response = await client.post<JSONAPIResponse>(
          "/task_lists",
          payload,
        );
        const data = Array.isArray(response.data)
          ? response.data[0]
          : response.data;
        taskListId = (data as TaskList).id;
        existingLists.set(list.name.toLowerCase(), taskListId);
        console.error(`✓ Created task list: ${list.name}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        listResults.push({ name: list.name, reused: false, error: message });
        console.error(`✗ Failed task list: ${list.name} - ${message}`);
        for (const task of list.tasks)
          markSkipped(task, list.name, 0, "Task list was not created");
        continue;
      }
    }

    listResults.push({ name: list.name, task_list_id: taskListId, reused });

    // In a reused list, skip top-level tasks that already exist by title so
    // re-applying a template or stacking add-ons stays idempotent.
    const existingTitles =
      reused && args.skip_existing_tasks
        ? await fetchExistingTaskTitles(taskListId)
        : null;

    for (const task of list.tasks) {
      if (existingTitles?.has(task.title.toLowerCase())) {
        markSkipped(task, list.name, 0, "Task already exists in this list");
        continue;
      }
      await createOneTask(task, taskListId, list.name, undefined, 0);
    }
  }

  const created = taskResults.filter((t) => t.status === "created");
  const failed = taskResults.filter((t) => t.status === "failed");
  const skipped = taskResults.filter((t) => t.status === "skipped");

  const summary = {
    template: template.name,
    project_id: args.project_id,
    variables: values,
    task_lists: listResults,
    total: taskResults.length,
    created: created.length,
    failed: failed.length,
    skipped: skipped.length,
    tasks: taskResults,
  };

  const result = formatResponse(summary, args.response_format, () => {
    const lines: string[] = [
      `# Applied template "${template.title}"`,
      "",
      `Project: ${args.project_id}`,
    ];
    if (Object.keys(values).length > 0) {
      lines.push(
        `Variables: ${Object.entries(values)
          .map(([k, v]) => `${k}="${v}"`)
          .join(", ")}`,
      );
    }
    lines.push(
      "",
      `**${created.length} of ${taskResults.length} tasks created**` +
        (failed.length > 0 ? `, ${failed.length} failed` : "") +
        (skipped.length > 0 ? `, ${skipped.length} skipped` : ""),
      "",
    );

    if (failed.length > 0) {
      lines.push("## Failures", "");
      for (const t of failed) {
        lines.push(`- [${t.task_list}] ${t.title}: ${t.error}`);
      }
      lines.push("");
    }
    if (skipped.length > 0) {
      lines.push(
        `## Skipped`,
        "",
        ...skipped.map((t) => `- [${t.task_list}] ${t.title} — ${t.error}`),
        "",
      );
    }

    lines.push("## Created", "");
    for (const list of listResults) {
      const note = list.error
        ? `— failed: ${list.error}`
        : list.reused
          ? "(existing list)"
          : "(new list)";
      lines.push(`### ${list.name} ${note}`, "");
      for (const t of taskResults) {
        if (t.task_list !== list.name || t.status !== "created") continue;
        const indent = "  ".repeat(t.depth);
        lines.push(`${indent}- [#${t.task_id}](${t.url}) ${t.title}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  });

  return truncateResponse(result, args.response_format);
}

/** Render what apply would do, without calling the API. */
function dryRunReport(
  template: TaskTemplate,
  values: Record<string, string>,
  args: z.infer<typeof ApplyTaskTemplateSchema>,
): string {
  const summary = {
    dry_run: true,
    template: template.name,
    project_id: args.project_id,
    variables: values,
    task_lists: template.task_lists.length,
    tasks: countTasks(template),
    total_estimate_minutes: totalEstimateMinutes(template),
    structure: template.task_lists,
  };

  return truncateResponse(
    formatResponse(summary, args.response_format, () => {
      const lines: string[] = [
        `# Dry run: template "${template.title}"`,
        "",
        `Would create ${countTasks(template)} tasks across ${template.task_lists.length} task list(s) in project ${args.project_id} (estimate ${formatMinutes(totalEstimateMinutes(template))}).`,
        "",
      ];
      if (Object.keys(values).length > 0) {
        lines.push(
          `Variables: ${Object.entries(values)
            .map(([k, v]) => `${k}="${v}"`)
            .join(", ")}`,
          "",
        );
      }
      const renderTask = (task: TemplateTask, depth: number): void => {
        const indent = "  ".repeat(depth);
        const estimate = task.estimate_minutes
          ? ` _(${formatMinutes(task.estimate_minutes)})_`
          : "";
        lines.push(`${indent}- ${task.title}${estimate}`);
        for (const sub of task.subtasks || []) renderTask(sub, depth + 1);
      };
      for (const list of template.task_lists) {
        lines.push(`## ${list.name}`, "");
        for (const task of list.tasks) renderTask(task, 0);
        lines.push("");
      }
      lines.push(
        "No changes were made. Re-run with dry_run: false to create these tasks.",
      );
      return lines.join("\n");
    }),
    args.response_format,
  );
}
