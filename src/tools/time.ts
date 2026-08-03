/**
 * Time tracking MCP tools (timers and time entries)
 *
 * Productive's time model: a time entry belongs to a *service* (a line on a
 * budget) and optionally references a task. A timer is a start/stop session
 * attached to a time entry. Starting a timer against a service creates the
 * time entry for you.
 *
 * Two API quirks this module works around:
 *   - `/time_entries` rejects `sort` outright (`sort_param_unsupported`).
 *   - Relationship linkage is omitted unless explicitly requested via
 *     `include`, so a missing `include` reads as "no service" rather than
 *     failing loudly.
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type { JSONAPIResponse } from "../types.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";
import { TRACK_METHOD_NAMES } from "../constants.js";
import {
  StartTimerSchema,
  StopTimerSchema,
  GetRunningTimerSchema,
  LogTimeSchema,
  ListTimeEntriesSchema,
} from "../schemas/time.js";

interface JSONAPIRecord {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } }>;
}

interface FormattedTimeEntry {
  id: string;
  date: string | null;
  minutes: number | null;
  note: string | null;
  track_method: string | null;
  running: boolean;
  timer_started_at: string | null;
  timer_stopped_at: string | null;
  approved: boolean;
  person_id: string | null;
  person_name: string | null;
  service_id: string | null;
  service_name: string | null;
  task_id: string | null;
  task_title: string | null;
}

interface FormattedTimer {
  id: string;
  person_id: string | null;
  started_at: string | null;
  stopped_at: string | null;
  running: boolean;
  total_time_minutes: number | null;
  time_entry_id: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relId(record: JSONAPIRecord, name: string): string | null {
  return record.relationships?.[name]?.data?.id || null;
}

function findIncluded(
  included: unknown[] | undefined,
  type: string,
  id: string | null,
): JSONAPIRecord | undefined {
  if (!included || !id) return undefined;
  return included.find(
    (item): item is JSONAPIRecord =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === type &&
      (item as { id?: unknown }).id === id,
  );
}

function formatTimeEntry(
  entry: JSONAPIRecord,
  included?: unknown[],
): FormattedTimeEntry {
  const a = entry.attributes || {};
  const serviceId = relId(entry, "service");
  const taskId = relId(entry, "task");
  const personId = relId(entry, "person");

  const service = findIncluded(included, "services", serviceId);
  const task = findIncluded(included, "tasks", taskId);
  const person = findIncluded(included, "people", personId);

  const startedAt = (a.timer_started_at as string) || null;
  const stoppedAt = (a.timer_stopped_at as string) || null;
  const trackMethodId = a.track_method_id as number | undefined;

  const personAttrs = person?.attributes as
    | { first_name?: string; last_name?: string }
    | undefined;

  return {
    id: entry.id,
    date: (a.date as string) || null,
    minutes: typeof a.time === "number" ? a.time : null,
    note: (a.note as string) || null,
    track_method:
      trackMethodId !== undefined
        ? TRACK_METHOD_NAMES[trackMethodId] || `Unknown (${trackMethodId})`
        : null,
    running: Boolean(startedAt && !stoppedAt),
    timer_started_at: startedAt,
    timer_stopped_at: stoppedAt,
    approved: Boolean(a.approved),
    person_id: personId,
    person_name: personAttrs
      ? `${personAttrs.first_name || ""} ${personAttrs.last_name || ""}`.trim() ||
        null
      : null,
    service_id: serviceId,
    service_name:
      ((service?.attributes as { name?: string } | undefined)?.name) || null,
    task_id: taskId,
    task_title:
      ((task?.attributes as { title?: string } | undefined)?.title) || null,
  };
}

function formatTimer(timer: JSONAPIRecord): FormattedTimer {
  const a = timer.attributes || {};
  const startedAt = (a.started_at as string) || null;
  const stoppedAt = (a.stopped_at as string) || null;

  return {
    id: timer.id,
    person_id: a.person_id !== undefined ? String(a.person_id) : null,
    started_at: startedAt,
    stopped_at: stoppedAt,
    running: Boolean(startedAt && !stoppedAt),
    total_time_minutes: typeof a.total_time === "number" ? a.total_time : null,
    time_entry_id: relId(timer, "time_entry"),
  };
}

function timeEntryMarkdown(entry: FormattedTimeEntry, heading: string): string {
  const lines = [`# ${heading}`, ""];
  lines.push(`**Entry ID**: ${entry.id}`);
  if (entry.date) lines.push(`**Date**: ${entry.date}`);
  if (entry.minutes !== null) {
    const h = Math.floor(entry.minutes / 60);
    const m = entry.minutes % 60;
    lines.push(
      `**Time**: ${entry.minutes} minutes${h > 0 ? ` (${h}h ${m}m)` : ""}`,
    );
  }
  lines.push(`**Running**: ${entry.running ? "yes" : "no"}`);
  if (entry.service_name || entry.service_id) {
    lines.push(
      `**Service**: ${entry.service_name || "(unnamed)"} (${entry.service_id})`,
    );
  }
  if (entry.task_id) {
    lines.push(`**Task**: ${entry.task_title || "(untitled)"} (${entry.task_id})`);
  }
  if (entry.person_name || entry.person_id) {
    lines.push(`**Person**: ${entry.person_name || entry.person_id}`);
  }
  if (entry.track_method) lines.push(`**Tracked via**: ${entry.track_method}`);
  if (entry.note) lines.push(`**Note**: ${entry.note}`);
  if (entry.approved) lines.push(`**Approved**: yes`);
  return lines.join("\n");
}

/**
 * Resolve the service to log against. A task carries a `service`
 * relationship; when only a task is supplied we follow it.
 */
async function resolveServiceId(
  client: ProductiveClient,
  args: { service_id?: string; task_id?: string },
): Promise<string> {
  if (args.service_id) return args.service_id;

  const response = await client.get<JSONAPIResponse>(
    `/tasks/${args.task_id}`,
    { include: "service" },
  );
  const task = (
    Array.isArray(response.data) ? response.data[0] : response.data
  ) as JSONAPIRecord;

  const serviceId = relId(task, "service");
  if (!serviceId) {
    throw new Error(
      `Task ${args.task_id} has no service attached, so time cannot be logged against it. ` +
        `Pass service_id explicitly — use productive_list_services to find one for the project.`,
    );
  }
  return serviceId;
}

async function resolvePersonId(
  client: ProductiveClient,
  personId?: string,
): Promise<string> {
  return personId || (await client.getCurrentPersonId());
}

/**
 * Find the running timer for a person, if any.
 *
 * `/timers` exposes no "running" filter — `filter[stopped_at]=null` is rejected
 * as an unsupported filter value type — so this sorts newest-first and takes
 * the first record with no `stopped_at`.
 *
 * The sort is essential: without it the API returns the OLDEST timers first,
 * which are all stopped, and a running timer is never found.
 */
async function findRunningTimer(
  client: ProductiveClient,
  personId: string,
): Promise<FormattedTimer | null> {
  const response = await client.get<JSONAPIResponse>("/timers", {
    "filter[person_id]": personId,
    sort: "-started_at",
    "page[size]": 25,
    // Without this, the time_entry relationship comes back with no linkage.
    include: "time_entry",
  });

  const timers = (
    Array.isArray(response.data) ? response.data : [response.data]
  ) as JSONAPIRecord[];

  // Already newest-first, so the first running record is the current one.
  const running = timers.map(formatTimer).find((t) => t.running);
  return running || null;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function startTimer(
  client: ProductiveClient,
  args: z.infer<typeof StartTimerSchema>,
): Promise<string> {
  const personId = await resolvePersonId(client, args.person_id);

  // Refuse to stack timers — Productive's UI allows only one at a time, and
  // the API does not document whether it enforces that.
  const existing = await findRunningTimer(client, personId);
  if (existing) {
    throw new Error(
      `A timer is already running for this person (timer ${existing.id}, started ${existing.started_at}, ` +
        `time entry ${existing.time_entry_id}). Stop it with productive_stop_timer before starting another.`,
    );
  }

  const attributes: Record<string, unknown> = { person_id: Number(personId) };

  if (args.time_entry_id) {
    attributes.time_entry_id = Number(args.time_entry_id);
  } else {
    attributes.service_id = Number(await resolveServiceId(client, args));
    if (args.task_id) attributes.task_id = Number(args.task_id);
    if (args.note) attributes.note = args.note;
  }

  const response = await client.post<JSONAPIResponse>(
    "/timers",
    { data: { type: "timers", attributes } },
    // Without this the response carries no time_entry linkage to report back.
    { include: "time_entry" },
  );

  const timer = formatTimer(
    (Array.isArray(response.data)
      ? response.data[0]
      : response.data) as JSONAPIRecord,
  );

  return formatResponse(timer, args.response_format, () =>
    [
      "# Timer Started",
      "",
      `**Timer ID**: ${timer.id}`,
      `**Started**: ${timer.started_at}`,
      `**Time entry**: ${timer.time_entry_id}`,
      `**Person**: ${timer.person_id}`,
      "",
      "Stop it with `productive_stop_timer`.",
    ].join("\n"),
  );
}

export async function stopTimer(
  client: ProductiveClient,
  args: z.infer<typeof StopTimerSchema>,
): Promise<string> {
  let timerId = args.timer_id;

  if (!timerId) {
    const personId = await resolvePersonId(client, args.person_id);
    const running = await findRunningTimer(client, personId);
    if (!running) {
      throw new Error(
        `No running timer found for person ${personId}. Pass timer_id to stop a specific timer.`,
      );
    }
    timerId = running.id;
  }

  const response = await client.patch<JSONAPIResponse>(
    `/timers/${timerId}/stop`,
    { data: { type: "timers", id: timerId } },
    // Without this the response carries no time_entry linkage to report back.
    { include: "time_entry" },
  );

  const timer = formatTimer(
    (Array.isArray(response.data)
      ? response.data[0]
      : response.data) as JSONAPIRecord,
  );

  return formatResponse(timer, args.response_format, () =>
    [
      "# Timer Stopped",
      "",
      `**Timer ID**: ${timer.id}`,
      `**Started**: ${timer.started_at}`,
      `**Stopped**: ${timer.stopped_at}`,
      `**Total**: ${timer.total_time_minutes} minutes`,
      `**Time entry**: ${timer.time_entry_id}`,
    ].join("\n"),
  );
}

export async function getRunningTimer(
  client: ProductiveClient,
  args: z.infer<typeof GetRunningTimerSchema>,
): Promise<string> {
  const personId = await resolvePersonId(client, args.person_id);
  const running = await findRunningTimer(client, personId);

  if (!running) {
    return formatResponse({ running: false, person_id: personId }, args.response_format, () =>
      `# No Running Timer\n\nNo timer is currently running for person ${personId}.`,
    );
  }

  // Pull the linked entry so the caller sees what is being timed.
  let entry: FormattedTimeEntry | null = null;
  if (running.time_entry_id) {
    const response = await client.get<JSONAPIResponse>(
      `/time_entries/${running.time_entry_id}`,
      { include: "service,task,person" },
    );
    entry = formatTimeEntry(
      (Array.isArray(response.data)
        ? response.data[0]
        : response.data) as JSONAPIRecord,
      response.included,
    );
  }

  return formatResponse({ timer: running, time_entry: entry }, args.response_format, () => {
    const lines = [
      "# Timer Running",
      "",
      `**Timer ID**: ${running.id}`,
      `**Started**: ${running.started_at}`,
      `**Elapsed so far**: ${running.total_time_minutes} minutes (as recorded by Productive)`,
    ];
    if (entry) {
      lines.push("");
      lines.push(`**Service**: ${entry.service_name || entry.service_id}`);
      if (entry.task_id) {
        lines.push(`**Task**: ${entry.task_title || "(untitled)"} (${entry.task_id})`);
      }
      if (entry.note) lines.push(`**Note**: ${entry.note}`);
    }
    return lines.join("\n");
  });
}

export async function logTime(
  client: ProductiveClient,
  args: z.infer<typeof LogTimeSchema>,
): Promise<string> {
  const personId = await resolvePersonId(client, args.person_id);
  const serviceId = await resolveServiceId(client, args);

  const attributes: Record<string, unknown> = {
    person_id: Number(personId),
    service_id: Number(serviceId),
    time: args.minutes,
    // 1 = Manual tracking
    track_method_id: 1,
  };
  if (args.date) attributes.date = args.date;
  if (args.note) attributes.note = args.note;
  if (args.task_id) attributes.task_id = Number(args.task_id);

  const response = await client.post<JSONAPIResponse>(
    "/time_entries",
    { data: { type: "time_entries", attributes } },
    { include: "service,task,person" },
  );

  const entry = formatTimeEntry(
    (Array.isArray(response.data)
      ? response.data[0]
      : response.data) as JSONAPIRecord,
    response.included,
  );

  return formatResponse(entry, args.response_format, () =>
    timeEntryMarkdown(entry, "Time Logged"),
  );
}

export async function listTimeEntries(
  client: ProductiveClient,
  args: z.infer<typeof ListTimeEntriesSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    "page[size]": args.limit,
    "page[number]": Math.floor(args.offset / args.limit) + 1,
    include: "service,task,person",
  };

  if (args.person_id) params["filter[person_id]"] = args.person_id;
  if (args.task_id) params["filter[task_id]"] = args.task_id;
  if (args.service_id) params["filter[service_id]"] = args.service_id;
  if (args.after) params["filter[after]"] = args.after;
  if (args.before) params["filter[before]"] = args.before;

  const response = await client.get<JSONAPIResponse>("/time_entries", params);

  const records = (
    Array.isArray(response.data) ? response.data : [response.data]
  ) as JSONAPIRecord[];
  const entries = records.map((r) => formatTimeEntry(r, response.included));
  const total = (response.meta as { total_count?: number } | undefined)
    ?.total_count;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0);

  const result = formatResponse(
    { entries, count: entries.length, total_count: total, total_minutes: totalMinutes },
    args.response_format,
    () => {
      if (entries.length === 0) {
        return "# Time Entries\n\nNo time entries matched.";
      }
      const lines = [
        "# Time Entries",
        "",
        `Showing ${entries.length}${total ? ` of ${total}` : ""} — ${totalMinutes} minutes total`,
        "",
      ];
      for (const e of entries) {
        const label = e.task_title || e.service_name || "(no label)";
        lines.push(
          `- **${e.date || "no date"}** — ${e.minutes ?? 0} min — ${label}${e.running ? " _(running)_" : ""}`,
        );
        if (e.note) lines.push(`  ${e.note}`);
      }
      return lines.join("\n");
    },
  );

  return truncateResponse(result, args.response_format);
}
