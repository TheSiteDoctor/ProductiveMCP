# Attachments in Productive.io

## Overview

Attachments in Productive use a multi-step upload flow via AWS S3. You cannot simply POST a file — you must create an attachment record, upload to S3 using signed credentials, then link the uploaded file back to the attachment and the target resource.

Attachments can be linked to **tasks**, **comments**, or **pages**.

## Upload Flow

### Step 1: Resolve file content

Get the file bytes from one of three sources:

- **Local file path** — read from disk
- **URL** — download via HTTP (30s timeout, 50MB max)
- **Base64 string** — decode from base64

Determine the MIME type from the file extension (e.g. `.pdf` → `application/pdf`, `.png` → `image/png`). Fall back to `application/octet-stream` for unknown types.

### Step 2: Create attachment record in Productive

```
POST /api/v2/attachments

{
  "data": {
    "type": "attachments",
    "attributes": {
      "name": "document.pdf",
      "content_type": "application/pdf",
      "size": 12345,
      "attachable_type": "task"
    }
  }
}
```

`attachable_type` must be one of: `task`, `comment`, `page`.

The response includes an `aws_policy` object with signed S3 upload credentials:

```json
{
  "data": {
    "id": "789",
    "type": "attachments",
    "attributes": {
      "name": "document.pdf",
      "aws_policy": {
        "key": "uploads/...",
        "success_action_status": "201",
        "Content-Type": "application/pdf",
        "x-amz-credential": "...",
        "x-amz-algorithm": "AWS4-HMAC-SHA256",
        "x-amz-date": "...",
        "x-amz-signature": "...",
        "x-amz-security-token": "...",
        "policy": "..."
      }
    }
  }
}
```

### Step 3: Upload to S3

POST the file as `multipart/form-data` to:

```
https://productive-files-production.s3.eu-west-1.amazonaws.com
```

The form fields must include all AWS policy fields **in order**, with the file appended last:

```
key=<aws_policy.key>
success_action_status=<aws_policy.success_action_status>
Content-Type=<aws_policy.Content-Type>
x-amz-credential=<aws_policy.x-amz-credential>
x-amz-algorithm=<aws_policy.x-amz-algorithm>
x-amz-date=<aws_policy.x-amz-date>
x-amz-signature=<aws_policy.x-amz-signature>
x-amz-security-token=<aws_policy.x-amz-security-token>
policy=<aws_policy.policy>
file=<binary file data>
```

Extract the `Location` header from the S3 response, or construct the URL as `https://productive-files-production.s3.eu-west-1.amazonaws.com/<key>`.

### Step 4: Update attachment with S3 URL

```
PATCH /api/v2/attachments/<attachment_id>

{
  "data": {
    "type": "attachments",
    "id": "<attachment_id>",
    "attributes": {
      "temp_url": "<s3_url_from_step_3>"
    }
  }
}
```

### Step 5: Link attachment to the target resource

The attachment must be explicitly added to the target resource's `attachments` relationship. The API **replaces** the relationship array, so you must preserve existing attachments.

1. Fetch the target resource with attachments included:

```
GET /api/v2/tasks/<task_id>?include=attachments
```

2. Extract the existing attachment IDs from `data.relationships.attachments.data`.

3. Append the new attachment and PATCH:

```
PATCH /api/v2/tasks/<task_id>

{
  "data": {
    "type": "tasks",
    "id": "<task_id>",
    "relationships": {
      "attachments": {
        "data": [
          { "type": "attachments", "id": "existing_1" },
          { "type": "attachments", "id": "existing_2" },
          { "type": "attachments", "id": "<new_attachment_id>" }
        ]
      }
    }
  }
}
```

## Gotchas

1. **The `aws_policy` is time-limited** — upload to S3 immediately after creating the attachment record. Do not store the policy for later use.
2. **~45MB practical size limit** per file.
3. **Base64 cleanup** — if working with base64 data, strip any `data:...;base64,` prefix and whitespace before decoding.
4. **All IDs must be strings** in JSON:API bodies (e.g. `"id": "789"`, not `"id": 789`).
5. **No shortcut** — there is no single-call upload endpoint. All 4 steps (create record → upload to S3 → confirm upload → link to resource) are required.
6. **Step 4 confirms the upload** — the PATCH response includes `data.attributes.url`, which is the final CDN URL for the file.
7. **Step 5 replaces the array** — always include existing attachment IDs alongside new ones, or they'll be unlinked from the resource.

## Reading Attachments

Attachments are automatically included when fetching tasks with `?include=attachments`. They appear in the `included` array with type `"attachments"`.

Each attachment has:

- `name` — filename
- `url` — download URL
- `content_type` — MIME type
- `size` — file size in bytes
- `attachment_type` — `"inline"` for embedded images, otherwise regular file
- `thumb` — thumbnail URL (for images)

## Common MIME Types

| Extension      | MIME Type                                                                 |
| -------------- | ------------------------------------------------------------------------- |
| `.pdf`         | `application/pdf`                                                         |
| `.png`         | `image/png`                                                               |
| `.jpg`/`.jpeg` | `image/jpeg`                                                              |
| `.docx`        | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xlsx`        | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       |
| `.csv`         | `text/csv`                                                                |
| `.zip`         | `application/zip`                                                         |
| `.md`          | `text/markdown`                                                           |

## Sandbox / Cowork Environments

The MCP server runs as a **separate process** from the LLM's sandbox environment. This means:

- **Sandbox temp directories are not accessible** — paths like `/sessions/[id]/file.png` will fail with ENOENT because the MCP server cannot see them.
- **Mounted workspace directories work** — paths like `/sessions/[id]/mnt/[workspace]/file.png` are accessible because they map to the host filesystem.

When working in a sandbox environment:

1. **Preferred:** Save/copy files to the **mounted workspace folder** before calling `productive_upload_attachment` with `file_path`
2. **Alternative:** Use the `base64_content` parameter — read the file in the sandbox, encode to base64, and pass directly. Data URI prefixes (e.g. `data:image/png;base64,`) are automatically stripped as of v1.3.1.
3. **Will not work:** Direct S3 uploads may be blocked by sandbox proxy restrictions (403 Forbidden). The MCP server handles S3 internally, so this only matters if bypassing the MCP server.

## MCP Server Implementation

The Productive MCP server (v1.3.0+) handles the entire 5-step flow via the `productive_upload_attachment` tool in `src/tools/attachments.ts`. It accepts file content from a local path, URL, or base64 string and handles the S3 upload and linking automatically.

The `productive_list_attachments` tool lists attachments for a task, though attachments are also included in standard task responses.
