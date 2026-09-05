import { formatLocalDate } from "@/core/date/local";

/** Keep date-sensitive dashboards current when a tab stays open overnight. */
export const LOCAL_DATE_ROLLOVER_POLL_MS = 60_000;
export const MIN_LOCAL_DATE_ROLLOVER_POLL_MS = 1_000;
export const MAX_LOCAL_DATE_ROLLOVER_POLL_MS = 24 * 60 * 60 * 1_000;

function normalizePollInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs)) return LOCAL_DATE_ROLLOVER_POLL_MS;
  return Math.min(
    MAX_LOCAL_DATE_ROLLOVER_POLL_MS,
    Math.max(MIN_LOCAL_DATE_ROLLOVER_POLL_MS, intervalMs),
  );
}

/**
 * Watch a local-date reader and invoke `onChange` once per date transition.
 * This adapter owns browser lifecycle listeners; the date reader and callback
 * remain injectable so the behavior is deterministic in tests.
 */
export function watchLocalDateRollover(
  readDate: () => string = formatLocalDate,
  onChange: () => void,
  intervalMs = LOCAL_DATE_ROLLOVER_POLL_MS,
): () => void {
  let active = true;
  let previous = readDate();
  const check = () => {
    if (!active) return;
    const current = readDate();
    if (current === previous) return;
    previous = current;
    onChange();
  };
  const timer = setInterval(check, normalizePollInterval(intervalMs));

  // Mobile browsers may throttle or pause interval timers in background tabs,
  // and bfcache restores can skip a visibility transition. Check both lifecycle
  // signals so date-sensitive UI catches up without waiting for the next tick.
  const hasDocument = typeof document !== "undefined";
  const hasWindow = typeof window !== "undefined";
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") check();
  };
  const handlePageShow = () => check();
  if (hasDocument) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  if (hasWindow) {
    window.addEventListener("pageshow", handlePageShow);
  }

  return () => {
    active = false;
    clearInterval(timer);
    if (hasDocument) {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    if (hasWindow) {
      window.removeEventListener("pageshow", handlePageShow);
    }
  };
}
