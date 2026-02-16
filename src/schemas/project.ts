/**
 * Project-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Schema for listing projects
 */
export const ListProjectsSchema = z
  .object({
    status: z.enum(["active", "archived", "all"]).default("active"),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for listing task lists
 */
export const ListTaskListsSchema = z
  .object({
    project_id: z.string().min(1, "Project ID is required"),
    board_id: z.string().optional(),
    include_inactive: z.boolean().default(false),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for listing people
 */
export const ListPeopleSchema = z
  .object({
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for listing boards
 */
export const ListBoardsSchema = z
  .object({
    project_id: z.string().min(1, "Project ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single task list
 */
export const GetTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a task list
 */
export const CreateTaskListSchema = z
  .object({
    project_id: z.string().min(1, "Project ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or less"),
    board_id: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a task list
 */
export const UpdateTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or less"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for archiving a task list
 */
export const ArchiveTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for restoring a task list
 */
export const RestoreTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for deleting a task list
 */
export const DeleteTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
  })
  .strict();

/**
 * Schema for repositioning a task list
 */
export const RepositionTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    move_before_id: z.string().min(1, "Move before ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for moving a task list to a different board
 */
export const MoveTaskListSchema = z
  .object({
    task_list_id: z.string().min(1, "Task list ID is required"),
    board_id: z.string().min(1, "Board ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for copying a task list
 */
export const CopyTaskListSchema = z
  .object({
    template_id: z.string().min(1, "Template task list ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or less"),
    project_id: z.string().min(1, "Project ID is required"),
    board_id: z.string().optional(),
    copy_open_tasks: z.boolean().default(true),
    copy_assignees: z.boolean().default(true),
    response_format: ResponseFormatSchema,
  })
  .strict();
