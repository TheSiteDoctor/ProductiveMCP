/**
 * Deal-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Deal,
  FormattedDeal,
  UpdateDealPayload,
  DealStatus,
} from "../types.js";
import {
  formatDeal,
  formatDealListMarkdown,
  formatSingleDealMarkdown,
  formatDealStatus,
  formatDealStatusListMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  ListDealsSchema,
  GetDealSchema,
  SearchDealsSchema,
  UpdateDealSchema,
  CreateDealSchema,
  CreateBudgetSchema,
  ListDealStatusesSchema,
} from "../schemas/deal.js";
import type { CreateDealPayload } from "../types.js";

const DEAL_INCLUDES =
  "project,company,responsible,deal_status,pipeline,contact";

const STAGE_STATUS_IDS: Record<string, number> = {
  open: 1,
  won: 2,
  lost: 3,
};

/**
 * List deals
 */
export async function listDeals(
  client: ProductiveClient,
  args: z.infer<typeof ListDealsSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "filter[type]": 1, // type 1 = deals (type 2 = budgets)
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: DEAL_INCLUDES,
    sort: args.sort || "-last_activity_at",
  };

  if (args.company_id) {
    params["filter[company_id]"] = args.company_id;
  }
  if (args.responsible_id) {
    params["filter[responsible_id]"] = args.responsible_id;
  }
  if (args.pipeline_id) {
    params["filter[pipeline_id]"] = args.pipeline_id;
  }
  if (args.stage_status) {
    params["filter[stage_status_id]"] = STAGE_STATUS_IDS[args.stage_status];
  }
  if (args.status_id) {
    params["filter[status_id]"] = args.status_id;
  }

  const response = await client.get<JSONAPIResponse>("/deals", params);

  const deals = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((deal) =>
    formatDeal(deal as Deal, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(deals, args.response_format, () =>
    formatDealListMarkdown(deals, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single deal by ID
 */
export async function getDeal(
  client: ProductiveClient,
  args: z.infer<typeof GetDealSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(`/deals/${args.deal_id}`, {
    include: DEAL_INCLUDES,
  });

  const deal = formatDeal(
    response.data as Deal,
    client.getOrgId(),
    response.included,
  );

  const result = formatResponse(deal, args.response_format, () =>
    formatSingleDealMarkdown(deal),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Search deals by query text
 */
export async function searchDeals(
  client: ProductiveClient,
  args: z.infer<typeof SearchDealsSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "filter[type]": 1,
    "filter[query]": args.query,
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: DEAL_INCLUDES,
    sort: "-last_activity_at",
  };

  if (args.company_id) {
    params["filter[company_id]"] = args.company_id;
  }
  if (args.pipeline_id) {
    params["filter[pipeline_id]"] = args.pipeline_id;
  }
  if (args.stage_status) {
    params["filter[stage_status_id]"] = STAGE_STATUS_IDS[args.stage_status];
  }

  const response = await client.get<JSONAPIResponse>("/deals", params);

  const deals = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((deal) =>
    formatDeal(deal as Deal, client.getOrgId(), response.included),
  );

  const total = response.meta?.total_count;

  const result = formatResponse(deals, args.response_format, () =>
    formatDealListMarkdown(deals, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a deal
 */
export async function updateDeal(
  client: ProductiveClient,
  args: z.infer<typeof UpdateDealSchema>,
): Promise<string> {
  const payload: UpdateDealPayload = {
    data: {
      type: "deals",
      id: args.deal_id,
      attributes: {},
    },
  };

  if (args.name !== undefined) {
    payload.data.attributes!.name = args.name;
  }
  if (args.probability !== undefined) {
    payload.data.attributes!.probability = args.probability;
  }
  if (args.note !== undefined) {
    // Sentinels for clearing: JSON null, empty string, or literal "null"
    // (MCP clients vary in how easily they can send a JSON null over the wire,
    // so we accept either form and translate to a true null for the API).
    const clearNote =
      args.note === null || args.note === "" || args.note === "null";
    payload.data.attributes!.note = clearNote ? null : args.note;
  }
  if (args.tag_list !== undefined) {
    payload.data.attributes!.tag_list = args.tag_list;
  }
  if (args.deal_status_id !== undefined) {
    // deal_status_id is set as an attribute, not a relationship
    payload.data.attributes!.deal_status_id = parseInt(args.deal_status_id, 10);
  }
  if (args.deal_value !== undefined) {
    payload.data.attributes!.deal_value = args.deal_value;
    // Setting deal_value without an explicit source defaults to "manual" — otherwise
    // Productive's "from_services" mode would ignore the value and recompute from services.
    if (args.deal_value_source === undefined) {
      payload.data.attributes!.deal_value_source = "manual";
    }
  }
  if (args.deal_value_source !== undefined) {
    payload.data.attributes!.deal_value_source = args.deal_value_source;
  }

  await client.patch<JSONAPIResponse>(`/deals/${args.deal_id}`, payload);

  // Re-fetch to get fresh state with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/deals/${args.deal_id}`,
    { include: DEAL_INCLUDES },
  );

  const deal = formatDeal(
    getResponse.data as Deal,
    client.getOrgId(),
    getResponse.included,
  );

  const result = formatResponse(
    deal,
    args.response_format,
    () => `Deal updated successfully:\n\n${formatSingleDealMarkdown(deal)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Convert minor-units integer (e.g. 60000 pence) to the stringified decimal
 * shape Productive returns and writes back (e.g. "60000.0"). Verified against
 * the live API on a deal with deal_value_source=manual.
 */
function formatDealValueForApi(minorUnits: number): string {
  return `${minorUnits}.0`;
}

/**
 * Create a sales deal (budget=false).
 *
 * Notes on the wire format (verified against live API):
 *  - `deal_value` must be a string in minor units ("60000.0" = £600).
 *  - `deal_value_source` defaults to "manual" when a value is supplied — leaving
 *    it as "from_services" silently zeroes the deal in the UI.
 *  - The start date attribute is `date`, not `start_date`.
 *  - Required custom fields are surfaced via 422 errors with
 *    `source.pointer = data/attributes/custom_field_<id>` — the error util in
 *    utils/errors.ts now passes those through verbatim.
 */
export async function createDeal(
  client: ProductiveClient,
  args: z.infer<typeof CreateDealSchema>,
): Promise<string> {
  const attributes: CreateDealPayload["data"]["attributes"] = {
    name: args.name,
    budget: false,
  };

  if (args.currency !== undefined) attributes.currency = args.currency;

  if (args.deal_value !== undefined) {
    attributes.deal_value = formatDealValueForApi(args.deal_value);
    attributes.deal_value_source = args.deal_value_source ?? "manual";
  } else if (args.deal_value_source !== undefined) {
    attributes.deal_value_source = args.deal_value_source;
  }

  if (args.start_date !== undefined) attributes.date = args.start_date;
  if (args.end_date !== undefined) attributes.end_date = args.end_date;
  if (args.probability !== undefined) attributes.probability = args.probability;
  attributes.deal_type_id = args.deal_type_id ?? 2;
  if (args.note !== undefined) attributes.note = args.note;
  if (args.tag_list !== undefined) attributes.tag_list = args.tag_list;
  if (args.custom_fields !== undefined)
    attributes.custom_fields = args.custom_fields;

  const relationships: CreateDealPayload["data"]["relationships"] = {
    company: { data: { type: "companies", id: args.company_id } },
  };
  if (args.responsible_id) {
    relationships.responsible = {
      data: { type: "people", id: args.responsible_id },
    };
  }
  if (args.deal_status_id) {
    relationships.deal_status = {
      data: { type: "deal_statuses", id: args.deal_status_id },
    };
  }
  if (args.pipeline_id) {
    relationships.pipeline = {
      data: { type: "pipelines", id: args.pipeline_id },
    };
  }
  if (args.project_id) {
    relationships.project = {
      data: { type: "projects", id: args.project_id },
    };
  }
  if (args.contact_id) {
    relationships.contact = {
      data: { type: "people", id: args.contact_id },
    };
  }

  const payload: CreateDealPayload = {
    data: { type: "deals", attributes, relationships },
  };

  const response = await client.post<JSONAPIResponse>("/deals", payload);
  const createdId = (
    Array.isArray(response.data) ? response.data[0] : response.data
  ).id as string;

  // Re-fetch with includes so the response carries names, not just IDs.
  const getResponse = await client.get<JSONAPIResponse>(`/deals/${createdId}`, {
    include: DEAL_INCLUDES,
  });
  const deal = formatDeal(
    getResponse.data as Deal,
    client.getOrgId(),
    getResponse.included,
  );

  const result = formatResponse(
    deal,
    args.response_format,
    () => `Deal created successfully:\n\n${formatSingleDealMarkdown(deal)}`,
  );
  return truncateResponse(result, args.response_format);
}

/**
 * Create a budget (deal with budget=true).
 */
export async function createBudget(
  client: ProductiveClient,
  args: z.infer<typeof CreateBudgetSchema>,
): Promise<string> {
  const attributes: CreateDealPayload["data"]["attributes"] = {
    name: args.name,
    budget: true,
  };

  if (args.currency !== undefined) attributes.currency = args.currency;
  if (args.start_date !== undefined) attributes.date = args.start_date;
  if (args.end_date !== undefined) attributes.end_date = args.end_date;
  if (args.note !== undefined) attributes.note = args.note;
  if (args.tag_list !== undefined) attributes.tag_list = args.tag_list;
  if (args.custom_fields !== undefined)
    attributes.custom_fields = args.custom_fields;

  const relationships: CreateDealPayload["data"]["relationships"] = {
    company: { data: { type: "companies", id: args.company_id } },
  };
  if (args.responsible_id) {
    relationships.responsible = {
      data: { type: "people", id: args.responsible_id },
    };
  }
  if (args.project_id) {
    relationships.project = {
      data: { type: "projects", id: args.project_id },
    };
  }

  const payload: CreateDealPayload = {
    data: { type: "deals", attributes, relationships },
  };

  const response = await client.post<JSONAPIResponse>("/deals", payload);
  const created = Array.isArray(response.data)
    ? response.data[0]
    : response.data;

  const result = formatResponse(
    { id: created.id, name: args.name, budget: true },
    args.response_format,
    () =>
      `Budget created successfully.\n\n- **ID**: ${created.id}\n- **Name**: ${args.name}\n- **Company ID**: ${args.company_id}\n\nUse productive_get_budget to inspect.`,
  );
  return truncateResponse(result, args.response_format);
}

/**
 * List deal statuses (pipeline stages)
 */
export async function listDealStatuses(
  client: ProductiveClient,
  args: z.infer<typeof ListDealStatusesSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "pipeline",
  };

  if (args.pipeline_id) {
    params["filter[pipeline_id]"] = args.pipeline_id;
  }

  const response = await client.get<JSONAPIResponse>("/deal_statuses", params);

  const statuses = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((status) => formatDealStatus(status as DealStatus, response.included));

  const total = response.meta?.total_count;

  const result = formatResponse(statuses, args.response_format, () =>
    formatDealStatusListMarkdown(statuses, total),
  );

  return truncateResponse(result, args.response_format);
}
