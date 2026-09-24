/**
 * Comment-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Comment,
  CommentAttributes,
  FormattedComment,
  CreateCommentPayload,
  UpdateCommentPayload,
} from "../types.js";
import {
  ListCommentsSchema,
  CreateCommentSchema,
  GetCommentSchema,
  UpdateCommentSchema,
  DeleteCommentSchema,
} from "../schemas/comment.js";
import {
  formatResponse,
  truncateResponse,
  markdownToHtml,
} from "../utils/formatting.js";

/**
 * Format a comment for display
 */
function formatComment(
  comment: Comment,
  includedData?: unknown[],
): FormattedComment {
  const attrs = comment.attributes as CommentAttributes;

  // Extract author info from relationships (API uses 'creator' relationship for comment authors)
  let authorId: string | null = null;
  let authorName: string | null = null;

  if (
    comment.relationships?.creator?.data &&
    "id" in comment.relationships.creator.data
  ) {
    authorId = comment.relationships.creator.data.id;

    // Try to find author name in included data
    if (includedData) {
      const person = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { first_name?: string; last_name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "people" &&
          "id" in item &&
          (item as { id: unknown }).id === authorId,
      );
      if (person?.attributes) {
        const firstName = person.attributes.first_name || "";
        const lastName = person.attributes.last_name || "";
        authorName = `${firstName} ${lastName}`.trim() || null;
      }
    }
  }

  // Extract task ID from relationships
  let taskId: string | null = null;
  if (
    comment.relationships?.task?.data &&
    "id" in comment.relationships.task.data
  ) {
    taskId = comment.relationships.task.data.id;
  }

  // Determine the commentable parent. Prefer the attribute the API already
  // computes (`commentable_type` + `commentable_id`); fall back to scanning
  // typed relationships for the first non-null match.
  let commentableType: string | null =
    (attrs.commentable_type as string) ?? null;
  let commentableId: string | null = (attrs.commentable_id as string) ?? null;
  if (!commentableType || !commentableId) {
    const rels = comment.relationships ?? {};
    for (const key of [
      "task",
      "deal",
      "project",
      "discussion",
      "invoice",
      "person",
      "company",
      "purchase_order",
    ]) {
      const rel = (rels as Record<string, { data?: unknown } | undefined>)[key];
      if (rel?.data && typeof rel.data === "object" && "id" in rel.data) {
        commentableType = key;
        commentableId = (rel.data as { id: string }).id;
        break;
      }
    }
  }

  return {
    id: comment.id,
    body: attrs.body || "",
    created_at: attrs.created_at,
    updated_at: attrs.updated_at,
    pinned: attrs.pinned_at != null,
    visible_to_clients: attrs.hidden !== true,
    author_id: authorId,
    author_name: authorName,
    task_id: taskId,
    commentable_type: commentableType,
    commentable_id: commentableId,
  };
}

/**
 * Format comments as markdown
 */
function formatCommentsMarkdown(
  comments: FormattedComment[],
  total?: number,
): string {
  if (comments.length === 0) {
    return "No comments found for this task.";
  }

  const lines = ["# Task Comments", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} comments`, "");
  }

  for (const comment of comments) {
    const pinnedBadge = comment.pinned ? " 📌" : "";
    const privateBadge = !comment.visible_to_clients ? " 🔒" : "";
    const author =
      comment.author_name || `User ${comment.author_id}` || "Unknown";
    const date = new Date(comment.created_at).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    lines.push(`## ${author}${pinnedBadge}${privateBadge}`);
    lines.push(`*${date}*`);
    lines.push("");
    lines.push(comment.body);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * List comments by task_id or project_id.
 *
 * Productive's /comments endpoint only supports these two filters. For other
 * commentable types (deals, invoices, etc.) the API has no list filter — use
 * productive_get_comment with a known comment ID instead.
 */
export async function listComments(
  client: ProductiveClient,
  args: z.infer<typeof ListCommentsSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "creator,task",
    sort: "-created_at",
  };
  if (args.task_id) {
    params["filter[task_id]"] = args.task_id;
  }
  if (args.project_id) {
    params["filter[project_id]"] = args.project_id;
  }

  const response = await client.get<JSONAPIResponse>("/comments", params);

  const comments = (
    Array.isArray(response.data) ? response.data : [response.data]
  )
    .filter((item) => item !== null)
    .map((comment) => formatComment(comment as Comment, response.included));

  const total = response.meta?.total_count;

  const result = formatResponse(
    { comments, total, count: comments.length },
    args.response_format,
    () => formatCommentsMarkdown(comments, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Format a single comment as markdown
 */
function formatCommentMarkdown(comment: FormattedComment): string {
  const pinnedBadge = comment.pinned ? " 📌" : "";
  const privateBadge = !comment.visible_to_clients ? " 🔒" : "";
  const author =
    comment.author_name || `User ${comment.author_id}` || "Unknown";
  const date = new Date(comment.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const visibilityLine = !comment.visible_to_clients
    ? "**Visibility**: Internal — hidden from clients"
    : "**Visibility**: Visible to clients";

  const lines = [
    `# Comment${pinnedBadge}${privateBadge}`,
    "",
    `**Author**: ${author}`,
    `**Date**: ${date}`,
    visibilityLine,
    `**ID**: ${comment.id}`,
  ];

  if (comment.task_id) {
    lines.push(`**Task ID**: ${comment.task_id}`);
  } else if (comment.commentable_type && comment.commentable_id) {
    lines.push(
      `**Parent**: ${comment.commentable_type} ${comment.commentable_id}`,
    );
  }

  lines.push("", "---", "", comment.body);

  return lines.join("\n");
}

/**
 * Singular commentable type → JSON:API plural resource type.
 *
 * Productive's comments payload uses the singular form as the relationship key
 * (e.g. `deal`) but the resource type within is plural (`deals`).
 */
const COMMENTABLE_RESOURCE_TYPES: Record<string, string> = {
  task: "tasks",
  deal: "deals",
  project: "projects",
  discussion: "discussions",
  invoice: "invoices",
  person: "people",
  company: "companies",
  purchase_order: "purchase_orders",
};

/**
 * Create a comment on a task, deal, project, or other commentable resource.
 *
 * Accepts either the legacy `task_id` shorthand or the polymorphic
 * `commentable_type` + `commentable_id` pair. The PDF/proposal export pulls
 * from the deal's `note` field — *comments* are internal-only.
 */
export async function createComment(
  client: ProductiveClient,
  args: z.infer<typeof CreateCommentSchema>,
): Promise<string> {
  const htmlBody = markdownToHtml(args.body);

  // Resolve the polymorphic parent. task_id is shorthand for ("task", task_id).
  const commentableType = args.task_id ? "task" : args.commentable_type;
  const commentableId = args.task_id ?? args.commentable_id;
  if (!commentableType || !commentableId) {
    throw new Error(
      "createComment: provide task_id or both commentable_type + commentable_id",
    );
  }

  const resourceType = COMMENTABLE_RESOURCE_TYPES[commentableType];
  if (!resourceType) {
    throw new Error(`Unknown commentable_type: ${commentableType}`);
  }

  const payload: CreateCommentPayload = {
    data: {
      type: "comments",
      attributes: {
        body: htmlBody,
        hidden: !args.visible_to_clients,
      },
      relationships: {
        [commentableType]: {
          data: {
            type: resourceType,
            id: commentableId,
          },
        },
      },
    },
  };

  const response = await client.post<JSONAPIResponse>("/comments", payload);
  const commentData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const comment = formatComment(commentData as Comment, response.included);

  const result = formatResponse(
    comment,
    args.response_format,
    () => `Comment created successfully:\n\n${formatCommentMarkdown(comment)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a specific comment by ID
 */
export async function getComment(
  client: ProductiveClient,
  args: z.infer<typeof GetCommentSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(
    `/comments/${args.comment_id}`,
    {
      include: "creator,task",
    },
  );

  const commentData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const comment = formatComment(commentData as Comment, response.included);

  const result = formatResponse(comment, args.response_format, () =>
    formatCommentMarkdown(comment),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a comment
 */
export async function updateComment(
  client: ProductiveClient,
  args: z.infer<typeof UpdateCommentSchema>,
): Promise<string> {
  const attributes: NonNullable<UpdateCommentPayload["data"]["attributes"]> =
    {};

  if (args.body !== undefined) {
    attributes.body = markdownToHtml(args.body);
  }
  if (args.visible_to_clients !== undefined) {
    attributes.hidden = !args.visible_to_clients;
  }

  const payload: UpdateCommentPayload = {
    data: {
      type: "comments",
      id: args.comment_id,
      attributes,
    },
  };

  const response = await client.patch<JSONAPIResponse>(
    `/comments/${args.comment_id}`,
    payload,
  );

  const commentData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const comment = formatComment(commentData as Comment, response.included);

  const result = formatResponse(
    comment,
    args.response_format,
    () => `Comment updated successfully:\n\n${formatCommentMarkdown(comment)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a comment
 */
export async function deleteComment(
  client: ProductiveClient,
  args: z.infer<typeof DeleteCommentSchema>,
): Promise<string> {
  await client.delete(`/comments/${args.comment_id}`);
  return `Comment ${args.comment_id} deleted successfully.`;
}
