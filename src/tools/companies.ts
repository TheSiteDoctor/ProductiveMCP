/**
 * Company-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Company,
  CompanyAttributes,
  FormattedCompany,
} from "../types.js";
import { ListCompaniesSchema, GetCompanySchema } from "../schemas/company.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";

function formatCompany(company: Company, orgId: string): FormattedCompany {
  const attrs = company.attributes as CompanyAttributes;
  const parentId =
    company.relationships?.parent_company?.data &&
    "id" in company.relationships.parent_company.data
      ? company.relationships.parent_company.data.id
      : (attrs.parent_company_id ?? null);

  return {
    id: company.id,
    name: attrs.name,
    billing_name: attrs.billing_name,
    domain: attrs.domain,
    default_currency: attrs.default_currency,
    tag_list: attrs.tag_list || [],
    archived: attrs.archived_at !== null,
    last_activity_at: attrs.last_activity_at,
    parent_company_id: parentId,
    url: company.id
      ? `https://app.productive.io/${orgId}/companies/${company.id}`
      : null,
  };
}

function formatCompaniesMarkdown(
  companies: FormattedCompany[],
  total?: number,
): string {
  if (companies.length === 0) {
    return "No companies found.";
  }
  const lines = ["# Companies", ""];
  if (total !== undefined) {
    lines.push(`**Total**: ${total} companies`, "");
  }
  for (const c of companies) {
    const archivedBadge = c.archived ? " _(archived)_" : "";
    lines.push(`- **${c.name}**${archivedBadge}`);
    lines.push(`  ID: ${c.id}`);
    if (c.domain) lines.push(`  Domain: ${c.domain}`);
    if (c.default_currency) lines.push(`  Currency: ${c.default_currency}`);
    if (c.url) lines.push(`  [View](${c.url})`);
    lines.push("");
  }
  return lines.join("\n");
}

function formatSingleCompanyMarkdown(company: FormattedCompany): string {
  const lines = [`# ${company.name}`, "", `**ID**: ${company.id}`];
  if (company.archived) lines.push("**Status**: Archived");
  if (company.billing_name)
    lines.push(`**Billing Name**: ${company.billing_name}`);
  if (company.domain) lines.push(`**Domain**: ${company.domain}`);
  if (company.default_currency)
    lines.push(`**Default Currency**: ${company.default_currency}`);
  if (company.tag_list.length)
    lines.push(`**Tags**: ${company.tag_list.join(", ")}`);
  if (company.parent_company_id)
    lines.push(`**Parent Company ID**: ${company.parent_company_id}`);
  if (company.last_activity_at)
    lines.push(`**Last Activity**: ${company.last_activity_at}`);
  if (company.url) lines.push(`\n[View in Productive](${company.url})`);
  return lines.join("\n");
}

export async function listCompanies(
  client: ProductiveClient,
  args: z.infer<typeof ListCompaniesSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    sort: "name",
  };
  if (args.query) {
    params["filter[query]"] = args.query;
  }

  const response = await client.get<JSONAPIResponse>("/companies", params);

  const orgId = client.getOrgId();
  const companies = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((c) => formatCompany(c as Company, orgId));

  const total = response.meta?.total_count;
  const result = formatResponse(companies, args.response_format, () =>
    formatCompaniesMarkdown(companies, total),
  );
  return truncateResponse(result, args.response_format);
}

export async function getCompany(
  client: ProductiveClient,
  args: z.infer<typeof GetCompanySchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(
    `/companies/${args.company_id}`,
  );

  const orgId = client.getOrgId();
  const company = formatCompany(response.data as Company, orgId);

  const result = formatResponse(company, args.response_format, () =>
    formatSingleCompanyMarkdown(company),
  );
  return truncateResponse(result, args.response_format);
}
