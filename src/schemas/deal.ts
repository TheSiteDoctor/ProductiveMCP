/**
 * Deal-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Deal stage status enum (1=open, 2=won, 3=lost)
 */
export const DealStageStatusSchema = z.enum(["open", "won", "lost"]);

/**
 * Schema for listing deals
 */
export const ListDealsSchema = z
  .object({
    company_id: z.string().optional(),
    responsible_id: z.string().optional(),
    pipeline_id: z.string().optional(),
    stage_status: DealStageStatusSchema.optional(),
    status_id: z.string().optional(),
    sort: z
      .string()
      .optional()
      .describe(
        "Sort field. Prefix with - for descending. Examples: -last_activity_at, name, -created_at, -deal_value_total",
      ),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single deal
 */
export const GetDealSchema = z
  .object({
    deal_id: z.string().min(1, "Deal ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for searching deals
 */
export const SearchDealsSchema = z
  .object({
    query: z.string().min(1, "Search query is required"),
    company_id: z.string().optional(),
    stage_status: DealStageStatusSchema.optional(),
    pipeline_id: z.string().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Deal value source enum.
 *
 * - `manual`: deal value is set directly via `deal_value` (no services required).
 * - `from_services`: deal value is computed from the deal's services.
 */
export const DealValueSourceSchema = z.enum(["manual", "from_services"]);

/**
 * Schema for updating a deal
 */
export const UpdateDealSchema = z
  .object({
    deal_id: z.string().min(1, "Deal ID is required"),
    name: z.string().max(200, "Name must be 200 characters or less").optional(),
    probability: z.number().int().min(0).max(100).optional(),
    note: z.union([z.string(), z.null()]).optional(),
    tag_list: z.array(z.string()).optional(),
    deal_status_id: z
      .string()
      .optional()
      .describe("Pipeline stage ID to move the deal to"),
    deal_value: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Deal value in minor units (cents/pence). E.g. 250000 = £2,500.00. Setting this auto-sets deal_value_source to 'manual' unless explicitly overridden.",
      ),
    deal_value_source: DealValueSourceSchema.optional().describe(
      "How the deal value is determined. 'manual' uses deal_value directly; 'from_services' sums service values. Defaults to 'manual' when deal_value is supplied.",
    ),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for listing deal statuses (pipeline stages)
 */
export const ListDealStatusesSchema = z
  .object({
    pipeline_id: z.string().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a sales deal.
 *
 * Productive treats deals and budgets as the same `deals` resource:
 *   - sales deals: `budget=false` (this schema)
 *   - budgets:    `budget=true`  (see CreateBudgetSchema)
 */
export const CreateDealSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or less"),
    company_id: z.string().min(1, "company_id is required"),
    pipeline_id: z
      .string()
      .optional()
      .describe(
        "Pipeline ID. Use productive_list_pipelines to enumerate. Required by Productive when deal_status_id is set; omit only for unstaged deals.",
      ),
    deal_status_id: z
      .string()
      .optional()
      .describe(
        "Pipeline stage ID. Use productive_list_deal_statuses (filter by pipeline_id).",
      ),
    responsible_id: z
      .string()
      .optional()
      .describe("Owner person ID. Defaults to the API token's user."),
    project_id: z.string().optional(),
    contact_id: z.string().optional(),
    currency: z
      .string()
      .optional()
      .describe(
        "ISO 4217 currency code. Defaults to the company's default_currency.",
      ),
    deal_value: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Deal value in minor units (cents/pence). E.g. 60000 = £600.00. Setting this auto-sets deal_value_source to 'manual' unless overridden — letting you set a value without creating services.",
      ),
    deal_value_source: DealValueSourceSchema.optional().describe(
      "How the deal value is determined. Defaults to 'manual' when deal_value is supplied, else 'from_services'.",
    ),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO 8601 date (YYYY-MM-DD)")
      .optional()
      .describe(
        "Deal start date (YYYY-MM-DD). Maps to API attribute 'date' (not 'start_date').",
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO 8601 date (YYYY-MM-DD)")
      .optional(),
    probability: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Win probability percentage (0-100). If omitted, Productive uses the stage's default.",
      ),
    deal_type_id: z
      .number()
      .int()
      .optional()
      .describe(
        "Deal type ID. Defaults to 2 (standard sales deal) — most orgs use this.",
      ),
    note: z.string().optional().describe("Deal note (HTML accepted)."),
    tag_list: z.array(z.string()).optional(),
    custom_fields: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Custom field values keyed by field ID. Use productive_list_custom_fields with customizable_type='deals' to discover required fields and option IDs. Single-select: option ID string. Multi-select: array of option ID strings.",
      ),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a budget.
 *
 * Budgets are deals with `budget=true`. Same endpoint, same payload shape,
 * minus the sales-specific fields (probability, deal_status, pipeline).
 */
export const CreateBudgetSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or less"),
    company_id: z.string().min(1, "company_id is required"),
    project_id: z.string().optional(),
    responsible_id: z.string().optional(),
    currency: z
      .string()
      .optional()
      .describe("ISO 4217 currency code. Defaults to company default."),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO 8601 date (YYYY-MM-DD)")
      .optional()
      .describe("Budget start date (maps to API attribute 'date')."),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO 8601 date (YYYY-MM-DD)")
      .optional(),
    note: z.string().optional(),
    tag_list: z.array(z.string()).optional(),
    custom_fields: z.record(z.string(), z.unknown()).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
