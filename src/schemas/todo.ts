/**
 * Todo-related Zod schemas
 */

import { z } from 'zod';
import {
  ResponseFormatSchema,
  ISO8601DateSchema,
  OptionalISO8601DateSchema,
} from './common.js';

/**
 * Schema for creating a single todo item
 */
export const CreateTodoSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  description: z.string().min(1, 'Description is required').max(5000, 'Description must be 5000 characters or less'),
  due_date: ISO8601DateSchema.optional(),
  assignee_id: z.string().optional(),
  closed: z.boolean().optional(),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for listing todos for a task
 */
export const ListTodosSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for getting a specific todo
 */
export const GetTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for updating a todo
 */
export const UpdateTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
  description: z.string().min(1, 'Description must not be empty').max(5000, 'Description must be 5000 characters or less').optional(),
  due_date: OptionalISO8601DateSchema,
  closed: z.boolean().optional(),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for deleting a todo
 */
export const DeleteTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
}).strict();

/**
 * Schema for a single todo item in task creation
 */
export const TodoItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(5000, 'Description must be 5000 characters or less'),
  due_date: ISO8601DateSchema.optional(),
  assignee_id: z.string().optional(),
  closed: z.boolean().optional(),
}).strict();
