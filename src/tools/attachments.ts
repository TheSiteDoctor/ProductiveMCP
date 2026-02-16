/**
 * Attachment-related MCP tools
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import axios from "axios";
import FormData from "form-data";
import type { ProductiveClient } from "../client.js";
import {
  ListAttachmentsSchema,
  UploadAttachmentSchema,
} from "../schemas/attachment.js";
import { formatResponse } from "../utils/formatting.js";
import type { AttachmentAttributes } from "../types.js";

/**
 * Common MIME types by file extension
 */
const MIME_TYPES: Record<string, string> = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".md": "text/markdown",
  // Archives
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".rar": "application/vnd.rar",
  // Media
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
};

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Resolve file content from various sources
 */
interface ResolvedFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
}

async function resolveFileContent(
  args: z.infer<typeof UploadAttachmentSchema>,
): Promise<ResolvedFile> {
  const contentType = args.content_type || getMimeType(args.filename);

  if (args.file_path) {
    // Read from local file
    try {
      const buffer = await fs.readFile(args.file_path);
      return {
        buffer,
        filename: args.filename,
        contentType,
        size: buffer.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to read file at ${args.file_path}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (args.url) {
    // Download from URL
    try {
      const response = await axios.get(args.url, {
        responseType: "arraybuffer",
        timeout: 30000, // 30 second timeout
        maxContentLength: 50 * 1024 * 1024, // 50MB max
      });
      const buffer = Buffer.from(response.data);
      return {
        buffer,
        filename: args.filename,
        contentType:
          args.content_type || response.headers["content-type"] || contentType,
        size: buffer.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to download file from ${args.url}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (args.base64_content) {
    // Decode from base64
    try {
      const buffer = Buffer.from(args.base64_content, "base64");
      if (
        buffer.toString("base64") !== args.base64_content.replace(/\s/g, "")
      ) {
        throw new Error("Invalid base64 encoding");
      }
      return {
        buffer,
        filename: args.filename,
        contentType,
        size: buffer.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to decode base64 content: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  throw new Error("No file source provided");
}

/**
 * List attachments for a task
 * Note: Attachments are automatically included when fetching tasks via productive_get_task
 * or productive_search_tasks. This tool is provided for convenience but typically not needed.
 */
export async function listAttachments(
  client: ProductiveClient,
  args: z.infer<typeof ListAttachmentsSchema>,
): Promise<string> {
  // Fetch the task with attachments included
  const response = await client.get(`/tasks/${args.task_id}`, {
    include: "attachments",
  });

  const taskData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;

  // Extract attachments from included data
  interface AttachmentData {
    type: string;
    id: string;
    attributes: AttachmentAttributes;
  }

  const attachments: AttachmentData[] =
    (response.included?.filter(
      (item): item is AttachmentData =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "attachments",
    ) as AttachmentData[]) || [];

  if (args.response_format === "json") {
    return JSON.stringify({ attachments }, null, 2);
  }

  // Format as markdown
  if (attachments.length === 0) {
    return "No attachments found for this task.";
  }

  const lines = ["# Task Attachments", ""];

  // Group by inline vs regular
  const inlineAttachments = attachments.filter(
    (a) => a.attributes.attachment_type === "inline",
  );
  const regularAttachments = attachments.filter(
    (a) => a.attributes.attachment_type !== "inline",
  );

  if (inlineAttachments.length > 0) {
    lines.push("## Inline Images", "");
    for (const att of inlineAttachments) {
      const attrs = att.attributes;
      const size = formatBytes(attrs.size);
      lines.push(`- 🖼️ [${attrs.name}](${attrs.url}) (${size})`);
      if (attrs.thumb) {
        lines.push(`  Thumbnail: ${attrs.thumb}`);
      }
      lines.push("");
    }
  }

  if (regularAttachments.length > 0) {
    lines.push("## Files", "");
    for (const att of regularAttachments) {
      const attrs = att.attributes;
      const size = formatBytes(attrs.size);
      const icon = attrs.content_type?.startsWith("image/") ? "🖼️" : "📎";
      lines.push(`- ${icon} [${attrs.name}](${attrs.url}) (${size})`);
      lines.push(`  Type: ${attrs.content_type}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * AWS Policy response from Productive when creating an attachment
 */
interface AwsPolicy {
  key: string;
  success_action_status: string;
  "Content-Type": string;
  "x-amz-credential": string;
  "x-amz-algorithm": string;
  "x-amz-date": string;
  "x-amz-signature": string;
  "x-amz-security-token": string;
  policy: string;
}

/**
 * Response from creating an attachment in Productive
 */
interface CreateAttachmentResponse {
  data: {
    id: string;
    type: "attachments";
    attributes: {
      name: string;
      content_type: string;
      size: number;
      aws_policy: AwsPolicy;
      url?: string;
    };
  };
}

/**
 * Upload an attachment to a task, comment, or page
 *
 * Flow:
 * 1. Resolve file content (from path, URL, or base64)
 * 2. Create attachment record in Productive (get AWS credentials)
 * 3. Upload file to S3 using multipart form-data
 * 4. Update attachment with S3 URL
 * 5. Link attachment to target resource
 */
export async function uploadAttachment(
  client: ProductiveClient,
  args: z.infer<typeof UploadAttachmentSchema>,
): Promise<string> {
  // Step 1: Resolve file content
  const file = await resolveFileContent(args);

  // Map attachable_type to Productive's expected format
  const attachableTypeMap: Record<string, string> = {
    task: "task",
    comment: "comment",
    page: "page",
  };
  const productiveAttachableType = attachableTypeMap[args.attachable_type];

  // Step 2: Create attachment record in Productive
  const createPayload = {
    data: {
      type: "attachments",
      attributes: {
        name: file.filename,
        content_type: file.contentType,
        size: file.size,
        attachable_type: productiveAttachableType,
      },
    },
  };

  const createResponse = await client.post<CreateAttachmentResponse>(
    "/attachments",
    createPayload,
  );

  const attachmentId = createResponse.data.id;
  const awsPolicy = createResponse.data.attributes.aws_policy;

  if (!awsPolicy) {
    throw new Error("No AWS policy returned from Productive API");
  }

  // Step 3: Upload to S3
  const formData = new FormData();

  // Add all AWS policy fields in the correct order
  formData.append("key", awsPolicy.key);
  formData.append("success_action_status", awsPolicy.success_action_status);
  formData.append("Content-Type", awsPolicy["Content-Type"]);
  formData.append("x-amz-credential", awsPolicy["x-amz-credential"]);
  formData.append("x-amz-algorithm", awsPolicy["x-amz-algorithm"]);
  formData.append("x-amz-date", awsPolicy["x-amz-date"]);
  formData.append("x-amz-signature", awsPolicy["x-amz-signature"]);
  formData.append("x-amz-security-token", awsPolicy["x-amz-security-token"]);
  formData.append("policy", awsPolicy.policy);

  // Add the file last
  formData.append("file", file.buffer, {
    filename: file.filename,
    contentType: file.contentType,
  });

  const s3Url =
    "https://productive-files-production.s3.eu-west-1.amazonaws.com";

  const s3Response = await axios.post(s3Url, formData, {
    headers: formData.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  // Extract the Location header or construct the URL from the key
  const locationHeader = s3Response.headers["location"];
  const tempUrl = locationHeader || `${s3Url}/${awsPolicy.key}`;

  // Step 4: Update attachment with S3 URL
  const updatePayload = {
    data: {
      type: "attachments",
      id: attachmentId,
      attributes: {
        temp_url: tempUrl,
      },
    },
  };

  await client.patch(`/attachments/${attachmentId}`, updatePayload);

  // Step 5: Link attachment to target resource
  // The attachment is already linked via attachable_type during creation,
  // but we need to add it to the resource's attachments relationship
  const resourceEndpoint = `/${args.attachable_type}s/${args.attachable_id}`;

  // First get the current attachments
  const currentResource = await client.get(resourceEndpoint, {
    include: "attachments",
  });

  // Build the attachments array with existing + new
  const existingAttachments: Array<{ type: string; id: string }> = [];
  if (
    currentResource.data &&
    !Array.isArray(currentResource.data) &&
    currentResource.data.relationships?.attachments?.data
  ) {
    const attachmentsData = currentResource.data.relationships.attachments.data;
    if (Array.isArray(attachmentsData)) {
      existingAttachments.push(
        ...attachmentsData.map((a: { type: string; id: string }) => ({
          type: a.type,
          id: a.id,
        })),
      );
    }
  }

  // Add the new attachment
  existingAttachments.push({ type: "attachments", id: attachmentId });

  // Update the resource with the new attachments list
  const linkPayload = {
    data: {
      type: `${args.attachable_type}s`,
      id: args.attachable_id,
      relationships: {
        attachments: {
          data: existingAttachments,
        },
      },
    },
  };

  await client.patch(resourceEndpoint, linkPayload);

  // Build response
  const orgId = client.getOrgId();
  const resourceUrl = `https://app.productive.io/${orgId}/${args.attachable_type}s/${args.attachable_id}`;

  const result = {
    id: attachmentId,
    filename: file.filename,
    size: file.size,
    size_formatted: formatBytes(file.size),
    content_type: file.contentType,
    attachable_type: args.attachable_type,
    attachable_id: args.attachable_id,
    url: tempUrl,
  };

  if (args.response_format === "json") {
    return JSON.stringify(result, null, 2);
  }

  // Format as markdown
  const lines = [
    "# Attachment Uploaded",
    "",
    `**ID**: ${attachmentId}`,
    `**Filename**: ${file.filename}`,
    `**Size**: ${formatBytes(file.size)}`,
    `**Type**: ${file.contentType}`,
    `**Attached to**: ${args.attachable_type.charAt(0).toUpperCase() + args.attachable_type.slice(1)} ${args.attachable_id}`,
    "",
    `[View in Productive](${resourceUrl})`,
  ];

  return lines.join("\n");
}
