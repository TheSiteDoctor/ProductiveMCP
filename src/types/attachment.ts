/**
 * Attachment-related types
 */

export interface AttachmentAttributes {
  name: string;
  content_type: string;
  size: number;
  url: string;
  thumb?: string;
  temp_url?: string;
  resized?: boolean;
  created_at: string;
  deleted_at: string | null;
  attachment_type: "inline" | null;
  message_id: string | null;
  external_id: string | null;
  attachable_type: string;
}

export interface Attachment {
  id: string;
  type: "attachments";
  attributes: AttachmentAttributes;
  relationships?: Record<string, unknown>;
}

export interface FormattedAttachment {
  id: string;
  name: string;
  content_type: string;
  size: number;
  size_formatted: string;
  url: string;
  thumb_url: string | null;
  is_image: boolean;
  is_inline: boolean;
  created_at: string;
}
