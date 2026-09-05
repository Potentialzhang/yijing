import type { ConceptProgress, ReviewAttempt, ReviewCardState } from "@/db/schema";
import { compareIsoTimestamps, compareLocalDateStrings, formatLocalDate, isValidIsoTimestamp } from "@/core/date/local";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";

function dateFromIso(value: string): string {
  if (!isValidIsoTimestamp(value)) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatLocalDate(date);
}

export function isAttemptCorrect(attempt: Pick<ReviewAttempt, "objectiveCorrect" | "recallGrade">): boolean {
  return attempt.objectiveCorrect ?? attempt.recallGrade !== "forgot";
}

export function calculateWeeklyAccuracy(attempts: readonly ReviewAttempt[], today: string): number | null {
  const end = dayNumber(today);
  if (end === null) return null;
  const start = end - 6;
  const recent = attempts.filter((attempt) => {
    const date = dayNumber(attempt.localDate);
    return date !== null && date >= start && date <= end;
  });
  if (recent.length === 0) return null;
  return Math.round((recent.filter(isAttemptCorrect).length / recent.length) * 100);
}

/**
 * Return the percentage of today's due-card set that received an answer.
 *
 * A card answered in spaced mode is counted as completed even when the
 * learner chose “forgot”: the metric measures task completion, while recall
 * quality is reported separately. Cards still due at the end of the day are
 * included in the denominator so the rate remains meaningful before a
 * session is finished.
 */
export function calculateDueCardCompletionRate(
  attempts: readonly ReviewAttempt[],
  states: readonly ReviewCardState[],
  today: string,
): number | null {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return null;
  const stateByCard = new Map(states.map((state) => [state.cardId, state]));
  const completed = new Set(
    attempts
      .filter((attempt) => {
        const state = stateByCard.get(attempt.cardId);
        return dayNumber(attempt.localDate) === todayNumber
          && attempt.reviewMode === "spaced"
          // A missing state is an orphaned attempt, not evidence that a
          // schedulable card completed today's due task.
          && state !== undefined
          && isSupportedReviewAlgorithm(state)
          && isValidReviewState(state);
      })
      .map((attempt) => attempt.cardId),
  );
  const stillDue = new Set(
    states
      .filter((state) => {
        const dueDate = dayNumber(state.dueDate);
        return dueDate !== null
          && dueDate <= todayNumber
          && isSupportedReviewAlgorithm(state)
          && isValidReviewState(state);
      })
      .map((state) => state.cardId),
  );
  const total = new Set([...completed, ...stillDue]);
  if (total.size === 0) return null;
  return Math.round((completed.size / total.size) * 100);
}

/** Return the percentage of hexagram exercises completed without opening a hint. */
export function calculateIndependentCompletionRate(
  attempts: readonly ReviewAttempt[],
  today: string,
): number | null {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return null;
  const hexagramAttempts = attempts.filter((attempt) => {
    const date = dayNumber(attempt.localDate);
    return attempt.targetType === "hexagram" && date !== null && date <= todayNumber;
  });
  if (hexagramAttempts.length === 0) return null;
  return Math.round(
    (hexagramAttempts.filter((attempt) => attempt.hintUsed !== true).length /
      hexagramAttempts.length) *
      100,
  );
}

export function calculateStudyStreak(dates: readonly string[], today: string): number {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return 0;
  const unique = new Set(dates.filter((date) => dayNumber(date) !== null));
  let cursor = unique.has(today) ? todayNumber : todayNumber - 1;
  if (!unique.has(dayString(cursor))) return 0;
  let streak = 0;
  while (unique.has(dayString(cursor))) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

export function latestStudyPosition(
  attempts: readonly ReviewAttempt[],
  states: readonly ReviewCardState[],
  progress: readonly ConceptProgress[],
): { targetType: string; targetId: string; at: string } | null {
  const stateByCard = new Map(states.map((state) => [state.cardId, state]));
  const candidates = [
    ...attempts.map((attempt) => {
      const state = stateByCard.get(attempt.cardId);
      return state && isSupportedReviewAlgorithm(state) && isValidReviewState(state)
        ? { targetType: state.targetType, targetId: state.targetId, at: attempt.reviewedAt }
        : null;
    }),
    ...progress.filter((item) => item.lastStudiedAt).map((item) => ({ targetType: "concept", targetId: item.conceptId, at: item.lastStudiedAt! })),
  ].filter((item): item is { targetType: string; targetId: string; at: string } => item !== null && isValidIsoTimestamp(item.at));
  return candidates.sort((a, b) => compareIsoTimestamps(b.at, a.at))[0] ?? null;
}

export function studyDates(attempts: readonly ReviewAttempt[], progress: readonly ConceptProgress[]): string[] {
  return [...new Set([
    ...attempts.map((attempt) => attempt.localDate).filter((date) => dayNumber(date) !== null),
    ...progress.filter((item) => item.lastStudiedAt).map((item) => dateFromIso(item.lastStudiedAt!)),
  ].filter(Boolean))];
}

function dayNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Gregorian civil-date ordinal. Keeping this as integer calendar arithmetic
  // avoids timezone/DST behavior and does not derive dates by adding 24-hour
  // millisecond chunks.
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthOfYear = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthOfYear + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  const ordinal = era * 146097 + dayOfEra - 719468;
  return dayString(ordinal) === value ? ordinal : null;
}

function addCalendarDays(value: string, days: number): string | null {
  const number = dayNumber(value);
  if (number === null) return null;
  return dayString(number + days);
}

/** Return whether the learner returned exactly seven calendar days later. */
export function calculateSevenDayRetention(
  attempts: readonly ReviewAttempt[],
  today: string,
): boolean | null {
  const todayNumber = dayNumber(today);
  const dates = attempts
    .map((attempt) => attempt.localDate)
    .filter((date) => {
      const number = dayNumber(date);
      return number !== null && (todayNumber === null || number <= todayNumber);
    });
  if (dates.length === 0 || todayNumber === null) return null;
  const firstDate = [...new Set(dates)].sort(compareLocalDateStrings)[0];
  const targetDate = addCalendarDays(firstDate, 7);
  if (!targetDate || todayNumber < (dayNumber(targetDate) ?? Number.POSITIVE_INFINITY)) return null;
  return new Set(dates).has(targetDate);
}

/** Return the remembered/mastered percentage after intervals of at least seven days. */
export function calculateSevenDayMemoryRate(
  attempts: readonly ReviewAttempt[],
  today: string,
): number | null {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return null;
  const byCard = new Map<string, ReviewAttempt[]>();
  attempts.forEach((attempt) => {
    // Immediate practice is intentionally separate from the spaced-review
    // memory metric. Legacy attempts without reviewMode remain compatible and
    // are treated as spaced records, matching the other long-term metric.
    if (attempt.reviewMode === "immediate") return;
    const dateNumber = dayNumber(attempt.localDate);
    if (dateNumber === null || dateNumber > todayNumber) return;
    const list = byCard.get(attempt.cardId) ?? [];
    list.push(attempt);
    byCard.set(attempt.cardId, list);
  });
  let qualifying = 0;
  let remembered = 0;
  byCard.forEach((cardAttempts) => {
    const ordered = [...cardAttempts].sort((a, b) => compareLocalDateStrings(a.localDate, b.localDate) || compareIsoTimestamps(a.reviewedAt, b.reviewedAt));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = dayNumber(ordered[index - 1].localDate);
      const current = dayNumber(ordered[index].localDate);
      if (previous === null || current === null || current - previous < 7) continue;
      qualifying += 1;
      if (ordered[index].recallGrade === "remembered" || ordered[index].recallGrade === "mastered") remembered += 1;
    }
  });
  return qualifying === 0 ? null : Math.round((remembered / qualifying) * 100);
}

/** Return the percentage of weak-point episodes cleared within 14 days. */
export function calculateWeakPointImprovementRate(
  attempts: readonly ReviewAttempt[],
  today: string,
): number | null {
  const todayNumber = dayNumber(today);
  if (todayNumber === null) return null;
  const byCard = new Map<string, ReviewAttempt[]>();
  attempts.forEach((attempt) => {
    if (attempt.reviewMode === "immediate") return;
    const dateNumber = dayNumber(attempt.localDate);
    if (dateNumber === null || dateNumber > todayNumber) return;
    const list = byCard.get(attempt.cardId) ?? [];
    list.push(attempt);
    byCard.set(attempt.cardId, list);
  });

  let episodeCount = 0;
  let improved = 0;
  byCard.forEach((cardAttempts) => {
    const ordered = [...cardAttempts].sort(
      (a, b) => compareLocalDateStrings(a.localDate, b.localDate) || compareIsoTimestamps(a.reviewedAt, b.reviewedAt),
    );
    let forgetStreak = 0;
    const episodes: { startedAt: number; passStreak: number; improved: boolean }[] = [];
    let active: (typeof episodes)[number] | null = null;
    ordered.forEach((attempt) => {
      const current = dayNumber(attempt.localDate);
      if (current === null) return;
      if (active && current - active.startedAt > 14) {
        active = null;
        forgetStreak = 0;
      }
      if (attempt.recallGrade === "forgot") {
        forgetStreak += 1;
        if (!active && forgetStreak >= 2) {
          active = { startedAt: current, passStreak: 0, improved: false };
          episodes.push(active);
        }
        return;
      }

      forgetStreak = 0;
      if (!active) return;
      active.passStreak += 1;
      if (active.passStreak >= 2) {
        active.improved = true;
        active = null;
      }
    });
    const observed = episodes.filter((episode) => todayNumber - episode.startedAt >= 14);
    episodeCount += observed.length;
    improved += observed.filter((episode) => episode.improved).length;
  });
  return episodeCount === 0 ? null : Math.round((improved / episodeCount) * 100);
}

export interface PeriodSummary {
  days: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number | null;
  activeDays: number;
  forgottenAttempts: number;
  dailyCounts: readonly { date: string; total: number; correct: number }[];
}

export function summarizePeriod(attempts: readonly ReviewAttempt[], today: string, days: number): PeriodSummary {
  const safeDays = Math.max(1, Math.floor(days));
  const end = dayNumber(today);
  if (end === null) {
    return { days: safeDays, totalAttempts: 0, correctAttempts: 0, accuracy: null, activeDays: 0, forgottenAttempts: 0, dailyCounts: [] };
  }
  const start = end - safeDays + 1;
  const dates = Array.from({ length: safeDays }, (_, index) => dayString(start + index));
  const dateSet = new Set(dates);
  const filtered = attempts.filter((attempt) => dateSet.has(attempt.localDate));
  const dailyCounts = dates.map((date) => {
    const dayAttempts = filtered.filter((attempt) => attempt.localDate === date);
    return { date, total: dayAttempts.length, correct: dayAttempts.filter(isAttemptCorrect).length };
  });
  const correctAttempts = filtered.filter(isAttemptCorrect).length;
  return { days: safeDays, totalAttempts: filtered.length, correctAttempts, accuracy: filtered.length ? Math.round((correctAttempts / filtered.length) * 100) : null, activeDays: dailyCounts.filter((item) => item.total > 0).length, forgottenAttempts: filtered.filter((attempt) => attempt.recallGrade === "forgot").length, dailyCounts };
}

function dayString(number: number): string {
  const shifted = number + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  const fullYear = year + (month <= 2 ? 1 : 0);
  return `${String(fullYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
