/**
 * Comment-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Schema for listing task comments
 */
export const ListCommentsSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
