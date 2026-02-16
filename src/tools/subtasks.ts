/**
 * Sub-task (child task) related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type { JSONAPIResponse, Task } from "../types.js";
import { ListSubtasksSchema } from "../schemas/subtask.js";
import {
  formatTask,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";

/**
 * Format sub-tasks as markdown
 */
function formatSubtasksMarkdown(
  subtasks: ReturnType<typeof formatTask>[],
  parentTaskId: string,
  total?: number,
): string {
  if (subtasks.length === 0) {
    return `No sub-tasks found for task ${parentTaskId}.`;
  }

  const lines = ["# Sub-tasks (Child Tasks)", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} sub-tasks`, "");
  }

  for (const task of subtasks) {
    const status = task.closed ? "✓" : "○";
    const taskNum = task.number ? `#${task.number}` : task.id;
    const priority = task.priority ? ` [${task.priority}]` : "";
    const taskType = task.task_type ? ` (${task.task_type})` : "";

    lines.push(`${status} **${taskNum}**: ${task.title}${taskType}${priority}`);

    if (task.assignee_name) {
      lines.push(`  Assignee: ${task.assignee_name}`);
    }

    if (task.workflow_status) {
      lines.push(`  Status: ${task.workflow_status}`);
    }

    if (task.due_date) {
      lines.push(`  Due: ${task.due_date}`);
    }

    if (task.url) {
      lines.push(`  [View](${task.url})`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * List sub-tasks (child tasks) for a parent task
 *
 * Note: Sub-tasks are tasks that have a parent_task relationship.
 * This is different from todos/checklists which are simple checkbox items.
 */
export async function listSubtasks(
  client: ProductiveClient,
  args: z.infer<typeof ListSubtasksSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "filter[parent_task_id]": args.parent_task_id,
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "project,task_list,assignee,workflow_status,attachments",
  };

  // Add closed filter if specified
  if (args.closed !== undefined) {
    params["filter[closed]"] = args.closed;
  }

  const response = await client.get<JSONAPIResponse>("/tasks", params);

  const subtasks = (
    Array.isArray(response.data) ? response.data : [response.data]
  )
    .filter((item) => item !== null)
    .map((task) =>
      formatTask(task as Task, client.getOrgId(), response.included),
    );

  const total = response.meta?.total_count;

  const result = formatResponse(
    {
      subtasks,
      total,
      count: subtasks.length,
      parent_task_id: args.parent_task_id,
    },
    args.response_format,
    () => formatSubtasksMarkdown(subtasks, args.parent_task_id, total),
  );

  return truncateResponse(result, args.response_format);
}
