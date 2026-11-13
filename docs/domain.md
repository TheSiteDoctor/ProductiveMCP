# Domain model

How this server models Productive tickets. Every tool, schema, formatter and
template follows these rules. If the code and this page disagree, the code is
wrong.

## Ticket

A **ticket** is a Productive task. It belongs to a project and to exactly one
task list. A task list is a project phase (for example "Core Delivery" or
"Go-live").

### Kind: task or Milestone

A ticket's kind is either:

| Kind          | Productive                       | Shown in the UI as | Hierarchy                                                    |
| ------------- | -------------------------------- | ------------------ | ------------------------------------------------------------ |
| **Task**      | `type_id` 1 (or absent)          | Task               | Top level, or a subtask of another task (`parent_task`)      |
| **Milestone** | `type_id` 3                      | Key Task           | Always top level in its task list: no parent, no subtasks    |

A Milestone marks a point in time, such as the end of a phase, a release or a
Show & Tell. Because it's a point, not a piece of work, it never sits inside a
Feature and never has children:

- Templates reject a milestone nested under another ticket, or one with
  `subtasks`.
- `productive_create_milestone` has no `parent_task_id`.
- `productive_update_task` refuses to give a Milestone a parent.

Within a task list, Milestones sit after the work they mark. When a template
adds a ticket to a list that already has a Milestone, the new ticket is moved
above it.

### Task type

**Task type** is TSD's classification of a ticket, held in the "Task type"
single-select custom field. It is independent of kind: a Milestone can have a
Task type. For example, "Show & Tell: Sprint 3" is a Milestone with Task type
"Show & Tell", and "Site go-live" is a Milestone with Task type "Release".

The valid Task types are the field's active (non-archived) options, discovered
by `npm run setup` and stored in `productive.config.json` as
`task_type_options`. Nothing in the code hard-codes the list. An unknown name
is an error that lists the valid options. At the time of writing they are Bug,
Task, Question, Meeting, Feature, Test Case, Release, Show & Tell,
Presentation and Outage.

TSD's hierarchy uses Task types as follows: a top-level **Feature** is an
epic, and its children are the Tasks, Questions, Meetings and so on that
deliver it.

### Commit reference

The **Commit reference** (for example `WGL-8712`) is a free-text custom field
stamped onto each new ticket by a Productive automation, not by this server.
It's used in branch names and commit messages. The automation also prefixes
the title with `[REF]`, so the title prefix mirrors the field.

- The reference is the identity developers use, so it must not change. It
  only changes when it clashes with another ticket's reference, or when the
  field is cleared, which makes the automation stamp a new one.
- Creating tickets quickly can give two tickets the same reference. **This is
  known and deliberately not handled here**: TSD resolves clashes separately
  (see `dedupe_commit_references.py`), and creating tickets quickly matters
  more, so create paths never wait for the automation. Don't add a wait.
- Task reads flag a `[REF]` title prefix that disagrees with the field
  (`commit_reference_title_mismatch`). That's informational: the field is the
  one to trust, and nothing is changed.
- This server never clears the field. When it rewrites a ticket's custom
  fields it sends the existing reference back unchanged, and it never sends
  `null` for it.

### Milestone date

A Milestone's **date** is its due date. Dates are checked against public
holidays in the regions involved, weekends, the Christmas period, bridge days
and (for e-commerce clients) trading peaks, and Show & Tells also get a
sprint capacity check. See [milestone-date-review.md](milestone-date-review.md).
The review only reports; it never moves a date, because the new date has to be
agreed with the customer.

## Clearing values

Parameters documented as "null to clear" (`parent_task_id`, `assignee_id`,
`due_date`, `start_date` and `description` on `productive_update_task`) accept
a JSON `null`. The string `"null"` and an empty string mean the same, because
some MCP clients and the CLI can't send a real null. The value reaches
Productive as a real `null` attribute or a `null` relationship.
