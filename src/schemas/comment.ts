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

/**
 * Schema for creating a comment on a task
 */
export const CreateCommentSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    body: z
      .string()
      .min(1, "Comment body is required")
      .max(10000, "Comment body must be 10000 characters or less"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a specific comment
 */
export const GetCommentSchema = z
  .object({
    comment_id: z.string().min(1, "Comment ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a comment
 */
export const UpdateCommentSchema = z
  .object({
    comment_id: z.string().min(1, "Comment ID is required"),
    body: z
      .string()
      .min(1, "Comment body must not be empty")
      .max(10000, "Comment body must be 10000 characters or less"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for deleting a comment
 */
export const DeleteCommentSchema = z
  .object({
    comment_id: z.string().min(1, "Comment ID is required"),
  })
  .strict();
