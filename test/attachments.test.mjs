/**
 * Attachment download tests. Run with `npm test` (builds first).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getAttachment } from "../dist/tools/attachments.js";
import { GetAttachmentSchema } from "../dist/schemas/attachment.js";
import { ProductiveClient } from "../dist/client.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function attachment(id, name, content_type, size = PNG.length) {
  return {
    type: "attachments",
    id,
    attributes: {
      name,
      content_type,
      size,
      url: `https://files.productive.io/attachments/files/${id}/original/${name}`,
      attachment_type: null,
      deleted_at: null,
    },
  };
}

// Minimal stand-in for ProductiveClient that records downloads.
function fakeClient(attachments) {
  const downloads = [];
  return {
    downloads,
    async get(endpoint) {
      if (endpoint.startsWith("/attachments/")) return { data: attachments[0] };
      return { data: { type: "tasks", id: "1" }, included: attachments };
    },
    async downloadFile(url, maxBytes) {
      downloads.push({ url, maxBytes });
      return { buffer: PNG, contentType: "image/png" };
    },
  };
}

test("exactly one of attachment_id or task_id is required", () => {
  assert.equal(GetAttachmentSchema.safeParse({}).success, false);
  assert.equal(
    GetAttachmentSchema.safeParse({ attachment_id: "1", task_id: "2" }).success,
    false,
  );
  assert.equal(GetAttachmentSchema.safeParse({ task_id: "2" }).success, true);
});

test("images come back as base64 image content", async () => {
  const client = fakeClient([attachment("1", "shot.png", "image/png")]);
  const result = await getAttachment(client, { attachment_id: "1" });

  const image = result.content.find((c) => c.type === "image");
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.data, PNG.toString("base64"));
});

test("non-images are skipped without save_dir and not downloaded", async () => {
  const client = fakeClient([
    attachment("1", "shot.png", "image/png"),
    attachment("2", "spec.pdf", "application/pdf"),
  ]);
  const result = await getAttachment(client, { task_id: "9" });

  assert.equal(client.downloads.length, 1);
  assert.match(result.content.at(-1).text, /spec\.pdf[\s\S]*Skipped/);
});

test("save_dir writes every file and still returns images inline", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "productive-att-"));
  const client = fakeClient([
    attachment("1", "shot.png", "image/png"),
    attachment("2", "spec.pdf", "application/pdf"),
  ]);
  const result = await getAttachment(client, { task_id: "9", save_dir: dir });

  assert.deepEqual((await fs.readdir(dir)).sort(), ["1-shot.png", "2-spec.pdf"]);
  assert.equal(result.content.filter((c) => c.type === "image").length, 1);
  await fs.rm(dir, { recursive: true });
});

test("downloadFile refuses to send the token to other hosts", async () => {
  const client = new ProductiveClient("secret", "1");
  await assert.rejects(
    client.downloadFile("https://example.com/a.png", 1024),
    /only https:\/\/files\.productive\.io/,
  );
  await assert.rejects(
    client.downloadFile("http://files.productive.io/a.png", 1024),
    /only https:\/\/files\.productive\.io/,
  );
});
