/**
 * Pipeline-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Schema for listing pipelines (sales pipelines used by deals).
 */
export const ListPipelinesSchema = z
  .object({
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();
