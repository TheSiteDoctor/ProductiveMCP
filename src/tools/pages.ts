/**
 * Page-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Page,
  CreatePagePayload,
  UpdatePagePayload,
  FormattedPage,
  Project,
  Person,
} from "../types.js";
import {
  formatResponse,
  truncateResponse,
  markdownToProductiveDoc,
} from "../utils/formatting.js";
import {
  ListPagesSchema,
  GetPageSchema,
  CreatePageSchema,
  UpdatePageSchema,
  DeletePageSchema,
  SearchPagesSchema,
} from "../schemas/page.js";

/**
 * Format a page for display
 */
function formatPage(
  page: Page,
  orgId: string,
  included?: any[],
): FormattedPage {
  const attributes = page.attributes!;

  // Extract project ID and name from relationships
  let projectId: string | null = null;
  let projectName: string | null = null;
  if (
    page.relationships?.project?.data &&
    "id" in page.relationships.project.data
  ) {
    projectId = page.relationships.project.data.id;

    // Find project in included resources
    if (included) {
      const project = included.find(
        (item) => item.type === "projects" && item.id === projectId,
      ) as Project | undefined;
      if (project?.attributes) {
        projectName = project.attributes.name;
      }
    }
  }

  // Extract creator ID and name from relationships
  let creatorId: string | null = null;
  let creatorName: string | null = null;
  if (
    page.relationships?.creator?.data &&
    "id" in page.relationships.creator.data
  ) {
    creatorId = page.relationships.creator.data.id;

    // Find creator in included resources
    if (included) {
      const creator = included.find(
        (item) => item.type === "people" && item.id === creatorId,
      ) as Person | undefined;
      if (creator?.attributes) {
        creatorName =
          `${creator.attributes.first_name} ${creator.attributes.last_name}`.trim();
      }
    }
  }

  // Construct URL
  const url = projectId
    ? `https://app.productive.io/1-${orgId}/pages/${page.id}`
    : null;

  return {
    id: page.id,
    title: attributes.title,
    body: attributes.body || null,
    created_at: attributes.created_at,
    updated_at: attributes.updated_at,
    edited_at: attributes.edited_at || null,
    parent_page_id: attributes.parent_page_id || null,
    root_page_id: attributes.root_page_id || null,
    public_access: attributes.public_access,
    public_uuid: attributes.public_uuid || null,
    version_number: attributes.version_number || null,
    project_id: projectId,
    project_name: projectName,
    creator_id: creatorId,
    creator_name: creatorName,
    url,
  };
}

/**
 * Format page as markdown
 */
function formatPageMarkdown(page: FormattedPage, fullContent = false): string {
  let markdown = `# ${page.title}\n\n`;
  markdown += `**Page ID**: ${page.id}\n`;

  if (page.project_name) {
    markdown += `**Project**: ${page.project_name}\n`;
  }

  markdown += `**Created**: ${new Date(page.created_at).toLocaleDateString()}\n`;
  markdown += `**Updated**: ${new Date(page.updated_at).toLocaleDateString()}\n`;

  if (page.edited_at) {
    markdown += `**Last Activity**: ${new Date(page.edited_at).toLocaleDateString()}\n`;
  }

  if (page.creator_name) {
    markdown += `**Creator**: ${page.creator_name}\n`;
  }

  markdown += `**Public**: ${page.public_access ? "Yes" : "No"}\n`;

  if (page.version_number) {
    markdown += `**Version**: ${page.version_number}\n`;
  }

  if (page.url) {
    markdown += `**URL**: ${page.url}\n`;
  }

  // Add content section
  if (page.body) {
    markdown += `\n## Content\n\n`;
    if (fullContent) {
      markdown += `${page.body}\n`;
    } else {
      // Show preview (first 200 chars)
      const preview =
        page.body.length > 200
          ? page.body.substring(0, 200) + "..."
          : page.body;
      markdown += `${preview}\n`;
    }
  }

  // Add hierarchical info if applicable
  if (page.parent_page_id || page.root_page_id) {
    markdown += `\n---\n\n`;
    if (page.parent_page_id) {
      markdown += `**Parent Page ID**: ${page.parent_page_id}\n`;
    }
    if (page.root_page_id) {
      markdown += `**Root Page ID**: ${page.root_page_id}\n`;
    }
  }

  return markdown;
}

/**
 * Format list of pages as markdown
 */
function formatPageListMarkdown(
  pages: FormattedPage[],
  total?: number,
): string {
  if (pages.length === 0) {
    return "No pages found.";
  }

  const totalText =
    total !== undefined
      ? ` (showing ${pages.length} of ${total})`
      : ` (${pages.length})`;
  let markdown = `# Pages${totalText}\n\n`;

  pages.forEach((page, index) => {
    if (index > 0) {
      markdown += "\n---\n\n";
    }

    markdown += `## ${page.title}\n`;

    if (page.url) {
      markdown += `**Link**: ${page.url}\n`;
    }

    if (page.project_name) {
      markdown += `**Project**: ${page.project_name}\n`;
    }

    markdown += `**ID**: ${page.id}\n`;
    markdown += `**Created**: ${new Date(page.created_at).toLocaleDateString()}\n`;
    markdown += `**Updated**: ${new Date(page.updated_at).toLocaleDateString()}\n`;

    if (page.creator_name) {
      markdown += `**Creator**: ${page.creator_name}\n`;
    }

    // Add body preview if available
    if (page.body) {
      const preview =
        page.body.length > 200
          ? page.body.substring(0, 200) + "..."
          : page.body;
      markdown += `\n${preview}\n`;
    }
  });

  return markdown;
}

/**
 * List pages
 */
export async function listPages(
  client: ProductiveClient,
  args: z.infer<typeof ListPagesSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  // Productive API uses page[number] (1-indexed) and page[size] per JSON:API spec
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };

  // Add filters
  if (args.project_id) {
    if (Array.isArray(args.project_id)) {
      params["filter[project_id]"] = args.project_id.join(",");
    } else {
      params["filter[project_id]"] = args.project_id;
    }
  }
  if (args.creator_id) {
    params["filter[creator_id]"] = args.creator_id;
  }

  // Add sorting
  if (args.sort_by) {
    const sortOrder = args.sort_order || "desc";
    params["sort"] = sortOrder === "desc" ? `-${args.sort_by}` : args.sort_by;
  }

  const response = await client.get<JSONAPIResponse>("/pages", params);

  const pages = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((page) =>
    formatPage(page as Page, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(
    { pages, total, count: pages.length },
    args.response_format,
    () => formatPageListMarkdown(pages, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a specific page
 */
export async function getPage(
  client: ProductiveClient,
  args: z.infer<typeof GetPageSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(`/pages/${args.page_id}`);

  const pageData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const page = formatPage(
    pageData as Page,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(
    page,
    args.response_format,
    () => formatPageMarkdown(page, true), // Show full content
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a page
 */
export async function createPage(
  client: ProductiveClient,
  args: z.infer<typeof CreatePageSchema>,
): Promise<string> {
  const payload: CreatePagePayload = {
    data: {
      type: "pages",
      attributes: {
        title: args.title,
      },
    },
  };

  // Add optional attributes
  // Convert Markdown to Productive Document Format (Productive expects JSON document structure)
  if (args.body !== undefined) {
    payload.data.attributes.body = markdownToProductiveDoc(args.body);
  }
  if (args.version_number) {
    payload.data.attributes.version_number = args.version_number;
  }

  // Add optional relationships
  if (args.project_id) {
    payload.data.relationships = payload.data.relationships || {};
    payload.data.relationships.project = {
      data: {
        type: "projects",
        id: args.project_id,
      },
    };
  }

  if (args.parent_page_id) {
    payload.data.relationships = payload.data.relationships || {};
    payload.data.relationships.parent_page = {
      data: {
        type: "pages",
        id: args.parent_page_id,
      },
    };
  }

  const response = await client.post<JSONAPIResponse>("/pages", payload);

  const pageData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const page = formatPage(
    pageData as Page,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(
    page,
    args.response_format,
    () => `Page created successfully:\n\n${formatPageMarkdown(page, true)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a page
 */
export async function updatePage(
  client: ProductiveClient,
  args: z.infer<typeof UpdatePageSchema>,
): Promise<string> {
  const payload: UpdatePagePayload = {
    data: {
      type: "pages",
      id: args.page_id,
    },
  };

  // Build attributes object only if there are attributes to update
  const attributes: Record<string, unknown> = {};

  if (args.title !== undefined) {
    attributes.title = args.title;
  }
  // Convert Markdown to Productive Document Format (Productive expects JSON document structure)
  // If body is null, pass it directly (to clear content); if string, convert it
  if (args.body !== undefined) {
    attributes.body =
      args.body === null ? null : markdownToProductiveDoc(args.body);
  }

  if (Object.keys(attributes).length > 0) {
    payload.data.attributes = attributes;
  }

  const response = await client.patch<JSONAPIResponse>(
    `/pages/${args.page_id}`,
    payload,
  );

  const pageData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const page = formatPage(
    pageData as Page,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(
    page,
    args.response_format,
    () => `Page updated successfully:\n\n${formatPageMarkdown(page, true)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a page
 */
export async function deletePage(
  client: ProductiveClient,
  args: z.infer<typeof DeletePageSchema>,
): Promise<string> {
  await client.delete(`/pages/${args.page_id}`);
  return `Page ${args.page_id} deleted successfully.`;
}

/**
 * Search pages
 */
export async function searchPages(
  client: ProductiveClient,
  args: z.infer<typeof SearchPagesSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  // Productive API uses page[number] (1-indexed) and page[size] per JSON:API spec
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };

  // Add filters
  if (args.query) {
    params["filter[title]"] = args.query;
  }
  if (args.project_id) {
    params["filter[project_id]"] = args.project_id;
  }

  const response = await client.get<JSONAPIResponse>("/pages", params);

  const pages = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((page) =>
    formatPage(page as Page, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(
    { pages, total, count: pages.length },
    args.response_format,
    () => formatPageListMarkdown(pages, total),
  );

  return truncateResponse(result, args.response_format);
}
