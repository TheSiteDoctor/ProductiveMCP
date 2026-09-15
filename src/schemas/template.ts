/**
 * Task template Zod schemas
 *
 * Two groups live here:
 * 1. Schemas describing a template file on disk (TaskTemplateSchema and the
 *    recursive TemplateTaskSchema it contains)
 * 2. Schemas validating the MCP tool arguments (list/get/apply)
 */

import { z } from "zod";
import { ResponseFormatSchema } from "./common.js";
import { TASK_TYPES, PRIORITIES } from "../constants.js";

/**
 * A single task inside a template. Tasks nest arbitrarily deep via
 * `subtasks`; each level is created with a parent_task relationship.
 */
export interface TemplateTask {
  title: string;
  description?: string;
  task_type?: (typeof TASK_TYPES)[number];
  priority?: (typeof PRIORITIES)[number];
  labels?: string[];
  estimate_minutes?: number;
  due_in_days?: number;
  subtasks?: TemplateTask[];
}

export const TemplateTaskSchema: z.ZodType<TemplateTask> = z.lazy(() =>
  z
    .object({
      title: z
        .string()
        .min(1, "Task title is required")
        .max(200, "Task title must be 200 characters or less"),
      description: z
        .string()
        .max(10000, "Task description must be 10000 characters or less")
        .optional(),
      task_type: z.enum(TASK_TYPES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      labels: z.array(z.string()).optional(),
      estimate_minutes: z.coerce
        .number()
        .int()
        .min(0, "Estimate must be a positive number of minutes")
        .optional(),
      due_in_days: z.coerce
        .number()
        .int()
        .min(0, "due_in_days must be zero or more days from the apply date")
        .optional(),
      subtasks: z.array(TemplateTaskSchema).optional(),
    })
    .strict(),
);

/**
 * A variable a template declares. Placeholders in the template body are
 * written as {{name}} and replaced when the template is applied.
 */
export const TemplateVariableSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Variable names must be lower_snake_case (letters, digits, underscores)",
      ),
    description: z.string().optional(),
    default: z.string().optional(),
  })
  .strict();

/**
 * A task list within a template. Maps to a Productive task list; when a
 * list with the same name already exists in the target project it can be
 * reused instead of duplicated.
 */
export const TemplateTaskListSchema = z
  .object({
    name: z
      .string()
      .min(1, "Task list name is required")
      .max(200, "Task list name must be 200 characters or less"),
    tasks: z
      .array(TemplateTaskSchema)
      .min(1, "A task list needs at least one task"),
  })
  .strict();

/**
 * A template file. `name` is the identifier used by the tools; the file
 * name (without .json) is accepted as an alias.
 */
export const TaskTemplateSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]*$/,
        "Template names must be kebab-case (lowercase letters, digits, hyphens)",
      ),
    title: z.string().min(1, "Template title is required"),
    description: z.string().optional(),
    variables: z.array(TemplateVariableSchema).optional(),
    task_lists: z
      .array(TemplateTaskListSchema)
      .min(1, "A template needs at least one task list"),
  })
  .strict();

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type TemplateTaskList = z.infer<typeof TemplateTaskListSchema>;

// ---------------------------------------------------------------------------
// Tool argument schemas
// ---------------------------------------------------------------------------

export const ListTaskTemplatesSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();

export const GetTaskTemplateSchema = z
  .object({
    template: z.string().min(1, "Template name is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const ApplyTaskTemplateSchema = z
  .object({
    template: z.string().min(1, "Template name is required"),
    project_id: z.string().min(1, "Project ID is required"),
    board_id: z.string().optional(),
    variables: z.record(z.string(), z.string()).optional(),
    default_assignee_id: z.string().optional(),
    reuse_existing_task_lists: z.boolean().default(true),
    dry_run: z.boolean().default(false),
    response_format: ResponseFormatSchema,
  })
  .strict();
