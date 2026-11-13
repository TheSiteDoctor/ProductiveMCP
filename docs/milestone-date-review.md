# Milestone date review

Planning dates without checking holidays leaves the customer to spot the
problem, which looks careless. The date review checks every Milestone that
has a due date and reports anything that needs raising with the customer.
**It never changes a date**: the new date has to be agreed first.

## When it runs

- **Automatically at the end of `productive_apply_task_template`**, when the
  run created or reused Milestones with due dates (for example the Show &
  Tells in `standard-delivery`). The result is part of the apply response,
  including on `dry_run`, where it reviews the dates the milestones would get.
  Pass `review_regions` and `include_trading_peaks` to the apply to change
  what's checked.
- **On demand with `productive_review_milestone_dates`**, for example after
  moving dates or agreeing a different Show & Tell day:

  ```json
  { "project_id": "1110685", "regions": ["england-and-wales", "us-federal"], "include_trading_peaks": false, "annotate": true }
  ```

  It reviews every open Milestone in the project.

## Regions and holiday sources

| Region              | Source                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `england-and-wales` | [GOV.UK bank holidays](https://www.gov.uk/bank-holidays.json)             |
| `scotland`          | GOV.UK bank holidays                                                     |
| `northern-ireland`  | GOV.UK bank holidays                                                     |
| `us-federal`        | Computed from 5 U.S.C. 6103 (no third-party dependency)                  |

- GOV.UK's feed includes **substitute days**, such as Boxing Day observed on
  Mon 28 Dec 2026. It only covers a few years ahead: a date beyond it is
  reported as not checked for that region, never as clear.
- US federal holidays: fixed dates move to the nearest weekday (Saturday to
  the Friday before, Sunday to the Monday after), plus the Monday rules (Martin
  Luther King Jr., Washington's Birthday, Memorial Day, Labor Day, Columbus
  Day) and Thanksgiving on the fourth Thursday of November.
- The default regions come from `productive.config.json`:
  `"date_review": { "regions": ["england-and-wales", "us-federal"] }`, which
  `npm run setup` writes and keeps. Calls can override them. Holidays vary by
  country, so confirm which countries the client's stakeholders and the team
  are in (the `standard-delivery` onboarding ticket "Confirm the Show & Tell
  day of the week" asks for this).
- GOV.UK data is cached for a day, in memory and on disk (in the system temp
  folder, or `PRODUCTIVE_HOLIDAY_CACHE_DIR`), with the time it was retrieved.
  If the feed can't be reached, the last cached copy is used and labelled as
  such. With no copy at all, the region is reported as **skipped** with the
  reason, and the review says the holiday check is incomplete. It never
  reports "no issues" when a check didn't run.

## Checks

**Problems** (the date shouldn't stand):

- A public holiday in any selected region, including substitute days.
- A weekend.

**Warnings** (raise with the customer):

- A **bridge day**: a single working day between a holiday and a weekend,
  such as the Friday after US Thanksgiving.
- Between **24 December and 1 January**.
- With `include_trading_peaks` (use it for e-commerce clients): **Black
  Friday**, **Cyber Monday** or the **week leading up to Christmas** (18 to
  24 December), when the customer's team is busy trading.

**Notes** (Show & Tells only - a Milestone with Task type "Show & Tell"):

- **Sprint capacity**: each sprint runs from the day after the previous Show &
  Tell (or `project_start_date` for Sprint 1; without it, Sprint 1 is assumed
  to be as long as the gap between the first two Show & Tells) to its demo.
  A sprint that loses working days to holidays, or that spans 24 December to
  1 January, is flagged so the demo can be planned as a lighter check-in.

## Output

Results are grouped by severity. Each item gives the ticket, its date, the
reason (with the holiday name and region) and a **suggested alternative**:
the nearest earlier working day that passes every check. It never suggests a
later date, since that would move the demo past the end of its sprint.

If nothing is flagged, the review is one line, with the regions checked and
the date the holiday data was retrieved.

### Review comments

With `annotate` (the default, and always on during an apply), each flagged
Milestone gets one **internal** comment for the project manager, for example:

> Date review: falls on Christmas Day (UK bank holiday, US federal holiday).
> Suggested alternative: Wed 23 Dec. Confirm with the customer before moving.

Re-runs update that comment rather than adding another, and delete it once
the date passes. A date that couldn't be fully checked keeps its comment.
Productive only lets a comment's author edit it, so if someone else ran the
earlier review, the update is reported as an error rather than duplicated.
