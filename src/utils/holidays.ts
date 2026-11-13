/**
 * Public holiday sources for the milestone date review.
 *
 * - UK bank holidays come from GOV.UK (https://www.gov.uk/bank-holidays.json),
 *   one region per division: england-and-wales, scotland, northern-ireland.
 *   The feed includes substitute days (e.g. Boxing Day observed on Mon 28 Dec
 *   2026) and only covers a few years, so dates outside it are reported as
 *   unchecked rather than clear.
 * - US federal holidays are computed from the rules in 5 U.S.C. 6103, so
 *   there's no third-party dependency: fixed dates move to the nearest weekday
 *   when they fall at a weekend (Saturday to the Friday before, Sunday to the
 *   Monday after), plus the Monday and Thursday rules.
 *
 * Holiday data is cached (in memory, and GOV.UK's also on disk) with the time
 * it was retrieved. A source that can't be loaded makes its region "skipped";
 * callers must never report "no issues" for a skipped region.
 */

import axios from "axios";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const UK_DIVISIONS = ["england-and-wales", "scotland", "northern-ireland"] as const;
export const SUPPORTED_REGIONS = [...UK_DIVISIONS, "us-federal"] as const;

const REGION_LABELS: Record<string, { name: string; holidayLabel: string }> = {
  "england-and-wales": { name: "England and Wales", holidayLabel: "UK bank holiday" },
  scotland: { name: "Scotland", holidayLabel: "UK bank holiday, Scotland" },
  "northern-ireland": { name: "Northern Ireland", holidayLabel: "UK bank holiday, Northern Ireland" },
  "us-federal": { name: "US federal", holidayLabel: "US federal holiday" },
};

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  region: string;
  /** e.g. "UK bank holiday", "US federal holiday" */
  label: string;
  substitute: boolean;
}

export interface RegionHolidays {
  region: string;
  /** Display name, e.g. "England and Wales" */
  name: string;
  status: "ok" | "skipped";
  /** Why the region was skipped */
  reason?: string;
  /** Where the data came from */
  source: string;
  /** ISO timestamp the data was retrieved (or computed) */
  retrieved_at?: string;
  /** Inclusive date range the data covers; dates outside it aren't checked */
  coverage?: { from: string; to: string };
  /** YYYY-MM-DD -> holidays on that date */
  byDate: Map<string, Holiday[]>;
}

// ---------------------------------------------------------------------------
// Date helpers (calendar dates as YYYY-MM-DD, computed in UTC)
// ---------------------------------------------------------------------------

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

/** "Wed 23 Dec" (add the year with withYear) */
export function formatShortDate(iso: string, withYear = false): string {
  return parseIsoDate(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).replace(/,/g, "");
}

// ---------------------------------------------------------------------------
// US federal holidays (5 U.S.C. 6103)
// ---------------------------------------------------------------------------

/** The nth (1-based) given weekday of a month, e.g. the 4th Thursday of November. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return toIsoDate(new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7)));
}

/** The last given weekday of a month, e.g. the last Monday of May. */
function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return toIsoDate(new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset)));
}

/** US federal holidays observed in a calendar year. */
export function usFederalHolidays(year: number): Holiday[] {
  const label = REGION_LABELS["us-federal"].holidayLabel;
  const make = (date: string, name: string, substitute = false): Holiday => ({
    date, name, region: "us-federal", label, substitute,
  });

  const holidays: Holiday[] = [];
  // Fixed-date holidays move to the nearest weekday. New Year's Day of the
  // following year can be observed on 31 December of this one.
  const fixed: Array<[number, number, string]> = [
    [1, 1, "New Year's Day"],
    [6, 19, "Juneteenth National Independence Day"],
    [7, 4, "Independence Day"],
    [11, 11, "Veterans Day"],
    [12, 25, "Christmas Day"],
  ];
  for (const y of [year, year + 1]) {
    for (const [month, day, name] of fixed) {
      const actual = toIsoDate(new Date(Date.UTC(y, month - 1, day)));
      const dow = dayOfWeek(actual);
      const observed = dow === 6 ? addDays(actual, -1) : dow === 0 ? addDays(actual, 1) : actual;
      if (observed.startsWith(`${year}-`)) {
        holidays.push(make(observed, observed === actual ? name : `${name} (observed)`, observed !== actual));
      }
    }
  }

  holidays.push(
    make(nthWeekday(year, 1, 1, 3), "Birthday of Martin Luther King, Jr."),
    make(nthWeekday(year, 2, 1, 3), "Washington's Birthday"),
    make(lastWeekday(year, 5, 1), "Memorial Day"),
    make(nthWeekday(year, 9, 1, 1), "Labor Day"),
    make(nthWeekday(year, 10, 1, 2), "Columbus Day"),
    make(nthWeekday(year, 11, 4, 4), "Thanksgiving Day"),
  );

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/** US Thanksgiving (4th Thursday of November) for a year. */
export function usThanksgiving(year: number): string {
  return nthWeekday(year, 11, 4, 4);
}

// ---------------------------------------------------------------------------
// UK bank holidays (GOV.UK)
// ---------------------------------------------------------------------------

const GOV_UK_URL = "https://www.gov.uk/bank-holidays.json";
const GOV_UK_TTL_MS = 24 * 60 * 60 * 1000;

interface GovUkFeed {
  [division: string]: {
    division: string;
    events: Array<{ title: string; date: string; notes?: string }>;
  };
}

type UkLoader = () => Promise<unknown>;

const defaultUkLoader: UkLoader = async () =>
  (await axios.get(GOV_UK_URL, { timeout: 10000 })).data;

let ukLoader: UkLoader = defaultUkLoader;
let ukCache: { feed: GovUkFeed; retrievedAt: string; fetchedAtMs: number } | null = null;
/** Whether the on-disk cache is used (off in tests that swap the loader). */
let ukDiskCache = true;

const diskCachePath = (): string =>
  join(process.env.PRODUCTIVE_HOLIDAY_CACHE_DIR || join(tmpdir(), "productive-mcp"), "gov-uk-bank-holidays.json");

/**
 * Replace the GOV.UK loader (tests use a fixture; pass undefined to restore).
 * Also clears the cache and turns the disk cache off while a custom loader is set.
 */
export function setUkBankHolidaysLoader(loader?: UkLoader): void {
  ukLoader = loader || defaultUkLoader;
  ukDiskCache = !loader;
  ukCache = null;
}

function isGovUkFeed(value: unknown): value is GovUkFeed {
  if (!value || typeof value !== "object") return false;
  const ew = (value as Record<string, { events?: unknown }>)["england-and-wales"];
  return !!ew && Array.isArray(ew.events);
}

/** Load the GOV.UK feed: fresh cache, else fetch, else a stale cache, else throw. */
async function loadGovUkFeed(): Promise<{ feed: GovUkFeed; retrievedAt: string; stale: boolean }> {
  if (ukCache && Date.now() - ukCache.fetchedAtMs < GOV_UK_TTL_MS) {
    return { feed: ukCache.feed, retrievedAt: ukCache.retrievedAt, stale: false };
  }
  try {
    const data = await ukLoader();
    if (!isGovUkFeed(data)) throw new Error("unexpected response format");
    const retrievedAt = new Date().toISOString();
    ukCache = { feed: data, retrievedAt, fetchedAtMs: Date.now() };
    if (ukDiskCache) {
      try {
        mkdirSync(join(diskCachePath(), ".."), { recursive: true });
        writeFileSync(diskCachePath(), JSON.stringify({ retrieved_at: retrievedAt, feed: data }));
      } catch {
        // A disk cache is a nicety; the in-memory one still works.
      }
    }
    return { feed: data, retrievedAt, stale: false };
  } catch (error) {
    // Fall back to the last copy we retrieved, saying when that was.
    if (ukCache) return { feed: ukCache.feed, retrievedAt: ukCache.retrievedAt, stale: true };
    if (ukDiskCache && existsSync(diskCachePath())) {
      try {
        const cached = JSON.parse(readFileSync(diskCachePath(), "utf-8"));
        if (isGovUkFeed(cached.feed)) {
          return { feed: cached.feed, retrievedAt: cached.retrieved_at, stale: true };
        }
      } catch {
        // Fall through to the error below.
      }
    }
    throw new Error(
      `GOV.UK bank holidays couldn't be loaded (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Loading regions
// ---------------------------------------------------------------------------

function indexByDate(holidays: Holiday[]): Map<string, Holiday[]> {
  const byDate = new Map<string, Holiday[]>();
  for (const h of holidays) {
    const list = byDate.get(h.date) || [];
    list.push(h);
    byDate.set(h.date, list);
  }
  return byDate;
}

/**
 * Load holidays for each region, for the years the dates being checked fall
 * in. Unsupported or unloadable regions come back with status "skipped" and a
 * reason; they never throw, so one bad source doesn't stop the others.
 */
export async function loadRegionHolidays(
  regions: readonly string[],
  years: readonly number[],
): Promise<RegionHolidays[]> {
  const results: RegionHolidays[] = [];
  for (const raw of regions) {
    const region = raw.trim().toLowerCase();
    const meta = REGION_LABELS[region];
    if (!meta) {
      results.push({
        region, name: raw, status: "skipped", source: "none", byDate: new Map(),
        reason: `"${raw}" isn't a supported region (supported: ${SUPPORTED_REGIONS.join(", ")})`,
      });
      continue;
    }

    if (region === "us-federal") {
      const holidays = [...new Set(years)].flatMap((y) => usFederalHolidays(y));
      const sorted = [...years].sort();
      results.push({
        region, name: meta.name, status: "ok",
        source: "computed from 5 U.S.C. 6103",
        retrieved_at: new Date().toISOString(),
        coverage: sorted.length > 0 ? { from: `${sorted[0]}-01-01`, to: `${sorted[sorted.length - 1]}-12-31` } : undefined,
        byDate: indexByDate(holidays),
      });
      continue;
    }

    try {
      const { feed, retrievedAt, stale } = await loadGovUkFeed();
      const division = feed[region];
      if (!division) throw new Error(`the GOV.UK feed has no "${region}" division`);
      const holidays: Holiday[] = division.events.map((e) => {
        const substitute = /substitute/i.test(e.notes || "");
        return {
          date: e.date,
          name: substitute ? `${e.title} (substitute day)` : e.title,
          region, label: meta.holidayLabel, substitute,
        };
      });
      const dates = holidays.map((h) => h.date).sort();
      results.push({
        region, name: meta.name, status: "ok",
        source: stale ? "GOV.UK bank holidays (cached copy; the live feed couldn't be reached)" : "GOV.UK bank holidays",
        retrieved_at: retrievedAt,
        // The feed covers whole years; anything outside them isn't checked.
        coverage: dates.length > 0 ? { from: `${dates[0].slice(0, 4)}-01-01`, to: `${dates[dates.length - 1].slice(0, 4)}-12-31` } : undefined,
        byDate: indexByDate(holidays),
      });
    } catch (error) {
      results.push({
        region, name: meta.name, status: "skipped", source: "GOV.UK bank holidays", byDate: new Map(),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/** Whether a region's data covers a date. */
export function covers(region: RegionHolidays, iso: string): boolean {
  return region.status === "ok" && !!region.coverage && iso >= region.coverage.from && iso <= region.coverage.to;
}
