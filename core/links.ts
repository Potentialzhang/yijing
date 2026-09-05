/**
 * Validate a user/source URL without accepting protocol-relative or opaque
 * values such as `http:foo`. Source references must be ordinary HTTP(S)
 * links with an explicit host.
 */
export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}
