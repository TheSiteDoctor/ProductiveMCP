# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-09-15

### Added

- **Task templates** — a reusable ticket template system for spinning up a project's standard tickets in one call:
  - `productive_list_task_templates` — list the templates found in `templates/` (or `PRODUCTIVE_TEMPLATES_DIR`), with task counts, total estimates and required variables. Invalid template files are reported individually without hiding valid ones.
  - `productive_get_task_template` — preview a template's full task list/task/subtask tree and its variables before applying.
  - `productive_apply_task_template` — create everything the template defines in a target project: task lists (reusing same-named active lists case-insensitively rather than duplicating, unless `reuse_existing_task_lists: false`), tasks and arbitrarily nested subtasks via `parent_task` relationships, with `{{variable}}` placeholder substitution in list names, titles and descriptions. Within a reused list, a ticket whose title already exists at the same level is reused and only the template's missing children are added beneath it, at every depth (unless `skip_existing_tasks: false`), so add-ons can contribute tasks to another template's Features and re-applies are idempotent. A newly created list is moved before any of the template's later phases that already exist, so phases stay in order, and a new top-level ticket added to a list that already holds a milestone is moved above it, so milestones stay at the end of their phase. Template tasks can `repeat` a fixed or variable number of times, with `{{repeat_index}}` numbering the copies and `repeat_every_days` stepping their due dates. Supports `dry_run` preview, `default_assignee_id`, `board_id` (defaults to the project's first board), per-task labels (auto-created), `estimate_minutes` (sets `initial_estimate`), `due_in_days`, `milestone: true` (creates a Productive milestone, `type_id: 3`), and task type/priority (skipped when the org hasn't configured the custom field, so templates stay portable). Failures are recorded and the run continues; subtasks of a failed parent are reported as skipped.
- Seven starter templates, all following TSD's Productive hierarchy: **task list = project phase** (`foundation_list`, `delivery_list` and `launch_list` variables, defaulting to Discovery / Foundation, Core Delivery and Go-live), **top-level ticket = Feature** (the epic), **children = the tasks** that deliver it:
  - `discovery` - foundational discovery for rebuilds and larger projects: seven Features (access requests due within five days, goals and stakeholders, Screaming Frog crawl and full legacy URL inventory, SEO and analytics baselines, technical and integrations including a DNS zone snapshot, content audit, sitemap and redirect map), then a findings playback and a sign-off milestone. High priority marks anything lost once the old site is switched off.
  - `standard-delivery` - Project Setup (agree the Product Owners and Project Team, kick-offs, repo, development environment), Project Management (with a `Show & Tell: Sprint N` ticket per planned two-week sprint from the required `sprint_count` variable), Infrastructure setup, Third-party accounts (get or create GTM, GA4, Clarity, Search Console, cookie consent, CreateSend) and Transactional email (client set up in the SMTP provider, SMTP details shared) Features in the core delivery phase, ending in a Build Complete milestone; and a Go-live Launch Feature: a lean gate of must-pass launch checks (production licences, live SMTP provider, HTTPS/www/canonical redirects, GTM/GA4/Clarity, Search Console, StatusCake, Seq, live e-commerce test transaction).
  - `umbraco-setup` - add-on contributing Umbraco/Igloo installation and client CMS training to standard-delivery's core delivery Features.
  - `website-build` - a Feature per page type in the core delivery phase (Site-wide, Homepage, Content Page) with Design / Front-end / Back-end / QA / QC tasks, plus canonical URL enforcement and a go-live release milestone.
  - `ecommerce-build` - the same breakdown for PLP, PDP and the four checkout steps.
  - `stripe-integration` - a Stripe Integration Feature in the core delivery phase (per-environment keys and webhook signing secrets, sandbox payment tests, early client account activation, statement descriptor) and a Stripe Go-live Feature at launch (live keys and webhook, wallet domain verification, live smoke test).
  - `site-go-live` - the exhaustive 131-task go-live reference checklist, each section a Feature in the go-live phase. Converted from the legacy JIRA-era checklist (wiki markup translated to Markdown), then modernised and pruned: GA4 via GTM, Search Console and Bing Webmaster Tools in place of the Universal Analytics era; uCommerce renamed to Umbraco Commerce with dead toggles removed; deep QA trees collapsed into checklist descriptions; transactional email tasks provider-neutral via an `email_provider` variable (default `Mailgun / Mandrill / SendGrid`), with an SPF/DKIM check added.
- `productive_apply_task_template` also accepts `template_definition` — a full template object passed inline instead of a stored name, for structures composed on the fly (exactly one of the two must be provided).
- `skills/tsd-site-scaffold/` — a Claude skill that interviews the user about a new site's page types ("Do you know what page types will be required yet?"), asks whether entity types like Case Studies or Products need separate list and detail pages, then scaffolds one task list per page with Design / Front-end / Back-end / QA / QC tasks via an inline template (dry run shown before anything is created). For Igloo builds it also asks which Igloo widgets the design needs and creates an `Igloo: <Widget>` Feature for each, with Front-end / Back-end / QA / QC tasks (no design task, as it follows design sign-off).
- `npm run templates:report` — builds the Template Planner (`template-report.html`), an interactive nested preview of every template that simulates stacking them (list merging and duplicate skipping) without calling the API.
- `docs/templates.md` — template format reference, apply behaviour, inline templates, and how to write new templates.

## [1.3.3] - 2026-08-03

### Fixed

- **Workflow status names resolved to the wrong workflow**: Productive scopes statuses to a workflow, and `npm run setup` built its name→ID map by keeping the first occurrence of each name. Since the API returns statuses in ascending ID order, an unused "Default workflow" won every collision. In an org with a Default and a real workflow, `To Do`, `In Progress`, and `To Be Discussed` all mapped to IDs the API rejects on real tasks.

  Setup now samples recent tasks to detect which workflow the organisation actually uses, resolves duplicate names in its favour, and prints what it chose and what it ignored. It also warns about statuses that exist *only* in an unused workflow (e.g. `Closed`), which can never be applied to tasks in the workflow you work in.

- **Statuses added after config generation were unreachable**: setup now picks these up on re-run; they were previously missing from the map and the tool enums entirely.

### Changed

- **Unknown workflow status names now error instead of being silently dropped.** `productive_create_task`, `productive_create_milestone`, `productive_update_task`, and `productive_create_tasks_batch` previously logged a warning to stderr, discarded the status field, and reported success — leaving the task at the wrong status. They now throw an error listing the usable statuses. In batch creation the error is recorded against that task and the remaining tasks continue.
- **Statuses belonging to an unused workflow are now refused up front** with an actionable message naming the alternatives, instead of being sent and rejected opaquely by the API. `Closed`, which in many orgs exists only in the unused `Default workflow`, is the common case.
- **The `workflow_status` enum now lists only statuses in the workflow your tasks use**, and is derived from the config rather than a hardcoded default list. Previously the enum fell back to 11 hardcoded names while `workflow_status_ids` was empty, so on an install without `productive.config.json` every advertised name would throw — failing the whole `create_task` call rather than just the status field. With no config the parameter is now **omitted from the tool schemas entirely**; task creation works, and passing a status explicitly errors pointing at `npm run setup`.
- `productive.config.json` gains `workflow_status_workflow_ids` (workflow ID per status — what resolution compares), `workflow_status_workflows` (display names, for messages) and `dominant_workflow`. Comparison is by workflow ID rather than display name, so two workflows sharing a name don't collide, and resolution still works when the `include=workflow` side of the response is missing while the statuses' own relationships resolve. A status whose workflow cannot be resolved is omitted from the map rather than recorded with a placeholder — runtime reads an absent workflow as "allow", whereas a placeholder would read as a foreign workflow and refuse a usable status. `workflow_status_names` is retained as informational only and is no longer read.
- Corrected the `workflow_status` parameter description at all four sites; one pointed at a `productive_list_workflow_statuses` tool that does not exist, and three were left un-updated.
- `npm run setup` now reports why task sampling failed rather than swallowing the error — a restricted token getting 403 would otherwise silently revert to the buggy first-of-name resolution.

### Documentation

- `docs/workflow-statuses.md` — how resolution works, why a name may be refused, behaviour with no config, and the known limitation for organisations genuinely running two workflows across different projects.

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
