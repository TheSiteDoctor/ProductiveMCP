/**
 * Service estimate tests. Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { updateService, getService } from "../dist/tools/services.js";
import { UpdateServiceSchema } from "../dist/schemas/service.js";

// Minimal stand-in for ProductiveClient that records the PATCH body.
function fakeClient() {
  const calls = [];
  return {
    calls,
    async patch(path, body) {
      calls.push({ path, body });
      return { data: {} };
    },
    async get() {
      return {
        data: {
          type: "services",
          id: "1",
          attributes: { name: "Design", billing_type_id: 1, unit_id: 1, estimated_time: 6187 },
        },
      };
    },
  };
}

test("estimate-only update sends only estimated_time", async () => {
  const client = fakeClient();
  const args = UpdateServiceSchema.parse({ service_id: "1", estimated_time_minutes: 6187 });
  await updateService(client, args);

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].body.data.attributes, { estimated_time: 6187 });
});

test("estimated_time_hours is rounded to whole minutes", async () => {
  const client = fakeClient();
  const args = UpdateServiceSchema.parse({ service_id: "1", estimated_time_hours: 103.12 });
  await updateService(client, args);

  assert.deepEqual(client.calls[0].body.data.attributes, { estimated_time: 6187 });
});

test("passing both minutes and hours is rejected", () => {
  const result = UpdateServiceSchema.safeParse({
    service_id: "1",
    estimated_time_minutes: 60,
    estimated_time_hours: 1,
  });
  assert.equal(result.success, false);
});

test("negative and fractional minutes are rejected", () => {
  assert.equal(UpdateServiceSchema.safeParse({ service_id: "1", estimated_time_minutes: -1 }).success, false);
  assert.equal(UpdateServiceSchema.safeParse({ service_id: "1", estimated_time_minutes: 1.5 }).success, false);
});

test("get_service returns the estimate in minutes and hours", async () => {
  const json = JSON.parse(await getService(fakeClient(), { service_id: "1", response_format: "json" }));
  assert.equal(json.estimated_time, 6187);
  assert.equal(json.estimated_time_hours, 103.12);

  const md = await getService(fakeClient(), { service_id: "1", response_format: "markdown" });
  assert.match(md, /\*\*Estimate\*\*: 103h 7m \(6187 min, 103\.12 h\)/);
});
