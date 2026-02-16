/**
 * Workflow operation tools - smart helpers for common task workflows
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import {
  MarkAsBlockedBySchema,
  MarkAsDuplicateSchema,
} from "../schemas/workflow.js";
import { updateTask } from "./tasks.js";
import { createTaskDependency } from "./dependencies.js";

/**
 * Mark a task as blocked by another task
 * This sets the task status to "Blocked" and creates a waiting_on dependency
 */
export async function markAsBlockedBy(
  client: ProductiveClient,
  args: z.infer<typeof MarkAsBlockedBySchema>,
): Promise<string> {
  try {
    // Step 1: Update the task status to "Blocked"
    await updateTask(client, {
      task_id: args.task_id,
      workflow_status: "Blocked",
      response_format: args.response_format,
    });

    // Step 2: Create a "waiting_on" dependency (this task is waiting on the blocking task)
    const dependencyResult = await createTaskDependency(client, {
      task_id: args.task_id,
      dependent_task_id: args.blocked_by_task_id,
      dependency_type: "waiting_on",
      response_format: args.response_format,
    });

    return dependencyResult;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to mark task as blocked: ${errorMessage}`);
  }
}

/**
 * Mark a task as duplicate/obsolete
 * This sets the task status to "Obsolete / Won't Fix" and creates a related dependency
 */
export async function markAsDuplicate(
  client: ProductiveClient,
  args: z.infer<typeof MarkAsDuplicateSchema>,
): Promise<string> {
  try {
    // Step 1: Update the task status to "Obsolete / Won't Fix"
    await updateTask(client, {
      task_id: args.task_id,
      workflow_status: "Obsolete / Won't Fix",
      response_format: args.response_format,
    });

    // Step 2: Create a "related" dependency to link to the original task
    const dependencyResult = await createTaskDependency(client, {
      task_id: args.task_id,
      dependent_task_id: args.duplicate_of_task_id,
      dependency_type: "related",
      response_format: args.response_format,
    });

    return dependencyResult;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to mark task as duplicate: ${errorMessage}`);
  }
}
