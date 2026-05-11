# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
