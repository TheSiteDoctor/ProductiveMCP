/**
 * Waiting for the Commit reference, shared by every create path.
 *
 * A Productive automation stamps each new ticket's Commit reference (and a
 * matching "[REF]" title prefix) shortly after it's created, picking the next
 * free number. Create the next ticket before the previous one is stamped and
 * both get the same reference; the automation later re-stamps clashes, so the
 * reference developers already used changes. Creating sequentially, waiting
 * for each reference, is what keeps references unique and stable.
 *
 * This server never writes the title prefix itself, so a prefix that doesn't
 * match the field is the automation's doing (typically after a clash was
 * re-stamped): it's reported, not "fixed", because changing either side would
 * change a reference someone may already be using.
 */

import type { ProductiveClient } from "../client.js";
import type { JSONAPIResponse, Task } from "../types.js";
import { CUSTOM_FIELD_IDS } from "../constants.js";

export interface CommitReferenceCheck {
  task_id: string;
  /** The stamped reference, or null when none appeared in time */
  reference: string | null;
  /** The ticket's title when last read (it may carry the [REF] prefix) */
  title?: string;
  status: "stamped" | "missing" | "not_configured";
  waited_ms: number;
  /** Set when the title's [REF] prefix doesn't match the reference field */
  title_prefix_mismatch?: { title_prefix: string; reference: string };
}

const envNumber = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/** "[WGL-8717] Show & Tell" -> "WGL-8717" */
export function titlePrefix(title: string | undefined): string | null {
  const match = title?.match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Poll a new ticket until its Commit reference is stamped (and its title
 * prefix, if any, agrees), or the wait runs out.
 *
 * The wait defaults to 10 seconds, polling every 500ms; set
 * PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS / _POLL_MS to change it (0 disables
 * the wait). With no Commit reference field configured it returns at once.
 */
export async function waitForCommitReference(
  client: ProductiveClient,
  taskId: string,
): Promise<CommitReferenceCheck> {
  const field = CUSTOM_FIELD_IDS.COMMIT_REFERENCE;
  if (!field) {
    return { task_id: taskId, reference: null, status: "not_configured", waited_ms: 0 };
  }

  const timeoutMs = envNumber("PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS", 10000);
  const pollMs = Math.max(1, envNumber("PRODUCTIVE_COMMIT_REFERENCE_POLL_MS", 500));
  const started = Date.now();
  let reference: string | null = null;
  let title: string | undefined;

  for (;;) {
    try {
      const response = await client.get<JSONAPIResponse>(`/tasks/${taskId}`);
      const task = (Array.isArray(response.data) ? response.data[0] : response.data) as Task | undefined;
      title = task?.attributes?.title;
      const raw = task?.attributes?.custom_fields?.[field];
      reference = raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : null;
    } catch {
      // A failed read is treated like "not stamped yet" and retried.
    }

    const prefix = titlePrefix(title);
    const settled = reference !== null && (prefix === null || prefix === reference);
    const waited = Date.now() - started;
    if (settled || waited >= timeoutMs) {
      const check: CommitReferenceCheck = {
        task_id: taskId,
        reference,
        title,
        status: reference ? "stamped" : "missing",
        waited_ms: waited,
      };
      if (reference && prefix && prefix !== reference) {
        check.title_prefix_mismatch = { title_prefix: prefix, reference };
      }
      return check;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, timeoutMs - waited)));
  }
}

export interface CommitReferenceReport {
  /** reference -> task IDs that share it */
  duplicates: Record<string, string[]>;
  /** Tickets with no reference after the wait */
  missing: string[];
  /** Tickets whose [REF] title prefix disagrees with the field */
  title_mismatches: Array<{ task_id: string; title_prefix: string; reference: string }>;
}

/** Summarise checks from a run: duplicates, missing references, mismatched prefixes. */
export function summariseCommitReferences(checks: CommitReferenceCheck[]): CommitReferenceReport {
  const byRef = new Map<string, string[]>();
  for (const c of checks) {
    if (!c.reference) continue;
    byRef.set(c.reference, [...(byRef.get(c.reference) || []), c.task_id]);
  }
  return {
    duplicates: Object.fromEntries([...byRef].filter(([, ids]) => ids.length > 1)),
    missing: checks.filter((c) => c.status === "missing").map((c) => c.task_id),
    title_mismatches: checks
      .filter((c) => c.title_prefix_mismatch)
      .map((c) => ({ task_id: c.task_id, ...c.title_prefix_mismatch! })),
  };
}

/** True when the report has nothing to say. */
export function commitReferencesClean(report: CommitReferenceReport): boolean {
  return (
    Object.keys(report.duplicates).length === 0 &&
    report.missing.length === 0 &&
    report.title_mismatches.length === 0
  );
}

/** Markdown lines for a report, or [] when it's clean. */
export function formatCommitReferenceReport(report: CommitReferenceReport): string[] {
  if (commitReferencesClean(report)) return [];
  const lines = ["## Commit references", ""];
  for (const [ref, ids] of Object.entries(report.duplicates)) {
    lines.push(`- **Duplicate** ${ref} on tasks ${ids.join(", ")}. Productive's automation will re-stamp the clash, so don't use ${ref} in a branch yet.`);
  }
  if (report.missing.length > 0) {
    lines.push(`- **No reference yet** on tasks ${report.missing.join(", ")} (the automation hadn't stamped them in time). Check them in Productive before using them in a branch.`);
  }
  for (const m of report.title_mismatches) {
    lines.push(`- **Title and reference disagree** on task ${m.task_id}: the title says [${m.title_prefix}] but the Commit reference field is ${m.reference}. This server doesn't write the prefix (Productive's automation does), so the field is the one to trust; fix the title in Productive.`);
  }
  lines.push("");
  return lines;
}
