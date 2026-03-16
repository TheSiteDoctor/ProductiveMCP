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
} from "../schemas/task.js";
import {
  CUSTOM_FIELD_IDS,
  TASK_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  LABEL_OPTIONS,
  WORKFLOW_STATUS_IDS,
} from "../constants.js";

/**
 * Create a new custom field option for the labels field.
 * Returns the new option ID, or null on failure.
 * Also updates the runtime LABEL_OPTIONS cache.
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
      // Update runtime cache so subsequent calls don't recreate the option
      LABEL_OPTIONS[name] = data.id;
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
 */
export async function resolveLabelOptionIds(
  client: ProductiveClient,
  labels: string[],
): Promise<string[]> {
  const optionIds: string[] = [];

  for (const label of labels) {
    const existingId = LABEL_OPTIONS[label];
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

  // Add optional workflow status relationship
  if (args.workflow_status && payload.data.relationships) {
    const statusId = WORKFLOW_STATUS_IDS[args.workflow_status];
    if (statusId) {
      payload.data.relationships.workflow_status = {
        data: {
          type: "workflow_statuses",
          id: statusId,
        },
      };
    } else {
      try {
        console.error(
          `Warning: Workflow status "${args.workflow_status}" is not configured. Skipping status field.`,
        );
      } catch {
        // Ignore logging errors
      }
    }
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
    const statusId = WORKFLOW_STATUS_IDS[args.workflow_status];
    if (statusId) {
      payload.data.relationships.workflow_status = {
        data: { type: "workflow_statuses", id: statusId },
      };
    } else {
      try {
        console.error(
          `Warning: Workflow status "${args.workflow_status}" is not configured. Skipping status field.`,
        );
      } catch {
        // Ignore logging errors
      }
    }
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
    // Map estimate_minutes to initial_estimate (the actual API field)
    attributes.initial_estimate = args.estimate_minutes;
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

  // Handle workflow status relationship
  if (args.workflow_status !== undefined) {
    if (!payload.data.relationships) {
      payload.data.relationships = {};
    }
    const statusId = WORKFLOW_STATUS_IDS[args.workflow_status];
    if (statusId) {
      payload.data.relationships.workflow_status = {
        data: {
          type: "workflow_statuses",
          id: statusId,
        },
      };
    } else {
      try {
        console.error(
          `Warning: Workflow status "${args.workflow_status}" is not configured. Skipping status field.`,
        );
      } catch {
        // Ignore logging errors
      }
    }
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
