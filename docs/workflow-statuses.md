# Workflow Statuses

How `workflow_status` resolves, and why some status names are refused.

## Statuses belong to a workflow

Productive scopes every workflow status to a **workflow**. Two workflows can both contain a status called `To Do`, with different IDs, and an ID from one workflow is rejected by the API on a task belonging to the other.

Most organisations have an unused `Default workflow` sitting alongside the one they actually work in. That produces duplicate names:

| Status | Default workflow | TSD workflow |
| --- | --- | --- |
| To Do | 142549 | 142889 |
| In Progress | 142518 | 142890 |
| To Be Discussed | 142550 | 142895 |
| Closed | 142519 | *(none)* |
| Done / Closed | *(none)* | 142891 |

## How setup resolves it

`npm run setup` samples recent tasks, maps each status back to its workflow, and picks the workflow your tasks actually use — the **dominant workflow**. Duplicate names resolve in its favour. It prints what it chose and what it ignored:

```
Detected 2 workflows.
Your tasks mostly use "TSD workflow" (200/200 of sampled tasks).

3 status name(s) exist in more than one workflow:
  "To Do": using 142889 (TSD workflow); ignoring 142549 (Default workflow)
  ...

Warning: 1 status(es) exist only in a workflow your tasks don't use.
Setting these on a "TSD workflow" task will be rejected by the API:
  "Closed" (only in Default workflow)
```

The config records `workflow_status_ids`, `workflow_status_workflows` (which workflow each name resolved to) and `dominant_workflow`.

## What the tools advertise

The `workflow_status` enum lists only names in the dominant workflow. A name like `Closed`, which exists solely in an unused workflow, is **not offered** — there is no ID that would work.

If you pass it anyway you get an actionable error rather than an opaque API rejection:

```
Workflow status "Closed" belongs to "Default workflow", but this organisation's
tasks use "TSD workflow" — the API rejects it. Use one of: In Progress, To Do,
To Be Discussed, Backlog, Done / Closed, In Review, Ready for Testing,
Ready for Deployment, Blocked, Obsolete / Won't Fix, On Hold.
```

## Unknown names error, they are not ignored

An unrecognised `workflow_status` throws, listing the usable statuses. It is never silently dropped: a task created at the wrong status while the tool reports success is worse than a clear failure.

In `productive_create_tasks_batch` the error is recorded against the offending task and the rest of the batch continues.

## With no config

On an install where `productive.config.json` is absent there are no resolvable statuses, so `workflow_status` is **omitted from the tool schemas entirely** rather than advertised and then rejected on every call. Task creation works normally; you just cannot set a status until you run `npm run setup`.

Passing it explicitly throws, pointing at the setup script.

## Known limitation

Dominance is detected **globally**, per organisation. An organisation genuinely running two workflows across different projects will have one of them treated as authoritative, and a status legitimately belonging to the other is refused — even where it would have worked.

The real fix is resolving the target's workflow per call: look up the task's or project's workflow, then match the status name within it. That would also let `Closed` work on a Default-workflow project. Until then, pass the status ID via the Productive UI for those projects.

## Re-run setup after upgrading

`productive.config.json` is gitignored, so a corrected mapping ships as code, not data. After pulling a change to the resolution logic, re-run:

```bash
npm run setup
```
