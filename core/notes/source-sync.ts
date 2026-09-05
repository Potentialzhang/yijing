import { compareIsoTimestamps } from "@/core/date/local";

/**
 * Decide whether a cross-tab source snapshot may replace the editor state.
 *
 * WebKit can expose a committed transaction with a timestamp captured just
 * before the local tab's write. When that snapshot contains a richer source
 * list, preferring the local timestamp would incorrectly hide the other
 * tab's committed reference. A snapshot that is both older and no richer is
 * still ignored so a delayed read cannot roll the editor back.
 */
export function shouldApplySourceRefresh(
  incomingUpdatedAt: string | undefined,
  localWriteAt: string | null,
  incomingSourceCount: number,
  currentSourceCount: number,
): boolean {
  if (!incomingUpdatedAt || !localWriteAt) return true;
  if (compareIsoTimestamps(incomingUpdatedAt, localWriteAt) >= 0) return true;
  return incomingSourceCount > currentSourceCount;
}
