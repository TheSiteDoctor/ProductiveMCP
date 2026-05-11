/**
 * Custom-field-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Productive resource types that support custom fields.
 *
 * NOTE: the API filter is the plural form (e.g. `deals`, `tasks`).
 */
export const CustomizableTypeSchema = z.enum([
  "deals",
  "tasks",
  "projects",
  "people",
  "companies",
  "employees",
  "invoices",
  "time_entries",
  "expenses",
  "services",
  "documents",
]);

/**
 * Schema for listing custom fields, optionally filtered by resource type.
 */
export const ListCustomFieldsSchema = z
  .object({
    customizable_type: CustomizableTypeSchema.optional().describe(
      "Filter by the resource type the custom field is attached to (plural form, e.g. 'deals', 'tasks').",
    ),
    include_archived: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Include archived custom fields. Defaults to false (active only).",
      ),
    include_options: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "For select / multi-select fields, fetch the available option IDs and labels. Defaults to true.",
      ),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
