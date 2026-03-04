# Milestone Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `productive_create_milestone` tool and `milestone_only` filter to `productive_search_tasks`, surfacing milestones (tasks with `type_id: 3`) as a first-class concept.

**Architecture:** Milestones are regular Productive tasks with `type_id: 3` — no separate API endpoint exists. The `create_milestone` handler posts to `/tasks` with `type_id: 3` in attributes. The `is_milestone` flag is threaded through `FormattedTask` so the formatter can label output correctly.

**Tech Stack:** TypeScript, Zod, axios (via ProductiveClient), MCP SDK, `marked` (for Markdown→HTML conversion)

---

### Task 1: Add `type_id` to type definitions

**Files:**

- Modify: `src/types.ts:33-44` (TaskAttributes interface)
- Modify: `src/types.ts:350-372` (FormattedTask interface)

**Step 1: Add `type_id` to `TaskAttributes`**

In `src/types.ts`, add `type_id` to the `TaskAttributes` interface:

```typescript
export interface TaskAttributes {
  title: string;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  initial_estimate?: number | null;
  closed: boolean;
  created_at: string;
  updated_at: string;
  number?: number;
  type_id?: number | null; // ← add this line
  custom_fields?: Record<string, string | string[] | number>;
}
```

**Step 2: Add `is_milestone` to `FormattedTask`**

In `src/types.ts`, add to the `FormattedTask` interface (after `labels`):

```typescript
export interface FormattedTask {
  id: string;
  number: number | null;
  title: string;
  description: string | null;
  project_id: string | null;
  project_name: string | null;
  task_list_id: string | null;
  task_list_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  estimate_minutes: number | null;
  task_type: string | null;
  priority: string | null;
  workflow_status: string | null;
  closed: boolean;
  due_date: string | null;
  start_date: string | null;
  labels: string[];
  is_milestone: boolean; // ← add this line
  created_at: string;
  url: string | null;
  attachments: Array<import("./types/attachment.js").FormattedAttachment>;
}
```

**Step 3: Build to verify no type errors**

```bash
npm run build
```

Expected: compiles successfully (or only errors from unimplemented usages in formatting.ts — fix those in Task 2).

**Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(milestones): add type_id to TaskAttributes and is_milestone to FormattedTask"
```

---

### Task 2: Update `formatTask()` and `formatTaskMarkdown()` in formatting utilities

**Files:**

- Modify: `src/utils/formatting.ts:557-598` (return object in `formatTask`)
- Modify: `src/utils/formatting.ts:603-609` (header in `formatTaskMarkdown`)

**Step 1: Thread `is_milestone` through `formatTask()` return object**

In `src/utils/formatting.ts`, find the `return {` block inside `formatTask()` (around line 557). Add `is_milestone` to the returned object:

```typescript
return {
  id: task.id,
  number: attributes.number || null,
  title: attributes.title,
  description: attributes.description || null,
  project_id: projectId,
  project_name: projectName,
  task_list_id: taskListId,
  task_list_name: taskListName,
  assignee_id: assigneeId,
  assignee_name: assigneeName,
  estimate_minutes: estimateMinutes,
  task_type: taskType,
  priority: priority,
  workflow_status: workflowStatus,
  closed: attributes.closed,
  due_date: attributes.due_date || null,
  start_date: attributes.start_date || null,
  labels: (() => {
    /* existing label logic unchanged */
  })(),
  is_milestone: attributes.type_id === 3, // ← add this line
  created_at: attributes.created_at,
  url: task.id ? `https://app.productive.io/${orgId}/tasks/${task.id}` : null,
  attachments: attachments,
};
```

**Step 2: Update `formatTaskMarkdown()` header**

In `src/utils/formatting.ts`, find `formatTaskMarkdown()` (line ~603). Change the header line to reflect milestone vs task:

```typescript
export function formatTaskMarkdown(task: FormattedTask): string {
  const lines = [
    task.is_milestone ? "# Milestone Created Successfully" : "# Task Created Successfully",
    "",
    `**ID**: ${task.number ? `#${task.number}` : task.id}`,
    `**Title**: ${task.title}`,
  ];
```

**Step 3: Build to verify no type errors**

```bash
npm run build
```

Expected: compiles cleanly.

**Step 4: Commit**

```bash
git add src/utils/formatting.ts
git commit -m "feat(milestones): surface is_milestone flag in formatTask and formatTaskMarkdown"
```

---

### Task 3: Add `CreateMilestoneSchema` to task schemas

**Files:**

- Modify: `src/schemas/task.ts` (append after line 47, the end of `CreateTaskSchema`)

**Step 1: Add schema after `CreateTaskSchema`**

In `src/schemas/task.ts`, after the closing `.strict();` of `CreateTaskSchema` (line 47), add:

```typescript
/**
 * Schema for creating a milestone
 */
export const CreateMilestoneSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be 200 characters or less"),
    description: z
      .string()
      .max(10000, "Description must be 10000 characters or less")
      .optional(),
    project_id: z.string().min(1, "Project ID is required"),
    task_list_id: z.string().min(1, "Task list ID is required"),
    assignee_id: z.string().optional(),
    due_date: ISO8601DateSchema.optional(),
    start_date: ISO8601DateSchema.optional(),
    workflow_status: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
```

**Step 2: Add `milestone_only` to `SearchTasksSchema`**

In the same file, find `SearchTasksSchema` (line ~52). Add `milestone_only` before `limit`:

```typescript
    milestone_only: z
      .boolean()
      .optional()
      .describe("When true, return only milestone-type tasks (type_id=3)"),
```

**Step 3: Build**

```bash
npm run build
```

Expected: compiles cleanly.

**Step 4: Commit**

```bash
git add src/schemas/task.ts
git commit -m "feat(milestones): add CreateMilestoneSchema and milestone_only filter to SearchTasksSchema"
```

---

### Task 4: Add `createMilestone()` handler and `milestone_only` filter to `src/tools/tasks.ts`

**Files:**

- Modify: `src/tools/tasks.ts` (add `createMilestone` after `createTask`, and update `searchTasks`)

**Step 1: Add import for `CreateMilestoneSchema` at the top of the file**

Find the existing schema import in `src/tools/tasks.ts` (around line 1-20). Add `CreateMilestoneSchema` to the import:

```typescript
import {
  CreateTaskSchema,
  CreateMilestoneSchema, // ← add
  SearchTasksSchema,
  GetTaskSchema,
  UpdateTaskSchema,
} from "../schemas/task.js";
```

**Step 2: Add `createMilestone()` function after `createTask()`**

After the closing `}` of `createTask()` (around line 320), add:

```typescript
export async function createMilestone(
  client: ProductiveClient,
  args: z.infer<typeof CreateMilestoneSchema>,
): Promise<string> {
  const payload = {
    data: {
      type: "tasks",
      attributes: {
        title: args.title,
        type_id: 3,
      } as Record<string, unknown>,
      relationships: {
        project: {
          data: { type: "projects", id: args.project_id },
        },
        task_list: {
          data: { type: "task_lists", id: args.task_list_id },
        },
      } as Record<string, unknown>,
    },
  };

  if (args.description) {
    payload.data.attributes.description = markdownToHtml(args.description);
  }
  if (args.due_date) {
    payload.data.attributes.due_date = args.due_date;
  }
  if (args.start_date) {
    payload.data.attributes.start_date = args.start_date;
  }
  if (args.assignee_id) {
    payload.data.relationships.assignee = {
      data: { type: "people", id: args.assignee_id },
    };
  }
  if (args.workflow_status) {
    const statusId = WORKFLOW_STATUS_IDS[args.workflow_status];
    if (statusId) {
      payload.data.relationships.workflow_status = {
        data: { type: "workflow_statuses", id: statusId },
      };
    }
  }

  const response = await client.post<JSONAPIResponse>("/tasks", payload, {
    include: "project,task_list,assignee,workflow_status,attachments",
  });

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const task = formatTask(
    taskData as Task,
    client.getOrgId(),
    response.included,
  );

  return formatResponse(task, args.response_format, () =>
    formatTaskMarkdown(task),
  );
}
```

**Step 3: Add `milestone_only` filter to `searchTasks()`**

In `searchTasks()`, after the `if (args.sort)` block (around line 381-383), add:

```typescript
if (args.milestone_only) {
  params["filter[type_id]"] = 3;
}
```

**Step 4: Build**

```bash
npm run build
```

Expected: compiles cleanly.

**Step 5: Commit**

```bash
git add src/tools/tasks.ts
git commit -m "feat(milestones): add createMilestone handler and milestone_only filter in searchTasks"
```

---

### Task 5: Register tool in `src/index.ts`

**Files:**

- Modify: `src/index.ts:36-41` (schema imports)
- Modify: `src/index.ts:125` (tool function imports)
- Modify: `src/index.ts:334` (tool definition — insert after `productive_create_task`)
- Modify: `src/index.ts:727-729` (search tool definition — add `milestone_only` property)
- Modify: `src/index.ts:2473` (routing — insert case after `productive_create_task`)

**Step 1: Add `CreateMilestoneSchema` to schema imports**

At line 36-41:

```typescript
import {
  CreateTaskSchema,
  CreateMilestoneSchema, // ← add
  SearchTasksSchema,
  GetTaskSchema,
  UpdateTaskSchema,
  CreateTasksBatchSchema,
} from "./schemas/task.js";
```

**Step 2: Add `createMilestone` to tool function imports**

At line 125:

```typescript
import {
  createTask,
  createMilestone,
  searchTasks,
  getTask,
  updateTask,
} from "./tools/tasks.js";
```

**Step 3: Insert `productive_create_milestone` tool definition**

After the closing `},` of `productive_create_task` at line 334, insert:

```typescript
    {
      name: "productive_create_milestone",
      description:
        'Create a milestone in Productive.io. Milestones are a special task type (type_id=3) used to mark key dates or deliverables in a project.\n\nBoth project_id and task_list_id are REQUIRED. Use productive_list_task_lists to find valid task list IDs.\n\nExample:\n{\n  "title": "v2.0 Release",\n  "project_id": "1234",\n  "task_list_id": "5678",\n  "due_date": "2026-04-01"\n}',
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Milestone title (1-200 characters)",
          },
          description: {
            type: "string",
            description:
              "Optional description in Markdown or HTML format (max 10000 characters)",
          },
          project_id: {
            type: "string",
            description:
              "Project ID (required). Use productive_list_projects to find project IDs",
          },
          task_list_id: {
            type: "string",
            description:
              "Task list ID (required). Use productive_list_task_lists to find task list IDs",
          },
          assignee_id: {
            type: "string",
            description:
              "Optional assignee person ID. Use productive_list_people to find person IDs",
          },
          due_date: {
            type: "string",
            description: "Optional due date in ISO 8601 format (YYYY-MM-DD)",
          },
          start_date: {
            type: "string",
            description: "Optional start date in ISO 8601 format (YYYY-MM-DD)",
          },
          workflow_status: {
            type: "string",
            description:
              "Optional workflow status name (e.g. 'To Do', 'In Progress'). Use productive_list_workflow_statuses to see available statuses.",
          },
          response_format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Response format (default: markdown)",
            default: "markdown",
          },
        },
        required: ["title", "project_id", "task_list_id"],
      },
    },
```

**Step 4: Add `milestone_only` to the `productive_search_tasks` tool definition**

In the `productive_search_tasks` inputSchema properties (around line 727, before the `limit` property), add:

```typescript
          milestone_only: {
            type: "boolean",
            description:
              "When true, return only milestone-type tasks (type_id=3)",
          },
```

**Step 5: Insert routing case for `productive_create_milestone`**

After the `productive_create_task` case (line 2473), insert:

```typescript
      case "productive_create_milestone": {
        const validated = CreateMilestoneSchema.parse(args);
        const result = await createMilestone(client, validated);
        safeLog("[MCP Tool Success]", { tool: name });
        return { content: [{ type: "text", text: result }] };
      }
```

**Step 6: Build**

```bash
npm run build
```

Expected: compiles cleanly with no errors.

**Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(milestones): register productive_create_milestone tool and milestone_only in search"
```

---

### Task 6: Verify end-to-end with Productive API

**Step 1: Start the server in dev mode**

```bash
npm run dev
```

**Step 2: Test create_milestone via curl (simulating MCP tool call)**

Using the credentials from the conversation, POST to `/tasks` with `type_id: 3` to confirm the API accepts it:

```bash
curl -s -X POST "https://api.productive.io/api/v2/tasks" \
  -H "X-Auth-Token: abbf82cf-49e9-4b53-bb5a-909a6538fbbb" \
  -H "X-Organization-Id: 48844" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "tasks",
      "attributes": { "title": "TEST MILESTONE - DELETE ME", "type_id": 3 },
      "relationships": {
        "project": { "data": { "type": "projects", "id": "REPLACE_WITH_REAL_PROJECT_ID" } },
        "task_list": { "data": { "type": "task_lists", "id": "REPLACE_WITH_REAL_TASK_LIST_ID" } }
      }
    }
  }' | python3 -m json.tool | grep -E '"type_id"|"title"|"id"'
```

Expected: response contains `"type_id": 3`.

**Step 3: Verify `milestone_only` search filter**

```bash
curl -s "https://api.productive.io/api/v2/tasks?filter%5Btype_id%5D=3&page%5Bsize%5D=5" \
  -H "X-Auth-Token: abbf82cf-49e9-4b53-bb5a-909a6538fbbb" \
  -H "X-Organization-Id: 48844" \
  -H "Accept: application/vnd.api+json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for t in d['data'][:3]:
    print('ID:', t['id'], '| type_id:', t['attributes']['type_id'], '| title:', t['attributes']['title'][:40])
"
```

Expected: all results have `type_id: 3`.

---

### Task 7: Update CHANGELOG and bump version

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Step 1: Add CHANGELOG entry**

Add to top of `CHANGELOG.md` under a new `## [Unreleased]` section:

```markdown
## [1.2.1] - 2026-03-03

### Added

- `productive_create_milestone` tool — creates milestones (tasks with `type_id: 3`) in Productive.io
- `milestone_only` filter on `productive_search_tasks` — filters results to milestones only
- `is_milestone` flag surfaced in all task responses; milestone creation output shows "Milestone Created Successfully"
```

**Step 2: Bump version in `package.json`**

Change `"version": "1.2.0"` to `"version": "1.2.1"`.

**Step 3: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: add changelog entry and bump to v1.2.1"
```
