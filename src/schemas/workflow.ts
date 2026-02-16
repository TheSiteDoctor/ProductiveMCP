/**
 * Workflow operation schemas
 */

import { z } from "zod";
import { ResponseFormatSchema } from "./common.js";

/**
 * Schema for marking a task as blocked by another task
 */
export const MarkAsBlockedBySchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    blocked_by_task_id: z.string().min(1, "Blocking task ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for marking a task as duplicate/obsolete
 */
export const MarkAsDuplicateSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    duplicate_of_task_id: z.string().min(1, "Original task ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();
