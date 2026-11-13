/**
 * Bug C: parent_task_id came back null for every subtask, because Productive
 * only returns a relationship's data when it's included.
 * Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { fakeProject, applyArgs } from "./helpers.mjs";

process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(new URL("./fixtures/productive.config.json", import.meta.url));
process.env.PRODUCTIVE_DATE_REVIEW = "off";
process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "0";
const { searchTasks, getTask } = await import("../dist/tools/tasks.js");
const { SearchTasksSchema, GetTaskSchema } = await import("../dist/schemas/task.js");
const { applyTaskTemplate } = await import("../dist/tools/templates.js");

const project = () => {
  const client = fakeProject();
  client.lists.push({ id: "7", name: "Core Delivery" });
  client.tasks.push(
    { id: "21572625", title: "Project Management", custom_fields: {}, list: "7" },
    { id: "21572626", title: "Weekly update", custom_fields: {}, list: "7", parent: "21572625" },
  );
  return client;
};

test("search_tasks returns parent_task_id for real subtasks", async () => {
  const client = project();
  const out = JSON.parse(await searchTasks(client, SearchTasksSchema.parse({ project_id: "9999", response_format: "json" })));
  const byId = Object.fromEntries(out.tasks.map((t) => [t.id, t]));
  assert.equal(byId["21572626"].parent_task_id, "21572625");
  assert.equal(byId["21572625"].parent_task_id, null);
});

test("get_task returns parent_task_id", async () => {
  const out = JSON.parse(await getTask(project(), GetTaskSchema.parse({ task_id: "21572626", response_format: "json" })));
  assert.equal(out.parent_task_id, "21572625");
});

test("re-applying a template doesn't mistake a subtask for a top-level ticket", async () => {
  // "Weekly update" exists as a subtask. A template with a top-level ticket of
  // the same title must create it, not reuse the subtask.
  const client = project();
  const template = { name: "t", title: "T", task_lists: [{ name: "Core Delivery", tasks: [{ title: "Weekly update" }] }] };
  const result = JSON.parse(await applyTaskTemplate(client, applyArgs({ template_definition: template })));
  assert.equal(result.created, 1);
  assert.equal(client.tasks.filter((t) => t.title === "Weekly update" && !t.parent).length, 1);
});
