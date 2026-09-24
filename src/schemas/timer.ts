/**
 * Timer-related Zod schemas
 *
 * Productive's running timer is a first-class resource (`/timers`) separate
 * from the immutable time-entry it converts to when stopped. These schemas
 * cover start / stop / get-running / patch-while-running operations.
 */

import { z } from "zod";
import { ResponseFormatSchema } from "./common.js";

const ISODateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    "Must be an ISO 8601 datetime (e.g. 2026-05-08T14:30:00Z)",
  );

/**
 * Schema for starting a running timer.
 */
export const StartTimerSchema = z
  .object({
    service_id: z.string().min(1, "Service ID is required"),
    task_id: z.string().optional(),
    note: z.string().max(5000).optional(),
    started_at: ISODateTimeSchema.optional(),
    person_id: z
      .string()
      .optional()
      .describe(
        "Person to start the timer for. Defaults to the authenticated user (resolved via PRODUCTIVE_PERSON_ID env or /people/me).",
      ),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for stopping a running timer.
 *
 * Productive's stop endpoint (`PATCH /timers/{id}/stop`) takes an empty
 * body and stops at "now". To back-date a stop (e.g. for idle detection),
 * stop the timer first, then call `productive_update_time_entry` on the
 * resulting entry to adjust `time_minutes` (and `started_at` if needed)
 * to discard the idle gap.
 *
 * `note` and `billable_time_minutes` here are conveniences applied via
 * `PATCH /time_entries/{linked}` immediately before the stop call.
 */
export const StopTimerSchema = z
  .object({
    timer_id: z.string().min(1, "Timer ID is required"),
    note: z.string().max(5000).optional(),
    billable_time_minutes: z.coerce.number().int().min(0).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for fetching the current running timer for a person.
 */
export const GetRunningTimerSchema = z
  .object({
    person_id: z
      .string()
      .optional()
      .describe(
        "Person whose running timer to fetch. Defaults to the authenticated user.",
      ),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for patching a running timer's metadata — note, task link,
 * service, or billable time. Internally these route through
 * `PATCH /time_entries/{linked}` since Productive timers themselves are
 * not directly patchable.
 *
 * Pass `task_id: null` to unlink the task without stopping the timer.
 *
 * NOTE: Productive's API does not expose a way to backdate a running
 * timer's `started_at`. To anchor the start time to a past moment, stop
 * the running timer and start a new one with `started_at` set in the
 * past — `productive_start_timer` accepts `started_at` directly.
 */
export const UpdateTimerSchema = z
  .object({
    timer_id: z.string().min(1, "Timer ID is required"),
    note: z.string().max(5000).optional().nullable(),
    service_id: z.string().optional(),
    task_id: z.string().optional().nullable(),
    billable_time_minutes: z.coerce.number().int().min(0).optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
