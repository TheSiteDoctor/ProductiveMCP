/**
 * Pipeline-related MCP tools
 */

import { z } from "zod";
import type { ProductiveClient } from "../client.js";
import type {
  JSONAPIResponse,
  Pipeline,
  PipelineAttributes,
  FormattedPipeline,
} from "../types.js";
import { ListPipelinesSchema } from "../schemas/pipeline.js";
import { formatResponse, truncateResponse } from "../utils/formatting.js";

function formatPipeline(pipeline: Pipeline): FormattedPipeline {
  const attrs = pipeline.attributes as PipelineAttributes;
  return {
    id: pipeline.id,
    name: attrs.name,
    position: attrs.position,
    icon_id: attrs.icon_id,
    pipeline_type_id: attrs.pipeline_type_id,
  };
}

function formatPipelinesMarkdown(
  pipelines: FormattedPipeline[],
  total?: number,
): string {
  if (pipelines.length === 0) {
    return "No pipelines found.";
  }
  const lines = ["# Pipelines", ""];
  if (total !== undefined) {
    lines.push(`**Total**: ${total} pipelines`, "");
  }
  for (const p of pipelines) {
    lines.push(`- **${p.name}** (ID: ${p.id})`);
    if (p.position !== null) lines.push(`  Position: ${p.position}`);
  }
  return lines.join("\n");
}

export async function listPipelines(
  client: ProductiveClient,
  args: z.infer<typeof ListPipelinesSchema>,
): Promise<string> {
  const pageNumber = Math.floor(args.offset / args.limit) + 1;

  // /pipelines does not support a sort param — the API returns them in
  // position order natively.
  const response = await client.get<JSONAPIResponse>("/pipelines", {
    "page[number]": pageNumber,
    "page[size]": args.limit,
  });

  const pipelines = (
    Array.isArray(response.data) ? response.data : [response.data]
  ).map((p) => formatPipeline(p as Pipeline));

  const total = response.meta?.total_count;
  const result = formatResponse(pipelines, args.response_format, () =>
    formatPipelinesMarkdown(pipelines, total),
  );
  return truncateResponse(result, args.response_format);
}
