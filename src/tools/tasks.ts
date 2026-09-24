/**
 * Task-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Task,
  CreateTaskPayload,
  UpdateTaskPayload,
  FormattedTask,
  CreateTodoPayload,
} from "../types.js";
import {
  formatTask,
  formatTaskMarkdown,
  formatTaskListMarkdown,
  formatResponse,
  truncateResponse,
  markdownToHtml,
} from "../utils/formatting.js";
import {
  CreateTaskSchema,
  CreateMilestoneSchema,
  SearchTasksSchema,
  GetTaskSchema,
  UpdateTaskSchema,
  ListMyTasksDueTodaySchema,
} from "../schemas/task.js";
import { resolveCurrentPersonId } from "./timers.js";
import {
  CUSTOM_FIELD_IDS,
  TASK_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  LABEL_OPTIONS,
  resolveWorkflowStatusId as resolveConfiguredWorkflowStatusId,
} from "../constants.js";

/**
 * Cached label options fetched from the Productive API.
 * Refreshed every 5 minutes to avoid stale lookups without excessive API calls.
 */
let labelOptionsCache: {
  map: Record<string, string>; // lowercaseName → optionId
  nameMap: Record<string, string>; // lowercaseName → originalName (for LABEL_OPTIONS)
  fetchedAt: number;
} | null = null;

const LABEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Per-project cache of workflow status name → ID mappings.
 * Keyed by projectId; expires after 5 minutes.
 */
const workflowStatusCache = new Map<
  string,
  { statuses: Record<string, string>; fetchedAt: number }
>();

const WORKFLOW_STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the name → ID map of every status in the workflow a project uses.
 *
 * GET /workflow_statuses?filter[project_id] is unsupported (returns 400).
 * Instead this uses a 3-step lookup:
 *   1. Fetch one task from the project with include=workflow_status to get a status ID.
 *   2. Fetch that workflow_status record to obtain its workflow_id.
 *   3. Fetch all statuses for that workflow_id.
 * Results are cached per project for 5 minutes.
 *
 * Returns null when the project's workflow cannot be determined — a project
 * with no tasks yet, or an API error — so the caller can fall back to config.
 */
async function fetchProjectWorkflowStatuses(
  client: ProductiveClient,
  projectId: string,
): Promise<Record<string, string> | null> {
  const cached = workflowStatusCache.get(projectId);
  if (cached && Date.now() - cached.fetchedAt < WORKFLOW_STATUS_CACHE_TTL_MS) {
    return cached.statuses;
  }

  try {
    // Step 1: get any task from the project to obtain a workflow_status ID
    const taskResponse = await client.get<JSONAPIResponse>("/tasks", {
      "filter[project_id]": projectId,
      "page[size]": "1",
      include: "workflow_status",
    });
    const included = (taskResponse.included ?? []) as Array<{
      id: string;
      type: string;
    }>;
    const anyStatus = included.find((r) => r.type === "workflow_statuses");
    if (!anyStatus) {
      return null;
    }

    // Step 2: fetch that workflow_status to get its workflow_id
    const wsResponse = await client.get<JSONAPIResponse>(
      `/workflow_statuses/${anyStatus.id}`,
      { include: "workflow" },
    );
    const wsData = Array.isArray(wsResponse.data)
      ? wsResponse.data[0]
      : wsResponse.data;
    const workflowId = (
      wsData?.relationships?.workflow as { data?: { id: string } } | undefined
    )?.data?.id;
    if (!workflowId) {
      return null;
    }

    // Step 3: fetch all statuses for this workflow
    const allResponse = await client.get<JSONAPIResponse>(
      "/workflow_statuses",
      {
        "filter[workflow_id]": workflowId,
      },
    );
    const allStatuses = Array.isArray(allResponse.data)
      ? allResponse.data
      : [allResponse.data];
    const statusMap: Record<string, string> = {};
    for (const s of allStatuses) {
      const name = (s.attributes as { name?: string })?.name;
      if (name && s.id) statusMap[name] = s.id;
    }

    workflowStatusCache.set(projectId, {
      statuses: statusMap,
      fetchedAt: Date.now(),
    });
    return statusMap;
  } catch {
    return null;
  }
}

/**
 * Resolve a workflow status name to the correct ID for a given project.
 *
 * Statuses are scoped to a workflow and different projects can use different
 * workflows, so the project's own workflow is consulted first. When it cannot
 * be determined, the config-based resolver in constants.ts takes over (it
 * prefers the organisation's dominant workflow as detected by `npm run setup`).
 *
 * Throws rather than silently skipping the field — a task created at the
 * wrong status while the tool reports success is worse than a clear failure.
 */
export async function resolveWorkflowStatusIdForProject(
  client: ProductiveClient,
  projectId: string,
  statusName: string,
): Promise<string> {
  const statuses = await fetchProjectWorkflowStatuses(client, projectId);
  if (!statuses) {
    return resolveConfiguredWorkflowStatusId(statusName);
  }

  const statusId = statuses[statusName];
  if (statusId) {
    return statusId;
  }

  throw new Error(
    `Workflow status "${statusName}" does not exist in the workflow used by project ${projectId}. ` +
      `Available statuses: ${Object.keys(statuses).join(", ")}.`,
  );
}

/**
 * Fetch all label options from the Productive API with pagination support.
 * Returns a case-insensitive name→ID map and updates the LABEL_OPTIONS runtime cache.
 */
async function fetchLabelOptions(
  client: ProductiveClient,
): Promise<Record<string, string>> {
  if (!CUSTOM_FIELD_IDS.LABELS) return {};

  // Return cached data if fresh
  if (
    labelOptionsCache &&
    Date.now() - labelOptionsCache.fetchedAt < LABEL_CACHE_TTL_MS
  ) {
    return labelOptionsCache.map;
  }

  const caseInsensitiveMap: Record<string, string> = {};
  const nameMap: Record<string, string> = {};
  let pageNumber = 1;
  const pageSize = 200;

  try {
    while (true) {
      const response = await client.get<JSONAPIResponse>(
        "/custom_field_options",
        {
          "filter[custom_field_id]": CUSTOM_FIELD_IDS.LABELS,
          "filter[archived]": "false",
          "page[number]": pageNumber,
          "page[size]": pageSize,
        },
      );

      const items = Array.isArray(response.data)
        ? response.data
        : [response.data];

      for (const item of items) {
        const attrs = item?.attributes as Record<string, unknown> | undefined;
        if (item?.id && attrs?.name) {
          const name = attrs.name as string;
          const lowerName = name.toLowerCase();
          caseInsensitiveMap[lowerName] = item.id;
          nameMap[lowerName] = name;
          // Also update LABEL_OPTIONS for display formatting
          LABEL_OPTIONS[name] = item.id;
        }
      }

      // Check if more pages exist
      const totalCount = response.meta?.total_count;
      if (totalCount && pageNumber * pageSize < totalCount) {
        pageNumber++;
      } else {
        break;
      }
    }
  } catch (error) {
    try {
      console.error(
        `Warning: Failed to fetch label options: ${error instanceof Error ? error.message : error}`,
      );
    } catch {
      // Ignore logging errors
    }
  }

  labelOptionsCache = {
    map: caseInsensitiveMap,
    nameMap,
    fetchedAt: Date.now(),
  };

  return caseInsensitiveMap;
}

/**
 * Create a new custom field option for the labels field.
 * Returns the new option ID, or null on failure.
 * Also updates both the LABEL_OPTIONS runtime cache and the label options cache.
 */
async function createLabelOption(
  client: ProductiveClient,
  name: string,
): Promise<string | null> {
  if (!CUSTOM_FIELD_IDS.LABELS) return null;

  try {
    const payload = {
      data: {
        type: "custom_field_options" as const,
        attributes: { name },
        relationships: {
          custom_field: {
            data: {
              type: "custom_fields" as const,
              id: CUSTOM_FIELD_IDS.LABELS,
            },
          },
        },
      },
    };

    const response = await client.post<JSONAPIResponse>(
      "/custom_field_options",
      payload,
    );

    const data = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    if (data?.id) {
      // Update runtime LABEL_OPTIONS for display formatting
      LABEL_OPTIONS[name] = data.id;
      // Update the API cache so we don't re-fetch immediately
      if (labelOptionsCache) {
        labelOptionsCache.map[name.toLowerCase()] = data.id;
        labelOptionsCache.nameMap[name.toLowerCase()] = name;
      }
      try {
        console.error(`Created new label option: "${name}" (ID: ${data.id})`);
      } catch {
        // Ignore logging errors
      }
      return data.id;
    }

    return null;
  } catch (error) {
    try {
      console.error(
        `Warning: Failed to create label option "${name}": ${error instanceof Error ? error.message : error}`,
      );
    } catch {
      // Ignore logging errors
    }
    return null;
  }
}

/**
 * Resolve label names to option IDs, creating new options as needed.
 * Fetches existing options from the Productive API (with caching) and
 * performs case-insensitive matching to avoid creating duplicates.
 */
export async function resolveLabelOptionIds(
  client: ProductiveClient,
  labels: string[],
): Promise<string[]> {
  // Fetch current options from API (cached with 5 min TTL)
  const existingOptions = await fetchLabelOptions(client);
  const optionIds: string[] = [];

  for (const label of labels) {
    const existingId = existingOptions[label.toLowerCase()];
    if (existingId) {
      optionIds.push(existingId);
    } else {
      const newId = await createLabelOption(client, label);
      if (newId) optionIds.push(newId);
    }
  }

  return optionIds;
}

/**
 * Create a single task
 */
export async function createTask(
  client: ProductiveClient,
  args: z.infer<typeof CreateTaskSchema>,
): Promise<string> {
  const payload: CreateTaskPayload = {
    data: {
      type: "tasks",
      attributes: {
        title: args.title,
      },
      relationships: {
        project: {
          data: {
            type: "projects",
            id: args.project_id,
          },
        },
      },
    },
  };

  // Add optional attributes
  // Convert Markdown to HTML for description (Productive expects HTML)
  if (args.description) {
    payload.data.attributes.description = markdownToHtml(args.description);
  }
  if (args.due_date) {
    payload.data.attributes.due_date = args.due_date;
  }
  if (args.start_date) {
    payload.data.attributes.start_date = args.start_date;
  }
  if (args.initial_estimate !== undefined) {
    payload.data.attributes.initial_estimate = args.initial_estimate;
  }

  // Add required task_list relationship
  if (payload.data.relationships) {
    payload.data.relationships.task_list = {
      data: {
        type: "task_lists",
        id: args.task_list_id,
      },
    };
  }

  // Add optional assignee relationship
  if (args.assignee_id && payload.data.relationships) {
    payload.data.relationships.assignee = {
      data: {
        type: "people",
        id: args.assignee_id,
      },
    };
  }

  // Add optional parent task relationship
  if (args.parent_task_id && payload.data.relationships) {
    payload.data.relationships.parent_task = {
      data: {
        type: "tasks",
        id: args.parent_task_id,
      },
    };
  }

  // Add optional workflow status relationship (resolve per-project)
  if (args.workflow_status && payload.data.relationships) {
    payload.data.relationships.workflow_status = {
      data: {
        type: "workflow_statuses",
        id: await resolveWorkflowStatusIdForProject(
          client,
          args.project_id,
          args.workflow_status,
        ),
      },
    };
  }

  // Add custom fields (task_type, priority, labels)
  const customFields: Record<string, string | string[]> = {};

  if (args.task_type) {
    const optionId = TASK_TYPE_OPTIONS[args.task_type];
    if (optionId) {
      customFields[CUSTOM_FIELD_IDS.TASK_TYPE] = optionId;
    } else {
      throw new Error(
        `Task type "${args.task_type}" does not have a configured option ID. Please update TASK_TYPE_OPTIONS in constants.ts`,
      );
    }
  }

  if (args.priority) {
    const optionId = PRIORITY_OPTIONS[args.priority];
    if (optionId) {
      customFields[CUSTOM_FIELD_IDS.PRIORITY] = optionId;
    } else {
      try {
        console.error(
          `Warning: Priority "${args.priority}" is not configured in Productive. Skipping priority field.`,
        );
      } catch {
        // Ignore logging errors
      }
      // Skip priority if not configured - don't throw error
    }
  }

  if (args.labels && args.labels.length > 0 && CUSTOM_FIELD_IDS.LABELS) {
    const optionIds = await resolveLabelOptionIds(client, args.labels);
    if (optionIds.length > 0) {
      customFields[CUSTOM_FIELD_IDS.LABELS] = optionIds;
    }
  }

  if (Object.keys(customFields).length > 0) {
    payload.data.attributes.custom_fields = customFields;
  }

  const response = await client.post<JSONAPIResponse>("/tasks", payload, {
    include: "project,task_list,assignee,workflow_status,attachments",
  });

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const task = formatTask(
    taskData as Task,
    client.getOrgId(),
    response.included,
  );

  // Create todos if provided
  if (args.todos && args.todos.length > 0) {
    try {
      console.error(
        `Creating ${args.todos.length} todo items for task ${task.id}...`,
      );
    } catch {
      // Ignore logging errors
    }

    for (let i = 0; i < args.todos.length; i++) {
      const todoInput = args.todos[i];
      try {
        const todoPayload: CreateTodoPayload = {
          data: {
            type: "todos",
            attributes: {
              description: todoInput.description,
            },
            relationships: {
              task: {
                data: {
                  type: "tasks",
                  id: task.id,
                },
              },
            },
          },
        };

        // Add optional attributes
        if (todoInput.due_date) {
          todoPayload.data.attributes.due_date = todoInput.due_date;
        }
        if (todoInput.closed !== undefined) {
          todoPayload.data.attributes.closed = todoInput.closed;
        }

        // Add optional assignee
        if (todoInput.assignee_id && todoPayload.data.relationships) {
          todoPayload.data.relationships.assignee = {
            data: {
              type: "people",
              id: todoInput.assignee_id,
            },
          };
        }

        await client.post<JSONAPIResponse>("/todos", todoPayload);
        try {
          console.error(
            `✓ Created todo ${i + 1}/${args.todos.length}: ${todoInput.description}`,
          );
        } catch {
          // Ignore logging errors
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        try {
          console.error(`✗ Failed to create todo ${i + 1}: ${errorMessage}`);
        } catch {
          // Ignore logging errors
        }
        // Continue creating other todos even if one fails
      }
    }
  }

  const result = formatResponse(task, args.response_format, () =>
    formatTaskMarkdown(task),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a new milestone (task with type_id: 3)
 */
export async function createMilestone(
  client: ProductiveClient,
  args: z.infer<typeof CreateMilestoneSchema>,
): Promise<string> {
  const payload: {
    data: {
      type: string;
      attributes: Record<string, unknown>;
      relationships: Record<string, unknown>;
    };
  } = {
    data: {
      type: "tasks",
      attributes: {
        title: args.title,
        type_id: 3,
      },
      relationships: {
        project: {
          data: { type: "projects", id: args.project_id },
        },
        task_list: {
          data: { type: "task_lists", id: args.task_list_id },
        },
      },
    },
  };

  if (args.description) {
    payload.data.attributes.description = markdownToHtml(args.description);
  }
  if (args.due_date) {
    payload.data.attributes.due_date = args.due_date;
  }
  if (args.start_date) {
    payload.data.attributes.start_date = args.start_date;
  }
  if (args.assignee_id) {
    payload.data.relationships.assignee = {
      data: { type: "people", id: args.assignee_id },
    };
  }
  if (args.workflow_status) {
    payload.data.relationships.workflow_status = {
      data: {
        type: "workflow_statuses",
        id: await resolveWorkflowStatusIdForProject(
          client,
          args.project_id,
          args.workflow_status,
        ),
      },
    };
  }

  const response = await client.post<JSONAPIResponse>("/tasks", payload, {
    include: "project,task_list,assignee,workflow_status,attachments",
  });

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const task = formatTask(
    taskData as Task,
    client.getOrgId(),
    response.included,
  );

  return truncateResponse(
    formatResponse(task, args.response_format, () => formatTaskMarkdown(task)),
    args.response_format,
  );
}

/**
 * Search tasks
 */
export async function searchTasks(
  client: ProductiveClient,
  args: z.infer<typeof SearchTasksSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  // Productive API uses page[number] (1-indexed) and page[size] per JSON:API spec
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "project,task_list,assignee,workflow_status,attachments",
  };

  // Add filters
  if (args.query) {
    params["filter[title]"] = args.query;
  }
  if (args.project_id) {
    params["filter[project_id]"] = args.project_id;
  }
  if (args.assignee_id) {
    params["filter[assignee_id]"] = args.assignee_id;
  }
  if (args.task_list_id) {
    params["filter[task_list_id]"] = args.task_list_id;
  }
  if (args.closed !== undefined) {
    // Productive API uses filter[status]: 1 = open, 2 = closed
    params["filter[status]"] = args.closed ? 2 : 1;
  }
  if (args.created_after) {
    params["filter[after]"] = args.created_after;
  }
  if (args.created_before) {
    params["filter[before]"] = args.created_before;
  }
  if (args.updated_after) {
    params["filter[updated_at]"] = args.updated_after;
  }
  if (args.sort) {
    params["sort"] = args.sort;
  }
  if (args.milestone_only) {
    params["filter[type_id]"] = 3;
  }

  const response = await client.get<JSONAPIResponse>("/tasks", params);

  const tasks = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((task) =>
    formatTask(task as Task, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(
    { tasks, total, count: tasks.length },
    args.response_format,
    () => formatTaskListMarkdown(tasks, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a specific task
 */
export async function getTask(
  client: ProductiveClient,
  args: z.infer<typeof GetTaskSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(`/tasks/${args.task_id}`, {
    include: "project,task_list,assignee,workflow_status,attachments",
  });

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const task = formatTask(
    taskData as Task,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(task, args.response_format, () =>
    formatTaskMarkdown(task),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a task
 */
export async function updateTask(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTaskSchema>,
): Promise<string> {
  const payload: UpdateTaskPayload = {
    data: {
      type: "tasks",
      id: args.task_id,
    },
  };

  // Build attributes object only if there are attributes to update
  const attributes: Record<string, unknown> = {};

  if (args.title !== undefined) {
    attributes.title = args.title;
  }
  if (args.description !== undefined) {
    // Convert Markdown to HTML for description (Productive expects HTML)
    attributes.description = args.description
      ? markdownToHtml(args.description)
      : args.description;
  }
  if (args.due_date !== undefined) {
    attributes.due_date = args.due_date;
  }
  if (args.start_date !== undefined) {
    attributes.start_date = args.start_date;
  }
  if (args.closed !== undefined) {
    attributes.closed = args.closed;
  }
  if (args.estimate_minutes !== undefined) {
    // Set both fields: initial_estimate is needed for tasks that never had an estimate,
    // remaining_time is the displayed "Time to complete" in the Productive GUI.
    attributes.initial_estimate = args.estimate_minutes;
    attributes.remaining_time = args.estimate_minutes;
  }

  // Handle custom fields
  // Productive API replaces the entire custom_fields hash on PATCH,
  // so we must GET existing values first and merge to avoid data loss.
  const customFieldUpdates: Record<string, string | string[] | number> = {};
  let hasCustomFieldChanges = false;

  if (args.task_type !== undefined) {
    const optionId = TASK_TYPE_OPTIONS[args.task_type];
    if (optionId) {
      customFieldUpdates[CUSTOM_FIELD_IDS.TASK_TYPE] = optionId;
      hasCustomFieldChanges = true;
    } else {
      throw new Error(
        `Task type "${args.task_type}" does not have a configured option ID. Please update TASK_TYPE_OPTIONS in constants.ts`,
      );
    }
  }

  if (args.priority !== undefined) {
    const optionId = PRIORITY_OPTIONS[args.priority];
    if (optionId) {
      customFieldUpdates[CUSTOM_FIELD_IDS.PRIORITY] = optionId;
      hasCustomFieldChanges = true;
    } else {
      try {
        console.error(
          `Warning: Priority "${args.priority}" is not configured in Productive. Skipping priority field.`,
        );
      } catch {
        // Ignore logging errors
      }
      // Skip priority if not configured - don't throw error
    }
  }

  if (args.labels !== undefined && CUSTOM_FIELD_IDS.LABELS) {
    if (args.labels.length === 0) {
      // Clear labels by setting to empty array
      customFieldUpdates[CUSTOM_FIELD_IDS.LABELS] = [];
    } else {
      const optionIds = await resolveLabelOptionIds(client, args.labels);
      if (optionIds.length > 0) {
        customFieldUpdates[CUSTOM_FIELD_IDS.LABELS] = optionIds;
      }
    }
    hasCustomFieldChanges = true;
  }

  if (hasCustomFieldChanges) {
    // Fetch existing custom_fields to preserve values not being updated
    const existingResponse = await client.get<JSONAPIResponse>(
      `/tasks/${args.task_id}`,
    );
    const existingTask = Array.isArray(existingResponse.data)
      ? existingResponse.data[0]
      : existingResponse.data;
    const existingCustomFields =
      (existingTask as Task).attributes?.custom_fields || {};

    // Merge: existing values as base, then apply our updates
    attributes.custom_fields = {
      ...existingCustomFields,
      ...customFieldUpdates,
    };
  }

  if (Object.keys(attributes).length > 0) {
    payload.data.attributes = attributes;
  }

  // Handle assignee relationship
  if (args.assignee_id !== undefined) {
    if (!payload.data.relationships) {
      payload.data.relationships = {};
    }
    payload.data.relationships.assignee = {
      data: args.assignee_id
        ? {
            type: "people",
            id: args.assignee_id,
          }
        : null,
    };
  }

  // Handle workflow status relationship (resolve per-project)
  if (args.workflow_status !== undefined) {
    if (!payload.data.relationships) {
      payload.data.relationships = {};
    }
    // Fetch the task to get its project_id for status resolution
    const taskResponse = await client.get<JSONAPIResponse>(
      `/tasks/${args.task_id}`,
      { include: "project" },
    );
    const taskData = Array.isArray(taskResponse.data)
      ? taskResponse.data[0]
      : taskResponse.data;
    const projectRel = (taskData as Task).relationships?.project;
    const projectId =
      projectRel && "data" in projectRel
        ? (projectRel.data as { id: string })?.id
        : null;

    // Resolve against the task's own project when it can be determined,
    // otherwise fall back to the organisation-level config mapping.
    const statusId = projectId
      ? await resolveWorkflowStatusIdForProject(
          client,
          projectId,
          args.workflow_status,
        )
      : resolveConfiguredWorkflowStatusId(args.workflow_status);
    payload.data.relationships.workflow_status = {
      data: {
        type: "workflow_statuses",
        id: statusId,
      },
    };
  }

  // Handle task list relationship
  if (args.task_list_id) {
    if (!payload.data.relationships) {
      payload.data.relationships = {};
    }
    payload.data.relationships.task_list = {
      data: { type: "task_lists", id: args.task_list_id },
    };
  }

  // Handle parent task relationship (null to clear, string to set)
  if (args.parent_task_id !== undefined) {
    if (!payload.data.relationships) {
      payload.data.relationships = {};
    }
    payload.data.relationships.parent_task = {
      data: args.parent_task_id
        ? {
            type: "tasks",
            id: args.parent_task_id,
          }
        : null,
    };
  }

  const response = await client.patch<JSONAPIResponse>(
    `/tasks/${args.task_id}`,
    payload,
    { include: "project,task_list,assignee,workflow_status,attachments" },
  );

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const task = formatTask(
    taskData as Task,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(task, args.response_format, () =>
    formatTaskMarkdown(task),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * List the authenticated user's open tasks that are due today or earlier.
 *
 * Today's tasks come first, overdue underneath. The due-date predicate is
 * applied client-side because Productive's `filter[due_date]` doesn't
 * support `[lte]` operator suffixes — we fetch by assignee + status, sort
 * by due_date ascending, and split locally.
 */
export async function listMyTasksDueToday(
  client: ProductiveClient,
  args: z.infer<typeof ListMyTasksDueTodaySchema>,
): Promise<string> {
  const personId = args.person_id ?? (await resolveCurrentPersonId(client));

  const params: Record<string, unknown> = {
    "filter[assignee_id]": personId,
    "filter[status]": 1, // 1 = open in Productive
    sort: "due_date",
    include: "project,task_list,assignee,workflow_status,attachments",
    "page[size]": args.limit,
  };

  const response = await client.get<JSONAPIResponse>("/tasks", params);

  const orgId = client.getOrgId();
  const tasks = (Array.isArray(response.data) ? response.data : [response.data])
    .filter((t): t is Task => !!t?.id)
    .map((task) => formatTask(task as Task, orgId, response.included));

  const todayIso = new Date().toISOString().slice(0, 10);
  const today: FormattedTask[] = [];
  const overdue: FormattedTask[] = [];
  const undated: FormattedTask[] = [];

  for (const t of tasks) {
    if (!t.due_date) {
      undated.push(t);
    } else if (t.due_date === todayIso) {
      today.push(t);
    } else if (t.due_date < todayIso) {
      overdue.push(t);
    }
    // Future-due tasks fall through — they aren't "due today or earlier".
  }

  if (args.response_format === "json") {
    return truncateResponse(
      JSON.stringify(
        {
          today,
          overdue: args.include_overdue ? overdue : [],
          undated,
          counts: {
            today: today.length,
            overdue: overdue.length,
            undated: undated.length,
          },
          person_id: personId,
          today_date: todayIso,
        },
        null,
        2,
      ),
      args.response_format,
    );
  }

  // Markdown — sectioned by Today / Overdue (date-ascending so most-urgent first).
  const lines: string[] = [`# My open tasks (as of ${todayIso})`, ""];

  const renderRow = (t: FormattedTask): string => {
    const num = t.number ? `#${t.number}` : t.id;
    const project = t.project_name ? ` · ${t.project_name}` : "";
    const due = t.due_date ? ` · due ${t.due_date}` : "";
    const url = t.url ? ` — [open](${t.url})` : "";
    return `- ○ **${num}** ${t.title}${project}${due}${url}`;
  };

  lines.push(`## Today (${today.length})`);
  if (today.length === 0) {
    lines.push("_Nothing due today._");
  } else {
    for (const t of today) lines.push(renderRow(t));
  }
  lines.push("");

  if (args.include_overdue) {
    overdue.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    lines.push(`## Overdue (${overdue.length})`);
    if (overdue.length === 0) {
      lines.push("_Nothing overdue. Nice._");
    } else {
      for (const t of overdue) lines.push(renderRow(t));
    }
    lines.push("");
  }

  if (undated.length > 0) {
    lines.push(`## Undated (${undated.length})`);
    for (const t of undated) lines.push(renderRow(t));
  }

  return truncateResponse(lines.join("\n"), args.response_format);
}
