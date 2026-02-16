/**
 * Revenue Distribution-related Zod schemas
 */

import { z } from "zod";
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
  ISO8601DateSchema,
} from "./common.js";

/**
 * Schema for listing revenue distributions
 */
export const ListRevenueDistributionsSchema = z
  .object({
    deal_id: z.string().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single revenue distribution
 */
export const GetRevenueDistributionSchema = z
  .object({
    distribution_id: z.string().min(1, "Distribution ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a revenue distribution
 */
export const CreateRevenueDistributionSchema = z
  .object({
    deal_id: z.string().min(1, "Deal ID is required"),
    start_on: ISO8601DateSchema,
    end_on: ISO8601DateSchema,
    amount_percent: z.coerce
      .number()
      .min(0, "Amount percent must be 0 or greater")
      .max(100, "Amount percent cannot exceed 100"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a revenue distribution
 */
export const UpdateRevenueDistributionSchema = z
  .object({
    distribution_id: z.string().min(1, "Distribution ID is required"),
    start_on: ISO8601DateSchema.optional(),
    end_on: ISO8601DateSchema.optional(),
    amount_percent: z.coerce
      .number()
      .min(0, "Amount percent must be 0 or greater")
      .max(100, "Amount percent cannot exceed 100")
      .optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for deleting a revenue distribution
 */
export const DeleteRevenueDistributionSchema = z
  .object({
    distribution_id: z.string().min(1, "Distribution ID is required"),
  })
  .strict();

/**
 * Schema for extending a revenue distribution end date
 */
export const ExtendRevenueDistributionSchema = z
  .object({
    distribution_id: z.string().min(1, "Distribution ID is required"),
    new_end_on: ISO8601DateSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for reporting overdue distributions
 */
export const ReportOverdueDistributionsSchema = z
  .object({
    as_of_date: ISO8601DateSchema.optional(),
    project_id: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
