/**
 * Best-effort BroadcastChannel delivery for local data-change notifications.
 *
 * IndexedDB writes are authoritative; a notification is only a cache-refresh
 * hint. A browser may close a channel while a tab is being suspended, so a
 * failed post must never escape into the write caller or be treated as a
 * failed persistence operation.
 */
export function tryPostDataChanged(
  channel: Pick<BroadcastChannel, "postMessage"> | null,
  changedAt: number,
): boolean {
  if (!channel) return false;
  try {
    channel.postMessage({ changedAt });
    return true;
  } catch {
    return false;
  }
}
