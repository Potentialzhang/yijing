import { z } from "zod";

/**
 * Content identifiers are protocol values, not user-facing prose. Keeping
 * the raw-value check in one module lets standalone content validators enforce
 * the same rule as the aggregate build gate without silently normalising IDs.
 */
export function isTrimmedIdentifier(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

export function assertTrimmedIdentifier(value: unknown, label = "标识符"): asserts value is string {
  if (typeof value !== "string" || !isTrimmedIdentifier(value)) {
    throw new TypeError(`${label}必须是已修剪的非空字符串`);
  }
}

/**
 * Zod counterpart for serialization boundaries.  Keep this separate from
 * `z.string().trim()` deliberately: protocol identifiers must be rejected in
 * their raw form when callers bypass the normalizing UI/repository path.
 */
export const trimmedIdentifierSchema = z
  .string()
  .refine(isTrimmedIdentifier, "标识符必须是已修剪的非空字符串");
