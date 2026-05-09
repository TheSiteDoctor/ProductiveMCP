/**
 * Time-entry-related Zod schemas
 *
 * Time entries are immutable-by-default logs of work done. Use these for
 * manual past-tense entries; for live tracking, use the timer schemas.
 */

import { z } from "zod";
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
  ISO8601DateSchema,
} from "./common.js";

const ISODateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    "Must be an ISO 8601 datetime (e.g. 2026-05-08T14:30:00Z)",
  );

/**
 * Schema for creating a manual time entry.
 *
 * `time_minutes` maps to Productive's `time` attribute (which is in minutes,
 * not hours — easy to get wrong).
 */
export const CreateTimeEntrySchema = z
  .object({
    service_id: z.string().min(1, "Service ID is required"),
    task_id: z.string().optional(),
    date: ISO8601DateSchema,
    time_minutes: z.coerce
      .number()
      .int()
      .min(1, "Time entry must be at least 1 minute"),
    billable_time_minutes: z.coerce.number().int().min(0).optional(),
    note: z.string().max(5000).optional(),
    started_at: ISODateTimeSchema.optional(),
    person_id: z
      .string()
      .optional()
      .describe("Person to log time for. Defaults to the authenticated user."),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for patching an existing time entry.
 *
 * Pass `task_id: null` to unlink the task. Pass `note: null` to clear notes.
 */
export const UpdateTimeEntrySchema = z
  .object({
    time_entry_id: z.string().min(1, "Time entry ID is required"),
    date: ISO8601DateSchema.optional(),
    time_minutes: z.coerce.number().int().min(1).optional(),
    billable_time_minutes: z.coerce.number().int().min(0).optional(),
    note: z.string().max(5000).optional().nullable(),
    started_at: ISODateTimeSchema.optional().nullable(),
    service_id: z.string().optional(),
    task_id: z.string().optional().nullable(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for deleting a time entry. Irreversible.
 */
export const DeleteTimeEntrySchema = z
  .object({
    time_entry_id: z.string().min(1, "Time entry ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for listing time entries.
 *
 * Defaults to the last 7 days for the authenticated user to keep responses
 * inside the 25k-character cap.
 */
export const ListTimeEntriesSchema = z
  .object({
    person_id: z
      .string()
      .optional()
      .describe(
        "Person whose time entries to fetch. Defaults to the authenticated user.",
      ),
    date_from: ISO8601DateSchema.optional().describe(
      "Start of the date range (inclusive). Defaults to 7 days ago.",
    ),
    date_to: ISO8601DateSchema.optional().describe(
      "End of the date range (inclusive). Defaults to today.",
    ),
    service_id: z.string().optional(),
    task_id: z.string().optional(),
    project_id: z.string().optional(),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
