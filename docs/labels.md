# Labels/Tags in Productive.io

## Key Concept

Labels in Productive are **multi-select custom field options** on a custom field (field ID: `166093` for TSD's org). Each label has a **name** (human-readable string like `"Status-Board"`) and an **option ID** (numeric string like `"407641"`).

The Productive API requires **option IDs**, not name strings, when setting labels on a task. Users and LLMs will typically provide label names as strings — these must be resolved to IDs before sending to the API.

## How to Set Labels on a Task

Labels are set via the `custom_fields` attribute, not a dedicated labels field:

```json
{
  "data": {
    "type": "tasks",
    "attributes": {
      "title": "My task",
      "custom_fields": {
        "166093": ["407641", "456628"]
      }
    }
  }
}
```

The key `"166093"` is the labels custom field ID. The value is an **array of option ID strings**.

## Resolving Label Names to IDs

When a user provides label names as strings (e.g. `["Status-Board", "Email-20260323"]`), you must resolve them to option IDs before sending to the API.

### Step 1: Fetch existing options

```
GET /api/v2/custom_field_options?filter[custom_field_id]=166093&filter[archived]=false&page[size]=200
```

Returns all existing label options with their names and IDs:

```json
{
  "data": [
    {
      "id": "407641",
      "type": "custom_field_options",
      "attributes": { "name": "AIForReview" }
    },
    {
      "id": "456628",
      "type": "custom_field_options",
      "attributes": { "name": "Meeting-20260217" }
    }
  ],
  "meta": { "total_count": 12 }
}
```

Handle pagination: check `meta.total_count` — if more than 200 options exist, fetch subsequent pages by incrementing `page[number]`.

### Step 2: Case-insensitive lookup

Match each requested label name against the fetched options **case-insensitively**. For example, `"status-board"` should match an existing option named `"Status-Board"`.

### Step 3: Create if not found

If a label name has no match, create a new option:

```
POST /api/v2/custom_field_options

{
  "data": {
    "type": "custom_field_options",
    "attributes": { "name": "Email-20260323" },
    "relationships": {
      "custom_field": {
        "data": { "type": "custom_fields", "id": "166093" }
      }
    }
  }
}
```

The response includes the new option's `id`. Use this ID going forward.

### Step 4: Use the IDs on the task

Once all label names are resolved to IDs, set them on the task:

```json
"custom_fields": { "166093": ["407641", "new_option_id"] }
```

## Critical Rules

1. **Never send label name strings to the API** — only option ID strings. The API will silently ignore name strings and the labels won't persist.
2. **Always do a case-insensitive lookup first** — sending a name that differs only in case (e.g. `"status-board"` vs `"Status-Board"`) will create a duplicate option in Productive.
3. **Cache the lookup** — fetching all options on every request is wasteful. Cache for ~5 minutes.
4. **On update, merge with existing** — the Productive API **replaces** the entire `custom_fields` hash on PATCH. You must GET the task's existing `custom_fields` first, merge your label changes, then send the combined object. Otherwise you'll wipe out task_type, priority, and other custom fields.

## Reading Labels from a Task

Labels come back in the task's `custom_fields` attribute as option IDs:

```json
"custom_fields": {
  "166093": ["407641", "456628"]
}
```

To display human-readable names, reverse-lookup each ID against the options you fetched. Show `"Unknown (id)"` for any ID not in your map.

## MCP Server Implementation

The Productive MCP server (v1.3.0+) handles all of this automatically via `resolveLabelOptionIds()` in `src/tools/tasks.ts`. Users pass label names as strings in the `labels` array parameter and the server resolves them. The `productive_create_task`, `productive_update_task`, and `productive_create_tasks_batch` tools all support this.
