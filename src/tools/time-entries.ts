/**
 * Time-entry MCP tools — manual create / update / delete / list.
 *
 * For live tracking use the timer tools. Time entries are the immutable-ish
 * row of work logged for a service (and optionally a task).
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  TimeEntry,
  CreateTimeEntryPayload,
  UpdateTimeEntryPayload,
  FormattedTimeEntry,
} from "../types.js";
import {
  formatTimeEntry,
  formatTimeEntryMarkdown,
  formatTimeEntryListMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  DeleteTimeEntrySchema,
  ListTimeEntriesSchema,
} from "../schemas/time-entry.js";
import { resolveCurrentPersonId } from "./timers.js";

const TIME_ENTRY_INCLUDE = "service,task,project,person";

/**
 * Format a date as YYYY-MM-DD in the local timezone.
 */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Validate that an ISO datetime falls on the given ISO date in UTC.
 * Used for the documented invariant that `started_at`'s date must match
 * `date` on Productive time entries.
 */
function dateMatches(date: string, startedAt: string): boolean {
  const startDate = new Date(startedAt);
  if (Number.isNaN(startDate.getTime())) return false;
  // Compare in UTC to avoid TZ slippage for callers that pass Z timestamps.
  const utcDate = `${startDate.getUTCFullYear()}-${String(
    startDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(startDate.getUTCDate()).padStart(2, "0")}`;
  return utcDate === date;
}

export async function createTimeEntry(
  client: ProductiveClient,
  args: z.infer<typeof CreateTimeEntrySchema>,
): Promise<string> {
  if (args.started_at && !dateMatches(args.date, args.started_at)) {
    throw new Error(
      `started_at (${args.started_at}) is on a different UTC date than \`date\` (${args.date}). Productive requires them to match.`,
    );
  }

  const personId = args.person_id ?? (await resolveCurrentPersonId(client));

  const payload: CreateTimeEntryPayload = {
    data: {
      type: "time_entries",
      attributes: {
        date: args.date,
        time: args.time_minutes,
      },
      relationships: {
        service: { data: { type: "services", id: args.service_id } },
        person: { data: { type: "people", id: personId } },
      },
    },
  };

  if (args.billable_time_minutes !== undefined) {
    payload.data.attributes.billable_time = args.billable_time_minutes;
  }
  if (args.note) {
    payload.data.attributes.note = args.note;
  }
  if (args.started_at) {
    payload.data.attributes.started_at = args.started_at;
  }
  if (args.task_id) {
    payload.data.relationships.task = {
      data: { type: "tasks", id: args.task_id },
    };
  }

  const response = await client.post<JSONAPIResponse>(
    "/time_entries",
    payload,
    { include: TIME_ENTRY_INCLUDE },
  );

  const data = Array.isArray(response.data) ? response.data[0] : response.data;
  const entry = formatTimeEntry(data as TimeEntry, response.included);

  const result = formatResponse(entry, args.response_format, () =>
    formatTimeEntryMarkdown(entry),
  );
  return truncateResponse(result, args.response_format);
}

export async function updateTimeEntry(
  client: ProductiveClient,
  args: z.infer<typeof UpdateTimeEntrySchema>,
): Promise<string> {
  const payload: UpdateTimeEntryPayload = {
    data: {
      type: "time_entries",
      id: args.time_entry_id,
    },
  };

  const attributes: Record<string, unknown> = {};
  if (args.date !== undefined) attributes.date = args.date;
  if (args.time_minutes !== undefined) attributes.time = args.time_minutes;
  if (args.billable_time_minutes !== undefined) {
    attributes.billable_time = args.billable_time_minutes;
  }
  if (args.note !== undefined) attributes.note = args.note;
  if (args.started_at !== undefined) attributes.started_at = args.started_at;
  if (Object.keys(attributes).length > 0) {
    payload.data.attributes =
      attributes as UpdateTimeEntryPayload["data"]["attributes"];
  }

  if (args.service_id !== undefined) {
    payload.data.relationships = payload.data.relationships ?? {};
    payload.data.relationships.service = {
      data: { type: "services", id: args.service_id },
    };
  }
  if (args.task_id !== undefined) {
    payload.data.relationships = payload.data.relationships ?? {};
    payload.data.relationships.task = {
      data: args.task_id ? { type: "tasks", id: args.task_id } : null,
    };
  }

  const response = await client.patch<JSONAPIResponse>(
    `/time_entries/${args.time_entry_id}`,
    payload,
    { include: TIME_ENTRY_INCLUDE },
  );

  const data = Array.isArray(response.data) ? response.data[0] : response.data;
  const entry = formatTimeEntry(data as TimeEntry, response.included);

  const result = formatResponse(entry, args.response_format, () =>
    formatTimeEntryMarkdown(entry),
  );
  return truncateResponse(result, args.response_format);
}

export async function deleteTimeEntry(
  client: ProductiveClient,
  args: z.infer<typeof DeleteTimeEntrySchema>,
): Promise<string> {
  await client.delete<JSONAPIResponse>(`/time_entries/${args.time_entry_id}`);

  if (args.response_format === "json") {
    return JSON.stringify(
      { deleted: true, time_entry_id: args.time_entry_id },
      null,
      2,
    );
  }
  return `Deleted time entry ${args.time_entry_id}.`;
}

export async function listTimeEntries(
  client: ProductiveClient,
  args: z.infer<typeof ListTimeEntriesSchema>,
): Promise<string> {
  const personId = args.person_id ?? (await resolveCurrentPersonId(client));

  // Default to the last 7 days if no range is provided — keeps responses
  // inside the 25k-char cap and matches typical "what did I do this week".
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const dateFrom = args.date_from ?? isoDate(sevenDaysAgo);
  const dateTo = args.date_to ?? isoDate(today);

  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "filter[person_id]": personId,
    "filter[after]": dateFrom,
    "filter[before]": dateTo,
    sort: "-date",
    include: TIME_ENTRY_INCLUDE,
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };

  if (args.service_id) params["filter[service_id]"] = args.service_id;
  if (args.task_id) params["filter[task_id]"] = args.task_id;
  if (args.project_id) params["filter[project_id]"] = args.project_id;

  const response = await client.get<JSONAPIResponse>("/time_entries", params);

  const items = Array.isArray(response.data) ? response.data : [response.data];
  const entries: FormattedTimeEntry[] = items
    .filter((item): item is TimeEntry => !!item?.id)
    .map((item) => formatTimeEntry(item as TimeEntry, response.included));

  const total = response.meta?.total_count;

  const result = formatResponse(
    {
      time_entries: entries,
      total,
      count: entries.length,
      date_from: dateFrom,
      date_to: dateTo,
    },
    args.response_format,
    () => formatTimeEntryListMarkdown(entries, total),
  );
  return truncateResponse(result, args.response_format);
}
