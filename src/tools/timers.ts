/**
 * Timer-related MCP tools — start, stop, get-running, update.
 *
 * Productive's timer model (verified empirically against the live API):
 *
 *   POST   /timers                  — start. Accepts attributes.started_at
 *                                     and relationships.service. Auto-mints
 *                                     a linked time_entry; the service
 *                                     propagates, but task / note / billable
 *                                     do NOT — those need a follow-up
 *                                     PATCH /time_entries/{linked}.
 *   GET    /timers, /timers/{id}    — read. Use ?include=time_entry to get
 *                                     the metadata.
 *   PATCH  /timers/{id}/stop        — stop (custom action). Empty body.
 *                                     Sets stopped_at and computes total_time.
 *   PATCH  /timers/{id}             — 404. Timers are not directly patchable.
 *   DELETE /timers/{id}             — 404. No deletion.
 *
 * All metadata edits (note, task, service, billable_time) flow through
 * PATCH /time_entries/{linked}. There is no public way to backdate a
 * running timer's started_at — to "anchor" the start, stop and start a
 * new timer with `started_at` in the past via productive_start_timer.
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type { JSONAPIResponse, Timer, CreateTimerPayload } from "../types.js";
import {
  formatTimer,
  formatTimerMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  StartTimerSchema,
  StopTimerSchema,
  GetRunningTimerSchema,
  UpdateTimerSchema,
} from "../schemas/timer.js";
import { ProductiveAPIError } from "../utils/errors.js";

// ---------------------------------------------------------------------------
// Current-user resolution
// ---------------------------------------------------------------------------

/**
 * Cached current-user person ID. The Productive person ID for the
 * authenticated token doesn't change, so we cache for the process lifetime.
 */
let cachedPersonId: string | null = null;

/**
 * Resolve the current user's person ID.
 *
 * Lookup order:
 *   1. `PRODUCTIVE_PERSON_ID` environment variable (fast path).
 *   2. `GET /people/me` (the documented current-user endpoint).
 *   3. `GET /people?filter[email]={PRODUCTIVE_USER_EMAIL}` if the env var
 *      is set — used as a fallback in orgs where `/people/me` 404s.
 *
 * Throws `ProductiveAPIError` if none of the above resolve, with
 * actionable instructions for the user.
 */
export async function resolveCurrentPersonId(
  client: ProductiveClient,
): Promise<string> {
  if (cachedPersonId) return cachedPersonId;

  const fromEnv = process.env.PRODUCTIVE_PERSON_ID;
  if (fromEnv) {
    cachedPersonId = fromEnv;
    return fromEnv;
  }

  // Try /people/me first.
  try {
    const meResponse = await client.get<JSONAPIResponse>("/people/me");
    const meData = Array.isArray(meResponse.data)
      ? meResponse.data[0]
      : meResponse.data;
    if (meData?.id) {
      cachedPersonId = meData.id;
      return meData.id;
    }
  } catch (err) {
    try {
      console.error(
        `[Timer] /people/me lookup failed (${err instanceof Error ? err.message : err}); trying email fallback`,
      );
    } catch {
      // Ignore logging errors
    }
  }

  // Email fallback.
  const email = process.env.PRODUCTIVE_USER_EMAIL;
  if (email) {
    try {
      const emailResponse = await client.get<JSONAPIResponse>("/people", {
        "filter[email]": email,
        "page[size]": "1",
      });
      const items = Array.isArray(emailResponse.data)
        ? emailResponse.data
        : [emailResponse.data];
      if (items[0]?.id) {
        cachedPersonId = items[0].id;
        return items[0].id;
      }
    } catch {
      // Fall through to error below.
    }
  }

  throw new ProductiveAPIError(
    "Unable to resolve the current user's person ID. " +
      "Set PRODUCTIVE_PERSON_ID in your .env file (find it in your Productive profile URL), " +
      "or set PRODUCTIVE_USER_EMAIL so /people lookup can resolve it for you.",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Standard include path that pulls the linked time_entry plus its
 * service, task, project, and person — everything formatTimer needs.
 */
const TIMER_INCLUDE =
  "time_entry,time_entry.service,time_entry.task,time_entry.project,time_entry.person";

/**
 * Apply note / task / service / billable_time updates to the time_entry
 * linked to a timer. Only sends fields actually being changed so we don't
 * accidentally clear unrelated relationships.
 */
async function patchLinkedTimeEntry(
  client: ProductiveClient,
  timeEntryId: string,
  changes: {
    note?: string | null;
    billable_time_minutes?: number;
    service_id?: string;
    task_id?: string | null;
  },
): Promise<void> {
  const attributes: Record<string, unknown> = {};
  const relationships: Record<string, unknown> = {};

  if (changes.note !== undefined) attributes.note = changes.note;
  if (changes.billable_time_minutes !== undefined) {
    attributes.billable_time = changes.billable_time_minutes;
  }
  if (changes.service_id !== undefined) {
    relationships.service = {
      data: { type: "services", id: changes.service_id },
    };
  }
  if (changes.task_id !== undefined) {
    relationships.task = {
      data: changes.task_id ? { type: "tasks", id: changes.task_id } : null,
    };
  }

  const data: Record<string, unknown> = {
    type: "time_entries",
    id: timeEntryId,
  };
  if (Object.keys(attributes).length > 0) data.attributes = attributes;
  if (Object.keys(relationships).length > 0) {
    data.relationships = relationships;
  }
  if (!data.attributes && !data.relationships) return; // Nothing to do.

  await client.patch<JSONAPIResponse>(`/time_entries/${timeEntryId}`, { data });
}

/**
 * Fetch the linked time_entry id for a timer, in one round-trip.
 */
async function fetchLinkedTimeEntryId(
  client: ProductiveClient,
  timerId: string,
): Promise<string | null> {
  // Without ?include=time_entry, Productive returns the relationship as
  // `meta: { included: false }` with no `data.id`. The include is required.
  const res = await client.get<JSONAPIResponse>(`/timers/${timerId}`, {
    include: "time_entry",
  });
  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  const rels = (data?.relationships ?? {}) as Record<
    string,
    { data?: { id?: string } | null }
  >;
  return rels.time_entry?.data?.id ?? null;
}

/**
 * Re-fetch a timer with the full include path, then format it.
 */
async function loadFormattedTimer(
  client: ProductiveClient,
  timerId: string,
): Promise<ReturnType<typeof formatTimer>> {
  const res = await client.get<JSONAPIResponse>(`/timers/${timerId}`, {
    include: TIMER_INCLUDE,
  });
  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  return formatTimer(data as Timer, client.getOrgId(), res.included);
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Start a new running timer.
 *
 * `relationships.service` is the only non-trivial field that propagates
 * through `POST /timers`. Task, note, and billable_time get applied as a
 * follow-up `PATCH /time_entries/{linked}` so the resulting time_entry
 * carries them.
 *
 * Productive allows only one running timer per user — if one is already
 * active, this POST returns 422 (which the error handler surfaces).
 */
export async function startTimer(
  client: ProductiveClient,
  args: z.infer<typeof StartTimerSchema>,
): Promise<string> {
  const payload: CreateTimerPayload = {
    data: {
      type: "timers",
      attributes: {},
      relationships: {
        service: { data: { type: "services", id: args.service_id } },
      },
    },
  };
  if (args.started_at) {
    payload.data.attributes.started_at = args.started_at;
  }

  const createRes = await client.post<JSONAPIResponse>("/timers", payload, {
    include: "time_entry",
  });
  const created = Array.isArray(createRes.data)
    ? createRes.data[0]
    : createRes.data;
  if (!created?.id) {
    throw new ProductiveAPIError(
      "Productive returned no timer id from POST /timers",
    );
  }
  const rels = (created.relationships ?? {}) as Record<
    string,
    { data?: { id?: string } | null }
  >;
  const timeEntryId = rels.time_entry?.data?.id ?? null;

  // Apply task / note / billable to the linked time_entry if asked.
  if (timeEntryId && (args.task_id !== undefined || args.note !== undefined)) {
    await patchLinkedTimeEntry(client, timeEntryId, {
      note: args.note,
      task_id: args.task_id ?? undefined,
    });
  }

  const timer = await loadFormattedTimer(client, created.id);
  const result = formatResponse(timer, args.response_format, () =>
    formatTimerMarkdown(timer),
  );
  return truncateResponse(result, args.response_format);
}

/**
 * Stop a running timer via `PATCH /timers/{id}/stop`. Optional note /
 * billable_time adjustments are applied to the linked time_entry first
 * so they're persisted alongside the stop.
 */
export async function stopTimer(
  client: ProductiveClient,
  args: z.infer<typeof StopTimerSchema>,
): Promise<string> {
  if (args.note !== undefined || args.billable_time_minutes !== undefined) {
    const teId = await fetchLinkedTimeEntryId(client, args.timer_id);
    if (teId) {
      await patchLinkedTimeEntry(client, teId, {
        note: args.note,
        billable_time_minutes: args.billable_time_minutes,
      });
    }
  }

  // Stop. Empty body, custom action route — Productive returns the timer.
  await client.patch<JSONAPIResponse>(`/timers/${args.timer_id}/stop`, {
    data: { type: "timers", id: args.timer_id },
  });

  const timer = await loadFormattedTimer(client, args.timer_id);
  const result = formatResponse(timer, args.response_format, () =>
    formatTimerMarkdown(timer),
  );
  return truncateResponse(result, args.response_format);
}

/**
 * Return the current running timer for a person (or the authenticated
 * user). Productive's `filter[stopped_at]=null` is rejected, so we fetch
 * the most-recent timer for the person and check `stopped_at`
 * client-side — a running timer always has `stopped_at: null`.
 */
export async function getRunningTimer(
  client: ProductiveClient,
  args: z.infer<typeof GetRunningTimerSchema>,
): Promise<string> {
  const personId = args.person_id ?? (await resolveCurrentPersonId(client));

  const response = await client.get<JSONAPIResponse>("/timers", {
    "filter[person_id]": personId,
    sort: "-started_at",
    include: TIMER_INCLUDE,
    "page[size]": "1",
  });

  const items = Array.isArray(response.data) ? response.data : [response.data];
  const latest = items[0] as Timer | undefined;
  const stoppedAt = (
    latest?.attributes as { stopped_at?: string | null } | undefined
  )?.stopped_at;
  const isRunning =
    !!latest?.id && (stoppedAt === null || stoppedAt === undefined);

  if (!isRunning) {
    if (args.response_format === "json") {
      return JSON.stringify({ running: false }, null, 2);
    }
    return "No running timer.";
  }

  const timer = formatTimer(
    latest as Timer,
    client.getOrgId(),
    response.included,
  );
  const result = formatResponse(timer, args.response_format, () =>
    formatTimerMarkdown(timer),
  );
  return truncateResponse(result, args.response_format);
}

/**
 * Update a running timer's metadata — note, task link, service, or
 * billable time. All edits route through `PATCH /time_entries/{linked}`
 * because Productive timers themselves are not patchable.
 *
 * Pass `task_id: null` to unlink the task. Pass `note: null` to clear
 * the note.
 *
 * Cannot update `started_at` on a running timer — Productive's API has
 * no public verb for that. To anchor the start time, stop the timer and
 * start a new one with `started_at` in the past.
 */
export async function updateTimer(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTimerSchema>,
): Promise<string> {
  const teId = await fetchLinkedTimeEntryId(client, args.timer_id);
  if (!teId) {
    throw new ProductiveAPIError(
      `Timer ${args.timer_id} has no linked time_entry — cannot update its metadata.`,
    );
  }

  await patchLinkedTimeEntry(client, teId, {
    note: args.note,
    billable_time_minutes: args.billable_time_minutes,
    service_id: args.service_id,
    task_id: args.task_id ?? undefined,
  });

  const timer = await loadFormattedTimer(client, args.timer_id);
  const result = formatResponse(timer, args.response_format, () =>
    formatTimerMarkdown(timer),
  );
  return truncateResponse(result, args.response_format);
}
