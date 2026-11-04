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

const comment = (id, attachments) => ({
  type: "comments",
  id,
  relationships: {
    attachments: { data: attachments.map((a) => ({ type: "attachments", id: a.id })) },
  },
});

// Minimal stand-in for ProductiveClient that records requests and downloads.
// commentAttachments: { [commentId]: attachment[] } for the task's comments.
function fakeClient(attachments, commentAttachments = {}) {
  const downloads = [];
  const gets = [];
  const comments = Object.entries(commentAttachments).map(([id, atts]) => comment(id, atts));
  const allCommentAttachments = Object.values(commentAttachments).flat();
  return {
    downloads,
    gets,
    async get(endpoint, params) {
      gets.push({ endpoint, params });
      if (endpoint.startsWith("/attachments/")) return { data: attachments[0] };
      if (endpoint.startsWith("/comments/")) {
        const id = endpoint.split("/")[2];
        return { data: comment(id, commentAttachments[id]), included: commentAttachments[id] };
      }
      if (endpoint === "/comments") {
        return { data: comments, included: allCommentAttachments, meta: { total_pages: 1 } };
      }
      return { data: { type: "tasks", id: "1" }, included: attachments };
    },
    async downloadFile(url, maxBytes) {
      downloads.push({ url, maxBytes });
      return { buffer: PNG, contentType: "image/png" };
    },
  };
}

test("exactly one of attachment_id, comment_id or task_id is required", () => {
  assert.equal(GetAttachmentSchema.safeParse({}).success, false);
  assert.equal(
    GetAttachmentSchema.safeParse({ attachment_id: "1", task_id: "2" }).success,
    false,
  );
  assert.equal(
    GetAttachmentSchema.safeParse({ comment_id: "1", task_id: "2" }).success,
    false,
  );
  assert.equal(GetAttachmentSchema.safeParse({ task_id: "2" }).success, true);
  assert.equal(GetAttachmentSchema.safeParse({ comment_id: "3" }).success, true);
});

test("comment_id returns that comment's attachments", async () => {
  const client = fakeClient([], { 7: [attachment("5", "bug.jpg", "image/jpeg")] });
  const result = await getAttachment(client, { comment_id: "7" });

  assert.equal(client.gets[0].endpoint, "/comments/7");
  assert.match(result.content[0].text, /bug\.jpg.*on comment 7/);
  assert.equal(result.content[1].mimeType, "image/jpeg");
});

test("task_id also returns attachments on the task's comments, once each", async () => {
  const shared = attachment("1", "shot.png", "image/png");
  const client = fakeClient([shared], {
    7: [attachment("5", "bug.jpg", "image/jpeg")],
    8: [shared],
  });
  const result = await getAttachment(client, { task_id: "9" });

  const commentsCall = client.gets.find((g) => g.endpoint === "/comments");
  assert.equal(commentsCall.params["filter[task_id]"], "9");
  const headings = result.content.filter((c) => c.type === "text").map((c) => c.text);
  assert.equal(headings.length, 2);
  assert.match(headings[1], /bug\.jpg.*on comment 7/);
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
