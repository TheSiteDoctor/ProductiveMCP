/**
 * Task-related Zod schemas
 */

import { z } from "zod";
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
  ISO8601DateSchema,
  OptionalISO8601DateSchema,
} from "./common.js";
import { TASK_TYPES, PRIORITIES } from "../constants.js";
import { TodoItemSchema } from "./todo.js";

/**
 * Schema for creating a single task
 */
export const CreateTaskSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be 200 characters or less"),
    description: z
      .string()
      .max(10000, "Description must be 10000 characters or less")
      .optional(),
    project_id: z.string().min(1, "Project ID is required"),
    task_list_id: z.string().min(1, "Task list ID is required"),
    assignee_id: z.string().optional(),
    due_date: ISO8601DateSchema.optional(),
    start_date: ISO8601DateSchema.optional(),
    initial_estimate: z.coerce
      .number()
      .int()
      .min(0, "Initial estimate must be a positive number")
      .optional(),
    task_type: z.enum(TASK_TYPES).default("Task"),
    priority: z.enum(PRIORITIES).default("Medium"),
    workflow_status: z.string().optional(),
    labels: z.array(z.string()).optional(),
    parent_task_id: z.string().optional(),
    todos: z.array(TodoItemSchema).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for searching tasks
 */
export const SearchTasksSchema = z
  .object({
    query: z.string().optional(),
    project_id: z.string().optional(),
    assignee_id: z.string().optional(),
    closed: z.boolean().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a task
 */
export const GetTaskSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a task
 */
export const UpdateTaskSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    title: z
      .string()
      .min(1, "Title must not be empty")
      .max(200, "Title must be 200 characters or less")
      .optional(),
    description: z
      .string()
      .max(10000, "Description must be 10000 characters or less")
      .optional()
      .nullable(),
    due_date: OptionalISO8601DateSchema,
    start_date: OptionalISO8601DateSchema,
    closed: z.boolean().optional(),
    assignee_id: z.string().optional().nullable(),
    estimate_minutes: z.coerce.number().int().min(0).optional(),
    priority: z.enum(PRIORITIES).optional(),
    task_type: z.enum(TASK_TYPES).optional(),
    workflow_status: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for a single task in batch creation
 */
export const BatchTaskItemSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be 200 characters or less"),
    description: z
      .string()
      .max(10000, "Description must be 10000 characters or less")
      .optional(),
    due_date: ISO8601DateSchema.optional(),
    start_date: ISO8601DateSchema.optional(),
    task_list_id: z.string().optional(),
    assignee_id: z.string().optional(),
    task_type: z.enum(TASK_TYPES).default("Task"),
    priority: z.enum(PRIORITIES).default("Medium"),
  })
  .strict();

/**
 * Schema for batch task creation
 */
export const CreateTasksBatchSchema = z
  .object({
    tasks: z.array(BatchTaskItemSchema).min(1, "At least one task is required"),
    project_id: z.string().min(1, "Project ID is required"),
    default_task_list_id: z.string().optional(),
    default_assignee_id: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
