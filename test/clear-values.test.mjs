/**
 * Bug D: "null to clear" parameters must reach Productive as a real null, and
 * the Commit reference must never be sent as null.
 * Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { fakeProject } from "./helpers.mjs";

process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(new URL("./fixtures/productive.config.json", import.meta.url));
const { updateTask } = await import("../dist/tools/tasks.js");
const { UpdateTaskSchema } = await import("../dist/schemas/task.js");

const withTask = (customFields = {}) => {
  const client = fakeProject();
  client.tasks.push({ id: "1", title: "Weekly update", custom_fields: customFields, list: "7", parent: "2", due_date: "2026-12-01" });
  return client;
};
const lastPatch = (client) => client.calls.filter((c) => c.method === "PATCH").at(-1).payload.data;

for (const cleared of [null, "null", ""]) {
  test(`passing ${JSON.stringify(cleared)} clears every "null to clear" parameter`, async () => {
    const client = withTask();
    await updateTask(client, UpdateTaskSchema.parse({
      task_id: "1", parent_task_id: cleared, assignee_id: cleared, due_date: cleared, start_date: cleared, description: cleared,
    }));
    const patch = lastPatch(client);
    assert.deepEqual(patch.relationships.parent_task, { data: null });
    assert.deepEqual(patch.relationships.assignee, { data: null });
    assert.equal(patch.attributes.due_date, null);
    assert.equal(patch.attributes.start_date, null);
    assert.equal(patch.attributes.description, null);
  });
}

test("a real value still sets the parent", async () => {
  const client = withTask();
  await updateTask(client, UpdateTaskSchema.parse({ task_id: "1", parent_task_id: "3" }));
  assert.deepEqual(lastPatch(client).relationships.parent_task, { data: { type: "tasks", id: "3" } });
});

test("rewriting custom fields keeps the Commit reference and never sends it as null", async () => {
  const stamped = withTask({ 158673: "357517", 160540: "WGL-8712" });
  await updateTask(stamped, UpdateTaskSchema.parse({ task_id: "1", task_type: "Bug" }));
  assert.deepEqual(lastPatch(stamped).attributes.custom_fields, { 158673: "357515", 160540: "WGL-8712" });

  const unstamped = withTask({ 158673: "357517", 160540: null });
  await updateTask(unstamped, UpdateTaskSchema.parse({ task_id: "1", task_type: "Bug" }));
  assert.ok(!("160540" in lastPatch(unstamped).attributes.custom_fields), "no null Commit reference sent");
});
