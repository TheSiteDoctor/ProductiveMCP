/**
 * Milestone date review: checks Milestone due dates against public holidays,
 * weekends, bridge days, the Christmas period and (optionally) trading peaks,
 * and Show & Tell sprints for lost capacity. It only reports; it never moves a
 * date, because the new date has to be agreed with the customer.
 *
 * Severity:
 * - problem: the date shouldn't stand (a public holiday or a weekend)
 * - warning: raise it with the customer (bridge day, Christmas period, trading peak)
 * - note:    Show & Tells only - the sprint loses working days to holidays, or
 *            spans Christmas, so plan the demo as a lighter check-in
 */

import {
  addDays,
  covers,
  dayOfWeek,
  formatShortDate,
  isWeekend,
  loadRegionHolidays,
  parseIsoDate,
  usThanksgiving,
  type Holiday,
  type RegionHolidays,
} from "./holidays.js";

export interface MilestoneToReview {
  id?: string;
  title: string;
  /** YYYY-MM-DD */
  due_date: string;
  task_type?: string | null;
  url?: string;
}

export interface ReviewOptions {
  regions: readonly string[];
  include_trading_peaks?: boolean;
  /** Start of Sprint 1 for Show & Tell capacity (otherwise inferred from the sprint length) */
  project_start_date?: string;
}

export type Severity = "problem" | "warning" | "note";

export interface ReviewedMilestone extends MilestoneToReview {
  is_show_and_tell: boolean;
  problems: string[];
  warnings: string[];
  notes: string[];
  /** Regions whose holidays couldn't be checked for this date */
  unchecked_regions: string[];
  /** Highest severity found, or null when the date passes */
  severity: Severity | null;
  /** Nearest earlier working day that passes every check (never later) */
  suggested_date?: string;
}

export interface DateReviewResult {
  regions: Array<{
    region: string;
    name: string;
    status: "ok" | "skipped";
    source: string;
    retrieved_at?: string;
    reason?: string;
  }>;
  include_trading_peaks: boolean;
  milestones: ReviewedMilestone[];
  counts: { reviewed: number; problems: number; warnings: number; notes: number };
  /** True only when every region loaded and covered every date */
  complete: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { problem: 3, warning: 2, note: 1 };

/** A Show & Tell is a Milestone with Task type "Show & Tell" (or so titled). */
export function isShowAndTell(m: MilestoneToReview): boolean {
  if (m.task_type && m.task_type.toLowerCase() === "show & tell") return true;
  return /^(\[[^\]]+\]\s*)?show\s*&\s*tell\b/i.test(m.title);
}

/** "Christmas Day (UK bank holiday, US federal holiday)" */
function describeHolidays(holidays: Holiday[]): string {
  const byName = new Map<string, string[]>();
  for (const h of holidays) {
    const labels = byName.get(h.name) || [];
    if (!labels.includes(h.label)) labels.push(h.label);
    byName.set(h.name, labels);
  }
  return [...byName.entries()].map(([name, labels]) => `${name} (${labels.join(", ")})`).join(" and ");
}

function holidaysOn(regions: RegionHolidays[], iso: string): Holiday[] {
  return regions.flatMap((r) => (covers(r, iso) ? r.byDate.get(iso) || [] : []));
}

function inChristmasPeriod(iso: string): boolean {
  const md = iso.slice(5);
  return md >= "12-24" || md <= "01-01";
}

/** Problems and warnings for one date (no notes, no suggestion). */
function checkDate(
  iso: string,
  regions: RegionHolidays[],
  includeTradingPeaks: boolean,
): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (isWeekend(iso)) {
    problems.push(`falls on a ${dayOfWeek(iso) === 6 ? "Saturday" : "Sunday"}`);
  }
  const holidays = holidaysOn(regions, iso);
  if (holidays.length > 0) {
    problems.push(`falls on ${describeHolidays(holidays)}`);
  }

  // A bridge day: a single working day between a holiday and a weekend, e.g.
  // the Friday after US Thanksgiving, when many people take the day off.
  if (problems.length === 0) {
    const before = holidaysOn(regions, addDays(iso, -1));
    const after = holidaysOn(regions, addDays(iso, 1));
    if (before.length > 0 && dayOfWeek(addDays(iso, 1)) === 6) {
      warnings.push(`is a bridge day between ${describeHolidays(before)} and the weekend`);
    } else if (after.length > 0 && dayOfWeek(addDays(iso, -1)) === 0) {
      warnings.push(`is a bridge day between the weekend and ${describeHolidays(after)}`);
    }
  }

  if (inChristmasPeriod(iso)) {
    warnings.push("falls between 24 December and 1 January, when many people are away");
  }

  if (includeTradingPeaks) {
    const year = parseInt(iso.slice(0, 4), 10);
    const blackFriday = addDays(usThanksgiving(year), 1);
    const cyberMonday = addDays(usThanksgiving(year), 4);
    if (iso === blackFriday) warnings.push("falls on Black Friday, a trading peak when the customer's team is busy");
    if (iso === cyberMonday) warnings.push("falls on Cyber Monday, a trading peak when the customer's team is busy");
    const md = iso.slice(5);
    if (md >= "12-18" && md <= "12-24") {
      warnings.push("falls in the week leading up to Christmas, a trading peak when the customer's team is busy");
    }
  }

  return { problems, warnings };
}

/** The nearest earlier day that passes every problem and warning check. */
function suggestEarlier(
  iso: string,
  regions: RegionHolidays[],
  includeTradingPeaks: boolean,
): string | undefined {
  // Never later: that would move the demo past the end of its sprint.
  for (let back = 1; back <= 60; back++) {
    const candidate = addDays(iso, -back);
    const { problems, warnings } = checkDate(candidate, regions, includeTradingPeaks);
    if (problems.length === 0 && warnings.length === 0) return candidate;
  }
  return undefined;
}

/** Years touched by the dates (and the days either side, for bridge checks). */
function yearsFor(dates: string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    for (const offset of [-62, 0, 1]) years.add(parseInt(addDays(d, offset).slice(0, 4), 10));
  }
  return [...years].sort();
}

/** Run the review over a set of milestones. */
export async function reviewMilestoneDates(
  milestones: MilestoneToReview[],
  options: ReviewOptions,
): Promise<DateReviewResult> {
  const includePeaks = !!options.include_trading_peaks;
  const dated = milestones.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.due_date || ""));
  const regions = await loadRegionHolidays(
    options.regions,
    yearsFor([...dated.map((m) => m.due_date), ...(options.project_start_date ? [options.project_start_date] : [])]),
  );
  const loaded = regions.filter((r) => r.status === "ok");

  const reviewed: ReviewedMilestone[] = dated.map((m) => {
    const { problems, warnings } = checkDate(m.due_date, loaded, includePeaks);
    return {
      ...m,
      is_show_and_tell: isShowAndTell(m),
      problems,
      warnings,
      notes: [],
      unchecked_regions: regions.filter((r) => !covers(r, m.due_date)).map((r) => r.name),
      severity: null,
    };
  });

  // Sprint capacity for Show & Tells: each sprint runs from the day after the
  // previous Show & Tell (or the project start for Sprint 1) to its demo.
  const showAndTells = reviewed.filter((m) => m.is_show_and_tell).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const sprintLength =
    showAndTells.length >= 2
      ? Math.round((parseIsoDate(showAndTells[1].due_date).getTime() - parseIsoDate(showAndTells[0].due_date).getTime()) / 86400000)
      : 14;
  showAndTells.forEach((sat, i) => {
    const start =
      i > 0
        ? addDays(showAndTells[i - 1].due_date, 1)
        : options.project_start_date ?? addDays(sat.due_date, -sprintLength + 1);
    if (start > sat.due_date) return;
    let working = 0;
    const lost: Holiday[][] = [];
    let spansChristmas = false;
    for (let d = start; d <= sat.due_date; d = addDays(d, 1)) {
      if (inChristmasPeriod(d)) spansChristmas = true;
      if (isWeekend(d)) continue;
      const h = holidaysOn(loaded, d);
      if (h.length > 0) lost.push(h);
      else working++;
    }
    const range = `${formatShortDate(start)} to ${formatShortDate(sat.due_date)}`;
    if (lost.length > 0) {
      const list = lost.map((h) => `${describeHolidays(h)} on ${formatShortDate(h[0].date)}`).join("; ");
      sat.notes.push(
        `its sprint (${range}) has ${working} working day${working === 1 ? "" : "s"} after losing ${lost.length} to public holidays: ${list}. Plan the demo as a lighter check-in`,
      );
    }
    if (spansChristmas) {
      sat.notes.push(
        `its sprint (${range}) spans 24 December to 1 January, when many people are away. Plan the demo as a lighter check-in`,
      );
    }
  });

  for (const m of reviewed) {
    m.severity = m.problems.length > 0 ? "problem" : m.warnings.length > 0 ? "warning" : m.notes.length > 0 ? "note" : null;
    if (m.problems.length > 0 || m.warnings.length > 0) {
      m.suggested_date = suggestEarlier(m.due_date, loaded, includePeaks);
    }
  }

  return {
    regions: regions.map(({ region, name, status, source, retrieved_at, reason }) => ({
      region, name, status, source, retrieved_at, reason,
    })),
    include_trading_peaks: includePeaks,
    milestones: reviewed,
    counts: {
      reviewed: reviewed.length,
      problems: reviewed.filter((m) => m.severity === "problem").length,
      warnings: reviewed.filter((m) => m.severity === "warning").length,
      notes: reviewed.filter((m) => m.severity === "note").length,
    },
    complete: regions.length > 0 && regions.every((r) => r.status === "ok") && reviewed.every((m) => m.unchecked_regions.length === 0),
  };
}

/** One sentence for a milestone, e.g. for its review comment. */
export function describeFinding(m: ReviewedMilestone): string {
  const reasons = [...m.problems, ...m.warnings, ...m.notes];
  const sentence = `Date review: ${reasons.join("; ")}.`;
  const suggestion = m.suggested_date ? ` Suggested alternative: ${formatShortDate(m.suggested_date)}.` : "";
  return `${sentence}${suggestion} Confirm with the customer before moving.`;
}

/** Markdown section for a review result. */
export function formatDateReviewMarkdown(result: DateReviewResult): string {
  const retrieved = (r: DateReviewResult["regions"][number]): string =>
    r.status === "ok"
      ? `${r.name} (${r.source}${r.retrieved_at ? `, retrieved ${r.retrieved_at.slice(0, 10)}` : ""})`
      : `${r.name} (skipped: ${r.reason})`;
  const regionLine = result.regions.map(retrieved).join("; ");
  const skipped = result.regions.filter((r) => r.status === "skipped");

  if (result.counts.reviewed === 0) {
    return "**Milestone date review**: no milestones with due dates to review.";
  }

  const flagged = result.milestones.filter((m) => m.severity);
  const unchecked = result.milestones.filter((m) => m.unchecked_regions.length > 0);

  if (flagged.length === 0 && result.complete) {
    const dates = result.regions.map((r) => r.retrieved_at?.slice(0, 10)).filter(Boolean).sort();
    return `**Milestone date review**: no issues across ${result.counts.reviewed} milestone${result.counts.reviewed === 1 ? "" : "s"} (regions checked: ${result.regions.map((r) => r.name).join(", ")}; holiday data retrieved ${dates[dates.length - 1] ?? "today"}).`;
  }

  const lines: string[] = ["## Milestone date review", "", `Regions: ${regionLine}.`];
  if (result.include_trading_peaks) lines.push("Trading peaks (Black Friday, Cyber Monday, the week before Christmas) checked.");
  lines.push("");
  if (skipped.length > 0) {
    lines.push(
      `**Holiday check incomplete**: ${skipped.map((r) => `${r.name} was skipped (${r.reason})`).join("; ")}. Dates were not checked against ${skipped.length === 1 ? "that region's" : "those regions'"} holidays.`,
      "",
    );
  }

  const label = (m: ReviewedMilestone): string => (m.url ? `[${m.title}](${m.url})` : m.title);
  const sections: Array<[Severity, string]> = [
    ["problem", "Problems (the date shouldn't stand)"],
    ["warning", "Warnings (raise with the customer)"],
    ["note", "Notes (Show & Tell sprint capacity)"],
  ];
  for (const [severity, heading] of sections) {
    const items = flagged.filter((m) => m.severity === severity);
    if (items.length === 0) continue;
    lines.push(`### ${heading}`, "");
    for (const m of items) {
      const reasons = [...m.problems, ...m.warnings, ...m.notes].join("; ");
      const suggestion = m.suggested_date ? ` Suggested alternative: **${formatShortDate(m.suggested_date, true)}**.` : "";
      lines.push(`- ${label(m)} - ${formatShortDate(m.due_date, true)}: ${reasons}.${suggestion}`);
    }
    lines.push("");
  }
  if (flagged.length === 0) {
    lines.push(
      `Nothing was flagged by the checks that ran on ${result.counts.reviewed} milestone${result.counts.reviewed === 1 ? "" : "s"}, but the holiday check is incomplete (see above), so the dates aren't confirmed clear.`,
      "",
    );
  }
  if (unchecked.length > 0) {
    lines.push(
      `Not checked against every region's holidays (outside the data available): ${unchecked.map((m) => `${m.title} (${m.unchecked_regions.join(", ")})`).join("; ")}.`,
      "",
    );
  }
  lines.push("The review never moves a date: agree any change with the customer first.");
  return lines.join("\n");
}

/** Rank helper for sorting by severity. */
export function severityRank(s: Severity | null): number {
  return s ? SEVERITY_RANK[s] : 0;
}
