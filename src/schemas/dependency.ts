/**
 * Task dependency Zod schemas
 */

import { z } from 'zod';
import { ResponseFormatSchema } from './common.js';
import { DEPENDENCY_TYPES } from '../constants.js';

/**
 * Dependency type enum schema
 */
export const DependencyTypeSchema = z.enum(DEPENDENCY_TYPES);

/**
 * Schema for creating a task dependency
 */
export const CreateTaskDependencySchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  dependent_task_id: z.string().min(1, 'Dependent task ID is required'),
  dependency_type: DependencyTypeSchema,
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for listing task dependencies
 */
export const ListTaskDependenciesSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for getting a specific task dependency
 */
export const GetTaskDependencySchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for updating a task dependency
 */
export const UpdateTaskDependencySchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
  dependency_type: DependencyTypeSchema,
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for deleting a task dependency
 */
export const DeleteTaskDependencySchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
}).strict();
