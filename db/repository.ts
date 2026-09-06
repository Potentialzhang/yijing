import { DATABASE_VERSION, yijingDb } from "@/db/schema";
import { compareIsoTimestamps } from "@/core/date/local";
import { isValidResponseTimeMs } from "@/core/review/response-time";
import { normalizeCompassRecordForWrite } from "@/core/compass/records";
import { normalizeCompassCorrectionRecordForWrite } from "@/core/compass/correction";
import { normalizeLabSnapshotForWrite } from "@/core/iching/snapshots";
import { normalizeErratumForWrite } from "@/core/content/errata";
import { normalizeFavoriteForWrite } from "@/core/notes/favorites";
import {
  areSourceRefsEqual,
  normalizeNoteForWrite,
  normalizeSourceRefForWrite,
} from "@/core/notes/records";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";
import {
  setPreference as persistPreference,
} from "@/db/preferences";
import {
  DEFAULT_PREFERENCES,
  isValidPreferenceValue,
  type PreferenceKey,
} from "@/core/preferences";
import type {
  CompassCorrectionRecord,
  CompassRecord,
  ContentErratumRecord,
  ConceptProgress,
  FavoriteRecord,
  LabSnapshotRecord,
  ReviewAttempt,
  ReviewCardState,
  UserNote,
  UserSourceRef,
} from "@/db/schema";

export { DATABASE_VERSION };
// Keep lower-level persistence modules private to the database layer while
// exposing one application-facing entry point for domain operations.
export { DEFAULT_PREFERENCES, getPreference } from "@/db/preferences";
export { markLessonProgress, syncConceptProgress } from "@/db/progress";
export { saveReviewResult } from "@/db/review";

const preferenceWriteQueue = createSerialTaskQueue();

/** Serialize all single-preference writes that enter through the repository. */
export function setPreference(
  key: PreferenceKey,
  value: string | number | boolean,
): Promise<void> {
  return preferenceWriteQueue.enqueue(() => persistPreference(key, value));
}

export interface PreferenceSnapshot {
  theme: string;
  fontScale: string;
  dailyNewCardLimit: number;
  sessionBatchSize: number;
  lastExportAt: string;
  selfTestResult: string;
  aiAssistEnabled: boolean;
  aiAllowedScopes: string;
  aiPreviewPurpose: string;
}

const preferenceKeys: readonly PreferenceKey[] = [
  "theme",
  "fontScale",
  "dailyNewCardLimit",
  "sessionBatchSize",
  "lastExportAt",
  "selfTestResult",
  "aiAssistEnabled",
  "aiAllowedScopes",
  "aiPreviewPurpose",
];

function preferenceValue<K extends PreferenceKey>(
  key: K,
  value: unknown,
): PreferenceSnapshot[K] {
  return (isValidPreferenceValue(key, value) ? value : DEFAULT_PREFERENCES[key]) as PreferenceSnapshot[K];
}

/** Read every user preference from one server-side snapshot. */
export function readPreferenceSnapshot(): Promise<PreferenceSnapshot> {
  return yijingDb.transaction("r", yijingDb.preferences, async () => {
    const records = await yijingDb.preferences.bulkGet([...preferenceKeys]);
    const values = new Map(preferenceKeys.map((key, index) => [key, records[index]?.value]));
    return {
      theme: preferenceValue("theme", values.get("theme")),
      fontScale: preferenceValue("fontScale", values.get("fontScale")),
      dailyNewCardLimit: preferenceValue("dailyNewCardLimit", values.get("dailyNewCardLimit")),
      sessionBatchSize: preferenceValue("sessionBatchSize", values.get("sessionBatchSize")),
      lastExportAt: preferenceValue("lastExportAt", values.get("lastExportAt")),
      selfTestResult: preferenceValue("selfTestResult", values.get("selfTestResult")),
      aiAssistEnabled: preferenceValue("aiAssistEnabled", values.get("aiAssistEnabled")),
      aiAllowedScopes: preferenceValue("aiAllowedScopes", values.get("aiAllowedScopes")),
      aiPreviewPurpose: preferenceValue("aiPreviewPurpose", values.get("aiPreviewPurpose")),
    };
  });
}

export type PreferenceUpdate = {
  key: PreferenceKey;
  value: string | number | boolean;
};

/** Persist a related group of preferences atomically with one timestamp. */
export async function setPreferencesAtomically(
  updates: readonly PreferenceUpdate[],
): Promise<void> {
  const keys = updates.map((update) => update.key);
  if (new Set(keys).size !== keys.length) {
    throw new TypeError("偏好更新不能包含重复键");
  }
  updates.forEach((update) => {
    if (!isValidPreferenceValue(update.key, update.value)) {
      throw new TypeError(`偏好 ${update.key} 的值无效`);
    }
  });
  await preferenceWriteQueue.enqueue(async () => {
    const updatedAt = new Date().toISOString();
    await yijingDb.transaction("rw", yijingDb.preferences, async () => {
      await Promise.all(updates.map((update) => yijingDb.preferences.put({
        key: update.key,
        value: update.value,
        updatedAt,
      })));
    });
  });
}

export async function getExistingDatabaseVersion(): Promise<number | undefined> {
  return undefined;
}

export async function openAndNormalizeDatabase(): Promise<void> {
  return;
}

/**
 * Application-facing persistence boundary.
 *
 * UI components should use these domain operations instead of reaching into a
 * remote table. Keeping transactions here makes
 * concurrency and migration changes local to the database layer.
 */

export function listNotesByUpdatedAt(): Promise<UserNote[]> {
  return yijingDb.notes.toArray().then((records) =>
    records.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)),
  );
}

export function getNote(id: string): Promise<UserNote | undefined> {
  return yijingDb.notes.get(id);
}

function normalizeNoteForKey(id: string, record: UserNote): UserNote {
  const normalized = normalizeNoteForWrite(record);
  if (normalized.id !== id) throw new TypeError("笔记记录 ID 与原子操作目标不一致");
  return normalized;
}

export async function updateNoteAtomically(
  id: string,
  updater: (note: UserNote) => UserNote | undefined | false,
): Promise<boolean> {
  return yijingDb.transaction("rw", yijingDb.notes, async () => {
    const current = await yijingDb.notes.get(id);
    if (!current) return false;
    const next = updater(current);
    if (!next) return false;
    await yijingDb.notes.put(normalizeNoteForKey(id, next));
    return true;
  });
}

/**
 * Upsert a note and return the exact normalized record committed by the
 * transaction. Callers that render derived state (for example source counts)
 * should use this result instead of a potentially stale local snapshot.
 */
export async function upsertNoteAtomicallyResult(
  id: string,
  create: () => UserNote | undefined,
  update: (note: UserNote) => UserNote | undefined,
): Promise<UserNote | undefined> {
  return yijingDb.transaction("rw", yijingDb.notes, async () => {
    const current = await yijingDb.notes.get(id);
    const next = current ? update(current) : create();
    if (!next) return undefined;
    const normalized = normalizeNoteForKey(id, next);
    await yijingDb.notes.put(normalized);
    return normalized;
  });
}

/** Preserve the boolean API for callers that only need write success. */
export async function upsertNoteAtomically(
  id: string,
  create: () => UserNote | undefined,
  update: (note: UserNote) => UserNote | undefined,
): Promise<boolean> {
  return Boolean(await upsertNoteAtomicallyResult(id, create, update));
}

function waitForRepositoryRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Append one source reference without allowing a stale cross-tab snapshot to
 * erase another tab's append. WebKit can expose an older transaction snapshot
 * briefly after a concurrent write, so the operation performs bounded
 * read-after-write reconciliation. The source reference is compared by its
 * normalized fields, making retries idempotent.
 */
export async function appendNoteSourceRefAtomically(
  id: string,
  sourceRef: UserSourceRef,
  create: () => UserNote | undefined,
): Promise<UserNote | undefined> {
  const normalizedSourceRef = normalizeSourceRefForWrite(sourceRef);
  let latest = await upsertNoteAtomicallyResult(
    id,
    () => {
      const created = create();
      return created ? { ...created, sourceRefs: [normalizedSourceRef] } : undefined;
    },
    (note) => ({
      ...note,
      sourceRefs: note.sourceRefs.some((item) => areSourceRefsEqual(item, normalizedSourceRef))
        ? note.sourceRefs
        : [...note.sourceRefs, normalizedSourceRef],
      updatedAt: new Date().toISOString(),
    }),
  );

  // Keep checking for a short bounded window. If another tab committed a
  // stale list after our first write, a fresh transaction appends our source
  // back onto that latest list instead of silently losing it.
  for (const delayMs of [120, 360, 900]) {
    await waitForRepositoryRetry(delayMs);
    const observed = await getNote(id);
    if (!observed) return latest;
    latest = observed;
    if (observed.sourceRefs.some((item) => areSourceRefsEqual(item, normalizedSourceRef))) continue;
    latest = await upsertNoteAtomicallyResult(
      id,
      () => undefined,
      (note) => ({
        ...note,
        sourceRefs: note.sourceRefs.some((item) => areSourceRefsEqual(item, normalizedSourceRef))
          ? note.sourceRefs
          : [...note.sourceRefs, normalizedSourceRef],
        updatedAt: new Date().toISOString(),
      }),
    ) ?? latest;
  }
  return latest;
}

export function listFavorites(): Promise<FavoriteRecord[]> {
  return yijingDb.favorites.toArray();
}

export interface KnowledgeBaseSnapshot {
  notes: UserNote[];
  favorites: FavoriteRecord[];
}

/**
 * Read the two collections rendered by the personal knowledge-base page from
 * one server-side snapshot. Independent reads can otherwise straddle a write
 * from another tab and briefly show a note without its matching favorite (or
 * vice versa).
 */
export function readKnowledgeBaseSnapshot(): Promise<KnowledgeBaseSnapshot> {
  return yijingDb.transaction(
    "r",
    [yijingDb.notes, yijingDb.favorites],
    async () => {
      const [notes, favorites] = await Promise.all([
        yijingDb.notes.toArray(),
        yijingDb.favorites.toArray(),
      ]);
      return { notes, favorites };
    },
  );
}

export interface ReviewQueueSnapshot {
  dailyNewCardLimit: number;
  sessionBatchSize: number;
  reviewCardStates: ReviewCardState[];
  /** Valid local timings used only to personalize the session ETA. */
  responseTimesMs: number[];
}

/**
 * Read queue limits and card states from one server-side snapshot. Queue
 * construction must not combine a newly saved preference with an older set
 * of card states (or the reverse) when another tab changes data.
 */
export function readReviewQueueSnapshot(): Promise<ReviewQueueSnapshot> {
  return yijingDb.transaction(
    "r",
    [yijingDb.reviewCardStates, yijingDb.reviewAttempts, yijingDb.preferences],
    async () => {
      const [reviewCardStates, reviewAttempts, dailyLimitRecord, batchSizeRecord] = await Promise.all([
        yijingDb.reviewCardStates.toArray(),
        yijingDb.reviewAttempts.toArray(),
        yijingDb.preferences.get("dailyNewCardLimit"),
        yijingDb.preferences.get("sessionBatchSize"),
      ]);
      const dailyNewCardLimit = isValidPreferenceValue(
        "dailyNewCardLimit",
        dailyLimitRecord?.value,
      )
        ? dailyLimitRecord!.value as number
        : DEFAULT_PREFERENCES.dailyNewCardLimit;
      const sessionBatchSize = isValidPreferenceValue(
        "sessionBatchSize",
        batchSizeRecord?.value,
      )
        ? batchSizeRecord!.value as number
        : DEFAULT_PREFERENCES.sessionBatchSize;
      return {
        dailyNewCardLimit,
        sessionBatchSize,
        reviewCardStates,
        responseTimesMs: reviewAttempts
          .map((attempt) => attempt.responseTimeMs)
          .filter(isValidResponseTimeMs),
      };
    },
  );
}

export function getFavorite(id: string): Promise<FavoriteRecord | undefined> {
  return yijingDb.favorites.get(id);
}

export function putFavorite(record: FavoriteRecord): Promise<string> {
  return yijingDb.favorites.put(normalizeFavoriteForWrite(record));
}

export function deleteFavorite(id: string): Promise<void> {
  return yijingDb.favorites.delete(id);
}

/** Toggle a favorite from the current database value, not a stale UI snapshot. */
export async function toggleFavoriteAtomically(record: FavoriteRecord): Promise<boolean> {
  const normalized = normalizeFavoriteForWrite(record);
  return yijingDb.transaction("rw", yijingDb.favorites, async () => {
    const current = await yijingDb.favorites.get(normalized.id);
    if (current) {
      await yijingDb.favorites.delete(normalized.id);
      return false;
    }
    await yijingDb.favorites.put(normalized);
    return true;
  });
}

export function listConceptProgress(): Promise<ConceptProgress[]> {
  return yijingDb.conceptProgress.toArray();
}

export function getConceptProgress(id: string): Promise<ConceptProgress | undefined> {
  return yijingDb.conceptProgress.get(id);
}

export function listReviewCardStates(): Promise<ReviewCardState[]> {
  return yijingDb.reviewCardStates.toArray();
}

export interface StudyRecordSnapshot {
  reviewCardStates: ReviewCardState[];
  conceptProgress: ConceptProgress[];
  reviewAttempts: ReviewAttempt[];
}

/**
 * Read the records used by the dashboard and study metrics as one snapshot.
 * A set of independent table reads can otherwise straddle a write from
 * another tab and briefly show counts derived from different moments.
 */
export function readStudySnapshot(): Promise<StudyRecordSnapshot> {
  return yijingDb.transaction(
    "r",
    [yijingDb.reviewCardStates, yijingDb.conceptProgress, yijingDb.reviewAttempts],
    async () => {
      const [reviewCardStates, conceptProgress, reviewAttempts] = await Promise.all([
        yijingDb.reviewCardStates.toArray(),
        yijingDb.conceptProgress.toArray(),
        yijingDb.reviewAttempts.toArray(),
      ]);
      return { reviewCardStates, conceptProgress, reviewAttempts };
    },
  );
}

export function getReviewCardState(id: string): Promise<ReviewCardState | undefined> {
  return yijingDb.reviewCardStates.get(id);
}

export function listReviewAttempts(): Promise<ReviewAttempt[]> {
  return yijingDb.reviewAttempts.toArray();
}

export function listReviewAttemptsForCards(cardIds: readonly string[]): Promise<ReviewAttempt[]> {
  if (cardIds.length === 0) return Promise.resolve([]);
  return yijingDb.reviewAttempts.where("cardId").anyOf(cardIds).toArray();
}

export function listLabSnapshotsByUpdatedAt(): Promise<LabSnapshotRecord[]> {
  return yijingDb.labSnapshots.toArray().then((records) =>
    records.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)),
  );
}

export function addLabSnapshot(snapshot: LabSnapshotRecord): Promise<string> {
  return yijingDb.labSnapshots.add(normalizeLabSnapshotForWrite(snapshot));
}

export function listErrataForTarget(targetId: string): Promise<ContentErratumRecord[]> {
  return yijingDb.errata.where("targetId").equals(targetId).toArray();
}

export function listOpenErrata(): Promise<ContentErratumRecord[]> {
  return yijingDb.errata.where("status").equals("open").toArray();
}

export function countResolvedErrata(): Promise<number> {
  return yijingDb.errata.where("status").equals("resolved").count();
}

export interface ErrataSummarySnapshot {
  open: ContentErratumRecord[];
  resolved: number;
}

/** Read the home-page errata list and resolved count from one snapshot. */
export function readErrataSummarySnapshot(): Promise<ErrataSummarySnapshot> {
  return yijingDb.transaction("r", yijingDb.errata, async () => {
    const [open, resolved] = await Promise.all([
      yijingDb.errata.where("status").equals("open").toArray(),
      yijingDb.errata.where("status").equals("resolved").count(),
    ]);
    return { open, resolved };
  });
}

export function putErratum(record: ContentErratumRecord): Promise<string> {
  return yijingDb.errata.put(normalizeErratumForWrite(record));
}

export async function updateErratumAtomically(
  id: string,
  updater: (record: ContentErratumRecord) => ContentErratumRecord | undefined | false,
): Promise<boolean> {
  return yijingDb.transaction("rw", yijingDb.errata, async () => {
    const current = await yijingDb.errata.get(id);
    if (!current) return false;
    const next = updater(current);
    if (!next) return false;
    // Re-validate the complete record after the updater runs.  Atomic
    // read-modify-write must not become a backdoor around the same history,
    // timestamp and field invariants enforced by putErratum.
    const normalized = normalizeErratumForWrite(next);
    if (normalized.id !== id) throw new TypeError("勘误记录 ID 与原子操作目标不一致");
    await yijingDb.errata.put(normalized);
    return true;
  });
}

export function listCompassRecordsByUpdatedAt(): Promise<CompassRecord[]> {
  return yijingDb.compassRecords.toArray().then((records) =>
    records.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)),
  );
}

export function addCompassRecord(record: CompassRecord): Promise<string> {
  return yijingDb.compassRecords.add(normalizeCompassRecordForWrite(record));
}

export function listCompassCorrectionsByUpdatedAt(): Promise<CompassCorrectionRecord[]> {
  return yijingDb.compassCorrections.toArray().then((records) =>
    records.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)),
  );
}

export function addCompassCorrection(record: CompassCorrectionRecord): Promise<string> {
  return yijingDb.compassCorrections.add(normalizeCompassCorrectionRecordForWrite(record));
}
