/**
 * Milestone date review tool, and the review that runs at the end of
 * productive_apply_task_template. See docs/milestone-date-review.md.
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type { JSONAPIResponse, Task } from "../types.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";
import { ReviewMilestoneDatesSchema } from "../schemas/milestone-review.js";
import {
  reviewMilestoneDates,
  describeFinding,
  formatDateReviewMarkdown,
  type DateReviewResult,
  type MilestoneToReview,
} from "../utils/date-review.js";
import {
  CUSTOM_FIELD_IDS,
  DEFAULT_DATE_REVIEW_REGIONS,
  taskTypeNameForOption,
} from "../constants.js";

/** Every review comment starts with this, so re-runs can find their own. */
const COMMENT_MARKER = "Date review:";

export interface AnnotationSummary {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  errors: string[];
}

/** A Milestone as the review sees it, from a task resource. */
export function milestoneFromTask(task: Task, orgId: string): MilestoneToReview | null {
  const due = task.attributes?.due_date;
  if (!due) return null;
  const fields = task.attributes?.custom_fields || {};
  return {
    id: task.id,
    title: task.attributes?.title ?? "",
    due_date: due,
    task_type: CUSTOM_FIELD_IDS.TASK_TYPE ? taskTypeNameForOption(fields[CUSTOM_FIELD_IDS.TASK_TYPE]) : null,
    url: `https://app.productive.io/${orgId}/tasks/${task.id}`,
  };
}

/** Open Milestones in a project, with their due dates. */
async function fetchProjectMilestones(
  client: ProductiveClient,
  projectId: string,
): Promise<MilestoneToReview[]> {
  const milestones: MilestoneToReview[] = [];
  const pageSize = 200;
  for (let page = 1; ; page++) {
    const response = await client.get<JSONAPIResponse>("/tasks", {
      "filter[project_id]": projectId,
      "filter[type_id]": 3,
      "filter[status]": 1,
      "page[number]": page,
      "page[size]": pageSize,
    });
    const items = (Array.isArray(response.data) ? response.data : [response.data]).filter(Boolean) as Task[];
    for (const task of items) {
      if (task.attributes?.type_id !== undefined && task.attributes.type_id !== 3) continue;
      const m = milestoneFromTask(task, client.getOrgId());
      if (m) milestones.push(m);
    }
    const total = response.meta?.total_count;
    if (!total || page * pageSize >= total) break;
  }
  return milestones;
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

/**
 * Keep exactly one internal review comment on each flagged Milestone: create
 * it, update it when the finding changes, and remove it once the date passes.
 * Comments are hidden from the client - they're written for the project manager.
 */
export async function annotateMilestones(
  client: ProductiveClient,
  result: DateReviewResult,
): Promise<AnnotationSummary> {
  const summary: AnnotationSummary = { created: 0, updated: 0, removed: 0, unchanged: 0, errors: [] };
  for (const m of result.milestones) {
    if (!m.id) continue;
    // A date that couldn't be fully checked keeps any earlier comment: absence
    // of findings there isn't evidence the date is fine.
    const fullyChecked = m.unchecked_regions.length === 0 && result.regions.every((r) => r.status === "ok");
    try {
      const response = await client.get<JSONAPIResponse>("/comments", { "filter[task_id]": m.id });
      const comments = (Array.isArray(response.data) ? response.data : [response.data]).filter(Boolean);
      const existing = comments.find((c) =>
        stripTags(String((c.attributes as { body?: string })?.body || "")).startsWith(COMMENT_MARKER),
      );

      if (!m.severity) {
        if (existing && fullyChecked) {
          await client.delete(`/comments/${existing.id}`);
          summary.removed++;
        }
        continue;
      }

      const text = describeFinding(m);
      const body = `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
      if (existing) {
        if (stripTags(String((existing.attributes as { body?: string }).body || "")) === text) {
          summary.unchanged++;
        } else {
          await client.patch(`/comments/${existing.id}`, {
            data: { type: "comments", id: existing.id, attributes: { body } },
          });
          summary.updated++;
        }
      } else {
        await client.post("/comments", {
          data: {
            type: "comments",
            attributes: { body, hidden: true },
            relationships: { task: { data: { type: "tasks", id: m.id } } },
          },
        });
        summary.created++;
      }
    } catch (error) {
      summary.errors.push(`${m.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

function formatAnnotations(a: AnnotationSummary): string {
  const parts = [
    a.created && `${a.created} added`,
    a.updated && `${a.updated} updated`,
    a.removed && `${a.removed} removed`,
  ].filter(Boolean);
  const lines: string[] = [];
  if (parts.length > 0) lines.push(`Review comments on the milestones: ${parts.join(", ")}.`);
  if (a.errors.length > 0) lines.push(`Couldn't update some review comments: ${a.errors.join("; ")}.`);
  return lines.join("\n");
}

/**
 * Review a set of milestones and optionally annotate them. Used by the tool
 * and at the end of a template apply. Errors become part of the result rather
 * than failing the caller, and are never reported as "no issues".
 */
export async function runMilestoneDateReview(
  client: ProductiveClient | null,
  milestones: MilestoneToReview[],
  options: { regions?: readonly string[]; include_trading_peaks?: boolean; project_start_date?: string; annotate: boolean },
): Promise<{ result?: DateReviewResult; annotations?: AnnotationSummary; error?: string; markdown: string }> {
  try {
    const result = await reviewMilestoneDates(milestones, {
      regions: options.regions && options.regions.length > 0 ? options.regions : DEFAULT_DATE_REVIEW_REGIONS,
      include_trading_peaks: options.include_trading_peaks,
      project_start_date: options.project_start_date,
    });
    const annotations = options.annotate && client ? await annotateMilestones(client, result) : undefined;
    const markdown = [formatDateReviewMarkdown(result), annotations ? formatAnnotations(annotations) : ""]
      .filter(Boolean)
      .join("\n\n");
    return { result, annotations, markdown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: message,
      markdown: `**Milestone date review didn't run**: ${message}. The dates have not been checked; run productive_review_milestone_dates to retry.`,
    };
  }
}

/**
 * productive_review_milestone_dates: check every open Milestone in a project.
 */
export async function reviewProjectMilestoneDates(
  client: ProductiveClient,
  args: z.infer<typeof ReviewMilestoneDatesSchema>,
): Promise<string> {
  const milestones = await fetchProjectMilestones(client, args.project_id);
  const review = await runMilestoneDateReview(client, milestones, {
    regions: args.regions,
    include_trading_peaks: args.include_trading_peaks,
    project_start_date: args.project_start_date,
    annotate: args.annotate,
  });
  const payload = {
    project_id: args.project_id,
    ...(review.result ?? {}),
    annotations: review.annotations,
    error: review.error,
  };
  return truncateResponse(
    formatResponse(payload, args.response_format, () => review.markdown),
    args.response_format,
  );
}
