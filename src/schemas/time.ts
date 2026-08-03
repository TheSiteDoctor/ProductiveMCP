/**
 * Time tracking Zod schemas (timers and time entries)
 */

import { z } from "zod";
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
  ISO8601DateSchema,
} from "./common.js";

/**
 * Schema for starting a timer.
 *
 * Productive logs time against a *service* (a budget line), not a task. Supply
 * one of:
 *   - `service_id`     — start a fresh timer on that service
 *   - `task_id`        — resolve the task's service, then start a timer on it
 *   - `time_entry_id`  — resume timing an existing entry
 */
export const StartTimerSchema = z
  .object({
    service_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    time_entry_id: z.string().min(1).optional(),
    person_id: z
      .string()
      .min(1)
      .optional()
      .describe("Defaults to the person owning the API token"),
    note: z.string().max(2000).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine(
    (args) =>
      Boolean(args.service_id || args.task_id || args.time_entry_id),
    {
      message:
        "Provide one of service_id, task_id, or time_entry_id — Productive needs a service to log time against",
    },
  );

/**
 * Schema for stopping a timer. With no timer_id, stops the running timer
 * belonging to the person owning the API token.
 */
export const StopTimerSchema = z
  .object({
    timer_id: z.string().min(1).optional(),
    person_id: z.string().min(1).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for inspecting the currently running timer.
 */
export const GetRunningTimerSchema = z
  .object({
    person_id: z.string().min(1).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for logging time manually (no timer involved).
 */
export const LogTimeSchema = z
  .object({
    service_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    minutes: z.coerce
      .number()
      .int()
      .min(1, "Minutes must be at least 1")
      .max(1440, "Minutes cannot exceed 1440 (24 hours)"),
    date: ISO8601DateSchema.optional().describe("Defaults to today"),
    note: z.string().max(2000).optional(),
    person_id: z.string().min(1).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine((args) => Boolean(args.service_id || args.task_id), {
    message:
      "Provide service_id or task_id — Productive needs a service to log time against",
  });

/**
 * Schema for listing time entries.
 *
 * Note: the /time_entries endpoint rejects `sort` entirely, so no sort option
 * is exposed here.
 */
export const ListTimeEntriesSchema = z
  .object({
    person_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    service_id: z.string().min(1).optional(),
    after: ISO8601DateSchema.optional().describe(
      "Only entries on or after this date",
    ),
    before: ISO8601DateSchema.optional().describe(
      "Only entries on or before this date",
    ),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
