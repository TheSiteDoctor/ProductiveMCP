/**
 * Custom field MCP tools — discovery for create/update payloads.
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  CustomField,
  CustomFieldAttributes,
  CustomFieldOption,
  CustomFieldOptionAttributes,
  FormattedCustomField,
  FormattedCustomFieldOption,
} from "../types.js";
import { ListCustomFieldsSchema } from "../schemas/custom-field.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";

// Productive's data_type_id → human label. Sourced from observed values in
// the live API. Unknown IDs fall back to `"unknown(<id>)"` so the caller can
// still see something meaningful.
const DATA_TYPE_LABELS: Record<number, string> = {
  1: "text",
  2: "number",
  3: "select",
  4: "date",
  5: "multi_select",
  6: "url",
  7: "email",
  8: "currency",
  9: "person",
  10: "attachment",
  11: "boolean",
};

function dataTypeLabel(id: number): string {
  return DATA_TYPE_LABELS[id] ?? `unknown(${id})`;
}

function formatOption(option: CustomFieldOption): FormattedCustomFieldOption {
  const attrs = option.attributes as CustomFieldOptionAttributes;
  return {
    id: option.id,
    name: attrs.name,
    archived: attrs.archived_at !== null,
  };
}

function formatCustomField(
  field: CustomField,
  options: FormattedCustomFieldOption[] | null,
): FormattedCustomField {
  const attrs = field.attributes as CustomFieldAttributes;
  return {
    id: field.id,
    name: attrs.name,
    description: attrs.description,
    data_type_id: attrs.data_type_id,
    data_type: dataTypeLabel(attrs.data_type_id),
    customizable_type: attrs.customizable_type,
    required: attrs.required,
    archived: attrs.archived_at !== null,
    position: attrs.position,
    options,
  };
}

function formatCustomFieldsMarkdown(
  fields: FormattedCustomField[],
  total?: number,
): string {
  if (fields.length === 0) {
    return "No custom fields found.";
  }
  const lines = ["# Custom Fields", ""];
  if (total !== undefined) {
    lines.push(`**Total**: ${total} custom fields`, "");
  }
  for (const f of fields) {
    const reqBadge = f.required ? " ⚠️ REQUIRED" : "";
    const archBadge = f.archived ? " _(archived)_" : "";
    lines.push(`## ${f.name}${reqBadge}${archBadge}`);
    lines.push(`- ID: \`${f.id}\``);
    lines.push(`- Type: ${f.data_type} (data_type_id=${f.data_type_id})`);
    lines.push(`- Attached to: \`${f.customizable_type}\``);
    if (f.description) lines.push(`- Description: ${f.description}`);
    if (f.options && f.options.length > 0) {
      lines.push("- Options:");
      for (const opt of f.options) {
        const archived = opt.archived ? " _(archived)_" : "";
        lines.push(`  - \`${opt.id}\` — ${opt.name}${archived}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Fetch options for select / multi-select custom fields.
 */
async function fetchOptions(
  client: ProductiveClient,
  customFieldId: string,
): Promise<FormattedCustomFieldOption[]> {
  // /custom_field_options doesn't accept a sort param; the API returns options
  // in position order natively.
  const response = await client.get<JSONAPIResponse>("/custom_field_options", {
    "filter[custom_field_id]": customFieldId,
    "page[size]": 200,
  });
  const items = Array.isArray(response.data) ? response.data : [response.data];
  return items
    .filter((item) => item !== null)
    .map((opt) => formatOption(opt as CustomFieldOption));
}

export async function listCustomFields(
  client: ProductiveClient,
  args: z.infer<typeof ListCustomFieldsSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  const params: Record<string, unknown> = {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  };
  if (args.customizable_type) {
    params["filter[customizable_type]"] = args.customizable_type;
  }

  const response = await client.get<JSONAPIResponse>("/custom_fields", params);

  const rawFields = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).filter((item) => item !== null) as CustomField[];

  // Filter archived unless requested.
  const visibleFields = args.include_archived
    ? rawFields
    : rawFields.filter(
        (f) => (f.attributes as CustomFieldAttributes).archived_at === null,
      );

  // For select / multi-select types, fetch options if requested.
  const fields: FormattedCustomField[] = [];
  for (const f of visibleFields) {
    const attrs = f.attributes as CustomFieldAttributes;
    let options: FormattedCustomFieldOption[] | null = null;
    if (
      args.include_options &&
      (attrs.data_type_id === 3 || attrs.data_type_id === 5)
    ) {
      options = await fetchOptions(client, f.id);
    }
    fields.push(formatCustomField(f, options));
  }

  const total = response.meta?.total_count;
  const result = formatResponse(fields, args.response_format, () =>
    formatCustomFieldsMarkdown(fields, total),
  );
  return truncateResponse(result, args.response_format);
}
