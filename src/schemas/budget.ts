/**
 * Budget-related Zod schemas
 */

import { z } from "zod";
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
  ISO8601DateSchema,
} from "./common.js";

/**
 * Budget status enum (1=open, 2=closed)
 */
export const BudgetStatusSchema = z.enum(["open", "closed"]);

/**
 * Schema for listing budgets
 */
export const ListBudgetsSchema = z
  .object({
    project_id: z.string().optional(),
    company_id: z.string().optional(),
    responsible_id: z.string().optional(),
    status: BudgetStatusSchema.optional(),
    recurring: z.boolean().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single budget
 */
export const GetBudgetSchema = z
  .object({
    budget_id: z.string().min(1, "Budget ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a budget
 */
export const UpdateBudgetSchema = z
  .object({
    budget_id: z.string().min(1, "Budget ID is required"),
    name: z.string().max(200, "Name must be 200 characters or less").optional(),
    end_date: z.union([ISO8601DateSchema, z.null()]).optional(),
    delivered_on: z.union([ISO8601DateSchema, z.null()]).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for marking a budget as delivered
 */
export const MarkBudgetDeliveredSchema = z
  .object({
    budget_id: z.string().min(1, "Budget ID is required"),
    delivered_on: ISO8601DateSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for closing a budget
 */
export const CloseBudgetSchema = z
  .object({
    budget_id: z.string().min(1, "Budget ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for auditing project budgets
 */
export const AuditProjectBudgetsSchema = z
  .object({
    project_id: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
