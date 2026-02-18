# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/TheSiteDoctor/ProductiveMCP/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TheSiteDoctor/ProductiveMCP/releases/tag/v1.0.0
