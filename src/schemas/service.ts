/**
 * Service and Service Type Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Billing type enum
 * 1=Fixed, 2=Time and Materials, 3=None/Not Billable
 */
export const BILLING_TYPES = [
  "Fixed",
  "Time and Materials",
  "Non-Billable",
] as const;

/**
 * Unit enum
 * 1=Hour, 2=Piece, 3=Day
 */
export const UNITS = ["Hour", "Piece", "Day"] as const;

/**
 * Schema for listing services
 */
export const ListServicesSchema = z
  .object({
    deal_id: z.string().optional(),
    project_id: z.string().optional(),
    person_id: z.string().optional(),
    billing_type: z.enum(BILLING_TYPES).optional(),
    time_tracking_enabled: z.boolean().optional(),
    expense_tracking_enabled: z.boolean().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single service
 */
export const GetServiceSchema = z
  .object({
    service_id: z.string().min(1, "Service ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a service
 */
export const CreateServiceSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    deal_id: z.string().min(1, "Budget/deal ID is required"),
    service_type_id: z.string().min(1, "Service type ID is required"),
    billing_type: z.enum(BILLING_TYPES).default("Time and Materials"),
    unit: z.enum(UNITS).default("Hour"),
    price: z.string().optional(),
    quantity: z.string().optional(),
    person_id: z.string().optional(),
    time_tracking_enabled: z.boolean().default(true),
    expense_tracking_enabled: z.boolean().default(false),
    booking_tracking_enabled: z.boolean().default(false),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a service
 */
export const UpdateServiceSchema = z
  .object({
    service_id: z.string().min(1, "Service ID is required"),
    name: z.string().min(1).max(200).optional(),
    description: z.union([z.string().max(5000), z.null()]).optional(),
    billing_type: z.enum(BILLING_TYPES).optional(),
    unit: z.enum(UNITS).optional(),
    price: z.string().optional(),
    quantity: z.string().optional(),
    time_tracking_enabled: z.boolean().optional(),
    expense_tracking_enabled: z.boolean().optional(),
    booking_tracking_enabled: z.boolean().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

// --- Service Type Schemas ---

/**
 * Schema for listing service types
 */
export const ListServiceTypesSchema = z
  .object({
    query: z.string().optional(),
    person_id: z.string().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single service type
 */
export const GetServiceTypeSchema = z
  .object({
    service_type_id: z.string().min(1, "Service type ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for creating a service type
 */
export const CreateServiceTypeSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for updating a service type
 */
export const UpdateServiceTypeSchema = z
  .object({
    service_type_id: z.string().min(1, "Service type ID is required"),
    name: z.string().min(1).max(200).optional(),
    description: z.union([z.string().max(5000), z.null()]).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for archiving a service type
 */
export const ArchiveServiceTypeSchema = z
  .object({
    service_type_id: z.string().min(1, "Service type ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();
