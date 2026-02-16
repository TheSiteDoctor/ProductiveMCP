/**
 * Common Zod schemas
 */

import { z } from 'zod';

/**
 * Response format enum
 */
export const ResponseFormatSchema = z.enum(['markdown', 'json']).default('markdown');

/**
 * Pagination schemas
 * Using coerce to accept strings from MCP function calling and convert to numbers
 */
export const LimitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const OffsetSchema = z.coerce.number().int().min(0).default(0);

/**
 * ISO 8601 date string schema
 */
export const ISO8601DateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in ISO 8601 format (YYYY-MM-DD)'
);

/**
 * Optional ISO 8601 date (can be null to clear)
 */
export const OptionalISO8601DateSchema = z.union([
  ISO8601DateSchema,
  z.null(),
]).optional();
