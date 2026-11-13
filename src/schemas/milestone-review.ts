/**
 * Milestone date review schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, ISO8601DateSchema } from "./common.js";

/** Holiday regions, e.g. ["england-and-wales", "us-federal"] */
export const ReviewRegionsSchema = z
  .array(z.string().min(1))
  .min(1, "Give at least one region, or leave regions out to use the configured defaults");

export const ReviewMilestoneDatesSchema = z
  .object({
    project_id: z.string().min(1, "Project ID is required"),
    regions: ReviewRegionsSchema.optional(),
    include_trading_peaks: z.boolean().default(false),
    annotate: z.boolean().default(true),
    project_start_date: ISO8601DateSchema.optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
