# Time Tracking

Tools for Productive.io timers and logged time.

| Tool | Purpose |
| --- | --- |
| `productive_start_timer` | Start a timer |
| `productive_stop_timer` | Stop a running timer |
| `productive_get_running_timer` | Show what is currently being timed |
| `productive_log_time` | Log time manually, no timer |
| `productive_list_time_entries` | List logged time with totals |

## Time attaches to a service, not a task

This is the thing to internalise. A time entry belongs to a **service** — a line on a budget — and *optionally* references a task. Roughly half the entries in a typical org have no task at all:

```
entry 156653874 | RUNNING | service 15771616 (Stand-up / Sit-down) | task NONE
entry 156607005 | 10 min  | service 15775324 (Build / Support)     | task 18969699
entry 156608557 | 156 min | service 11808374 (Back-end Build)      | task NONE
```

So "log time on ticket X" is not directly expressible. The tools accept `task_id` and follow the task's `service` relationship for you; if the task has no service they error and ask for `service_id`. Use `productive_list_services` to find one.

## Who am I?

Productive has no `/people/me`. `GET /organization_memberships` is scoped to the authenticated token and returns exactly one record, whose `person` is the token owner — that is how `ProductiveClient.getCurrentPersonId()` works, cached per client. Every time tool takes an optional `person_id` that defaults to this.

## Timers

A timer is a start/stop session attached to a time entry. Starting one against a service creates the entry for you.

- Start: `POST /timers` with `person_id` plus `service_id` or `time_entry_id`
- Stop: `PATCH /timers/{id}/stop`

`productive_start_timer` refuses when a timer is already running for that person. Productive's UI permits only one at a time and the API does not document whether it enforces that, so the tool enforces it rather than risking stacked timers.

## Gotchas

- **`/timers` returns oldest-first by default.** With no `sort`, the first page is all long-stopped timers and a running one is never found. `findRunningTimer` sorts `-started_at`. This silently produced "no running timer" while a timer was plainly running.
- **`/timers` has no "running" filter.** `filter[stopped_at]=null` is rejected with `unsupported_filter_value_type`. Sort descending and take the first record with no `stopped_at`.
- **`/time_entries` rejects `sort` entirely** (`sort_param_unsupported`), so `productive_list_time_entries` exposes no sort option and results come back in the API's own order. Note the error arrives in the response body with HTTP 200-style handling, so a bad `sort` reads as an empty result rather than a failure.
- **Relationship linkage is omitted without an explicit `include`.** `time_entries.service`, `timers.time_entry`, `tasks.workflow_status` and `workflow_statuses.workflow` all come back with empty `data` unless requested. This reads as "no service" rather than failing, which makes it easy to misdiagnose. Always pass `include` for any relationship you intend to read.
- **Logged time may be auto-approved.** Entries observed in this org come back `approved: true` with `approved_at` already set. Combined with the next point, treat writes as hard to undo.
- **Deletion is not documented.** The API reference lists only GET and PATCH for time entries. There is no supported way to remove a mistaken entry, only to amend it. `productive_log_time` says so in its tool description.
