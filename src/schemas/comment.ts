/**
 * Comment-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Resource types Productive lets you post a comment on.
 *
 * Sent to the API as the relationship key (`task`, `deal`, ...). The list
 * endpoint only supports filtering by `task_id` or `project_id`; other types
 * must be fetched individually via productive_get_comment.
 */
export const CommentableTypeSchema = z.enum([
  "task",
  "deal",
  "project",
  "discussion",
  "invoice",
  "person",
  "company",
  "purchase_order",
]);

/**
 * Schema for listing comments.
 *
 * The Productive API only supports filtering this endpoint by `task_id` or
 * `project_id`. Other commentable types (deals, invoices, etc.) cannot be
 * listed in bulk — you can only fetch their comments one at a time by ID.
 */
export const ListCommentsSchema = z
  .object({
    task_id: z.string().optional().describe("Filter comments by task ID."),
    project_id: z
      .string()
      .optional()
      .describe(
        "Filter comments by project ID. Either task_id or project_id must be provided.",
      ),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine((v) => Boolean(v.task_id || v.project_id), {
    message: "Either task_id or project_id is required",
  });

/**
 * Schema for creating a comment.
 *
 * Accepts either:
 *  - `task_id` (legacy shorthand, equivalent to commentable_type="task")
 *  - `commentable_type` + `commentable_id` (polymorphic — for deals, projects,
 *    invoices, etc.)
 */
export const CreateCommentSchema = z
  .object({
    task_id: z
      .string()
      .optional()
      .describe(
        "Legacy: parent task ID. Equivalent to commentable_type='task' + commentable_id=<task_id>.",
      ),
    commentable_type: CommentableTypeSchema.optional().describe(
      "Type of resource to attach the comment to (task, deal, project, etc.).",
    ),
    commentable_id: z
      .string()
      .optional()
      .describe(
        "ID of the resource to attach the comment to. Must be paired with commentable_type.",
      ),
    body: z
      .string()
      .min(1, "Comment body is required")
      .max(10000, "Comment body must be 10000 characters or less"),
    visible_to_clients: z.boolean().optional().default(true),
    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine(
    (v) =>
      Boolean(v.task_id) ||
      (Boolean(v.commentable_type) && Boolean(v.commentable_id)),
    {
      message:
        "Provide either task_id, or both commentable_type and commentable_id.",
    },
  );

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
      .max(10000, "Comment body must be 10000 characters or less")
      .optional(),
    visible_to_clients: z.boolean().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine((data) => data.body !== undefined || data.visible_to_clients !== undefined, {
    message: "At least one of body or visible_to_clients must be provided",
  });

/**
 * Schema for deleting a comment
 */
export const DeleteCommentSchema = z
  .object({
    comment_id: z.string().min(1, "Comment ID is required"),
  })
  .strict();
