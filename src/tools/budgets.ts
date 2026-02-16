/**
 * Budget-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Budget,
  FormattedBudget,
  UpdateBudgetPayload,
  BudgetAuditResult,
  BudgetAuditIssue,
} from "../types.js";
import {
  formatBudget,
  formatBudgetListMarkdown,
  formatSingleBudgetMarkdown,
  formatBudgetAuditMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  ListBudgetsSchema,
  GetBudgetSchema,
  UpdateBudgetSchema,
  MarkBudgetDeliveredSchema,
  CloseBudgetSchema,
  AuditProjectBudgetsSchema,
} from "../schemas/budget.js";

/**
 * List budgets
 */
export async function listBudgets(
  client: ProductiveClient,
  args: z.infer<typeof ListBudgetsSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "filter[type]": 2, // type 2 = budgets (type 1 = deals)
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "project,company,responsible",
  };

  // Apply filters
  if (args.project_id) {
    params["filter[project_id]"] = args.project_id;
  }

  if (args.company_id) {
    params["filter[company_id]"] = args.company_id;
  }

  if (args.responsible_id) {
    params["filter[responsible_id]"] = args.responsible_id;
  }

  if (args.status) {
    // budget_status: 1=open, 2=closed
    params["filter[budget_status]"] = args.status === "open" ? 1 : 2;
  }

  if (args.recurring !== undefined) {
    params["filter[recurring]"] = args.recurring;
  }

  const response = await client.get<JSONAPIResponse>("/deals", params);

  const budgets = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((budget) =>
    formatBudget(budget as Budget, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(budgets, args.response_format, () =>
    formatBudgetListMarkdown(budgets, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single budget by ID
 */
export async function getBudget(
  client: ProductiveClient,
  args: z.infer<typeof GetBudgetSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    include: "project,company,responsible",
  };

  const response = await client.get<JSONAPIResponse>(
    `/deals/${args.budget_id}`,
    params,
  );

  const budgetData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const budget = formatBudget(
    budgetData as Budget,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(budget, args.response_format, () =>
    formatSingleBudgetMarkdown(budget),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a budget
 */
export async function updateBudget(
  client: ProductiveClient,
  args: z.infer<typeof UpdateBudgetSchema>,
): Promise<string> {
  const payload: UpdateBudgetPayload = {
    data: {
      type: "deals",
      id: args.budget_id,
      attributes: {},
    },
  };

  if (args.name !== undefined) {
    payload.data.attributes!.name = args.name;
  }

  if (args.end_date !== undefined) {
    payload.data.attributes!.end_date = args.end_date;
  }

  if (args.delivered_on !== undefined) {
    payload.data.attributes!.delivered_on = args.delivered_on;
  }

  const response = await client.patch<JSONAPIResponse>(
    `/deals/${args.budget_id}`,
    payload,
  );

  // Fetch the updated budget with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/deals/${args.budget_id}`,
    { include: "project,company,responsible" },
  );

  const budgetData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const budget = formatBudget(
    budgetData as Budget,
    client.getOrgId(),
    getResponse.included,
  );

  const result = formatResponse(
    budget,
    args.response_format,
    () =>
      `Budget updated successfully:\n\n${formatSingleBudgetMarkdown(budget)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Mark a budget as delivered
 */
export async function markBudgetDelivered(
  client: ProductiveClient,
  args: z.infer<typeof MarkBudgetDeliveredSchema>,
): Promise<string> {
  const payload: UpdateBudgetPayload = {
    data: {
      type: "deals",
      id: args.budget_id,
      attributes: {
        delivered_on: args.delivered_on,
      },
    },
  };

  await client.patch<JSONAPIResponse>(`/deals/${args.budget_id}`, payload);

  // Fetch the updated budget with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/deals/${args.budget_id}`,
    { include: "project,company,responsible" },
  );

  const budgetData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const budget = formatBudget(
    budgetData as Budget,
    client.getOrgId(),
    getResponse.included,
  );

  const result = formatResponse(
    budget,
    args.response_format,
    () =>
      `Budget marked as delivered on ${args.delivered_on}:\n\n${formatSingleBudgetMarkdown(budget)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Close a budget
 */
export async function closeBudget(
  client: ProductiveClient,
  args: z.infer<typeof CloseBudgetSchema>,
): Promise<string> {
  const payload: UpdateBudgetPayload = {
    data: {
      type: "deals",
      id: args.budget_id,
      attributes: {
        budget_status: 2, // 2 = closed
      },
    },
  };

  await client.patch<JSONAPIResponse>(`/deals/${args.budget_id}`, payload);

  // Fetch the updated budget with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/deals/${args.budget_id}`,
    { include: "project,company,responsible" },
  );

  const budgetData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const budget = formatBudget(
    budgetData as Budget,
    client.getOrgId(),
    getResponse.included,
  );

  const result = formatResponse(
    budget,
    args.response_format,
    () =>
      `Budget closed successfully:\n\n${formatSingleBudgetMarkdown(budget)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Audit project budgets for issues
 */
export async function auditProjectBudgets(
  client: ProductiveClient,
  args: z.infer<typeof AuditProjectBudgetsSchema>,
): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all open budgets
  let allBudgets: FormattedBudget[] = [];
  let currentPage = 1;
  let totalPages = 1;

  const baseParams: Record<string, unknown> = {
    "filter[type]": 2, // type 2 = budgets (type 1 = deals)
    "filter[budget_status]": 1, // Open budgets only
    "page[size]": 30,
    include: "project,company,responsible",
  };

  if (args.project_id) {
    baseParams["filter[project_id]"] = args.project_id;
  }

  // Paginate through all open budgets
  do {
    const params = { ...baseParams, "page[number]": currentPage };
    const response = await client.get<JSONAPIResponse>("/deals", params);

    const pageBudgets = (
      Array.isArray(response.data) ? response.data : [response.data]
    ).map((budget) =>
      formatBudget(budget as Budget, client.getOrgId(), response.included),
    );

    allBudgets = allBudgets.concat(pageBudgets);

    if (response.meta?.total_pages) {
      totalPages = response.meta.total_pages as number;
    }

    currentPage++;
  } while (currentPage <= totalPages);

  // Analyze budgets for issues
  const issues: BudgetAuditIssue[] = [];

  for (const budget of allBudgets) {
    // Check for missing end date
    if (!budget.end_date) {
      issues.push({
        budget_id: budget.id,
        budget_name: budget.name,
        project_id: budget.project_id,
        project_name: budget.project_name,
        issue_type: "no_end_date",
        details: "Budget has no end date set",
      });
      continue;
    }

    // Check for expired end date
    const endDate = new Date(budget.end_date);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today && !budget.delivered_on) {
      issues.push({
        budget_id: budget.id,
        budget_name: budget.name,
        project_id: budget.project_id,
        project_name: budget.project_name,
        issue_type: "expired_end_date",
        details: `End date ${budget.end_date} is in the past and budget is not delivered`,
      });
    }
  }

  // If checking a specific project, verify it has at least one open budget
  const projectsWithoutOpenBudget: Array<{
    project_id: string;
    project_name: string;
  }> = [];

  if (args.project_id && allBudgets.length === 0) {
    // Fetch project info
    try {
      const projectResponse = await client.get<JSONAPIResponse>(
        `/projects/${args.project_id}`,
      );
      const projectData = Array.isArray(projectResponse.data)
        ? projectResponse.data[0]
        : projectResponse.data;
      const projectName =
        (projectData as { attributes?: { name?: string } })?.attributes?.name ||
        "Unknown";

      projectsWithoutOpenBudget.push({
        project_id: args.project_id,
        project_name: projectName,
      });
    } catch {
      projectsWithoutOpenBudget.push({
        project_id: args.project_id,
        project_name: "Unknown",
      });
    }
  }

  const auditResult: BudgetAuditResult = {
    total_budgets_checked: allBudgets.length,
    issues_found: issues.length + projectsWithoutOpenBudget.length,
    issues,
    projects_without_open_budget: projectsWithoutOpenBudget,
  };

  const result = formatResponse(auditResult, args.response_format, () =>
    formatBudgetAuditMarkdown(auditResult),
  );

  return truncateResponse(result, args.response_format);
}
