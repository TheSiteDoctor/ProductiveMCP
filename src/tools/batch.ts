/**
 * Batch task creation tool
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Task,
  CreateTaskPayload,
  BatchTaskResult,
  BatchOperationSummary,
} from "../types.js";
import {
  formatTask,
  formatBatchSummaryMarkdown,
  formatResponse,
  truncateResponse,
  markdownToHtml,
} from "../utils/formatting.js";
import { CreateTasksBatchSchema } from "../schemas/task.js";
import {
  CUSTOM_FIELD_IDS,
  TASK_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
} from "../constants.js";

/**
 * Create multiple tasks in batch
 */
export async function createTasksBatch(
  client: ProductiveClient,
  args: z.infer<typeof CreateTasksBatchSchema>,
): Promise<string> {
  const results: BatchTaskResult[] = [];
  let successful = 0;
  let failed = 0;

  console.error(`Starting batch creation of ${args.tasks.length} tasks...`);

  for (let i = 0; i < args.tasks.length; i++) {
    const taskInput = args.tasks[i];

    try {
      // Build task payload
      const payload: CreateTaskPayload = {
        data: {
          type: "tasks",
          attributes: {
            title: taskInput.title,
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
      if (taskInput.description) {
        payload.data.attributes.description = markdownToHtml(
          taskInput.description,
        );
      }
      if (taskInput.due_date) {
        payload.data.attributes.due_date = taskInput.due_date;
      }
      if (taskInput.start_date) {
        payload.data.attributes.start_date = taskInput.start_date;
      }

      // Add custom fields (task_type and priority)
      const customFields: Record<string, string> = {};

      // task_type has a default from schema, so it will always be present
      const taskTypeOptionId = TASK_TYPE_OPTIONS[taskInput.task_type];
      if (taskTypeOptionId) {
        customFields[CUSTOM_FIELD_IDS.TASK_TYPE] = taskTypeOptionId;
      }

      // priority has a default from schema, so it will always be present
      const priorityOptionId = PRIORITY_OPTIONS[taskInput.priority];
      if (priorityOptionId) {
        customFields[CUSTOM_FIELD_IDS.PRIORITY] = priorityOptionId;
      }

      if (Object.keys(customFields).length > 0) {
        payload.data.attributes.custom_fields = customFields;
      }

      // Determine task list ID (individual overrides default)
      const taskListId = taskInput.task_list_id || args.default_task_list_id;
      if (taskListId && payload.data.relationships) {
        payload.data.relationships.task_list = {
          data: {
            type: "task_lists",
            id: taskListId,
          },
        };
      }

      // Determine assignee ID (individual overrides default)
      const assigneeId = taskInput.assignee_id || args.default_assignee_id;
      if (assigneeId && payload.data.relationships) {
        payload.data.relationships.assignee = {
          data: {
            type: "people",
            id: assigneeId,
          },
        };
      }

      // Create the task
      const response = await client.post<JSONAPIResponse>("/tasks", payload);
      const taskData = Array.isArray(response.data)
        ? response.data[0]
        : response.data;
      const task = formatTask(
        taskData as Task,
        client.getOrgId(),
        response.included,
      );

      results.push({
        success: true,
        task,
        index: i,
        title: taskInput.title,
      });

      successful++;
      console.error(
        `✓ Created task ${i + 1}/${args.tasks.length}: ${taskInput.title}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      results.push({
        success: false,
        error: errorMessage,
        index: i,
        title: taskInput.title,
      });

      failed++;
      console.error(
        `✗ Failed task ${i + 1}/${args.tasks.length}: ${taskInput.title} - ${errorMessage}`,
      );

      // Continue with remaining tasks even if one fails
    }
  }

  const summary: BatchOperationSummary = {
    total: args.tasks.length,
    successful,
    failed,
    results,
  };

  console.error(
    `Batch creation complete: ${successful} successful, ${failed} failed`,
  );

  const result = formatResponse(summary, args.response_format, () =>
    formatBatchSummaryMarkdown(summary),
  );

  return truncateResponse(result, args.response_format);
}
