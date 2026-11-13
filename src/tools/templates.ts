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
import { mergeCustomFieldsForPatch } from "../utils/custom-fields.js";
import {
  waitForCommitReference,
  summariseCommitReferences,
  commitReferencesClean,
  formatCommitReferenceReport,
  type CommitReferenceCheck,
} from "../utils/commit-reference.js";
import { runMilestoneDateReview, milestoneFromTask } from "./milestone-review.js";
import type { MilestoneToReview } from "../utils/date-review.js";

/** Due date N days from the apply date, as YYYY-MM-DD. */
function dueDateFromToday(today: Date, days: number): string {
  const due = new Date(today);
  due.setDate(due.getDate() + days);
  return due.toISOString().slice(0, 10);
}

/** The milestone date review can be turned off (the tests do, for speed). */
const dateReviewEnabled = (): boolean => process.env.PRODUCTIVE_DATE_REVIEW !== "off";
import {
  CUSTOM_FIELD_IDS,
  PRIORITY_OPTIONS,
  TASK_TYPES,
  resolveTaskType,
} from "../constants.js";

/**
 * Check every Task type a template uses against the organisation's options
 * before anything is created, so an unknown name fails the whole apply up
 * front (listing the valid options) instead of half-creating the structure.
 *
 * With no Task types configured at all (no `npm run setup`), types are
 * skipped with a warning instead, so templates stay usable on a bare install.
 */
function checkTemplateTaskTypes(template: TaskTemplate): string[] {
  const used = new Set<string>();
  const walk = (task: TemplateTask): void => {
    if (task.task_type) used.add(task.task_type);
    for (const sub of task.subtasks || []) walk(sub);
  };
  for (const list of template.task_lists) list.tasks.forEach(walk);
  if (used.size === 0) return [];
  if (TASK_TYPES.length === 0) {
    return [
      `No Task type options are configured, so Task types were not set (${[...used].join(", ")}). Run \`npm run setup\` to enable them.`,
    ];
  }
  for (const name of used) resolveTaskType(name);
  return [];
}

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
      if (task.repeat !== undefined) extras.push(`repeated ${task.repeat} times`);
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
  status: "created" | "existing" | "failed" | "skipped";
  task_id?: string;
  url?: string;
  error?: string;
}

interface ExistingTasks {
  /** lowercase title -> task id */
  byTitle: Map<string, string>;
  /** first top-level milestone found, if any */
  milestoneId?: string;
}

interface AppliedListResult {
  name: string;
  task_list_id?: string;
  reused: boolean;
  placed_before?: string;
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
  // Schema validation guarantees exactly one of the two is present. An inline
  // definition lets callers (e.g. a page-scaffolding skill) compose a
  // one-off structure without a file existing on the server.
  const rawTemplate = args.template_definition
    ? args.template_definition
    : loadTemplate(args.template!).template;
  const values = resolveVariables(rawTemplate, args.variables);
  const template = substituteTemplate(rawTemplate, values);
  const taskTypeWarnings = checkTemplateTaskTypes(template);

  if (args.dry_run) {
    // Review the dates the milestones would get, without annotating anything.
    const today = new Date();
    const planned: MilestoneToReview[] = template.task_lists.flatMap((list) =>
      list.tasks
        .filter((t) => t.milestone && t.due_in_days !== undefined)
        .map((t) => ({
          title: t.title,
          due_date: dueDateFromToday(today, t.due_in_days!),
          task_type: t.task_type ?? null,
        })),
    );
    const review =
      planned.length > 0 && dateReviewEnabled()
        ? await runMilestoneDateReview(null, planned, {
            regions: args.review_regions,
            include_trading_peaks: args.include_trading_peaks,
            annotate: false,
          })
        : undefined;
    return dryRunReport(template, values, args, taskTypeWarnings, review);
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
  const reviewMilestones: MilestoneToReview[] = [];
  const referenceChecks: CommitReferenceCheck[] = [];
  const today = new Date();

  const createOneTask = async (
    task: TemplateTask,
    taskListId: string,
    taskListName: string,
    parentTaskId: string | undefined,
    depth: number,
    existingSiblings: Map<string, string> | null,
    moveBeforeId?: string,
  ): Promise<void> => {
    // A ticket with this title already exists at this level: reuse it and
    // merge the template's children into it rather than duplicating it.
    const existingId = existingSiblings?.get(task.title.toLowerCase());
    if (existingId) {
      taskResults.push({
        title: task.title,
        task_list: taskListName,
        depth,
        status: "existing",
        task_id: existingId,
        url: `https://app.productive.io/${client.getOrgId()}/tasks/${existingId}`,
      });
      // A reused Milestone is reviewed on its current date, which may have
      // been moved since it was created.
      if (task.milestone && dateReviewEnabled()) {
        try {
          const current = await client.get<JSONAPIResponse>(`/tasks/${existingId}`);
          const data = (Array.isArray(current.data) ? current.data[0] : current.data) as Task;
          const m = data ? milestoneFromTask(data, client.getOrgId()) : null;
          if (m) reviewMilestones.push(m);
        } catch (error) {
          warnings.push(
            `Couldn't read the date of existing milestone "${task.title}" for the date review: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (task.subtasks && task.subtasks.length > 0) {
        const existingChildren = (
          await fetchExistingTasks({ "filter[parent_task_id]": existingId })
        ).byTitle;
        for (const sub of task.subtasks) {
          await createOneTask(
            sub,
            taskListId,
            taskListName,
            existingId,
            depth + 1,
            existingChildren,
          );
        }
      }
      return;
    }

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
        payload.data.attributes.due_date = dueDateFromToday(today, task.due_in_days);
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
      if (task.task_type && TASK_TYPES.length > 0) {
        customFields[CUSTOM_FIELD_IDS.TASK_TYPE] = resolveTaskType(
          task.task_type,
        ).optionId;
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

      // A Milestone is created top-level (validation guarantees it) and then
      // must carry its Task type, e.g. "Show & Tell". If Productive didn't
      // keep the type from the create, set it now.
      const typeOption = customFields[CUSTOM_FIELD_IDS.TASK_TYPE];
      const returnedFields = (data as Task).attributes?.custom_fields;
      if (
        task.milestone &&
        typeOption &&
        returnedFields &&
        String(returnedFields[CUSTOM_FIELD_IDS.TASK_TYPE] ?? "") !== String(typeOption)
      ) {
        await client.patch<JSONAPIResponse>(`/tasks/${createdId}`, {
          data: {
            type: "tasks",
            id: createdId,
            attributes: {
              custom_fields: mergeCustomFieldsForPatch(returnedFields, {
                [CUSTOM_FIELD_IDS.TASK_TYPE]: typeOption,
              }),
            },
          },
        });
      }

      if (moveBeforeId && !task.milestone) {
        await keepMilestoneLast(createdId, moveBeforeId, taskListName);
      }

      // Wait for Productive to stamp the Commit reference before creating the
      // next ticket: creating faster than the automation stamps is what gave
      // one 21-ticket run WGL-8714 seven times.
      referenceChecks.push(await waitForCommitReference(client, createdId));

      if (task.milestone && payload.data.attributes.due_date) {
        reviewMilestones.push({
          id: createdId,
          title: task.title,
          due_date: payload.data.attributes.due_date,
          task_type: task.task_type ?? null,
          url: `https://app.productive.io/${client.getOrgId()}/tasks/${createdId}`,
        });
      }

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
        // A freshly created parent has no existing children to merge with.
        await createOneTask(
          sub,
          taskListId,
          taskListName,
          createdId,
          depth + 1,
          null,
        );
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

  // Productive appends new task lists at the end. When a template's later
  // phase already exists (e.g. an earlier template created "Go-live"), move
  // the new list before it so phases stay in the template's order.
  const placeBeforeLaterPhase = async (
    listIndex: number,
    taskListId: string,
  ): Promise<string | undefined> => {
    for (const later of template.task_lists.slice(listIndex + 1)) {
      const laterId = existingLists.get(later.name.toLowerCase());
      if (!laterId) continue;
      try {
        await client.patch<JSONAPIResponse>(
          `/task_lists/${taskListId}/reposition`,
          {
            data: {
              type: "task_lists",
              attributes: { move_before_id: parseInt(laterId, 10) },
            },
          },
        );
        return later.name;
      } catch (error) {
        console.error(
          `Warning: could not move task list before "${later.name}": ${error instanceof Error ? error.message : error}`,
        );
        return undefined;
      }
    }
    return undefined;
  };

  // A milestone marks the end of its phase, so a ticket added to a list that
  // already holds one is moved above it. If the API refuses, warn once and
  // leave the ticket at the end of the list.
  const warnings: string[] = [...taskTypeWarnings];
  let taskRepositionFailed = false;
  const keepMilestoneLast = async (
    taskId: string,
    milestoneId: string,
    taskListName: string,
  ): Promise<void> => {
    if (taskRepositionFailed) return;
    try {
      await client.patch<JSONAPIResponse>(`/tasks/${taskId}/reposition`, {
        data: {
          type: "tasks",
          attributes: { move_before_id: parseInt(milestoneId, 10) },
        },
      });
    } catch (error) {
      taskRepositionFailed = true;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        `New tickets in "${taskListName}" could not be moved above its milestone (${message}); drag them into place in Productive.`,
      );
      console.error(`Warning: task reposition failed - ${message}`);
    }
  };

  // Existing tasks (lowercase title -> id) matching a filter. Used so that
  // re-applying a template, or stacking add-ons that share Features, reuses
  // tickets that already exist instead of duplicating them.
  const fetchExistingTasks = async (
    filter: Record<string, string>,
    topLevelOnly = false,
  ): Promise<ExistingTasks> => {
    const tasks = new Map<string, string>();
    let milestoneId: string | undefined;
    let pageNumber = 1;
    const pageSize = 200;
    while (true) {
      const response = await client.get<JSONAPIResponse>("/tasks", {
        ...filter,
        // Without the include, Productive omits parent_task's data, so every
        // subtask would look top-level and could be wrongly reused.
        ...(topLevelOnly ? { include: "parent_task" } : {}),
        "page[number]": pageNumber,
        "page[size]": pageSize,
      });
      const items = Array.isArray(response.data)
        ? response.data
        : [response.data];
      for (const item of items) {
        const task = item as Task;
        const title = task?.attributes?.title;
        if (!title || !task.id) continue;
        if (topLevelOnly && task.relationships?.parent_task?.data) continue;
        if (!tasks.has(title.toLowerCase())) {
          tasks.set(title.toLowerCase(), task.id);
        }
        if (!milestoneId && task.attributes?.type_id === 3) {
          milestoneId = task.id;
        }
      }
      const totalCount = response.meta?.total_count;
      if (totalCount && pageNumber * pageSize < totalCount) {
        pageNumber++;
      } else {
        break;
      }
    }
    return { byTitle: tasks, milestoneId };
  };

  for (const [listIndex, list] of template.task_lists.entries()) {
    let taskListId = args.reuse_existing_task_lists
      ? existingLists.get(list.name.toLowerCase())
      : undefined;
    const reused = taskListId !== undefined;
    let placedBefore: string | undefined;

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
        placedBefore = await placeBeforeLaterPhase(listIndex, taskListId);
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

    listResults.push({
      name: list.name,
      task_list_id: taskListId,
      reused,
      placed_before: placedBefore,
    });

    const existingTopLevel =
      reused && args.skip_existing_tasks
        ? await fetchExistingTasks({ "filter[task_list_id]": taskListId }, true)
        : null;

    for (const task of list.tasks) {
      await createOneTask(
        task,
        taskListId,
        list.name,
        undefined,
        0,
        existingTopLevel?.byTitle ?? null,
        existingTopLevel?.milestoneId,
      );
    }
  }

  const review =
    reviewMilestones.length > 0 && dateReviewEnabled()
      ? await runMilestoneDateReview(client, reviewMilestones, {
          regions: args.review_regions,
          include_trading_peaks: args.include_trading_peaks,
          annotate: true,
        })
      : undefined;

  const references = summariseCommitReferences(referenceChecks);

  const created = taskResults.filter((t) => t.status === "created");
  const failed = taskResults.filter((t) => t.status === "failed");
  const skipped = taskResults.filter((t) => t.status === "skipped");
  const existing = taskResults.filter((t) => t.status === "existing");

  const summary = {
    template: template.name,
    project_id: args.project_id,
    variables: values,
    task_lists: listResults,
    total: taskResults.length,
    created: created.length,
    existing: existing.length,
    failed: failed.length,
    skipped: skipped.length,
    warnings,
    commit_references: commitReferencesClean(references) ? undefined : references,
    date_review: review
      ? { ...(review.result ?? {}), annotations: review.annotations, error: review.error }
      : undefined,
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
        (existing.length > 0
          ? `, ${existing.length} already existed and were reused`
          : "") +
        (failed.length > 0 ? `, ${failed.length} failed` : "") +
        (skipped.length > 0 ? `, ${skipped.length} skipped` : ""),
      "",
    );

    if (warnings.length > 0) {
      lines.push("## Warnings", "", ...warnings.map((w) => `- ${w}`), "");
    }
    lines.push(...formatCommitReferenceReport(references));
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
    if (existing.length > 0) {
      lines.push(
        "_(existing)_ marks a ticket that was already in the project; new children were added under it.",
        "",
      );
    }
    for (const list of listResults) {
      const note = list.error
        ? `— failed: ${list.error}`
        : list.reused
          ? "(existing list)"
          : list.placed_before
            ? `(new list, placed before ${list.placed_before})`
            : "(new list)";
      lines.push(`### ${list.name} ${note}`, "");
      for (const t of taskResults) {
        if (t.task_list !== list.name) continue;
        if (t.status !== "created" && t.status !== "existing") continue;
        const indent = "  ".repeat(t.depth);
        const marker = t.status === "existing" ? " _(existing)_" : "";
        lines.push(`${indent}- [#${t.task_id}](${t.url}) ${t.title}${marker}`);
      }
      lines.push("");
    }

    if (review) lines.push(review.markdown, "");

    return lines.join("\n");
  });

  return truncateResponse(result, args.response_format);
}

/** Render what apply would do, without calling the API. */
function dryRunReport(
  template: TaskTemplate,
  values: Record<string, string>,
  args: z.infer<typeof ApplyTaskTemplateSchema>,
  warnings: string[],
  review?: Awaited<ReturnType<typeof runMilestoneDateReview>>,
): string {
  const summary = {
    dry_run: true,
    template: template.name,
    project_id: args.project_id,
    variables: values,
    task_lists: template.task_lists.length,
    tasks: countTasks(template),
    total_estimate_minutes: totalEstimateMinutes(template),
    warnings,
    date_review: review ? { ...(review.result ?? {}), error: review.error } : undefined,
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
      if (warnings.length > 0) {
        lines.push("## Warnings", "", ...warnings.map((w) => `- ${w}`), "");
      }
      const renderTask = (task: TemplateTask, depth: number): void => {
        const indent = "  ".repeat(depth);
        const extras: string[] = [];
        if (task.milestone) extras.push("Milestone");
        if (task.task_type) extras.push(task.task_type);
        if (task.estimate_minutes) extras.push(formatMinutes(task.estimate_minutes));
        const suffix = extras.length > 0 ? ` _(${extras.join(", ")})_` : "";
        lines.push(`${indent}- ${task.title}${suffix}`);
        for (const sub of task.subtasks || []) renderTask(sub, depth + 1);
      };
      for (const list of template.task_lists) {
        lines.push(`## ${list.name}`, "");
        for (const task of list.tasks) renderTask(task, 0);
        lines.push("");
      }
      if (review) lines.push(review.markdown, "");
      lines.push(
        "No changes were made. Re-run with dry_run: false to create these tasks.",
      );
      return lines.join("\n");
    }),
    args.response_format,
  );
}
