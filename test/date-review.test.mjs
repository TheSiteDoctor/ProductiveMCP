/**
 * Milestone date review: England and Wales + US federal.
 * GOV.UK data comes from a fixture in the feed's own format.
 * Run with `npm test` (builds first).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeProject } from "./helpers.mjs";

// No fake reference automation here, so don't wait for Commit references.
process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "0";
process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(new URL("./fixtures/productive.config.json", import.meta.url));
const feed = JSON.parse(readFileSync(new URL("./fixtures/gov-uk-bank-holidays.json", import.meta.url), "utf-8"));

const { setUkBankHolidaysLoader, usFederalHolidays } = await import("../dist/utils/holidays.js");
const { reviewMilestoneDates, formatDateReviewMarkdown } = await import("../dist/utils/date-review.js");
const { reviewProjectMilestoneDates } = await import("../dist/tools/milestone-review.js");
const { ReviewMilestoneDatesSchema } = await import("../dist/schemas/milestone-review.js");

const REGIONS = ["england-and-wales", "us-federal"];
beforeEach(() => setUkBankHolidaysLoader(async () => feed));

const review = (dates, options = {}) =>
  reviewMilestoneDates(
    dates.map((d, i) => (typeof d === "string" ? { id: String(i + 1), title: `Milestone ${d}`, due_date: d } : d)),
    { regions: REGIONS, ...options },
  );
const one = async (date, options) => (await review([date], options)).milestones[0];

test("US federal holidays follow 5 U.S.C. 6103", () => {
  const y2026 = Object.fromEntries(usFederalHolidays(2026).map((h) => [h.date, h.name]));
  assert.equal(y2026["2026-07-03"], "Independence Day (observed)"); // 4 July 2026 is a Saturday
  assert.equal(y2026["2026-11-26"], "Thanksgiving Day");
  assert.equal(y2026["2026-01-19"], "Birthday of Martin Luther King, Jr.");
  assert.equal(y2026["2026-05-25"], "Memorial Day");
  const y2027 = Object.fromEntries(usFederalHolidays(2027).map((h) => [h.date, h.name]));
  assert.equal(y2027["2027-12-24"], "Christmas Day (observed)"); // 25 Dec 2027 is a Saturday
  assert.equal(y2027["2027-12-31"], "New Year's Day (observed)"); // 1 Jan 2028 is a Saturday
});

test("2026-12-25 is a problem: Christmas Day in both regions", async () => {
  const m = await one("2026-12-25");
  assert.equal(m.severity, "problem");
  assert.match(m.problems.join(), /Christmas Day \(UK bank holiday, US federal holiday\)/);
  assert.equal(m.suggested_date, "2026-12-23");
});

test("2026-12-28 is a problem: the Boxing Day substitute in England and Wales", async () => {
  const m = await one("2026-12-28");
  assert.equal(m.severity, "problem");
  assert.match(m.problems.join(), /Boxing Day \(substitute day\) \(UK bank holiday\)/);
});

test("2027-03-26 is a problem: Good Friday in England and Wales", async () => {
  const m = await one("2027-03-26");
  assert.equal(m.severity, "problem");
  assert.match(m.problems.join(), /Good Friday \(UK bank holiday\)/);
});

test("2026-11-27 is a bridge day after US Thanksgiving, and Black Friday with trading peaks", async () => {
  const m = await one("2026-11-27");
  assert.equal(m.severity, "warning");
  assert.match(m.warnings.join(), /bridge day between Thanksgiving Day \(US federal holiday\) and the weekend/);
  assert.doesNotMatch(m.warnings.join(), /Black Friday/);
  const peak = await one("2026-11-27", { include_trading_peaks: true });
  assert.match(peak.warnings.join(), /Black Friday/);
});

test("Show & Tell sprints: the one ending 2027-01-08 gets a capacity note; 2026-12-11 and 2027-02-05 pass", async () => {
  const sat = (date, n) => ({ id: String(n), title: `Show & Tell: Sprint ${n}`, due_date: date, task_type: "Show & Tell" });
  const result = await review([
    sat("2026-12-11", 1), sat("2026-12-25", 2), sat("2027-01-08", 3), sat("2027-01-22", 4), sat("2027-02-05", 5),
  ]);
  const byDate = Object.fromEntries(result.milestones.map((m) => [m.due_date, m]));
  assert.equal(byDate["2027-01-08"].severity, "note");
  assert.match(byDate["2027-01-08"].notes.join(), /loses?|losing 2 to public holidays/);
  assert.match(byDate["2027-01-08"].notes.join(), /spans 24 December to 1 January/);
  assert.equal(byDate["2026-12-11"].severity, null);
  assert.equal(byDate["2027-02-05"].severity, null);
});

test("suggested alternatives are always earlier working days that pass every check", async () => {
  for (const peaks of [false, true]) {
    const result = await review(["2026-12-25", "2026-12-28", "2027-03-26", "2026-11-27", "2026-12-26", "2027-12-27"], { include_trading_peaks: peaks });
    for (const m of result.milestones) {
      assert.ok(m.suggested_date, `${m.due_date} has a suggestion`);
      assert.ok(m.suggested_date < m.due_date, `${m.suggested_date} is before ${m.due_date}`);
      const check = await one(m.suggested_date, { include_trading_peaks: peaks });
      assert.ok(check.problems.length === 0 && check.warnings.length === 0, `${m.suggested_date} passes: ${[...check.problems, ...check.warnings]}`);
    }
  }
});

test("a clean review is one line naming the regions and the retrieval date", async () => {
  const md = formatDateReviewMarkdown(await review(["2026-12-11", "2027-02-05"]));
  assert.match(md, /^\*\*Milestone date review\*\*: no issues across 2 milestones \(regions checked: England and Wales, US federal; holiday data retrieved \d{4}-\d{2}-\d{2}\)\.$/);
});

test("a failed holiday fetch reports the region as skipped, not 'no issues'", async () => {
  setUkBankHolidaysLoader(async () => { throw new Error("getaddrinfo ENOTFOUND www.gov.uk"); });
  const result = await review(["2026-12-11"]);
  assert.equal(result.complete, false);
  assert.equal(result.regions.find((r) => r.region === "england-and-wales").status, "skipped");
  const md = formatDateReviewMarkdown(result);
  assert.doesNotMatch(md, /no issues/i);
  assert.match(md, /Holiday check incomplete.*England and Wales was skipped.*ENOTFOUND/);
});

test("dates beyond the GOV.UK data are reported as unchecked", async () => {
  const result = await review(["2028-06-14"]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.milestones[0].unchecked_regions, ["England and Wales"]);
  assert.doesNotMatch(formatDateReviewMarkdown(result), /no issues/i);
});

test("re-running the review updates its comment instead of duplicating it, and removes it once the date passes", async () => {
  const client = fakeProject();
  client.tasks.push(
    { id: "1", title: "Show & Tell: Sprint 2", type_id: 3, due_date: "2026-12-25", custom_fields: { 158673: "479116" }, list: "7" },
    { id: "2", title: "Site go-live", type_id: 3, due_date: "2027-02-05", custom_fields: { 158673: "479115" }, list: "7" },
  );
  const args = ReviewMilestoneDatesSchema.parse({ project_id: "9999", regions: REGIONS, response_format: "json" });

  const first = JSON.parse(await reviewProjectMilestoneDates(client, args));
  assert.equal(first.annotations.created, 1);
  assert.equal(client.comments.length, 1);
  assert.equal(client.comments[0].task, "1");
  assert.equal(client.comments[0].hidden, true);
  assert.match(client.comments[0].body, /Date review: falls on Christmas Day \(UK bank holiday, US federal holiday\).*Suggested alternative: Wed 23 Dec\. Confirm with the customer before moving\./);

  const second = JSON.parse(await reviewProjectMilestoneDates(client, args));
  assert.equal(second.annotations.unchanged, 1);
  assert.equal(client.comments.length, 1);

  client.tasks[0].due_date = "2026-12-28"; // still flagged, different reason: updated in place
  const third = JSON.parse(await reviewProjectMilestoneDates(client, args));
  assert.equal(third.annotations.updated, 1);
  assert.equal(client.comments.length, 1);
  assert.match(client.comments[0].body, /Boxing Day/);

  client.tasks[0].due_date = "2026-12-11"; // passes: comment removed
  const fourth = JSON.parse(await reviewProjectMilestoneDates(client, args));
  assert.equal(fourth.annotations.removed, 1);
  assert.equal(client.comments.length, 0);
});

test("applying a template reviews the milestones it creates, and so does a dry run", async () => {
  const { applyTaskTemplate } = await import("../dist/tools/templates.js");
  const { applyArgs } = await import("./helpers.mjs");
  const template = {
    name: "sat", title: "Show & Tells",
    task_lists: [{ name: "Core Delivery", tasks: [
      { title: "Show & Tell: Sprint {{repeat_index}}", milestone: true, task_type: "Show & Tell", repeat: 2, due_in_days: 14, repeat_every_days: 14 },
    ] }],
  };
  const dry = await applyTaskTemplate(null, applyArgs({ template_definition: template, dry_run: true, review_regions: REGIONS, response_format: "markdown" }));
  assert.match(dry, /Milestone date review/);
  const client = fakeProject();
  const applied = JSON.parse(await applyTaskTemplate(client, applyArgs({ template_definition: template, review_regions: REGIONS })));
  assert.equal(applied.date_review.counts.reviewed, 2);
  assert.deepEqual(applied.date_review.regions.map((r) => r.region), REGIONS);
});
