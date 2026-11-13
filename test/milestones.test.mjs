/**
 * Milestones: always top-level, and kind is independent of Task type.
 * Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { fakeProject, applyArgs } from "./helpers.mjs";

// No fake reference automation here, so don't wait for Commit references.
process.env.PRODUCTIVE_COMMIT_REFERENCE_WAIT_MS = "0";
process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(
  new URL("./fixtures/productive.config.json", import.meta.url),
);
process.env.PRODUCTIVE_DATE_REVIEW = "off";
const { applyTaskTemplate } = await import("../dist/tools/templates.js");
const { createMilestone, updateTask } = await import("../dist/tools/tasks.js");
const { TaskTemplateSchema } = await import("../dist/schemas/template.js");
const { CreateMilestoneSchema, UpdateTaskSchema } = await import("../dist/schemas/task.js");

const showAndTell = {
  name: "show-and-tell",
  title: "Show & Tell",
  task_lists: [{
    name: "Core Delivery",
    tasks: [
      { title: "Project Management", task_type: "Feature", subtasks: [{ title: "Weekly update", task_type: "Task" }] },
      { title: "Show & Tell: Sprint {{repeat_index}}", milestone: true, task_type: "Show & Tell", repeat: 2, due_in_days: 14, repeat_every_days: 14, description: "Demo" },
    ],
  }],
};

test("a dry run shows both the Milestone kind and its Task type", async () => {
  const out = await applyTaskTemplate(null, applyArgs({ template_definition: showAndTell, dry_run: true, response_format: "markdown" }));
  assert.match(out, /- Show & Tell: Sprint 1 _\(Milestone, Show & Tell\)_/);
  assert.match(out, /- Show & Tell: Sprint 2 _\(Milestone, Show & Tell\)_/);
});

test("applying creates a top-level Milestone with the right Task type", async () => {
  const client = fakeProject();
  await applyTaskTemplate(client, applyArgs({ template_definition: showAndTell }));
  const sat = client.tasks.filter((t) => t.title.startsWith("Show & Tell"));
  assert.equal(sat.length, 2);
  for (const t of sat) {
    assert.equal(t.type_id, 3);
    assert.equal(t.parent, undefined);
    assert.equal(t.custom_fields["158673"], "479116");
  }
});

test("a milestone nested under a Feature fails validation", () => {
  const nested = structuredClone(showAndTell);
  nested.task_lists[0].tasks[0].subtasks.push({ title: "Sign-off", milestone: true });
  const result = TaskTemplateSchema.safeParse(nested);
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /Milestone "Sign-off" is nested under another ticket/);
});

test("a milestone with subtasks fails validation", () => {
  const withKids = structuredClone(showAndTell);
  withKids.task_lists[0].tasks[1].subtasks = [{ title: "Prepare demo" }];
  const result = TaskTemplateSchema.safeParse(withKids);
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /has subtasks/);
});

test("create_milestone accepts task_type, priority and labels but not parent_task_id", async () => {
  assert.equal(CreateMilestoneSchema.safeParse({ title: "x", project_id: "1", task_list_id: "2", parent_task_id: "3" }).success, false);
  const client = fakeProject();
  await createMilestone(client, CreateMilestoneSchema.parse({
    title: "Site go-live", project_id: "9999", task_list_id: "7", task_type: "Release", priority: "High", due_date: "2027-02-05",
  }));
  const posted = client.calls.find((c) => c.method === "POST").payload.data.attributes;
  assert.equal(posted.type_id, 3);
  assert.deepEqual(posted.custom_fields, { 158673: "479115", 158674: "2" });
});

test("update_task refuses to give a Milestone a parent", async () => {
  const client = fakeProject();
  client.tasks.push({ id: "1", title: "Go-live", type_id: 3, custom_fields: {}, list: "7" });
  await assert.rejects(
    updateTask(client, UpdateTaskSchema.parse({ task_id: "1", parent_task_id: "2" })),
    /is a Milestone, and Milestones are always top-level/,
  );
  assert.equal(client.calls.filter((c) => c.method === "PATCH").length, 0);
});
