# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.4] - 2026-09-24

### Fixed

- **`productive_get_todo` was unreachable over MCP**: the tool was registered in `src/registry.ts` (and so worked through the CLI) but had no definition in the `ListToolsRequestSchema` handler, so MCP clients never saw it. It is now listed alongside the other todo tools, with a required `todo_id` and optional `response_format`.

## [1.6.3] - 2026-09-16

Merges PR #5 (`fix/comment-internal-visibility`, authored upstream as 1.3.4) into the 1.6 line. Verified against the live API: the comment resource exposes `hidden` and `pinned_at`; `visible_to_clients` and `pinned` do not exist.

### Fixed

- **Internal comments were always created public**: `productive_create_comment` sent `visible_to_clients` as an attribute that does not exist on Productive's comment resource. The API silently dropped it, so every comment was created visible to clients regardless of the flag, while the tool reported success. Comments are now sent with Productive's real `hidden` attribute (`hidden: !visible_to_clients`). This applies to every commentable type (task, deal, project, …).
- **Comment reads always reported client-visible and never showed pinned status**: `formatComment()` read the nonexistent `visible_to_clients` and `pinned` attributes, so `visible_to_clients` was always `true` and `pinned` always `false`. It now derives them from `hidden` and `pinned_at`. Single-comment views gained an explicit `**Visibility**` line.

### Added

- **`productive_update_comment` can toggle visibility**: optional `visible_to_clients` parameter, mapped to `hidden` on the wire, so comments incorrectly posted as public can be corrected without rewriting their body. `body` is now optional; at least one of `body` or `visible_to_clients` must be supplied, and omitting either leaves that aspect untouched.

### Notes

- This is a behaviour fix, not a data fix. Every comment previously posted through this server as "internal" is still `hidden: false` in Productive. The new update parameter is the route to correcting them, but the intent was never recorded, so they have to be found by hand.

## [1.6.2] - 2026-09-16

Merges the workflow-status scoping fix from PR #3 (published upstream as 1.3.3 on 2026-08-03) into the 1.4–1.6 line. Both branches had fixed the same underlying bug — status names resolving to IDs from an unused `Default workflow` — in different ways. This release combines them: the per-project runtime lookup (1.4.1/1.4.3) stays the primary path, and the dominant-workflow config resolution from PR #3 becomes the fallback.

### Fixed

- **Workflow status names resolved to the wrong workflow** (PR #3): Productive scopes statuses to a workflow, and `npm run setup` built its name→ID map by keeping the first occurrence of each name. Since the API returns statuses in ascending ID order, an unused "Default workflow" won every collision. Setup now samples recent tasks to detect which workflow the organisation actually uses, resolves duplicate names in its favour, and prints what it chose and what it ignored. It also warns about statuses that exist _only_ in an unused workflow (e.g. `Closed`).
- **Statuses added after config generation were unreachable** (PR #3): setup now picks these up on re-run.

### Changed

- **Workflow status resolution now combines both strategies.** `productive_create_task`, `productive_create_milestone`, `productive_update_task` and `productive_create_tasks_batch` first resolve the name against the workflow the target project actually uses (`resolveWorkflowStatusIdForProject` in `src/tools/tasks.ts`, cached 5 minutes). Only when the project's workflow cannot be determined — a project with no tasks yet, or an API error — does resolution fall back to `productive.config.json` via `resolveWorkflowStatusId` in `src/constants.ts`, which prefers the dominant workflow. This resolves the "known limitation" PR #3 documented: an organisation running two workflows across different projects now gets the right ID for each project. `productive_create_tasks_batch` previously used the static config map only; it now uses the per-project lookup too.
- **Unknown workflow status names now error instead of being silently dropped** (PR #3). All four tools previously logged a warning to stderr, discarded the status field, and reported success — leaving the task at the wrong status. They now throw, listing the usable statuses (the project's own workflow when it could be determined, otherwise the configured dominant workflow). In batch creation the error is recorded against that task and the remaining tasks continue.
- **Statuses belonging to an unused workflow are refused up front** (PR #3) with an actionable message naming the alternatives, instead of being sent and rejected opaquely by the API.
- **The `workflow_status` enum lists only statuses in the workflow your tasks use** (PR #3), derived from the config rather than a hardcoded default list. With no config the parameter is omitted from the tool schemas entirely; passing it explicitly errors pointing at `npm run setup`.
- `productive.config.json` gains `workflow_status_workflow_ids`, `workflow_status_workflows` and `dominant_workflow` (PR #3). **Re-run `npm run setup` after upgrading.**
- Corrected the `workflow_status` parameter descriptions at all four sites (PR #3); `npm run setup` now reports why task sampling failed rather than swallowing the error.

### Documentation

- `docs/workflow-statuses.md` (PR #3) — how resolution works and why a name may be refused, updated here to describe the per-project lookup.

## [1.6.1] - 2026-05-13

### Changed

- **Deal `date` attribute is "Date Opened", not "Start Date"** — terminology corrected throughout. The Productive UI labels this field "Date Opened" and uses it for when the opportunity was first opened (or the Pipedrive first-recorded date for migrated deals). It is NOT a sales-close forecast — revenue attribution lives on separate `revenue_distributions` objects with their own `start_on`/`end_on` periods. Affects:
  - `formatSingleDealMarkdown` — "Start Date" label → "Date Opened", with an inline note explaining the distinction.
  - `productive_get_deal`, `productive_list_deals`, `productive_search_deals`, `productive_update_deal`, `productive_create_deal` tool descriptions — clarify that `date` / `start_date` is the opportunity open date and point readers at revenue distributions for forecast/attribution.
  - `FormattedDeal.start_date` retains its field name for backward compatibility (it still maps to the API's `date` attribute).

### Added

- **`productive_get_deal` now surfaces revenue distributions** — fetches `/revenue_distributions?filter[deal_id]=<id>` alongside the deal and renders a "Revenue Distributions" section listing each distribution's `start_on → end_on` period and `amount_percent`. Empty when no distributions exist (rendered as "_None attached to this deal._"). `FormattedDeal` gains an optional `revenue_distributions` array; populated by `getDeal`, undefined elsewhere (so list/search responses stay slim).
- **`productive_update_deal` accepts five additional fields** (closes the gaps with `productive_create_deal`):
  - `start_date` — maps to the API's `date` attribute (Date Opened).
  - `end_date` — deal end date.
  - `responsible_id` — reassign the deal owner via a `relationships.responsible` write.
  - `currency` — change the deal currency (ISO 4217).
  - `custom_fields` — same `{ field_id: value }` shape as create. Use `productive_list_custom_fields` (`customizable_type='deals'`) to discover IDs.

### Notes

- The `productive_create_revenue_distribution` tool continues to send `start_on` / `end_on` as API attribute names (matching what the existing implementation has used since the initial 0.1.0 release). The Productive API docs use `started_on` / `ended_on` for similar resources (bookings, salaries), so this is worth re-verifying against the live API on the next round — but no functional change was made as the current names work in practice.

## [1.6.0] - 2026-05-11

### Added

- **Deal lifecycle support** — six new tools that fill the gaps a Pipedrive → Productive migration hit on 11 May 2026:
  - `productive_create_deal` — full sales-deal create. Payload quirks baked in:
    - `deal_value` is sent in **minor units** (pence/cents) — e.g. 60000 = £600.00 — and we auto-set `deal_value_source: "manual"` so the value sticks without needing services. Without `manual`, Productive silently zeroes the deal.
    - The start date attribute is `date` on the API (not `start_date`); the tool translates.
    - `deal_type_id` defaults to 2 (standard sales deal).
    - Required custom fields surface via 422 with `(at data/attributes/custom_field_<id>)` thanks to the error reporter changes below.
  - `productive_create_budget` — same `/deals` endpoint with `budget: true`.
  - `productive_list_pipelines` — `GET /pipelines` (no sort param accepted).
  - `productive_list_companies` + `productive_get_company` — `GET /companies` with optional `filter[query]`.
  - `productive_list_custom_fields` — `GET /custom_fields?filter[customizable_type]=<plural>` (e.g. `deals`). For `select` / `multi_select` fields, also fetches option IDs and labels via `GET /custom_field_options?filter[custom_field_id]=<id>`. Surfaces `required`, friendly `data_type` labels (text/number/select/date/multi_select/etc), and skips archived fields by default.
- **Deal value capability on read + update** — `FormattedDeal` and `productive_update_deal` now expose `deal_value`, `deal_value_source`, and `deal_value_total`. Setting `deal_value` on update auto-promotes `deal_value_source` to `"manual"` unless overridden. Markdown views show **Deal Value** with the source label.
- **Polymorphic comments** — `productive_create_comment` accepts either the legacy `task_id` shorthand or a `commentable_type` + `commentable_id` pair (`task`, `deal`, `project`, `discussion`, `invoice`, `person`, `company`, `purchase_order`). Sent via the typed singular relationship key (e.g. `relationships.deal`), with the resource type as plural (`deals`) — matches what Productive returns. `FormattedComment` gains `commentable_type` and `commentable_id`.
- **List comments by project** — `productive_list_comments` now accepts `project_id` as an alternative to `task_id`. (Productive's API only supports these two list filters; deal/invoice comments cannot be listed in bulk — fetch by known comment ID.)

### Fixed

- `productive_update_deal` `note: "null"` (string) no longer writes the literal four-character string. We now accept JSON null, empty string, or the literal `"null"` and translate all three to a real null for the API. Tool description updated to be unambiguous.
- Error reporter surfaces the JSON:API `code` and `source.pointer` / `source.parameter` verbatim. Example: `Sort by 'position' is not supported on this endpoint. [sort_param_unsupported] (param sort)`. This makes `required_custom_field` 422s actionable for callers (the pointer names the missing field).

## [1.5.0] - 2026-05-08

### Added

- **Time tracking tools** — nine new MCP tools, the foundation for the upcoming ProductiveTimer desktop app. All verified end-to-end against the live Productive API:
  - `productive_start_timer` — start a timer against a service, optionally with a backdated `started_at`, a linked task, and a note. Internally: `POST /timers` (only `relationships.service` propagates), then a follow-up `PATCH /time_entries/{linked}` for task / note since those don't propagate through the timer POST.
  - `productive_stop_timer` — `PATCH /timers/{id}/stop` (custom action route — empty body). Optional `note` / `billable_time_minutes` are applied to the linked time_entry just before stopping.
  - `productive_get_running_timer` — current user's active timer, or `No running timer`. Productive doesn't accept `filter[stopped_at]=null`, so we fetch the most-recent timer for the person and check `stopped_at` client-side.
  - `productive_update_timer` — patch a running timer's note, task, service, or billable time via `PATCH /time_entries/{linked}` (timers themselves are not directly patchable; `PATCH /timers/{id}` returns 404). Pass `task_id: null` to unlink. **Cannot update `started_at` on a running timer** — the API has no public verb for that; to anchor the start time, stop the timer and start a new one with `started_at` in the past.
  - `productive_create_time_entry` — manual past-tense entry. `time_minutes` is in **minutes** (Productive's `time` attribute), not hours.
  - `productive_update_time_entry` / `productive_delete_time_entry` — patch or remove existing entries.
  - `productive_list_time_entries` — list entries by person and date range, optionally filtered by service / task / project. Defaults to the last 7 days; renders as a Markdown table with total / billable totals.
  - `productive_list_my_tasks_due_today` — convenience view: the authenticated user's open tasks, split into Today / Overdue / Undated. The due-date predicate is applied client-side because Productive's `filter[due_date]` does not support `[lte]` operator suffixes.
- **Current-user resolution** — new helper `resolveCurrentPersonId` (in `src/tools/timers.ts`, re-used by time-entry and task tools). Lookup order: `PRODUCTIVE_PERSON_ID` env → `GET /people/me` → `GET /people?filter[email]=PRODUCTIVE_USER_EMAIL`. Cached for the process lifetime.
- New `Timer`, `TimeEntry`, `FormattedTimer`, and `FormattedTimeEntry` types in `src/types.ts` plus `formatTimer` / `formatTimerMarkdown` / `formatTimeEntry` / `formatTimeEntryMarkdown` / `formatTimeEntryListMarkdown` formatters in `src/utils/formatting.ts`. The timer formatter reads metadata from the linked `time_entry` (including `?include=time_entry,time_entry.service,time_entry.task,time_entry.project,time_entry.person`), since Productive timers carry only `person_id` / `started_at` / `stopped_at` / `total_time` themselves.
- `.env.example` documents the optional `PRODUCTIVE_PERSON_ID` and `PRODUCTIVE_USER_EMAIL` variables.

## [1.4.5] - 2026-04-13

### Fixed

- Page body content no longer disappears after loading in Productive's collaborative editor. Three root causes addressed:
  1. `br` inline tokens were emitting `{ type: "text", text: "\n" }` — text nodes must not contain `\n` in ProseMirror; the editor silently discards them on load. Fixed to emit `{ type: "br" }`.
  2. Code blocks with multi-line content emitted a single text node with embedded `\n` characters (same violation). Fixed by splitting on `\n` and interspersing `br` nodes.
  3. GFM markdown tables were silently dropped (no handler). Added full table conversion to Productive's `table → table_row → table_header/table_cell` format.

### Added

- Debug logging: `createPage` and `updatePage` now log the converted ProseMirror JSON to stderr before the API call (`[Pages:createPage]` / `[Pages:updatePage]`).
- CLI now logs `[CLI Tool Call]` with tool name, version, and args to stderr on every invocation, matching the MCP server's existing `[MCP Tool Call]` logging — makes it possible to identify the source interface in logs.

## [1.4.4] - 2026-04-10

### Fixed

- Page body now persists correctly in Productive's UI (content no longer appears then disappears). Root cause was two compounding bugs: (1) block nodes in the generated ProseMirror document were missing `id` attributes required by Productive's real-time collaborative editor — without these the editor overwrites API-provided content with empty state; (2) the body must be sent as a stringified JSON string, not a raw JSON object — sending a raw object causes the API to reject the body and return the default empty document. Both fixes are required together.

## [1.4.3] - 2026-04-03

### Fixed

- `resolveWorkflowStatusId` no longer uses the unsupported `filter[project_id]` on `/workflow_statuses` (returned 400). It now uses a 3-step lookup: fetch one task from the project to get a status ID, fetch that status to get its workflow ID, then fetch all statuses for that workflow. Results are cached per project for 5 minutes.
- Corrected stale IDs in `productive.config.json` static fallback: `In Progress` (142518→142890), `To Do` (142549→142889), `To Be Discussed` (142550→142895). Removed non-existent `Closed` entry. All 10 real statuses now confirmed against the API.

## [1.4.2] - 2026-04-03

### Fixed

- `truncateResponse` no longer truncates JSON format output — mid-string cuts produced invalid JSON that broke downstream parsers (e.g. `JSONDecodeError: Invalid control character at char 25000`). JSON responses are now returned in full regardless of size; only Markdown responses are truncated with a pagination hint.

## [1.4.1] - 2026-04-03

### Added

- `parent_task_id` parameter on `productive_update_task` — set or change a task's parent to make it a sub-task, or pass `null` to remove the parent and make it top-level
- `parent_task_id` surfaced in all task responses (JSON and Markdown formats)

## [1.4.0] - 2026-04-03

### Added

- **CLI interface**: New `productive` CLI command alongside the existing MCP server. All 71 tools are available as subcommands (e.g. `productive search-tasks --project_id 123`). Features include:
  - Auto-generated flags from Zod schemas with type hints, choices, and required/optional indicators
  - `@file` convention for long string args (e.g. `--body @design.md`, `--body @-` for stdin)
  - JSON output by default (override with `--format markdown`)
  - Comma-separated array values (e.g. `--labels "Bug,Urgent"`)
  - JSON auto-parsing for nested args (e.g. batch task creation)

### Changed

- **Shared tool registry**: Extracted tool-to-handler mapping from 530-line switch statement into `src/registry.ts`, shared by both MCP server and CLI. Adding new tools now requires a single registry entry instead of maintaining parallel switch cases.

## [1.3.4] - 2026-03-26

### Fixed

- **Workflow status updates across projects**: Resolve workflow status IDs dynamically per-project instead of using static config. The same status name (e.g. "In Progress") has different IDs in different projects — using the wrong ID caused "attribute is invalid" errors.

## [1.3.3] - 2026-03-24

### Fixed

- **Page body format**: Send ProseMirror document as raw JSON object, not stringified string. Stringified bodies were rendered as literal JSON text inside a paragraph instead of structured content.

## [1.3.2] - 2026-03-24

### Fixed

- **Estimate updates on pre-existing tasks**: Set both `initial_estimate` and `remaining_time` when updating estimates. Tasks created without an initial estimate would silently reject `remaining_time`-only updates.

## [1.3.1] - 2026-03-24

### Fixed

- **Base64 attachment uploads**: Strip `data:...;base64,` prefix from base64 content before decoding, preventing "Invalid base64 encoding" errors when LLMs include data URI prefixes.

## [1.3.0] - 2026-03-24

### Added

- `query` parameter on `productive_list_people` — search people by name or email via `filter[query]`
- `assignee_id` parameter on `productive_update_task` — assign or unassign tasks (pass `null` to clear)
- Dynamic server version — MCP server now reports actual version from package.json instead of hardcoded `1.0.0`

### Fixed

- **Page body persistence**: Pages API expects body as a stringified JSON string, not a raw JSON object. Body content now correctly persists on create and update.
- **Label duplicate prevention**: Label resolution now fetches existing options from the Productive API with case-insensitive matching instead of relying on a stale local config. Results cached for 5 minutes with pagination support.
- **Estimate updates**: `estimate_minutes` on update now sets `remaining_time` (the displayed "Time to complete" in Productive) instead of `initial_estimate`, which is only meaningful at creation time.

## [1.2.1] - 2026-03-03

### Added

- `productive_create_milestone` tool — creates milestones (tasks with `type_id: 3`) in Productive.io, with support for title, description, due date, assignee, and workflow status
- `milestone_only` filter on `productive_search_tasks` — filters results to milestones only (`type_id=3`)
- `is_milestone` flag surfaced in all task responses; milestone creation output shows "Milestone Created Successfully"

## [1.2.0] - 2026-02-18

### Added

- **Labels support**: Labels are now handled as multi-select custom fields (auto-discovered by setup script)
- Labels on create_task, update_task, and batch create — new labels auto-created as custom field options
- Labels displayed in task output (markdown and JSON formats)
- **Search enhancements**: `created_after`, `created_before`, `updated_after`, `sort`, and `task_list_id` filters on search_tasks

### Fixed

- **Custom fields merge on update**: `updateTask` now GETs existing custom_fields before PATCHing, preventing task_type/priority/labels from being wiped when updating other custom fields

## [1.1.1] - 2026-02-17

### Fixed

- Page create/update body was silently ignored — Productive's Pages API expects body as a stringified JSON document, not a raw JSON object
- Exported `ProductiveDoc` and `ProductiveDocNode` types from `src/types.ts` for reuse
- Added `markdownToProductiveDocString()` wrapper for the API's expected string format

### Documentation

- Added "Body Format Gotchas" section to CLAUDE.md documenting the different formats across endpoints

## [1.1.0] - 2026-02-17

### Added

- Comment tools: create, get, update, and delete comments on tasks

## [1.0.0] - 2026-02-16

### Added

- Initial public release
- 50+ read/write tools for the Productive.io API
- Task management (create, search, update, list subtasks, batch create)
- Task list management (CRUD, reposition, move, copy, archive/restore)
- Task dependencies and todo items
- Project and board listing
- People directory
- Page management (CRUD, search)
- Budget and revenue distribution management
- Service and service type management
- Attachment listing and upload
- Custom field support via setup script
- Rate limiting (100 requests/10s sliding window)
- Response truncation with pagination hints

[1.4.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.3.4...v1.4.0
[1.3.4]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TheSiteDoctor/ProductiveMCP/releases/tag/v1.0.0
