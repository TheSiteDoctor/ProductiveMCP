/**
 * Revenue Distribution-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  RevenueDistribution,
  FormattedRevenueDistribution,
  CreateRevenueDistributionPayload,
  UpdateRevenueDistributionPayload,
  OverdueDistributionReport,
  Budget,
  BudgetAttributes,
} from "../types.js";
import {
  formatRevenueDistribution,
  formatRevenueDistributionListMarkdown,
  formatSingleRevenueDistributionMarkdown,
  formatOverdueDistributionsMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  ListRevenueDistributionsSchema,
  GetRevenueDistributionSchema,
  CreateRevenueDistributionSchema,
  UpdateRevenueDistributionSchema,
  DeleteRevenueDistributionSchema,
  ExtendRevenueDistributionSchema,
  ReportOverdueDistributionsSchema,
} from "../schemas/revenue-distribution.js";

/**
 * List revenue distributions
 */
export async function listRevenueDistributions(
  client: ProductiveClient,
  args: z.infer<typeof ListRevenueDistributionsSchema>,
): Promise<string> {
  // Calculate page number from offset and limit
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "deal,deal.project",
  };

  if (args.deal_id) {
    params["filter[deal_id]"] = args.deal_id;
  }

  const response = await client.get<JSONAPIResponse>(
    "/revenue_distributions",
    params,
  );

  const distributions = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((dist) =>
    formatRevenueDistribution(dist as RevenueDistribution, response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(distributions, args.response_format, () =>
    formatRevenueDistributionListMarkdown(distributions, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single revenue distribution by ID
 */
export async function getRevenueDistribution(
  client: ProductiveClient,
  args: z.infer<typeof GetRevenueDistributionSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    include: "deal,deal.project",
  };

  const response = await client.get<JSONAPIResponse>(
    `/revenue_distributions/${args.distribution_id}`,
    params,
  );

  const distData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const distribution = formatRevenueDistribution(
    distData as RevenueDistribution,
    response.included,
  );

  const result = formatResponse(distribution, args.response_format, () =>
    formatSingleRevenueDistributionMarkdown(distribution),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a revenue distribution
 */
export async function createRevenueDistribution(
  client: ProductiveClient,
  args: z.infer<typeof CreateRevenueDistributionSchema>,
): Promise<string> {
  const payload: CreateRevenueDistributionPayload = {
    data: {
      type: "revenue_distributions",
      attributes: {
        start_on: args.start_on,
        end_on: args.end_on,
        amount_percent: String(args.amount_percent),
      },
      relationships: {
        deal: {
          data: {
            type: "deals",
            id: args.deal_id,
          },
        },
      },
    },
  };

  const response = await client.post<JSONAPIResponse>(
    "/revenue_distributions",
    payload,
  );

  const distData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const distribution = formatRevenueDistribution(
    distData as RevenueDistribution,
    response.included,
  );

  const result = formatResponse(
    distribution,
    args.response_format,
    () =>
      `Revenue distribution created successfully:\n\n${formatSingleRevenueDistributionMarkdown(distribution)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a revenue distribution
 */
export async function updateRevenueDistribution(
  client: ProductiveClient,
  args: z.infer<typeof UpdateRevenueDistributionSchema>,
): Promise<string> {
  const payload: UpdateRevenueDistributionPayload = {
    data: {
      type: "revenue_distributions",
      id: args.distribution_id,
      attributes: {},
    },
  };

  if (args.start_on !== undefined) {
    payload.data.attributes!.start_on = args.start_on;
  }

  if (args.end_on !== undefined) {
    payload.data.attributes!.end_on = args.end_on;
  }

  if (args.amount_percent !== undefined) {
    payload.data.attributes!.amount_percent = String(args.amount_percent);
  }

  await client.patch<JSONAPIResponse>(
    `/revenue_distributions/${args.distribution_id}`,
    payload,
  );

  // Fetch the updated distribution with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/revenue_distributions/${args.distribution_id}`,
    { include: "deal,deal.project" },
  );

  const distData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const distribution = formatRevenueDistribution(
    distData as RevenueDistribution,
    getResponse.included,
  );

  const result = formatResponse(
    distribution,
    args.response_format,
    () =>
      `Revenue distribution updated successfully:\n\n${formatSingleRevenueDistributionMarkdown(distribution)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Delete a revenue distribution
 */
export async function deleteRevenueDistribution(
  client: ProductiveClient,
  args: z.infer<typeof DeleteRevenueDistributionSchema>,
): Promise<string> {
  await client.delete(`/revenue_distributions/${args.distribution_id}`);
  return `Revenue distribution ${args.distribution_id} deleted successfully.`;
}

/**
 * Extend a revenue distribution's end date
 */
export async function extendRevenueDistribution(
  client: ProductiveClient,
  args: z.infer<typeof ExtendRevenueDistributionSchema>,
): Promise<string> {
  const payload: UpdateRevenueDistributionPayload = {
    data: {
      type: "revenue_distributions",
      id: args.distribution_id,
      attributes: {
        end_on: args.new_end_on,
      },
    },
  };

  await client.patch<JSONAPIResponse>(
    `/revenue_distributions/${args.distribution_id}`,
    payload,
  );

  // Fetch the updated distribution with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/revenue_distributions/${args.distribution_id}`,
    { include: "deal,deal.project" },
  );

  const distData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const distribution = formatRevenueDistribution(
    distData as RevenueDistribution,
    getResponse.included,
  );

  const result = formatResponse(
    distribution,
    args.response_format,
    () =>
      `Revenue distribution end date extended to ${args.new_end_on}:\n\n${formatSingleRevenueDistributionMarkdown(distribution)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Report overdue revenue distributions
 */
export async function reportOverdueDistributions(
  client: ProductiveClient,
  args: z.infer<typeof ReportOverdueDistributionsSchema>,
): Promise<string> {
  // Determine the reference date (default to today)
  const asOfDate = args.as_of_date ? new Date(args.as_of_date) : new Date();
  asOfDate.setHours(0, 0, 0, 0);

  // Fetch all revenue distributions
  let allDistributions: FormattedRevenueDistribution[] = [];
  let currentPage = 1;
  let totalPages = 1;

  const baseParams: Record<string, unknown> = {
    "page[size]": 30,
    include: "deal,deal.project",
  };

  // Paginate through all distributions
  do {
    const params = { ...baseParams, "page[number]": currentPage };
    const response = await client.get<JSONAPIResponse>(
      "/revenue_distributions",
      params,
    );

    const pageDistributions = (
      Array.isArray(response.data) ? response.data : [response.data]
    ).map((dist) =>
      formatRevenueDistribution(dist as RevenueDistribution, response.included),
    );

    allDistributions = allDistributions.concat(pageDistributions);

    if (response.meta?.total_pages) {
      totalPages = response.meta.total_pages as number;
    }

    currentPage++;
  } while (currentPage <= totalPages);

  // Filter by project if specified
  if (args.project_id) {
    allDistributions = allDistributions.filter(
      (dist) => dist.project_id === args.project_id,
    );
  }

  // Find overdue distributions
  const overdueItems: Array<{
    distribution: FormattedRevenueDistribution;
    days_overdue: number;
    budget_delivered: boolean;
  }> = [];

  // Cache for budget delivery status
  const budgetDeliveryCache: Map<string, boolean> = new Map();

  for (const dist of allDistributions) {
    const endDate = new Date(dist.end_on);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < asOfDate) {
      // This distribution is overdue
      const diffTime = asOfDate.getTime() - endDate.getTime();
      const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Check if the associated budget is delivered
      let budgetDelivered = false;
      if (dist.deal_id) {
        if (budgetDeliveryCache.has(dist.deal_id)) {
          budgetDelivered = budgetDeliveryCache.get(dist.deal_id)!;
        } else {
          try {
            const budgetResponse = await client.get<JSONAPIResponse>(
              `/deals/${dist.deal_id}`,
            );
            const budgetData = Array.isArray(budgetResponse.data)
              ? budgetResponse.data[0]
              : budgetResponse.data;
            const attrs = (budgetData as Budget).attributes as BudgetAttributes;
            budgetDelivered = !!attrs.delivered_on;
            budgetDeliveryCache.set(dist.deal_id, budgetDelivered);
          } catch {
            budgetDeliveryCache.set(dist.deal_id, false);
          }
        }
      }

      overdueItems.push({
        distribution: dist,
        days_overdue: daysOverdue,
        budget_delivered: budgetDelivered,
      });
    }
  }

  // Sort by days overdue (most overdue first)
  overdueItems.sort((a, b) => b.days_overdue - a.days_overdue);

  const report: OverdueDistributionReport = {
    total_checked: allDistributions.length,
    overdue_count: overdueItems.length,
    overdue_distributions: overdueItems,
  };

  const result = formatResponse(report, args.response_format, () =>
    formatOverdueDistributionsMarkdown(report),
  );

  return truncateResponse(result, args.response_format);
}
