/**
 * Response formatting utilities
 */

import { marked, Token, Tokens } from "marked";
import {
  CHARACTER_LIMIT,
  CUSTOM_FIELD_IDS,
  TASK_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
} from "../constants.js";
import type {
  Board,
  BoardAttributes,
  FormattedBoard,
  FormattedTask,
  FormattedProject,
  FormattedTaskList,
  FormattedPerson,
  FormattedAttachment,
  Attachment,
  AttachmentAttributes,
  BatchOperationSummary,
  ResponseFormat,
  Task,
  TaskAttributes,
  Project,
  ProjectAttributes,
  TaskList,
  TaskListAttributes,
  Person,
  PersonAttributes,
  JSONAPIResponse,
  Budget,
  BudgetAttributes,
  FormattedBudget,
  BudgetAuditResult,
  RevenueDistribution,
  RevenueDistributionAttributes,
  FormattedRevenueDistribution,
  OverdueDistributionReport,
  Service,
  ServiceAttributes,
  FormattedService,
  ServiceType,
  ServiceTypeAttributes,
  FormattedServiceType,
  ProductiveDoc,
  ProductiveDocNode,
} from "../types.js";

/**
 * Convert Markdown to HTML for Productive.io
 * Productive accepts HTML in description fields, but Claude outputs Markdown.
 * This function automatically converts Markdown to HTML.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === "") {
    return markdown;
  }

  // Configure marked for safe, clean HTML output
  marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert \n to <br>
  });

  // Convert markdown to HTML and remove wrapping <p> tags if it's a single paragraph
  const html = marked.parse(markdown, { async: false }) as string;

  // Clean up: remove trailing newlines and trim
  return html.trim();
}

// Productive Document Format types imported from types.ts

/**
 * Convert Markdown to Productive JSON Document Format for Pages.
 * Productive Pages use a JSON document format similar to Atlassian Document Format (ADF).
 * This function parses markdown and converts it to the required structure.
 */
export function markdownToProductiveDoc(markdown: string): ProductiveDoc {
  if (!markdown || markdown.trim() === "") {
    // Return empty document structure
    return { type: "doc", content: [] };
  }

  // Parse markdown into tokens using marked's lexer
  const tokens = marked.lexer(markdown);

  // Convert tokens to Productive document nodes
  return {
    type: "doc",
    content: convertTokensToNodes(tokens),
  };
}

/**
 * Convert Markdown to a stringified Productive document JSON.
 * Productive's Pages API expects the body attribute as a string containing JSON
 * (not a raw JSON object), matching the format returned in API responses:
 * e.g. "body": "{\"type\":\"doc\",\"content\":[...]}"
 */
export function markdownToProductiveDocString(markdown: string): string {
  return JSON.stringify(markdownToProductiveDoc(markdown));
}

/**
 * Convert marked tokens to Productive document nodes
 */
function convertTokensToNodes(tokens: Token[]): ProductiveDocNode[] {
  const nodes: ProductiveDocNode[] = [];

  for (const token of tokens) {
    const node = convertTokenToNode(token);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Convert a single marked token to a Productive document node
 */
function convertTokenToNode(token: Token): ProductiveDocNode | null {
  switch (token.type) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: Math.min(token.depth, 3) }, // Productive supports 3 levels
        content: convertInlineTokens(token.tokens || []),
      };

    case "paragraph":
      return {
        type: "paragraph",
        content: convertInlineTokens(token.tokens || []),
      };

    case "blockquote":
      return {
        type: "blockquote",
        content: convertTokensToNodes(token.tokens || []),
      };

    case "list":
      return {
        type: token.ordered ? "ol" : "ul",
        content: (token.items || []).map((item: Tokens.ListItem) => ({
          type: "li",
          content: convertListItemTokens(item.tokens || []),
        })),
      };

    case "code":
      // Code blocks become paragraphs with code-marked text
      return {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: token.text,
            marks: [{ type: "code" }],
          },
        ],
      };

    case "hr":
      return {
        type: "divider",
      };

    case "space":
      // Skip whitespace-only tokens
      return null;

    default:
      // For unknown block types, try to convert as paragraph if it has text
      if ("text" in token && typeof token.text === "string") {
        return {
          type: "paragraph",
          content: [{ type: "text", text: token.text }],
        };
      }
      return null;
  }
}

/**
 * Convert list item tokens to Productive nodes
 * List items have a special structure where inline formatting is nested inside text tokens
 */
function convertListItemTokens(tokens: Token[]): ProductiveDocNode[] {
  const nodes: ProductiveDocNode[] = [];

  for (const token of tokens) {
    if (
      token.type === "text" &&
      "tokens" in token &&
      Array.isArray(token.tokens)
    ) {
      // This is a text token with nested inline formatting - wrap in paragraph
      nodes.push({
        type: "paragraph",
        content: convertInlineTokens(token.tokens),
      });
    } else if (
      token.type === "paragraph" ||
      token.type === "heading" ||
      token.type === "list"
    ) {
      // Handle block-level tokens normally
      const node = convertTokenToNode(token);
      if (node) {
        nodes.push(node);
      }
    } else {
      // Fallback: wrap as paragraph
      const inlineNodes = convertInlineToken(token);
      if (inlineNodes.length > 0) {
        nodes.push({
          type: "paragraph",
          content: inlineNodes,
        });
      }
    }
  }

  return nodes;
}

/**
 * Convert inline tokens (text, bold, italic, links, etc.) to Productive nodes
 */
function convertInlineTokens(tokens: Token[]): ProductiveDocNode[] {
  const nodes: ProductiveDocNode[] = [];

  for (const token of tokens) {
    const inlineNodes = convertInlineToken(token);
    nodes.push(...inlineNodes);
  }

  return nodes;
}

/**
 * Convert a single inline token to Productive text nodes with marks
 */
function convertInlineToken(token: Token): ProductiveDocNode[] {
  switch (token.type) {
    case "text":
      return [{ type: "text", text: token.text }];

    case "strong":
      // Bold text - recursively process children with strong mark
      return applyMarkToTokens(token.tokens || [], { type: "strong" });

    case "em":
      // Italic text - recursively process children with em mark
      return applyMarkToTokens(token.tokens || [], { type: "em" });

    case "codespan":
      return [
        {
          type: "text",
          text: token.text,
          marks: [{ type: "code" }],
        },
      ];

    case "link":
      // Links apply mark to all child content
      return applyMarkToTokens(token.tokens || [], {
        type: "link",
        attrs: { href: token.href, title: token.title || undefined },
      });

    case "br":
      return [{ type: "text", text: "\n" }];

    case "escape":
      return [{ type: "text", text: token.text }];

    default:
      // For unknown inline types, return as plain text if possible
      if ("text" in token && typeof token.text === "string") {
        return [{ type: "text", text: token.text }];
      }
      if ("raw" in token && typeof token.raw === "string") {
        return [{ type: "text", text: token.raw }];
      }
      return [];
  }
}

/**
 * Apply a mark to all text nodes within tokens
 */
function applyMarkToTokens(
  tokens: Token[],
  mark: { type: string; attrs?: Record<string, unknown> },
): ProductiveDocNode[] {
  const nodes: ProductiveDocNode[] = [];

  for (const token of tokens) {
    const innerNodes = convertInlineToken(token);
    for (const node of innerNodes) {
      if (node.type === "text") {
        // Add the mark to existing marks array
        const existingMarks = node.marks || [];
        node.marks = [...existingMarks, mark];
      }
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Format an attachment for display
 */
export function formatAttachment(attachment: Attachment): FormattedAttachment {
  const attrs = attachment.attributes as AttachmentAttributes;

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Check if it's an image based on content type
  const isImage = attrs.content_type?.startsWith("image/") || false;

  // Check if it's inline
  const isInline = attrs.attachment_type === "inline";

  return {
    id: attachment.id,
    name: attrs.name,
    content_type: attrs.content_type,
    size: attrs.size,
    size_formatted: formatBytes(attrs.size),
    url: attrs.url,
    thumb_url: attrs.thumb || null,
    is_image: isImage,
    is_inline: isInline,
    created_at: attrs.created_at,
  };
}

/**
 * Format a task for display
 */
export function formatTask(
  task: Task,
  orgId: string,
  includedData?: unknown[],
): FormattedTask {
  const attributes = task.attributes as TaskAttributes;

  // Extract project info from relationships and included data
  let projectId: string | null = null;
  let projectName: string | null = null;
  let taskListId: string | null = null;
  let taskListName: string | null = null;
  let assigneeId: string | null = null;
  let assigneeName: string | null = null;

  if (
    task.relationships?.project?.data &&
    "id" in task.relationships.project.data
  ) {
    projectId = task.relationships.project.data.id;

    // Try to find project name in included data
    if (includedData) {
      const project = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "projects" &&
          "id" in item &&
          (item as { id: unknown }).id === projectId,
      );
      if (project?.attributes?.name) {
        projectName = project.attributes.name;
      }
    }
  }

  if (
    task.relationships?.task_list?.data &&
    "id" in task.relationships.task_list.data
  ) {
    taskListId = task.relationships.task_list.data.id;

    // Try to find task list name in included data
    if (includedData) {
      const taskList = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "task_lists" &&
          "id" in item &&
          (item as { id: unknown }).id === taskListId,
      );
      if (taskList?.attributes?.name) {
        taskListName = taskList.attributes.name;
      }
    }
  }

  if (
    task.relationships?.assignee?.data &&
    "id" in task.relationships.assignee.data
  ) {
    assigneeId = task.relationships.assignee.data.id;

    // Try to find assignee name in included data
    if (includedData) {
      const assignee = includedData.find(
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
          (item as { id: unknown }).id === assigneeId,
      );
      if (assignee?.attributes) {
        const firstName = assignee.attributes.first_name || "";
        const lastName = assignee.attributes.last_name || "";
        assigneeName = `${firstName} ${lastName}`.trim() || null;
      }
    }
  }

  // Extract estimate from top-level attribute (not custom field)
  const estimateMinutes =
    typeof attributes.initial_estimate === "number"
      ? attributes.initial_estimate
      : null;

  // Extract custom fields
  const customFields = attributes.custom_fields || {};

  // Extract task type from custom field
  let taskType: string | null = null;
  if (CUSTOM_FIELD_IDS.TASK_TYPE) {
    const taskTypeOptionId = customFields[CUSTOM_FIELD_IDS.TASK_TYPE];
    if (taskTypeOptionId) {
      // Reverse lookup from TASK_TYPE_OPTIONS
      const taskTypeEntry = Object.entries(TASK_TYPE_OPTIONS).find(
        ([, optionId]) => optionId === String(taskTypeOptionId),
      );
      taskType = taskTypeEntry ? taskTypeEntry[0] : null;
    }
  }

  // Extract priority from custom field
  let priority: string | null = null;
  if (CUSTOM_FIELD_IDS.PRIORITY) {
    const priorityOptionId = customFields[CUSTOM_FIELD_IDS.PRIORITY];
    if (priorityOptionId) {
      // Reverse lookup from PRIORITY_OPTIONS
      const priorityEntry = Object.entries(PRIORITY_OPTIONS).find(
        ([, optionId]) => optionId === String(priorityOptionId),
      );
      priority = priorityEntry ? priorityEntry[0] : null;
    }
  }

  // Extract workflow status from relationship
  let workflowStatus: string | null = null;
  if (
    task.relationships?.workflow_status?.data &&
    "id" in task.relationships.workflow_status.data
  ) {
    const workflowStatusId = task.relationships.workflow_status.data.id;

    // Try to find workflow status name in included data
    if (includedData) {
      const status = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "workflow_statuses" &&
          "id" in item &&
          (item as { id: unknown }).id === workflowStatusId,
      );
      if (status?.attributes?.name) {
        workflowStatus = status.attributes.name;
      }
    }
  }

  // Extract attachments from relationships and included data
  const attachments: FormattedAttachment[] = [];
  if (task.relationships?.attachments?.data && includedData) {
    const attachmentData = Array.isArray(task.relationships.attachments.data)
      ? task.relationships.attachments.data
      : [task.relationships.attachments.data];

    for (const attachmentRef of attachmentData) {
      if ("id" in attachmentRef) {
        const attachmentObj = includedData.find(
          (item): item is Attachment =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            (item as { type: unknown }).type === "attachments" &&
            "id" in item &&
            (item as { id: unknown }).id === attachmentRef.id,
        );

        if (attachmentObj) {
          attachments.push(formatAttachment(attachmentObj));
        }
      }
    }
  }

  return {
    id: task.id,
    number: attributes.number || null,
    title: attributes.title,
    description: attributes.description || null,
    project_id: projectId,
    project_name: projectName,
    task_list_id: taskListId,
    task_list_name: taskListName,
    assignee_id: assigneeId,
    assignee_name: assigneeName,
    estimate_minutes: estimateMinutes,
    task_type: taskType,
    priority: priority,
    workflow_status: workflowStatus,
    closed: attributes.closed,
    due_date: attributes.due_date || null,
    start_date: attributes.start_date || null,
    created_at: attributes.created_at,
    url: task.id ? `https://app.productive.io/${orgId}/tasks/${task.id}` : null,
    attachments: attachments,
  };
}

/**
 * Format task as markdown
 */
export function formatTaskMarkdown(task: FormattedTask): string {
  const lines = [
    "# Task Created Successfully",
    "",
    `**ID**: ${task.number ? `#${task.number}` : task.id}`,
    `**Title**: ${task.title}`,
  ];

  if (task.description) {
    lines.push(`**Description**: ${task.description}`);
  }

  if (task.project_name) {
    lines.push(`**Project**: ${task.project_name}`);
  } else if (task.project_id) {
    lines.push(`**Project ID**: ${task.project_id}`);
  }

  if (task.task_list_name) {
    lines.push(`**Task List**: ${task.task_list_name}`);
  } else if (task.task_list_id) {
    lines.push(`**Task List ID**: ${task.task_list_id}`);
  }

  if (task.assignee_name) {
    lines.push(`**Assignee**: ${task.assignee_name}`);
  } else if (task.assignee_id) {
    lines.push(`**Assignee ID**: ${task.assignee_id}`);
  }

  if (task.task_type) {
    lines.push(`**Type**: ${task.task_type}`);
  }

  if (task.priority) {
    lines.push(`**Priority**: ${task.priority}`);
  }

  if (task.workflow_status) {
    lines.push(`**Status**: ${task.workflow_status}`);
  }

  if (task.estimate_minutes !== null) {
    const hours = Math.floor(task.estimate_minutes / 60);
    const minutes = task.estimate_minutes % 60;
    const estimateStr =
      hours > 0
        ? minutes > 0
          ? `${hours}h ${minutes}m`
          : `${hours}h`
        : `${minutes}m`;
    lines.push(
      `**Estimate**: ${estimateStr} (${task.estimate_minutes} minutes)`,
    );
  }

  lines.push(`**Status**: ${task.closed ? "Closed" : "Open"}`);

  if (task.due_date) {
    lines.push(`**Due Date**: ${task.due_date}`);
  }

  if (task.start_date) {
    lines.push(`**Start Date**: ${task.start_date}`);
  }

  const createdDate = new Date(task.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  lines.push(`**Created**: ${createdDate}`);

  // Display attachments if present
  if (task.attachments && task.attachments.length > 0) {
    lines.push("", "## Attachments");

    // Group attachments by type
    const inlineAttachments = task.attachments.filter((a) => a.is_inline);
    const regularAttachments = task.attachments.filter((a) => !a.is_inline);

    if (inlineAttachments.length > 0) {
      lines.push("", "**Inline Images:**");
      for (const att of inlineAttachments) {
        const imageIcon = att.is_image ? "🖼️ " : "📎 ";
        lines.push(
          `- ${imageIcon}[${att.name}](${att.url}) (${att.size_formatted})`,
        );
      }
    }

    if (regularAttachments.length > 0) {
      lines.push("", "**Files:**");
      for (const att of regularAttachments) {
        const fileIcon = att.is_image ? "🖼️ " : "📎 ";
        lines.push(
          `- ${fileIcon}[${att.name}](${att.url}) (${att.size_formatted})`,
        );
      }
    }
  }

  if (task.url) {
    lines.push("", `[View in Productive](${task.url})`);
  }

  return lines.join("\n");
}

/**
 * Format a list of tasks as markdown
 */
export function formatTaskListMarkdown(
  tasks: FormattedTask[],
  total?: number,
): string {
  if (tasks.length === 0) {
    return "No tasks found.";
  }

  const lines = ["# Tasks", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} tasks`, "");
  }

  for (const task of tasks) {
    const status = task.closed ? "✓" : "○";
    const taskNum = task.number ? `#${task.number}` : task.id;
    lines.push(`${status} **${taskNum}**: ${task.title}`);

    if (task.project_name) {
      lines.push(`  Project: ${task.project_name}`);
    }

    if (task.due_date) {
      lines.push(`  Due: ${task.due_date}`);
    }

    if (task.url) {
      lines.push(`  [View](${task.url})`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format project for display
 */
export function formatProject(
  project: Project,
  includedData?: unknown[],
): FormattedProject {
  const attributes = project.attributes as ProjectAttributes;

  // Extract client/company info from relationships and included data
  let clientId: string | null = null;
  let clientName: string | null = null;

  if (
    project.relationships?.company?.data &&
    "id" in project.relationships.company.data
  ) {
    clientId = project.relationships.company.data.id;

    // Try to find company name in included data
    if (includedData) {
      const company = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "companies" &&
          "id" in item &&
          (item as { id: unknown }).id === clientId,
      );
      if (company?.attributes?.name) {
        clientName = company.attributes.name;
      }
    }
  }

  return {
    id: project.id,
    name: attributes.name,
    project_number: attributes.project_number || null,
    archived: attributes.archived,
    client_id: clientId,
    client_name: clientName,
  };
}

/**
 * Format projects as markdown
 */
export function formatProjectListMarkdown(
  projects: FormattedProject[],
): string {
  if (projects.length === 0) {
    return "No projects found.";
  }

  const lines = ["# Projects", ""];

  for (const project of projects) {
    const status = project.archived ? "[Archived]" : "[Active]";
    const projectNum = project.project_number
      ? `(${project.project_number})`
      : "";
    lines.push(`- **${project.name}** ${projectNum} ${status}`);
    lines.push(`  ID: ${project.id}`);
    if (project.client_name) {
      lines.push(`  Client: ${project.client_name} (ID: ${project.client_id})`);
    } else if (project.client_id) {
      lines.push(`  Client ID: ${project.client_id}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format task list for display
 */
export function formatTaskList(taskList: TaskList): FormattedTaskList {
  const attributes = taskList.attributes as TaskListAttributes;

  // Extract relationship IDs
  const boardData = taskList.relationships?.board?.data as {
    id: string;
  } | null;
  const projectData = taskList.relationships?.project?.data as {
    id: string;
  } | null;

  return {
    id: taskList.id,
    name: attributes.name || "",
    position: attributes.position ?? null,
    sort_order: null, // Set by caller based on API return order
    archived: attributes.archived_at !== null,
    board_id: boardData?.id ?? null,
    project_id: projectData?.id ?? null,
  };
}

/**
 * Format task lists as markdown
 */
export function formatTaskListsMarkdown(
  taskLists: FormattedTaskList[],
): string {
  if (taskLists.length === 0) {
    return "No task lists found for this project.";
  }

  const lines = ["# Task Lists", ""];

  for (const list of taskLists) {
    const status = list.archived ? "(Inactive)" : "(Active)";
    lines.push(`- **${list.name}** ${status}`);
    lines.push(`  ID: ${list.id}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single task list as markdown
 */
export function formatSingleTaskListMarkdown(
  taskList: FormattedTaskList,
): string {
  const status = taskList.archived ? "Archived" : "Active";
  const lines = [
    `# Task List: ${taskList.name}`,
    "",
    `**ID**: ${taskList.id}`,
    `**Status**: ${status}`,
  ];

  if (taskList.position !== null) {
    lines.push(`**Position**: ${taskList.position}`);
  }

  if (taskList.board_id) {
    lines.push(`**Board ID**: ${taskList.board_id}`);
  }

  if (taskList.project_id) {
    lines.push(`**Project ID**: ${taskList.project_id}`);
  }

  return lines.join("\n");
}

/**
 * Format board for display
 */
export function formatBoard(board: Board): FormattedBoard {
  const attributes = board.attributes as BoardAttributes;

  return {
    id: board.id,
    name: attributes.name || "",
    position: attributes.position ?? null,
    archived: attributes.archived_at !== null,
  };
}

/**
 * Format boards as markdown
 */
export function formatBoardsMarkdown(boards: FormattedBoard[]): string {
  if (boards.length === 0) {
    return "No boards found for this project.";
  }

  const lines = ["# Boards", ""];

  for (const board of boards) {
    const status = board.archived ? "(Archived)" : "(Active)";
    lines.push(`- **${board.name}** ${status}`);
    lines.push(`  ID: ${board.id}`);
    if (board.position !== null) {
      lines.push(`  Position: ${board.position}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
/**
 * Format person for display
 */
export function formatPerson(person: Person): FormattedPerson {
  const attributes = person.attributes as PersonAttributes;

  // Handle null/undefined last names
  const firstName = attributes.first_name || "";
  const lastName = attributes.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "Unknown";

  return {
    id: person.id,
    name: fullName,
    email: attributes.email || "No email",
    active: attributes.active !== undefined ? attributes.active : true,
  };
}

/**
 * Format people as markdown
 */
export function formatPeopleListMarkdown(people: FormattedPerson[]): string {
  if (people.length === 0) {
    return "No people found.";
  }

  const lines = ["# People", ""];

  for (const person of people) {
    const status = person.active ? "[Active]" : "[Inactive]";
    lines.push(`- **${person.name}** ${status}`);
    lines.push(`  Email: ${person.email}`);
    lines.push(`  ID: ${person.id}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format batch operation summary as markdown
 */
export function formatBatchSummaryMarkdown(
  summary: BatchOperationSummary,
): string {
  const lines = [
    "# Batch Task Creation Results",
    "",
    `**Total**: ${summary.total}`,
    `**Successful**: ${summary.successful}`,
    `**Failed**: ${summary.failed}`,
    "",
  ];

  if (summary.successful > 0) {
    lines.push("## Successfully Created Tasks", "");

    for (const result of summary.results) {
      if (result.success && result.task) {
        const taskNum = result.task.number
          ? `#${result.task.number}`
          : result.task.id;
        lines.push(`✓ **${taskNum}**: ${result.task.title}`);
        if (result.task.url) {
          lines.push(`  [View](${result.task.url})`);
        }
        lines.push("");
      }
    }
  }

  if (summary.failed > 0) {
    lines.push("## Failed Tasks", "");

    for (const result of summary.results) {
      if (!result.success) {
        lines.push(`✗ **${result.title}**`);
        lines.push(`  Error: ${result.error}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Truncate response if it exceeds character limit
 */
export function truncateResponse(
  content: string,
  format: ResponseFormat,
): string {
  if (content.length <= CHARACTER_LIMIT) {
    return content;
  }

  const truncated = content.substring(0, CHARACTER_LIMIT);
  const truncationMessage =
    format === "markdown"
      ? "\n\n---\n**Response truncated.** Use `limit` and `offset` parameters to paginate through results."
      : "\n\n[Response truncated. Use limit and offset parameters to paginate.]";

  return truncated + truncationMessage;
}

/**
 * Format response based on format preference
 */
export function formatResponse(
  data: unknown,
  format: ResponseFormat,
  markdownFormatter?: () => string,
): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  if (markdownFormatter) {
    return markdownFormatter();
  }

  // Fallback to JSON if no markdown formatter provided
  return JSON.stringify(data, null, 2);
}

/**
 * Format a budget for display
 */
export function formatBudget(
  budget: Budget,
  orgId: string,
  includedData?: unknown[],
): FormattedBudget {
  const attributes = budget.attributes as BudgetAttributes;

  // Extract relationship data
  let projectId: string | null = null;
  let projectName: string | null = null;
  let companyId: string | null = null;
  let companyName: string | null = null;
  let responsibleId: string | null = null;
  let responsibleName: string | null = null;

  if (
    budget.relationships?.project?.data &&
    "id" in budget.relationships.project.data
  ) {
    projectId = budget.relationships.project.data.id;

    if (includedData) {
      const project = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "projects" &&
          "id" in item &&
          (item as { id: unknown }).id === projectId,
      );
      if (project?.attributes?.name) {
        projectName = project.attributes.name;
      }
    }
  }

  if (
    budget.relationships?.company?.data &&
    "id" in budget.relationships.company.data
  ) {
    companyId = budget.relationships.company.data.id;

    if (includedData) {
      const company = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "companies" &&
          "id" in item &&
          (item as { id: unknown }).id === companyId,
      );
      if (company?.attributes?.name) {
        companyName = company.attributes.name;
      }
    }
  }

  if (
    budget.relationships?.responsible?.data &&
    "id" in budget.relationships.responsible.data
  ) {
    responsibleId = budget.relationships.responsible.data.id;

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
          (item as { id: unknown }).id === responsibleId,
      );
      if (person?.attributes) {
        const firstName = person.attributes.first_name || "";
        const lastName = person.attributes.last_name || "";
        responsibleName = `${firstName} ${lastName}`.trim() || null;
      }
    }
  }

  return {
    id: budget.id,
    name: attributes.name,
    status: attributes.budget_status === 1 ? "open" : "closed",
    start_date: attributes.date || null,
    end_date: attributes.end_date || null,
    delivered_on: attributes.delivered_on || null,
    total: attributes.total || null,
    currency: attributes.currency || null,
    project_id: projectId,
    project_name: projectName,
    company_id: companyId,
    company_name: companyName,
    responsible_id: responsibleId,
    responsible_name: responsibleName,
    created_at: attributes.created_at,
    url: budget.id
      ? `https://app.productive.io/${orgId}/deals/${budget.id}`
      : null,
  };
}

/**
 * Format budgets as markdown list
 */
export function formatBudgetListMarkdown(
  budgets: FormattedBudget[],
  total?: number,
): string {
  if (budgets.length === 0) {
    return "No budgets found.";
  }

  const lines = ["# Budgets", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} budgets`, "");
  }

  for (const budget of budgets) {
    const statusIcon = budget.status === "open" ? "Open" : "Closed";
    const deliveredBadge = budget.delivered_on ? " [Delivered]" : "";
    lines.push(`- **${budget.name}** (${statusIcon})${deliveredBadge}`);
    lines.push(`  ID: ${budget.id}`);

    if (budget.project_name) {
      lines.push(`  Project: ${budget.project_name}`);
    }

    if (budget.total && budget.currency) {
      lines.push(`  Total: ${budget.currency} ${budget.total}`);
    }

    if (budget.end_date) {
      lines.push(`  End Date: ${budget.end_date}`);
    }

    if (budget.delivered_on) {
      lines.push(`  Delivered: ${budget.delivered_on}`);
    }

    if (budget.url) {
      lines.push(`  [View](${budget.url})`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single budget as markdown
 */
export function formatSingleBudgetMarkdown(budget: FormattedBudget): string {
  const lines = [`# Budget: ${budget.name}`, ""];

  lines.push(`**ID**: ${budget.id}`);
  lines.push(`**Status**: ${budget.status === "open" ? "Open" : "Closed"}`);

  if (budget.total && budget.currency) {
    lines.push(`**Total**: ${budget.currency} ${budget.total}`);
  }

  if (budget.start_date) {
    lines.push(`**Start Date**: ${budget.start_date}`);
  }

  if (budget.end_date) {
    lines.push(`**End Date**: ${budget.end_date}`);
  }

  if (budget.delivered_on) {
    lines.push(`**Delivered On**: ${budget.delivered_on}`);
  }

  if (budget.project_name) {
    lines.push(
      `**Project**: ${budget.project_name} (ID: ${budget.project_id})`,
    );
  } else if (budget.project_id) {
    lines.push(`**Project ID**: ${budget.project_id}`);
  }

  if (budget.company_name) {
    lines.push(
      `**Company**: ${budget.company_name} (ID: ${budget.company_id})`,
    );
  } else if (budget.company_id) {
    lines.push(`**Company ID**: ${budget.company_id}`);
  }

  if (budget.responsible_name) {
    lines.push(
      `**Responsible**: ${budget.responsible_name} (ID: ${budget.responsible_id})`,
    );
  } else if (budget.responsible_id) {
    lines.push(`**Responsible ID**: ${budget.responsible_id}`);
  }

  const createdDate = new Date(budget.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  lines.push(`**Created**: ${createdDate}`);

  if (budget.url) {
    lines.push("", `[View in Productive](${budget.url})`);
  }

  return lines.join("\n");
}

/**
 * Format budget audit results as markdown
 */
export function formatBudgetAuditMarkdown(result: BudgetAuditResult): string {
  const lines = ["# Budget Audit Report", ""];

  lines.push(`**Budgets Checked**: ${result.total_budgets_checked}`);
  lines.push(`**Issues Found**: ${result.issues_found}`);
  lines.push("");

  if (result.issues.length > 0) {
    lines.push("## Issues", "");

    for (const issue of result.issues) {
      const issueIcon =
        issue.issue_type === "expired_end_date"
          ? "Warning: Expired"
          : issue.issue_type === "no_end_date"
            ? "Warning: No End Date"
            : "Info";
      lines.push(`### ${issueIcon}: ${issue.budget_name}`);
      lines.push(`- **Budget ID**: ${issue.budget_id}`);
      if (issue.project_name) {
        lines.push(`- **Project**: ${issue.project_name}`);
      }
      lines.push(`- **Issue**: ${issue.details}`);
      lines.push("");
    }
  }

  if (result.projects_without_open_budget.length > 0) {
    lines.push("## Projects Without Open Budgets", "");

    for (const project of result.projects_without_open_budget) {
      lines.push(`- **${project.project_name}** (ID: ${project.project_id})`);
    }
    lines.push("");
  }

  if (result.issues_found === 0) {
    lines.push("All budgets are healthy with valid end dates.");
  }

  return lines.join("\n");
}

/**
 * Format a revenue distribution for display
 */
export function formatRevenueDistribution(
  distribution: RevenueDistribution,
  includedData?: unknown[],
): FormattedRevenueDistribution {
  const attributes = distribution.attributes as RevenueDistributionAttributes;

  // Extract relationship data
  let dealId: string | null = null;
  let dealName: string | null = null;
  let projectId: string | null = null;
  let projectName: string | null = null;

  if (
    distribution.relationships?.deal?.data &&
    "id" in distribution.relationships.deal.data
  ) {
    dealId = distribution.relationships.deal.data.id;

    if (includedData) {
      const deal = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
          relationships?: {
            project?: { data?: { id?: string } };
          };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "deals" &&
          "id" in item &&
          (item as { id: unknown }).id === dealId,
      );
      if (deal?.attributes?.name) {
        dealName = deal.attributes.name;
      }
      if (deal?.relationships?.project?.data?.id) {
        projectId = deal.relationships.project.data.id;

        // Try to find project name
        const project = includedData.find(
          (
            item,
          ): item is {
            type: string;
            id: string;
            attributes?: { name?: string };
          } =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            (item as { type: unknown }).type === "projects" &&
            "id" in item &&
            (item as { id: unknown }).id === projectId,
        );
        if (project?.attributes?.name) {
          projectName = project.attributes.name;
        }
      }
    }
  }

  return {
    id: distribution.id,
    start_on: attributes.start_on,
    end_on: attributes.end_on,
    amount_percent: attributes.amount_percent,
    deal_id: dealId,
    deal_name: dealName,
    project_id: projectId,
    project_name: projectName,
    created_at: attributes.created_at,
  };
}

/**
 * Format revenue distributions as markdown list
 */
export function formatRevenueDistributionListMarkdown(
  distributions: FormattedRevenueDistribution[],
  total?: number,
): string {
  if (distributions.length === 0) {
    return "No revenue distributions found.";
  }

  const lines = ["# Revenue Distributions", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} distributions`, "");
  }

  for (const dist of distributions) {
    lines.push(
      `- **${dist.start_on} to ${dist.end_on}** (${dist.amount_percent}%)`,
    );
    lines.push(`  ID: ${dist.id}`);

    if (dist.deal_name) {
      lines.push(`  Budget: ${dist.deal_name}`);
    } else if (dist.deal_id) {
      lines.push(`  Budget ID: ${dist.deal_id}`);
    }

    if (dist.project_name) {
      lines.push(`  Project: ${dist.project_name}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single revenue distribution as markdown
 */
export function formatSingleRevenueDistributionMarkdown(
  distribution: FormattedRevenueDistribution,
): string {
  const lines = ["# Revenue Distribution", ""];

  lines.push(`**ID**: ${distribution.id}`);
  lines.push(`**Start Date**: ${distribution.start_on}`);
  lines.push(`**End Date**: ${distribution.end_on}`);
  lines.push(`**Amount**: ${distribution.amount_percent}%`);

  if (distribution.deal_name) {
    lines.push(
      `**Budget**: ${distribution.deal_name} (ID: ${distribution.deal_id})`,
    );
  } else if (distribution.deal_id) {
    lines.push(`**Budget ID**: ${distribution.deal_id}`);
  }

  if (distribution.project_name) {
    lines.push(
      `**Project**: ${distribution.project_name} (ID: ${distribution.project_id})`,
    );
  } else if (distribution.project_id) {
    lines.push(`**Project ID**: ${distribution.project_id}`);
  }

  const createdDate = new Date(distribution.created_at).toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    },
  );
  lines.push(`**Created**: ${createdDate}`);

  return lines.join("\n");
}

/**
 * Format overdue distributions report as markdown
 */
export function formatOverdueDistributionsMarkdown(
  report: OverdueDistributionReport,
): string {
  const lines = ["# Overdue Revenue Distributions Report", ""];

  lines.push(`**Total Distributions Checked**: ${report.total_checked}`);
  lines.push(`**Overdue Distributions**: ${report.overdue_count}`);
  lines.push("");

  if (report.overdue_distributions.length > 0) {
    lines.push("## Overdue Items", "");

    for (const item of report.overdue_distributions) {
      const deliveredStatus = item.budget_delivered
        ? " [Budget Delivered]"
        : " [Not Delivered]";
      lines.push(
        `### ${item.distribution.deal_name || item.distribution.deal_id}${deliveredStatus}`,
      );
      lines.push(`- **Distribution ID**: ${item.distribution.id}`);
      lines.push(`- **End Date**: ${item.distribution.end_on}`);
      lines.push(`- **Days Overdue**: ${item.days_overdue}`);
      if (item.distribution.project_name) {
        lines.push(`- **Project**: ${item.distribution.project_name}`);
      }
      lines.push(`- **Amount**: ${item.distribution.amount_percent}%`);
      lines.push("");
    }
  } else {
    lines.push("No overdue revenue distributions found.");
  }

  return lines.join("\n");
}

// Billing type and unit ID mappings
const BILLING_TYPE_MAP: Record<number, string> = {
  1: "Fixed",
  2: "Time and Materials",
  3: "Non-Billable",
};

const UNIT_MAP: Record<number, string> = {
  1: "Hour",
  2: "Piece",
  3: "Day",
};

/**
 * Format a service for display
 */
export function formatService(
  service: Service,
  includedData?: unknown[],
): FormattedService {
  const attributes = service.attributes as ServiceAttributes;

  // Extract relationship data
  let dealId: string | null = null;
  let dealName: string | null = null;
  let serviceTypeId: string | null = null;
  let serviceTypeName: string | null = null;
  let personId: string | null = null;
  let personName: string | null = null;

  if (
    service.relationships?.deal?.data &&
    "id" in service.relationships.deal.data
  ) {
    dealId = service.relationships.deal.data.id;

    if (includedData) {
      const deal = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "deals" &&
          "id" in item &&
          (item as { id: unknown }).id === dealId,
      );
      if (deal?.attributes?.name) {
        dealName = deal.attributes.name;
      }
    }
  }

  if (
    service.relationships?.service_type?.data &&
    "id" in service.relationships.service_type.data
  ) {
    serviceTypeId = service.relationships.service_type.data.id;

    if (includedData) {
      const serviceType = includedData.find(
        (
          item,
        ): item is {
          type: string;
          id: string;
          attributes?: { name?: string };
        } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: unknown }).type === "service_types" &&
          "id" in item &&
          (item as { id: unknown }).id === serviceTypeId,
      );
      if (serviceType?.attributes?.name) {
        serviceTypeName = serviceType.attributes.name;
      }
    }
  }

  if (
    service.relationships?.person?.data &&
    "id" in service.relationships.person.data
  ) {
    personId = service.relationships.person.data.id;

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
          (item as { id: unknown }).id === personId,
      );
      if (person?.attributes) {
        const firstName = person.attributes.first_name || "";
        const lastName = person.attributes.last_name || "";
        personName = `${firstName} ${lastName}`.trim() || null;
      }
    }
  }

  return {
    id: service.id,
    name: attributes.name,
    description: attributes.description || null,
    billing_type:
      BILLING_TYPE_MAP[attributes.billing_type_id] ||
      `Unknown (${attributes.billing_type_id})`,
    unit: UNIT_MAP[attributes.unit_id] || `Unknown (${attributes.unit_id})`,
    price: attributes.price || null,
    quantity: attributes.quantity || null,
    billable: attributes.billable,
    time_tracking_enabled: attributes.time_tracking_enabled,
    expense_tracking_enabled: attributes.expense_tracking_enabled,
    booking_tracking_enabled: attributes.booking_tracking_enabled,
    budget_cap_enabled: attributes.budget_cap_enabled,
    budgeted_time: attributes.budgeted_time || null,
    worked_time: attributes.worked_time || null,
    revenue: attributes.revenue || null,
    cost: attributes.cost || null,
    profit: attributes.profit || null,
    profit_margin: attributes.profit_margin || null,
    budget_total: attributes.budget_total || null,
    budget_used: attributes.budget_used || null,
    deal_id: dealId,
    deal_name: dealName,
    service_type_id: serviceTypeId,
    service_type_name: serviceTypeName,
    person_id: personId,
    person_name: personName,
  };
}

/**
 * Format services as markdown list
 */
export function formatServiceListMarkdown(
  services: FormattedService[],
  total?: number,
): string {
  if (services.length === 0) {
    return "No services found.";
  }

  const lines = ["# Services", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} services`, "");
  }

  for (const service of services) {
    const billableTag = service.billable ? "" : " [Non-Billable]";
    lines.push(`- **${service.name}** (${service.billing_type})${billableTag}`);
    lines.push(`  ID: ${service.id}`);

    if (service.service_type_name) {
      lines.push(`  Type: ${service.service_type_name}`);
    }

    if (service.deal_name) {
      lines.push(`  Budget: ${service.deal_name}`);
    } else if (service.deal_id) {
      lines.push(`  Budget ID: ${service.deal_id}`);
    }

    if (service.price) {
      const unitLabel = service.unit ? `/${service.unit.toLowerCase()}` : "";
      lines.push(`  Price: ${service.price}${unitLabel}`);
    }

    if (service.person_name) {
      lines.push(`  Person: ${service.person_name}`);
    }

    const tracking: string[] = [];
    if (service.time_tracking_enabled) tracking.push("Time");
    if (service.expense_tracking_enabled) tracking.push("Expense");
    if (service.booking_tracking_enabled) tracking.push("Booking");
    if (tracking.length > 0) {
      lines.push(`  Tracking: ${tracking.join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single service as markdown
 */
export function formatSingleServiceMarkdown(service: FormattedService): string {
  const lines = [`# Service: ${service.name}`, ""];

  lines.push(`**ID**: ${service.id}`);
  lines.push(`**Billing Type**: ${service.billing_type}`);
  lines.push(`**Unit**: ${service.unit}`);
  lines.push(`**Billable**: ${service.billable ? "Yes" : "No"}`);

  if (service.description) {
    lines.push(`**Description**: ${service.description}`);
  }

  if (service.price) {
    lines.push(`**Price**: ${service.price}`);
  }

  if (service.quantity) {
    lines.push(`**Quantity**: ${service.quantity}`);
  }

  if (service.service_type_name) {
    lines.push(
      `**Service Type**: ${service.service_type_name} (ID: ${service.service_type_id})`,
    );
  } else if (service.service_type_id) {
    lines.push(`**Service Type ID**: ${service.service_type_id}`);
  }

  if (service.deal_name) {
    lines.push(`**Budget**: ${service.deal_name} (ID: ${service.deal_id})`);
  } else if (service.deal_id) {
    lines.push(`**Budget ID**: ${service.deal_id}`);
  }

  if (service.person_name) {
    lines.push(`**Person**: ${service.person_name} (ID: ${service.person_id})`);
  } else if (service.person_id) {
    lines.push(`**Person ID**: ${service.person_id}`);
  }

  // Tracking section
  lines.push("");
  lines.push("## Tracking");
  lines.push(
    `- Time: ${service.time_tracking_enabled ? "Enabled" : "Disabled"}`,
  );
  lines.push(
    `- Expense: ${service.expense_tracking_enabled ? "Enabled" : "Disabled"}`,
  );
  lines.push(
    `- Booking: ${service.booking_tracking_enabled ? "Enabled" : "Disabled"}`,
  );
  lines.push(
    `- Budget Cap: ${service.budget_cap_enabled ? "Enabled" : "Disabled"}`,
  );

  // Financial section (if any data available)
  const hasFinancials =
    service.revenue || service.cost || service.profit || service.budget_total;
  if (hasFinancials) {
    lines.push("");
    lines.push("## Financials");

    if (service.revenue) {
      lines.push(`- Revenue: ${service.revenue}`);
    }
    if (service.cost) {
      lines.push(`- Cost: ${service.cost}`);
    }
    if (service.profit) {
      lines.push(`- Profit: ${service.profit}`);
    }
    if (service.profit_margin) {
      lines.push(`- Profit Margin: ${service.profit_margin}%`);
    }
    if (service.budget_total) {
      lines.push(`- Budget Total: ${service.budget_total}`);
    }
    if (service.budget_used) {
      lines.push(`- Budget Used: ${service.budget_used}`);
    }
  }

  // Time section (if any data available)
  const hasTime = service.budgeted_time || service.worked_time;
  if (hasTime) {
    lines.push("");
    lines.push("## Time");

    if (service.budgeted_time) {
      lines.push(`- Budgeted: ${(service.budgeted_time / 60).toFixed(1)}h`);
    }
    if (service.worked_time) {
      lines.push(`- Worked: ${(service.worked_time / 60).toFixed(1)}h`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a service type for display
 */
export function formatServiceType(
  serviceType: ServiceType,
): FormattedServiceType {
  const attributes = serviceType.attributes as ServiceTypeAttributes;

  return {
    id: serviceType.id,
    name: attributes.name,
    description: attributes.description || null,
    archived: attributes.archived_at !== null,
  };
}

/**
 * Format service types as markdown list
 */
export function formatServiceTypeListMarkdown(
  serviceTypes: FormattedServiceType[],
  total?: number,
): string {
  if (serviceTypes.length === 0) {
    return "No service types found.";
  }

  const lines = ["# Service Types", ""];

  if (total !== undefined) {
    lines.push(`**Total**: ${total} service types`, "");
  }

  for (const st of serviceTypes) {
    const status = st.archived ? "(Archived)" : "(Active)";
    lines.push(`- **${st.name}** ${status}`);
    lines.push(`  ID: ${st.id}`);
    if (st.description) {
      lines.push(`  ${st.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single service type as markdown
 */
export function formatSingleServiceTypeMarkdown(
  serviceType: FormattedServiceType,
): string {
  const lines = [`# Service Type: ${serviceType.name}`, ""];

  lines.push(`**ID**: ${serviceType.id}`);
  lines.push(`**Status**: ${serviceType.archived ? "Archived" : "Active"}`);

  if (serviceType.description) {
    lines.push(`**Description**: ${serviceType.description}`);
  }

  return lines.join("\n");
}
