/**
 * Custom field helpers shared by every path that rewrites a ticket's fields.
 */

import { CUSTOM_FIELD_IDS } from "../constants.js";

type CustomFieldValue = string | string[] | number | null | undefined;

/**
 * Merge updates onto a ticket's existing custom fields for a PATCH.
 *
 * Productive replaces the whole custom_fields hash on PATCH, so existing values
 * are sent back unchanged. The one exception is the Commit reference: clearing
 * it makes Productive's automation stamp a new reference, so it's never sent
 * as null or empty. An existing reference is sent back as-is (so it's kept),
 * and a missing one is left out rather than sent as null.
 */
export function mergeCustomFieldsForPatch(
  existing: Record<string, unknown> | undefined,
  updates: Record<string, CustomFieldValue>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing || {}), ...updates };
  const ref = CUSTOM_FIELD_IDS.COMMIT_REFERENCE;
  if (ref && ref in merged) {
    const value = merged[ref];
    if (value === null || value === undefined || String(value).trim() === "") {
      delete merged[ref];
    }
  }
  return merged;
}
