/**
 * Page-related Zod schemas
 */

import { z } from 'zod';
import {
  ResponseFormatSchema,
  LimitSchema,
  OffsetSchema,
} from './common.js';

/**
 * Valid sort fields for pages
 */
export const PAGE_SORT_FIELDS = [
  'created_at',
  'creator_name',
  'edited_at',
  'project',
  'title',
  'updated_at',
] as const;

/**
 * Schema for listing pages
 */
export const ListPagesSchema = z.object({
  project_id: z.union([z.string(), z.array(z.string())]).optional(),
  creator_id: z.string().optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
  sort_by: z.enum(PAGE_SORT_FIELDS).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for getting a specific page
 */
export const GetPageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for creating a page
 */
export const CreatePageSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
  body: z.string().optional(),
  project_id: z.string().optional(),
  parent_page_id: z.string().optional(),
  version_number: z.string().optional(),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for updating a page
 */
export const UpdatePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  title: z.string().min(1, 'Title must not be empty').max(500, 'Title must be 500 characters or less').optional(),
  body: z.string().optional().nullable(),
  response_format: ResponseFormatSchema,
}).strict();

/**
 * Schema for deleting a page
 */
export const DeletePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
}).strict();

/**
 * Schema for searching pages
 */
export const SearchPagesSchema = z.object({
  query: z.string().optional(),
  project_id: z.string().optional(),
  limit: LimitSchema,
  offset: OffsetSchema,
  response_format: ResponseFormatSchema,
}).strict();
