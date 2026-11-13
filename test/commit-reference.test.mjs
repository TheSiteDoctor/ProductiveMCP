/**
 * Bugs A and B: duplicate Commit references from fast creates, and title
 * prefixes that disagree with the reference field.
 * Run with `npm test` (builds first).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { fakeProject, applyArgs } from "./helpers.mjs";

process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(new URL("./fixtures/productive.config.json", import.meta.url));
process.env.PRODUCTIVE_DATE_REVIEW = "off";
const { applyTaskTemplate } = await import("../dist/tools/templates.js");
const { createMilestone, createTask } = await import("../dist/tools/tasks.js");
const { createTasksBatch } = await import("../dist/tools/batch.js");
const { CreateMilestoneSchema, CreateTaskSchema, CreateTasksBatchSchema } = await import("../dist/schemas/task.js");

// The fake automation stamps 30ms after each create; we wait up to 2s, polling every 5ms.
const automation = { prefix: "WGL", delayMs: 30, start: 8712 };
beforeEach(() => {
  process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "2000";
  process.env.PRODUCTIVE_COMMIT_REFERENCE_POLL_MS = "5";
});

// 21 tickets, like the WGL run: a Feature with children, plus milestones.
const template = {
  name: "pm", title: "PM",
  task_lists: [{ name: "Core Delivery", tasks: [
    { title: "Project Management", task_type: "Feature", subtasks: Array.from({ length: 14 }, (_, i) => ({ title: `Task ${i + 1}` })) },
    { title: "Show & Tell: Sprint {{repeat_index}}", milestone: true, task_type: "Show & Tell", repeat: 6, due_in_days: 14, repeat_every_days: 14 },
  ] }],
};
const refs = (client) => client.tasks.map((t) => t.custom_fields["160540"]);
const settle = () => new Promise((r) => setTimeout(r, 100));

test("sequential template creates never produce duplicate commit references", async () => {
  const client = fakeProject({ reference: automation });
  const result = JSON.parse(await applyTaskTemplate(client, applyArgs({ template_definition: template })));
  await settle();
  assert.equal(client.tasks.length, 21);
  assert.equal(new Set(refs(client)).size, 21, `duplicates: ${refs(client)}`);
  assert.equal(result.commit_references, undefined);
});

test("without the wait, the same run produces duplicates, and the response reports them", async () => {
  process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "0";
  const client = fakeProject({ reference: automation });
  const result = JSON.parse(await applyTaskTemplate(client, applyArgs({ template_definition: template })));
  await settle();
  assert.ok(new Set(refs(client)).size < 21, "the fake automation does produce clashes when rushed");
  // Nothing was stamped when we looked, so every ticket is reported as missing a reference.
  assert.equal(result.commit_references.missing.length, 21);
});

test("create_milestone, create_task and the batch tool wait too", async () => {
  const client = fakeProject({ reference: automation });
  for (let i = 1; i <= 3; i++) {
    await createMilestone(client, CreateMilestoneSchema.parse({ title: `Show & Tell: Sprint ${i}`, project_id: "9999", task_list_id: "7", task_type: "Show & Tell" }));
  }
  await createTask(client, CreateTaskSchema.parse({ title: "One-off", project_id: "9999", task_list_id: "7" }));
  const batch = JSON.parse(await createTasksBatch(client, CreateTasksBatchSchema.parse({
    project_id: "9999", default_task_list_id: "7", response_format: "json",
    tasks: [{ title: "A" }, { title: "B" }, { title: "C" }],
  })));
  await settle();
  assert.equal(new Set(refs(client)).size, 7, `duplicates: ${refs(client)}`);
  assert.equal(batch.commit_references, undefined);
  assert.match(batch.results[0].task.commit_reference, /^WGL-\d+$/);
});

test("a title prefix that disagrees with the reference field is reported", async () => {
  // Simulate the automation re-stamping the field after a clash without
  // updating the title, as seen on task 21572874.
  const client = fakeProject();
  const post = client.post.bind(client);
  client.post = async (path, payload) => {
    const response = await post(path, payload);
    if (path === "/tasks") {
      const t = client.tasks.at(-1);
      t.custom_fields["160540"] = "WGL-8716";
      t.title = `[WGL-8717] ${t.title}`;
    }
    return response;
  };
  process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "50";
  const out = JSON.parse(await createMilestone(client, CreateMilestoneSchema.parse({
    title: "Show & Tell: Sprint 3", project_id: "9999", task_list_id: "7", task_type: "Show & Tell", response_format: "json",
  })));
  assert.deepEqual(out.commit_reference_report.title_mismatches, [{ task_id: "5000", title_prefix: "WGL-8717", reference: "WGL-8716" }]);
  assert.equal(out.commit_reference, "WGL-8716");
});
