import { normalizeAiScopes } from "@/core/ai/consent";
import { compareIsoTimestamps, formatLocalDate, isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { getHexagramByLines, getHexagramByPair, toggleLines } from "@/core/iching";
import type { LinePosition, TrigramId } from "@/core/iching";
import { isValidHttpUrl } from "@/core/links";
import { REVIEW_ALGORITHM_VERSION } from "@/core/review/scheduler";
import { isValidResponseTimeMs } from "@/core/review/response-time";
import { MAX_SELF_EXPLANATION_LENGTH } from "@/core/review/records";

type LegacyRecord = Record<string, unknown>;
export type MigrationTable = { toArray: () => Promise<LegacyRecord[]>; put: (record: LegacyRecord) => Promise<unknown> };

const COMPASS_DIRECTION_IDS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;
const TRIGRAM_IDS = ["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"] as const;
const FAVORITE_TARGET_TYPES = ["concept", "trigram", "hexagram"] as const;
const NOTE_TARGET_TYPES = ["concept", "trigram", "hexagram", "hexagram_line", "session"] as const;
const REVIEW_TARGET_TYPES = ["concept", "trigram", "hexagram", "five-element"] as const;
const REVIEW_MODES = ["immediate", "spaced"] as const;
const SOURCE_KINDS = ["classic", "book", "video", "web", "personal"] as const;
const MAX_REVIEW_STEP_INDEX = 5;
const ERRATUM_KEYS = new Set([
  "id",
  "targetType",
  "targetId",
  "category",
  "description",
  "proposedText",
  "sourceRef",
  "contentVersion",
  "status",
  "history",
  "createdAt",
  "updatedAt",
]);

/**
 * Persisted timestamps are ISO instants, not arbitrary strings.  Migration
 * must repair malformed legacy values before they can affect sorting,
 * monotonic merges, or user-visible history.
 */
function isValidIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && isValidIsoTimestamp(value);
}

function isoDate(value: unknown, fallback: string): string {
  return isValidIsoDateTime(value) ? value : fallback;
}

function optionalIsoDate(value: unknown): string | undefined {
  return isValidIsoDateTime(value) ? value : undefined;
}

/** Keep legacy update timestamps compatible with current write contracts. */
function orderedUpdatedAt(value: unknown, createdAt: string): string {
  const updatedAt = isoDate(value, createdAt);
  return compareIsoTimestamps(updatedAt, createdAt) < 0 ? createdAt : updatedAt;
}

function localDate(value: unknown, fallback: string): string {
  return typeof value === "string" && isValidLocalDate(value) && isValidLocalDate(fallback) ? value : fallback;
}

/** Derive a migration fallback from the user's local calendar, not UTC text. */
function migrationLocalDate(now: string): string {
  const instant = isValidIsoDateTime(now) ? new Date(now) : new Date();
  return formatLocalDate(instant);
}

/** Recover a legacy wall-clock date without mistaking a UTC date for local time. */
function reviewedLocalDate(value: string, fallback: string): string {
  const datePart = /^(\d{4}-\d{2}-\d{2})T/.exec(value)?.[1];
  // An explicit numeric offset carries the original wall-clock date in its
  // text. A Z timestamp does not, so convert that instant to this user's local
  // calendar instead of copying its UTC date component.
  if (datePart && !value.endsWith("Z") && isValidLocalDate(datePart)) return datePart;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? fallback : formatLocalDate(instant);
}

function normalizeDegrees(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = ((parsed % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : Number(normalized.toFixed(1));
}

function directionIdAt(degrees: number): (typeof COMPASS_DIRECTION_IDS)[number] {
  return COMPASS_DIRECTION_IDS[Math.floor((degrees + 22.5) / 45) % 8];
}

/** v1 → v2: make legacy notes safe for source-aware editors. */
export function migrateNoteRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (!NOTE_TARGET_TYPES.includes(record.targetType as (typeof NOTE_TARGET_TYPES)[number])) record.targetType = "hexagram";
  if (typeof record.targetId !== "string" || !record.targetId) record.targetId = String(record.id ?? "unknown");
  if (typeof record.markdown !== "string") record.markdown = "";
  if (!Array.isArray(record.tags)) record.tags = [];
  if (!Array.isArray(record.sourceRefs)) record.sourceRefs = [];
  else {
    record.sourceRefs = record.sourceRefs
      .filter((source): source is LegacyRecord => Boolean(source) && typeof source === "object")
      .map((source) => {
        // Rebuild from the declared source schema instead of spreading the
        // legacy object. This removes typo/forward-compatibility fields that
        // the strict note writer would otherwise reject on the next edit.
        const next: LegacyRecord = {
          label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : "未命名来源",
        };
        if (SOURCE_KINDS.includes(source.kind as (typeof SOURCE_KINDS)[number])) {
          next.kind = source.kind;
        }
        for (const key of ["author", "edition", "locator"] as const) {
          if (typeof source[key] === "string" && source[key].trim()) next[key] = source[key].trim();
        }
        if (typeof source.url === "string" && isValidHttpUrl(source.url)) next.url = source.url.trim();
        if (typeof source.accessedAt === "string" && isValidLocalDate(source.accessedAt)) next.accessedAt = source.accessedAt;
        return next;
      });
  }
  record.createdAt = isoDate(record.createdAt, now);
  record.updatedAt = orderedUpdatedAt(record.updatedAt, record.createdAt as string);
  const deletedAt = optionalIsoDate(record.deletedAt);
  if (deletedAt && compareIsoTimestamps(deletedAt, record.createdAt as string) >= 0) record.deletedAt = deletedAt;
  else delete record.deletedAt;
}

/** v1 → v2: normalize old review rows without changing their historical meaning. */
export function migrateReviewAttemptRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  const fallbackDate = migrationLocalDate(now);
  if (typeof record.cardId !== "string" || !record.cardId) record.cardId = String(record.id ?? "legacy-card");
  if (typeof record.promptSnapshot !== "string") record.promptSnapshot = "";
  if (typeof record.answerSnapshot !== "string") record.answerSnapshot = "";
  if (record.exerciseVersion !== undefined && (typeof record.exerciseVersion !== "number" || !Number.isInteger(record.exerciseVersion) || record.exerciseVersion < 1)) delete record.exerciseVersion;
  if (record.targetType !== undefined && !REVIEW_TARGET_TYPES.includes(record.targetType as (typeof REVIEW_TARGET_TYPES)[number])) delete record.targetType;
  if (record.objectiveCorrect !== undefined && typeof record.objectiveCorrect !== "boolean") delete record.objectiveCorrect;
  if (record.reviewMode !== undefined && !REVIEW_MODES.includes(record.reviewMode as (typeof REVIEW_MODES)[number])) delete record.reviewMode;
  if (record.hintUsed !== undefined && typeof record.hintUsed !== "boolean") delete record.hintUsed;
  if (record.selfExplanation !== undefined) {
    if (typeof record.selfExplanation !== "string" || record.selfExplanation.trim().length > MAX_SELF_EXPLANATION_LENGTH) {
      delete record.selfExplanation;
    } else {
      const normalized = record.selfExplanation.trim();
      if (normalized) record.selfExplanation = normalized;
      else delete record.selfExplanation;
    }
  }
  if (!["forgot", "hard", "remembered", "mastered"].includes(String(record.recallGrade))) record.recallGrade = record.objectiveCorrect === false ? "forgot" : "remembered";
  const hadValidReviewedAt = isValidIsoDateTime(record.reviewedAt);
  record.reviewedAt = isoDate(record.reviewedAt, now);
  // For an existing offset-bearing timestamp, its date component is the
  // original wall-clock date. If the timestamp itself was corrupt, fall back
  // to the migration instant in the current user's local calendar.
  const reviewedDate = hadValidReviewedAt ? reviewedLocalDate(String(record.reviewedAt), fallbackDate) : fallbackDate;
  record.localDate = localDate(record.localDate, localDate(reviewedDate, fallbackDate));
  if (record.responseTimeMs !== undefined && !isValidResponseTimeMs(record.responseTimeMs)) {
    delete record.responseTimeMs;
  }
}

/** v1 → v2: normalize card state defaults so due queues remain deterministic. */
export function migrateReviewCardStateRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  const fallbackDate = migrationLocalDate(now);
  if (typeof record.cardId !== "string" || !record.cardId) record.cardId = "legacy-card";
  if (!REVIEW_TARGET_TYPES.includes(record.targetType as (typeof REVIEW_TARGET_TYPES)[number])) record.targetType = "concept";
  if (typeof record.targetId !== "string" || !record.targetId) record.targetId = record.cardId;
  // A missing field identifies a pre-v9 record. Preserve an explicit value so
  // a future algorithm version cannot be silently interpreted as the current
  // scheduler; the review runtime will reject it visibly.
  if (record.algorithmVersion === undefined) record.algorithmVersion = REVIEW_ALGORITHM_VERSION;
  if (typeof record.stepIndex !== "number" || !Number.isInteger(record.stepIndex)) record.stepIndex = 0;
  record.stepIndex = Math.max(0, Math.min(MAX_REVIEW_STEP_INDEX, record.stepIndex as number));
  record.dueDate = localDate(record.dueDate, fallbackDate);
  if (typeof record.lapseCount !== "number" || !Number.isInteger(record.lapseCount)) record.lapseCount = 0;
  record.lapseCount = Math.max(0, record.lapseCount as number);
  if (typeof record.consecutivePasses !== "number" || !Number.isInteger(record.consecutivePasses)) record.consecutivePasses = 0;
  record.consecutivePasses = Math.max(0, record.consecutivePasses as number);
  if (typeof record.consecutiveForgets !== "number" || !Number.isInteger(record.consecutiveForgets)) record.consecutiveForgets = record.isWeak === true ? 2 : 0;
  record.consecutiveForgets = Math.max(0, record.consecutiveForgets as number);
  if (typeof record.isWeak !== "boolean") record.isWeak = false;
  const lastReviewedAt = optionalIsoDate(record.lastReviewedAt);
  if (lastReviewedAt) record.lastReviewedAt = lastReviewedAt;
  else delete record.lastReviewedAt;
  record.updatedAt = isoDate(record.updatedAt, now);
}

/** v1 → v2: normalize concept progress defaults without fabricating mastery. */
export function migrateConceptProgressRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (typeof record.conceptId !== "string" || !record.conceptId) record.conceptId = "legacy-concept";
  if (!["not_started", "learning", "reviewing", "mastered"].includes(String(record.status))) record.status = "learning";
  if (typeof record.masteryScore !== "number" || !Number.isFinite(record.masteryScore)) record.masteryScore = 0;
  record.masteryScore = Math.max(0, Math.min(100, record.masteryScore as number));
  const lastStudiedAt = optionalIsoDate(record.lastStudiedAt);
  if (lastStudiedAt) record.lastStudiedAt = lastStudiedAt;
  else delete record.lastStudiedAt;
  record.updatedAt = isoDate(record.updatedAt, now);
}

/** Normalize v2 favorites so a malformed target cannot create a phantom link. */
export function migrateFavoriteRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (typeof record.id !== "string" || !record.id) record.id = "legacy-favorite";
  if (!FAVORITE_TARGET_TYPES.includes(record.targetType as (typeof FAVORITE_TARGET_TYPES)[number])) record.targetType = "concept";
  if (typeof record.targetId !== "string" || !record.targetId.trim()) record.targetId = "unknown";
  record.createdAt = isoDate(record.createdAt, now);
}

/**
 * Normalize lab snapshots at startup as well as during import.  A snapshot is
 * a derived structure, so recompute its base/changed IDs from the persisted
 * trigram pair and moving positions instead of preserving contradictory data.
 */
export function migrateLabSnapshotRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (typeof record.id !== "string" || !record.id) record.id = "legacy-lab-snapshot";
  const lowerId = TRIGRAM_IDS.includes(record.lowerTrigramId as (typeof TRIGRAM_IDS)[number])
    ? (record.lowerTrigramId as TrigramId)
    : "qian";
  const upperId = TRIGRAM_IDS.includes(record.upperTrigramId as (typeof TRIGRAM_IDS)[number])
    ? (record.upperTrigramId as TrigramId)
    : "qian";
  record.lowerTrigramId = lowerId;
  record.upperTrigramId = upperId;
  const movingPositions = Array.isArray(record.movingPositions)
    ? [...new Set(record.movingPositions.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6))]
    : [];
  record.movingPositions = movingPositions;
  const base = getHexagramByPair(lowerId, upperId);
  const changed = getHexagramByLines(toggleLines(base.lines, new Set(movingPositions as LinePosition[])));
  record.baseHexagramId = base.id;
  record.changedHexagramId = changed.id;
  if (typeof record.title !== "string" || !record.title.trim()) record.title = base.name;
  if (typeof record.note !== "string") record.note = "";
  record.createdAt = isoDate(record.createdAt, now);
  record.updatedAt = orderedUpdatedAt(record.updatedAt, record.createdAt as string);
}

/** v8: preserve a small append-only status history for content errata. */
export function migrateErratumRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  for (const key of Object.keys(record)) {
    if (!ERRATUM_KEYS.has(key)) delete record[key];
  }
  const status = record.status === "resolved" ? "resolved" : "open";
  record.status = status;
  if (typeof record.id !== "string" || !record.id) record.id = "legacy-erratum";
  if (typeof record.targetType !== "string") record.targetType = "concept";
  if (typeof record.targetId !== "string" || !record.targetId) record.targetId = "unknown";
  if (typeof record.category !== "string" || !["question", "correction"].includes(record.category)) record.category = "question";
  if (typeof record.description !== "string") record.description = "";
  if (typeof record.proposedText !== "string") record.proposedText = "";
  if (typeof record.sourceRef !== "string") record.sourceRef = "";
  if (typeof record.contentVersion !== "number" || !Number.isInteger(record.contentVersion) || record.contentVersion < 1) record.contentVersion = 1;
  record.createdAt = isoDate(record.createdAt, now);
  record.updatedAt = orderedUpdatedAt(record.updatedAt, record.createdAt as string);
  const rawHistory = Array.isArray(record.history)
    ? record.history.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        status: entry.status === "resolved" ? "resolved" : "open",
        at: isoDate(entry.at, record.createdAt as string),
      }))
    : [];
  // The current write contract treats `open` as the beginning of every
  // erratum lifecycle. Legacy rows may only have been persisted after a
  // resolved state, so add an explicit synthetic opening event instead of
  // leaving the record permanently uneditable.
  const history = rawHistory.length === 0
    ? [{ status: "open", at: record.createdAt as string }]
    : rawHistory[0].status === "open"
      ? rawHistory
      : [{ status: "open", at: record.createdAt as string }, ...rawHistory];
  let previousAt = record.createdAt as string;
  for (const entry of history) {
    if (compareIsoTimestamps(entry.at, previousAt) < 0) entry.at = previousAt;
    previousAt = entry.at;
  }
  const last = history[history.length - 1];
  if (last.status !== status) {
    const transitionAt = compareIsoTimestamps(record.updatedAt as string, last.at) < 0
      ? last.at
      : record.updatedAt as string;
    history.push({ status, at: transitionAt });
  }
  record.history = history;
}

/** v6: normalize hand-entered compass records without inventing a measurement source. */
export function migrateCompassRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (typeof record.id !== "string" || !record.id) record.id = "legacy-compass-record";
  record.degrees = normalizeDegrees(record.degrees);
  if (!COMPASS_DIRECTION_IDS.includes(record.directionId as (typeof COMPASS_DIRECTION_IDS)[number])) record.directionId = directionIdAt(record.degrees as number);
  record.layerId = "eight-directions-v1";
  record.ruleVersion = 1;
  if (typeof record.title !== "string" || !record.title.trim()) record.title = "未命名坐向";
  if (typeof record.environmentNote !== "string") record.environmentNote = "";
  record.createdAt = isoDate(record.createdAt, now);
  record.updatedAt = orderedUpdatedAt(record.updatedAt, record.createdAt as string);
}

/** v7: normalize manual sensor offsets without treating them as calibration. */
export function migrateCompassCorrectionRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  if (typeof record.id !== "string" || !record.id) record.id = "legacy-compass-correction";
  const parsed = typeof record.offsetDegrees === "number" ? record.offsetDegrees : Number(record.offsetDegrees);
  const bounded = Number.isFinite(parsed) ? Math.max(-180, Math.min(180, parsed)) : 0;
  record.offsetDegrees = Number(bounded.toFixed(1));
  if (typeof record.reason !== "string" || !record.reason.trim()) record.reason = "历史手动修正";
  record.createdAt = isoDate(record.createdAt, now);
  record.updatedAt = orderedUpdatedAt(record.updatedAt, record.createdAt as string);
}

/** Normalize persisted preferences so malformed local values cannot alter queue limits. */
export function migratePreferenceRecord(record: LegacyRecord, now = new Date().toISOString()): void {
  const key = typeof record.key === "string" ? record.key : "legacy-preference";
  record.key = key;
  if (
    (typeof record.value !== "string" && typeof record.value !== "number" && typeof record.value !== "boolean") ||
    (typeof record.value === "number" && !Number.isFinite(record.value))
  ) record.value = "";
  if (key === "theme" && !["light", "dark", "system"].includes(String(record.value))) record.value = "light";
  if (key === "fontScale" && !["normal", "large"].includes(String(record.value))) record.value = "normal";
  if (key === "dailyNewCardLimit") {
    const value = Number(record.value);
    record.value = [5, 10, 15, 20, 30].includes(value) ? value : 10;
  }
  if (key === "sessionBatchSize") {
    const value = Number(record.value);
    record.value = [10, 20, 30, 40].includes(value) ? value : 20;
  }
  if (["lastExportAt", "selfTestResult"].includes(key) && typeof record.value !== "string") record.value = "";
  if (key === "lastExportAt" && record.value !== "") {
    record.value = optionalIsoDate(record.value) ?? "";
  }
  if (key === "aiAssistEnabled" && typeof record.value !== "boolean") record.value = false;
  if (key === "aiAllowedScopes") {
    try {
      record.value = Array.isArray(JSON.parse(String(record.value)))
        ? JSON.stringify(normalizeAiScopes(JSON.parse(String(record.value))))
        : "";
    } catch {
      record.value = "";
    }
  }
  if (key === "aiPreviewPurpose" && !["study-draft", "confusion-analysis", "note-organization"].includes(String(record.value))) record.value = "study-draft";
  record.updatedAt = isoDate(record.updatedAt, now);
}

/** Idempotent repair pass for browsers that upgrade object stores but skip a callback. */
export async function normalizeCurrentRecords(tables: {
  notes: MigrationTable;
  reviewAttempts: MigrationTable;
  reviewCardStates: MigrationTable;
  conceptProgress: MigrationTable;
  favorites?: MigrationTable;
  labSnapshots?: MigrationTable;
  preferences?: MigrationTable;
  errata?: MigrationTable;
  compassRecords?: MigrationTable;
  compassCorrections?: MigrationTable;
}): Promise<void> {
  const now = new Date().toISOString();
  const notes = await tables.notes.toArray();
  for (const record of notes) { const next = { ...record }; migrateNoteRecord(next, now); await tables.notes.put(next); }
  const attempts = await tables.reviewAttempts.toArray();
  for (const record of attempts) { const next = { ...record }; migrateReviewAttemptRecord(next, now); await tables.reviewAttempts.put(next); }
  const states = await tables.reviewCardStates.toArray();
  for (const record of states) { const next = { ...record }; migrateReviewCardStateRecord(next, now); await tables.reviewCardStates.put(next); }
  const progress = await tables.conceptProgress.toArray();
  for (const record of progress) { const next = { ...record }; migrateConceptProgressRecord(next, now); await tables.conceptProgress.put(next); }
  if (tables.favorites) {
    const favorites = await tables.favorites.toArray();
    for (const record of favorites) { const next = { ...record }; migrateFavoriteRecord(next, now); await tables.favorites.put(next); }
  }
  if (tables.labSnapshots) {
    const snapshots = await tables.labSnapshots.toArray();
    for (const record of snapshots) { const next = { ...record }; migrateLabSnapshotRecord(next, now); await tables.labSnapshots.put(next); }
  }
  if (tables.preferences) {
    const preferences = await tables.preferences.toArray();
    for (const record of preferences) { const next = { ...record }; migratePreferenceRecord(next, now); await tables.preferences.put(next); }
  }
  if (tables.errata) {
    const errata = await tables.errata.toArray();
    for (const record of errata) { const next = { ...record }; migrateErratumRecord(next, now); await tables.errata.put(next); }
  }
  if (tables.compassRecords) {
    const compassRecords = await tables.compassRecords.toArray();
    for (const record of compassRecords) { const next = { ...record }; migrateCompassRecord(next, now); await tables.compassRecords.put(next); }
  }
  if (tables.compassCorrections) {
    const compassCorrections = await tables.compassCorrections.toArray();
    for (const record of compassCorrections) { const next = { ...record }; migrateCompassCorrectionRecord(next, now); await tables.compassCorrections.put(next); }
  }
}
