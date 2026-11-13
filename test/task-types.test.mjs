/**
 * Task types come from productive.config.json, not a hard-coded list.
 * Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.PRODUCTIVE_CONFIG_PATH = fileURLToPath(
  new URL("./fixtures/productive.config.json", import.meta.url),
);
const { TASK_TYPES, resolveTaskType, taskTypeNameForOption } = await import("../dist/constants.js");
const { CreateTaskSchema, UpdateTaskSchema } = await import("../dist/schemas/task.js");
const { TaskTemplateSchema } = await import("../dist/schemas/template.js");
const { updateTask } = await import("../dist/tools/tasks.js");

test("task types are the configured options, including ones the old list lacked", () => {
  assert.deepEqual([...TASK_TYPES], [
    "Bug", "Task", "Question", "Meeting", "Feature", "Test Case", "Release", "Show & Tell", "Presentation", "Outage",
  ]);
  assert.deepEqual(resolveTaskType("Show & Tell"), { name: "Show & Tell", optionId: "479116" });
  assert.deepEqual(resolveTaskType("release"), { name: "Release", optionId: "479115" });
  assert.equal(taskTypeNameForOption(479116), "Show & Tell");
  assert.equal(taskTypeNameForOption("999"), null);
});

test("an unknown task type is an error listing the valid options", () => {
  assert.throws(() => resolveTaskType("Epic"), /"Epic" is not one of .*Valid options: Bug, Task, .*Show & Tell/);
});

test("schemas no longer hard-code task types", () => {
  assert.equal(CreateTaskSchema.safeParse({ title: "t", project_id: "1", task_list_id: "2", task_type: "Show & Tell" }).success, true);
  assert.equal(UpdateTaskSchema.safeParse({ task_id: "1", task_type: "Presentation" }).success, true);
  const template = {
    name: "t", title: "T",
    task_lists: [{ name: "L", tasks: [{ title: "Go-live", task_type: "Release" }] }],
  };
  assert.equal(TaskTemplateSchema.safeParse(template).success, true);
});

test("update_task rejects an unknown task type before calling the API", async () => {
  const calls = [];
  const client = { async get() { calls.push("get"); return { data: {} }; }, async patch() { calls.push("patch"); return { data: {} }; }, getOrgId: () => "1" };
  await assert.rejects(updateTask(client, UpdateTaskSchema.parse({ task_id: "1", task_type: "Epic" })), /Valid options/);
  assert.deepEqual(calls, []);
});
