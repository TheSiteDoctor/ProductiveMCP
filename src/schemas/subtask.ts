/**
 * Sub-task (child task) related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Schema for listing sub-tasks (child tasks) of a parent task
 */
export const ListSubtasksSchema = z
  .object({
    parent_task_id: z.string().min(1, "Parent task ID is required"),
    closed: z.boolean().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
