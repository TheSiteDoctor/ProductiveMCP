# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.3] - 2026-08-03

### Fixed

- **Workflow status names resolved to the wrong workflow**: Productive scopes statuses to a workflow, and `npm run setup` built its name→ID map by keeping the first occurrence of each name. Since the API returns statuses in ascending ID order, an unused "Default workflow" won every collision. In an org with a Default and a real workflow, `To Do`, `In Progress`, and `To Be Discussed` all mapped to IDs the API rejects on real tasks.

  Setup now samples recent tasks to detect which workflow the organisation actually uses, resolves duplicate names in its favour, and prints what it chose and what it ignored. It also warns about statuses that exist *only* in an unused workflow (e.g. `Closed`), which can never be applied to tasks in the workflow you work in.

- **Statuses added after config generation were unreachable**: setup now picks these up on re-run; they were previously missing from the map and the tool enums entirely.

### Changed

- **Unknown workflow status names now error instead of being silently dropped.** `productive_create_task`, `productive_create_milestone`, `productive_update_task`, and `productive_create_tasks_batch` previously logged a warning to stderr, discarded the status field, and reported success — leaving the task at the wrong status. They now throw an error listing the available statuses. In batch creation the error is recorded against that task and the remaining tasks continue.
- `productive.config.json` gains `workflow_status_workflows` (which workflow each status belongs to) and `dominant_workflow`, for transparency and to support per-workflow resolution later.
- Corrected the `workflow_status` parameter description, which pointed at a `productive_list_workflow_statuses` tool that does not exist.

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

[1.2.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TheSiteDoctor/ProductiveMCP/releases/tag/v1.0.0
