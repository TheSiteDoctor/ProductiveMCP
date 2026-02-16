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
} from "../types.js";
import { ListCommentsSchema } from "../schemas/comment.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";

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

  return {
    id: comment.id,
    body: attrs.body || "",
    created_at: attrs.created_at,
    updated_at: attrs.updated_at,
    pinned: attrs.pinned || false,
    author_id: authorId,
    author_name: authorName,
    task_id: taskId,
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
    const author =
      comment.author_name || `User ${comment.author_id}` || "Unknown";
    const date = new Date(comment.created_at).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    lines.push(`## ${author}${pinnedBadge}`);
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
 * List comments for a task
 */
export async function listComments(
  client: ProductiveClient,
  args: z.infer<typeof ListCommentsSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const response = await client.get<JSONAPIResponse>("/comments", {
    "filter[task_id]": args.task_id,
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "creator,task",
    sort: "-created_at", // Most recent first
  });

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
