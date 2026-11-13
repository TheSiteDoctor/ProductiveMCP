/**
 * Commit references: creates never wait for Productive's automation (fast
 * creation matters more; clashes are cleaned up separately), and reads flag a
 * [REF] title prefix that disagrees with the field.
 * Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { fakeProject, applyArgs } from "./helpers.mjs";

process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(new URL("./fixtures/productive.config.json", import.meta.url));
process.env.PRODUCTIVE_DATE_REVIEW = "off";
const { applyTaskTemplate } = await import("../dist/tools/templates.js");
const { getTask } = await import("../dist/tools/tasks.js");
const { GetTaskSchema } = await import("../dist/schemas/task.js");

test("applying a template doesn't poll for Commit references", async () => {
  const client = fakeProject();
  const template = { name: "t", title: "T", task_lists: [{ name: "Core Delivery", tasks: [
    { title: "Project Management", subtasks: [{ title: "A" }, { title: "B" }] },
  ] }] };
  const started = Date.now();
  await applyTaskTemplate(client, applyArgs({ template_definition: template }));
  assert.ok(Date.now() - started < 1000, "no waiting");
  assert.equal(client.calls.filter((c) => c.method === "GET" && /^\/tasks\/\d+$/.test(c.path)).length, 0);
});

test("a read flags a title prefix that disagrees with the Commit reference field", async () => {
  const client = fakeProject();
  client.tasks.push(
    { id: "21572874", title: "[WGL-8717] Show & Tell: Sprint 3", type_id: 3, custom_fields: { 160540: "WGL-8716" }, list: "7" },
    { id: "21572875", title: "[WGL-8718] Show & Tell: Sprint 4", type_id: 3, custom_fields: { 160540: "WGL-8718" }, list: "7" },
  );
  const mismatched = JSON.parse(await getTask(client, GetTaskSchema.parse({ task_id: "21572874", response_format: "json" })));
  assert.equal(mismatched.commit_reference, "WGL-8716");
  assert.equal(mismatched.commit_reference_title_mismatch, "WGL-8717");
  const md = await getTask(client, GetTaskSchema.parse({ task_id: "21572874" }));
  assert.match(md, /\*\*Ref\*\*: WGL-8716 \(the title says \[WGL-8717\]; the Commit reference field is the one to trust\)/);
  const matching = JSON.parse(await getTask(client, GetTaskSchema.parse({ task_id: "21572875", response_format: "json" })));
  assert.equal(matching.commit_reference_title_mismatch, null);
});
