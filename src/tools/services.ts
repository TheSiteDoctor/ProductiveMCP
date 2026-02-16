/**
 * Service and Service Type MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Service,
  FormattedService,
  CreateServicePayload,
  UpdateServicePayload,
  ServiceType,
  FormattedServiceType,
  CreateServiceTypePayload,
  UpdateServiceTypePayload,
} from "../types.js";
import {
  formatService,
  formatServiceListMarkdown,
  formatSingleServiceMarkdown,
  formatServiceType,
  formatServiceTypeListMarkdown,
  formatSingleServiceTypeMarkdown,
  formatResponse,
  truncateResponse,
} from "../utils/formatting.js";
import {
  ListServicesSchema,
  GetServiceSchema,
  CreateServiceSchema,
  UpdateServiceSchema,
  ListServiceTypesSchema,
  GetServiceTypeSchema,
  CreateServiceTypeSchema,
  UpdateServiceTypeSchema,
  ArchiveServiceTypeSchema,
} from "../schemas/service.js";

// Billing type name to ID mapping
const BILLING_TYPE_IDS: Record<string, number> = {
  Fixed: 1,
  "Time and Materials": 2,
  "Non-Billable": 3,
};

// Unit name to ID mapping
const UNIT_IDS: Record<string, number> = {
  Hour: 1,
  Piece: 2,
  Day: 3,
};

/**
 * List services
 */
export async function listServices(
  client: ProductiveClient,
  args: z.infer<typeof ListServicesSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
    include: "deal,service_type,person",
  };

  if (args.deal_id) {
    params["filter[deal_id]"] = args.deal_id;
  }

  if (args.project_id) {
    params["filter[project_id]"] = args.project_id;
  }

  if (args.person_id) {
    params["filter[person_id]"] = args.person_id;
  }

  if (args.billing_type) {
    params["filter[billing_type]"] = BILLING_TYPE_IDS[args.billing_type];
  }

  if (args.time_tracking_enabled !== undefined) {
    params["filter[time_tracking_enabled]"] = args.time_tracking_enabled;
  }

  if (args.expense_tracking_enabled !== undefined) {
    params["filter[expense_tracking_enabled]"] = args.expense_tracking_enabled;
  }

  const response = await client.get<JSONAPIResponse>("/services", params);

  const services = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((service) => formatService(service as Service, response.included));

  const total = response.meta?.total_count;

  const result = formatResponse(services, args.response_format, () =>
    formatServiceListMarkdown(services, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single service by ID
 */
export async function getService(
  client: ProductiveClient,
  args: z.infer<typeof GetServiceSchema>,
): Promise<string> {
  const params: Record<string, unknown> = {
    include: "deal,service_type,person",
  };

  const response = await client.get<JSONAPIResponse>(
    `/services/${args.service_id}`,
    params,
  );

  const serviceData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const service = formatService(serviceData as Service, response.included);

  const result = formatResponse(service, args.response_format, () =>
    formatSingleServiceMarkdown(service),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a new service
 */
export async function createService(
  client: ProductiveClient,
  args: z.infer<typeof CreateServiceSchema>,
): Promise<string> {
  const payload: CreateServicePayload = {
    data: {
      type: "services",
      attributes: {
        name: args.name,
        billing_type_id: BILLING_TYPE_IDS[args.billing_type],
        unit_id: UNIT_IDS[args.unit],
      },
      relationships: {
        deal: {
          data: {
            type: "deals",
            id: args.deal_id,
          },
        },
        service_type: {
          data: {
            type: "service_types",
            id: args.service_type_id,
          },
        },
      },
    },
  };

  if (args.description) {
    payload.data.attributes.description = args.description;
  }

  if (args.price) {
    payload.data.attributes.price = args.price;
  }

  if (args.quantity) {
    payload.data.attributes.quantity = args.quantity;
  }

  if (args.time_tracking_enabled !== undefined) {
    payload.data.attributes.time_tracking_enabled = args.time_tracking_enabled;
  }

  if (args.expense_tracking_enabled !== undefined) {
    payload.data.attributes.expense_tracking_enabled =
      args.expense_tracking_enabled;
  }

  if (args.booking_tracking_enabled !== undefined) {
    payload.data.attributes.booking_tracking_enabled =
      args.booking_tracking_enabled;
  }

  if (args.person_id) {
    payload.data.relationships.person = {
      data: {
        type: "people",
        id: args.person_id,
      },
    };
  }

  const response = await client.post<JSONAPIResponse>("/services", payload, {
    include: "deal,service_type,person",
  });

  const serviceData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const service = formatService(serviceData as Service, response.included);

  const result = formatResponse(
    service,
    args.response_format,
    () =>
      `Service created successfully:\n\n${formatSingleServiceMarkdown(service)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update an existing service
 */
export async function updateService(
  client: ProductiveClient,
  args: z.infer<typeof UpdateServiceSchema>,
): Promise<string> {
  const payload: UpdateServicePayload = {
    data: {
      type: "services",
      id: args.service_id,
      attributes: {},
    },
  };

  if (args.name !== undefined) {
    payload.data.attributes!.name = args.name;
  }

  if (args.description !== undefined) {
    payload.data.attributes!.description = args.description;
  }

  if (args.billing_type !== undefined) {
    payload.data.attributes!.billing_type_id =
      BILLING_TYPE_IDS[args.billing_type];
  }

  if (args.unit !== undefined) {
    payload.data.attributes!.unit_id = UNIT_IDS[args.unit];
  }

  if (args.price !== undefined) {
    payload.data.attributes!.price = args.price;
  }

  if (args.quantity !== undefined) {
    payload.data.attributes!.quantity = args.quantity;
  }

  if (args.time_tracking_enabled !== undefined) {
    payload.data.attributes!.time_tracking_enabled = args.time_tracking_enabled;
  }

  if (args.expense_tracking_enabled !== undefined) {
    payload.data.attributes!.expense_tracking_enabled =
      args.expense_tracking_enabled;
  }

  if (args.booking_tracking_enabled !== undefined) {
    payload.data.attributes!.booking_tracking_enabled =
      args.booking_tracking_enabled;
  }

  await client.patch<JSONAPIResponse>(`/services/${args.service_id}`, payload);

  // Fetch the updated service with includes
  const getResponse = await client.get<JSONAPIResponse>(
    `/services/${args.service_id}`,
    { include: "deal,service_type,person" },
  );

  const serviceData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const service = formatService(serviceData as Service, getResponse.included);

  const result = formatResponse(
    service,
    args.response_format,
    () =>
      `Service updated successfully:\n\n${formatSingleServiceMarkdown(service)}`,
  );

  return truncateResponse(result, args.response_format);
}

// --- Service Type Tools ---

/**
 * List service types
 */
export async function listServiceTypes(
  client: ProductiveClient,
  args: z.infer<typeof ListServiceTypesSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };

  if (args.query) {
    params["filter[query]"] = args.query;
  }

  if (args.person_id) {
    params["filter[person_id]"] = args.person_id;
  }

  const response = await client.get<JSONAPIResponse>("/service_types", params);

  const serviceTypes = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((st) => formatServiceType(st as ServiceType));

  const total = response.meta?.total_count;

  const result = formatResponse(serviceTypes, args.response_format, () =>
    formatServiceTypeListMarkdown(serviceTypes, total),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Get a single service type by ID
 */
export async function getServiceType(
  client: ProductiveClient,
  args: z.infer<typeof GetServiceTypeSchema>,
): Promise<string> {
  const response = await client.get<JSONAPIResponse>(
    `/service_types/${args.service_type_id}`,
  );

  const stData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const serviceType = formatServiceType(stData as ServiceType);

  const result = formatResponse(serviceType, args.response_format, () =>
    formatSingleServiceTypeMarkdown(serviceType),
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Create a new service type
 */
export async function createServiceType(
  client: ProductiveClient,
  args: z.infer<typeof CreateServiceTypeSchema>,
): Promise<string> {
  const payload: CreateServiceTypePayload = {
    data: {
      type: "service_types",
      attributes: {
        name: args.name,
      },
    },
  };

  if (args.description) {
    payload.data.attributes.description = args.description;
  }

  const response = await client.post<JSONAPIResponse>(
    "/service_types",
    payload,
  );

  const stData = Array.isArray(response.data)
    ? response.data[0]
    : response.data;
  const serviceType = formatServiceType(stData as ServiceType);

  const result = formatResponse(
    serviceType,
    args.response_format,
    () =>
      `Service type created successfully:\n\n${formatSingleServiceTypeMarkdown(serviceType)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Update a service type
 */
export async function updateServiceType(
  client: ProductiveClient,
  args: z.infer<typeof UpdateServiceTypeSchema>,
): Promise<string> {
  const payload: UpdateServiceTypePayload = {
    data: {
      type: "service_types",
      id: args.service_type_id,
      attributes: {},
    },
  };

  if (args.name !== undefined) {
    payload.data.attributes!.name = args.name;
  }

  if (args.description !== undefined) {
    payload.data.attributes!.description = args.description;
  }

  await client.patch<JSONAPIResponse>(
    `/service_types/${args.service_type_id}`,
    payload,
  );

  // Fetch the updated service type
  const getResponse = await client.get<JSONAPIResponse>(
    `/service_types/${args.service_type_id}`,
  );

  const stData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const serviceType = formatServiceType(stData as ServiceType);

  const result = formatResponse(
    serviceType,
    args.response_format,
    () =>
      `Service type updated successfully:\n\n${formatSingleServiceTypeMarkdown(serviceType)}`,
  );

  return truncateResponse(result, args.response_format);
}

/**
 * Archive a service type
 */
export async function archiveServiceType(
  client: ProductiveClient,
  args: z.infer<typeof ArchiveServiceTypeSchema>,
): Promise<string> {
  await client.patch<JSONAPIResponse>(
    `/service_types/${args.service_type_id}/archive`,
    {
      data: {
        type: "service_types",
        id: args.service_type_id,
      },
    },
  );

  // Fetch the archived service type
  const getResponse = await client.get<JSONAPIResponse>(
    `/service_types/${args.service_type_id}`,
  );

  const stData = Array.isArray(getResponse.data)
    ? getResponse.data[0]
    : getResponse.data;
  const serviceType = formatServiceType(stData as ServiceType);

  const result = formatResponse(
    serviceType,
    args.response_format,
    () =>
      `Service type archived successfully:\n\n${formatSingleServiceTypeMarkdown(serviceType)}`,
  );

  return truncateResponse(result, args.response_format);
}
