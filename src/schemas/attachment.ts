/**
 * Attachment-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema } from "./common.js";

/**
 * Schema for listing task attachments
 */
export const ListAttachmentsSchema = z
  .object({
    task_id: z.string().min(1, "Task ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Attachable types supported for uploads
 */
export const AttachableTypeSchema = z.enum(["task", "comment", "page"]);

/**
 * Schema for uploading attachments
 * Exactly one of file_path, url, or base64_content must be provided
 */
export const UploadAttachmentSchema = z
  .object({
    // Target resource
    attachable_type: AttachableTypeSchema,
    attachable_id: z.string().min(1, "Attachable ID is required"),

    // File source (exactly one required)
    file_path: z.string().optional(),
    url: z.string().url().optional(),
    base64_content: z.string().optional(),

    // File metadata
    filename: z.string().min(1, "Filename is required"),
    content_type: z.string().optional(),

    response_format: ResponseFormatSchema,
  })
  .strict()
  .refine(
    (data) => {
      const sources = [data.file_path, data.url, data.base64_content].filter(
        Boolean,
      );
      return sources.length === 1;
    },
    {
      message:
        "Exactly one of file_path, url, or base64_content must be provided",
    },
  );
