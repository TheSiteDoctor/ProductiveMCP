/**
 * Advertised tool schemas (tools/list from the built MCP server) must match
 * the zod schemas the handlers validate against. Run with `npm test`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { z } from "zod";
import { toolRegistry } from "../dist/registry.js";

let server;
let tools;

// Start dist/index.js over stdio and fetch tools/list. tools/list makes no
// API calls, so placeholder credentials are enough.
before(async () => {
  server = spawn("node", ["dist/index.js"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, PRODUCTIVE_API_TOKEN: "test", PRODUCTIVE_ORG_ID: "1" },
  });
  tools = await new Promise((resolve, reject) => {
    let buf = "";
    server.stdout.on("data", (chunk) => {
      buf += chunk;
      for (const line of buf.split("\n")) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2) resolve(msg.result.tools);
        } catch {}
      }
    });
    setTimeout(() => reject(new Error("tools/list timed out")), 10000);
    const send = (o) => server.stdin.write(JSON.stringify(o) + "\n");
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  });
});

after(() => server?.kill());

const shapeKeys = (schema) => {
  while (schema instanceof z.ZodEffects) schema = schema._def.schema;
  return Object.keys(schema.shape).sort();
};

test("both service write tools advertise the estimate parameters", () => {
  for (const name of ["productive_create_service", "productive_update_service"]) {
    const props = tools.find((t) => t.name === name).inputSchema.properties;
    assert.equal(props.estimated_time_minutes?.type, "integer", name);
    assert.equal(props.estimated_time_hours?.type, "number", name);
  }
});

test("every tool advertises exactly the parameters its zod schema accepts", () => {
  const drift = [];
  for (const tool of tools) {
    const advertised = Object.keys(tool.inputSchema.properties ?? {}).sort();
    const accepted = shapeKeys(toolRegistry[tool.name].schema);
    if (JSON.stringify(advertised) !== JSON.stringify(accepted)) {
      drift.push({ tool: tool.name, advertised, accepted });
    }
  }
  assert.deepEqual(drift, []);
});

test("service schemas reject both estimate units together, and unknown params", () => {
  for (const name of ["productive_create_service", "productive_update_service"]) {
    const { schema } = toolRegistry[name];
    const base = name.endsWith("update_service")
      ? { service_id: "1" }
      : { name: "Design", deal_id: "1", service_type_id: "1" };
    assert.equal(schema.safeParse({ ...base, estimated_time_minutes: 60 }).success, true, name);
    assert.equal(
      schema.safeParse({ ...base, estimated_time_minutes: 60, estimated_time_hours: 1 }).success,
      false,
      `${name}: both units`,
    );
    assert.equal(schema.safeParse({ ...base, estimated_minutes: 60 }).success, false, `${name}: unknown param`);
  }
});
