/**
 * Company-related Zod schemas
 */

import { z } from "zod";
import { ResponseFormatSchema, LimitSchema, OffsetSchema } from "./common.js";

/**
 * Schema for listing companies.
 */
export const ListCompaniesSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe("Free-text search across company name and other text fields"),
    limit: LimitSchema,
    offset: OffsetSchema,
    response_format: ResponseFormatSchema,
  })
  .strict();

/**
 * Schema for getting a single company by ID.
 */
export const GetCompanySchema = z
  .object({
    company_id: z.string().min(1, "Company ID is required"),
    response_format: ResponseFormatSchema,
  })
  .strict();
