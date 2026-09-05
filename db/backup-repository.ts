import {
  assertBackupDataIntegrity,
  shouldImportRecord,
  summarizeImport,
  type BackupData,
  type ImportSummary,
} from "@/core/data/backup";
import { migrateErratumRecord } from "@/db/migrations";
import { yijingDb } from "@/db/schema";
import { DEFAULT_PREFERENCES, isValidPreferenceValue } from "@/core/preferences";
import { normalizeNoteForWrite } from "@/core/notes/records";

export type UserDataCounts = {
  notes: number;
  reviewAttempts: number;
  reviewCardStates: number;
  conceptProgress: number;
  favorites: number;
  preferences: number;
  labSnapshots: number;
  errata: number;
  compassRecords: number;
  compassCorrections: number;
};

const userDataTables = [
  yijingDb.notes,
  yijingDb.reviewAttempts,
  yijingDb.reviewCardStates,
  yijingDb.conceptProgress,
  yijingDb.favorites,
  yijingDb.preferences,
  yijingDb.labSnapshots,
  yijingDb.errata,
  yijingDb.compassRecords,
  yijingDb.compassCorrections,
] as const;

/** Normalize legacy errata before integrity checks or persistence. */
export function normalizeImportedBackupData(data: BackupData): BackupData {
  return {
    // Build a protocol-shaped object instead of spreading the caller's value.
    // The data-settings UI temporarily attaches `importSummary` to its pending
    // import object; that presentation metadata must never cross the backup
    // repository boundary. Copy each table and nested mutable collection so
    // the transaction works from a stable snapshot even if a caller retains
    // and mutates its parsed input after this function returns.
    notes: data.notes.map((item) => normalizeNoteForWrite({
      ...item,
      tags: [...item.tags],
      sourceRefs: item.sourceRefs.map((source) => ({ ...source })),
    })),
    reviewAttempts: data.reviewAttempts.map((item) => ({ ...item })),
    reviewCardStates: data.reviewCardStates.map((item) => ({ ...item })),
    conceptProgress: data.conceptProgress.map((item) => ({ ...item })),
    favorites: data.favorites.map((item) => ({ ...item })),
    preferences: data.preferences.map((item) => ({ ...item })),
    labSnapshots: data.labSnapshots.map((item) => ({
      ...item,
      movingPositions: [...item.movingPositions],
    })),
    errata: data.errata.map((item) => {
      const normalized = { ...item } as unknown as Record<string, unknown>;
      migrateErratumRecord(normalized);
      const next = normalized as unknown as BackupData["errata"][number];
      return {
        ...next,
        history: next.history.map((entry) => ({ ...entry })),
      };
    }),
    compassRecords: data.compassRecords.map((item) => ({ ...item })),
    compassCorrections: data.compassCorrections.map((item) => ({ ...item })),
  };
}

async function readBackupDataInCurrentTransaction(): Promise<BackupData> {
  return {
    notes: await yijingDb.notes.toArray(),
    reviewAttempts: await yijingDb.reviewAttempts.toArray(),
    reviewCardStates: await yijingDb.reviewCardStates.toArray(),
    conceptProgress: await yijingDb.conceptProgress.toArray(),
    favorites: await yijingDb.favorites.toArray(),
    preferences: await yijingDb.preferences.toArray(),
    labSnapshots: await yijingDb.labSnapshots.toArray(),
    errata: await yijingDb.errata.toArray(),
    compassRecords: await yijingDb.compassRecords.toArray(),
    compassCorrections: await yijingDb.compassCorrections.toArray(),
  };
}

export async function readBackupData(): Promise<BackupData> {
  return yijingDb.transaction("r", userDataTables, readBackupDataInCurrentTransaction);
}

export async function hasRecoverySnapshot(): Promise<boolean> {
  return Boolean(await yijingDb.recoverySnapshots.get("latest-import"));
}

export interface BackupMetadataSnapshot {
  recoveryAvailable: boolean;
  lastExportAt?: string;
}

/**
 * Read backup reminder metadata from one snapshot. The data settings page
 * renders both values together, so they should not come from different points
 * in time while an import or export is completing in another tab.
 */
export function readBackupMetadataSnapshot(): Promise<BackupMetadataSnapshot> {
  return yijingDb.transaction(
    "r",
    [yijingDb.recoverySnapshots, yijingDb.preferences],
    async () => {
      const [recovery, exportPreference] = await Promise.all([
        yijingDb.recoverySnapshots.get("latest-import"),
        yijingDb.preferences.get("lastExportAt"),
      ]);
      const lastExportAt = isValidPreferenceValue(
        "lastExportAt",
        exportPreference?.value,
      )
        ? exportPreference!.value as string
        : DEFAULT_PREFERENCES.lastExportAt;
      return {
        recoveryAvailable: Boolean(recovery),
        ...(lastExportAt ? { lastExportAt } : {}),
      };
    },
  );
}

export async function mergeBackupData(data: BackupData): Promise<ImportSummary> {
  // Keep the repository boundary safe for non-UI callers as well. The data
  // settings screen already normalizes legacy errata, but imports can also be
  // triggered by tests, migrations, or future integrations directly through
  // this domain API.
  const normalizedData = normalizeImportedBackupData(data);
  // Validate at the boundary before opening a write transaction. The UI
  // performs the same check while preparing its preview, but direct callers
  // must not start a merge with malformed references or dates.
  assertBackupDataIntegrity(normalizedData);
  let confirmedSummary: ImportSummary | null = null;
  await yijingDb.transaction(
    "rw",
    [
      ...userDataTables,
      yijingDb.recoverySnapshots,
    ],
    async () => {
      const currentData = await readBackupDataInCurrentTransaction();
      confirmedSummary = summarizeImport(normalizedData, currentData);
      await yijingDb.recoverySnapshots.put({
        id: "latest-import",
        createdAt: new Date().toISOString(),
        data: currentData,
      });

      const mergeTable = async <T extends { id: string }>(
        records: readonly T[],
        table: { bulkGet: (keys: string[]) => Promise<Array<T | undefined>>; put: (record: T) => Promise<unknown> },
        tableIndex: number,
      ) => {
        const ids = records.map((record) => String(record.id));
        const existing = await table.bulkGet(ids);
        for (const [index, record] of records.entries()) {
          if (shouldImportRecord(record, existing[index], tableIndex)) await table.put(record);
        }
      };
      const mergeKeyedTable = async <T extends Record<string, unknown>>(
        records: readonly T[],
        key: string,
        table: { bulkGet: (keys: string[]) => Promise<Array<T | undefined>>; put: (record: T) => Promise<unknown> },
        tableIndex: number,
      ) => {
        const ids = records.map((record) => String(record[key]));
        const existing = await table.bulkGet(ids);
        for (const [index, record] of records.entries()) {
          if (shouldImportRecord(record, existing[index], tableIndex)) await table.put(record);
        }
      };

      await mergeTable(normalizedData.notes, yijingDb.notes, 0);
      await mergeTable(normalizedData.reviewAttempts, yijingDb.reviewAttempts, 1);
      await mergeKeyedTable(normalizedData.reviewCardStates as unknown as Record<string, unknown>[], "cardId", yijingDb.reviewCardStates as never, 2);
      await mergeKeyedTable(normalizedData.conceptProgress as unknown as Record<string, unknown>[], "conceptId", yijingDb.conceptProgress as never, 3);
      await mergeTable(normalizedData.favorites, yijingDb.favorites, 4);
      await mergeKeyedTable(normalizedData.preferences as unknown as Record<string, unknown>[], "key", yijingDb.preferences as never, 5);
      await mergeTable(normalizedData.labSnapshots, yijingDb.labSnapshots, 6);
      await mergeTable(normalizedData.errata, yijingDb.errata, 7);
      await mergeTable(normalizedData.compassRecords, yijingDb.compassRecords, 8);
      await mergeTable(normalizedData.compassCorrections, yijingDb.compassCorrections, 9);

      assertBackupDataIntegrity(await readBackupDataInCurrentTransaction());
    },
  );
  return confirmedSummary ?? summarizeImport(normalizedData, await readBackupData());
}

export async function undoLatestImport(): Promise<boolean> {
  return yijingDb.transaction(
    "rw",
    [
      yijingDb.notes,
      yijingDb.reviewAttempts,
      yijingDb.reviewCardStates,
      yijingDb.conceptProgress,
      yijingDb.favorites,
      yijingDb.preferences,
      yijingDb.labSnapshots,
      yijingDb.errata,
      yijingDb.compassRecords,
      yijingDb.compassCorrections,
      yijingDb.recoverySnapshots,
    ],
    async () => {
      // Read the latest snapshot inside the same transaction as the restore.
      // A read before opening the transaction could capture an older import
      // while another tab is replacing the recovery snapshot.
      const snapshot = await yijingDb.recoverySnapshots.get("latest-import");
      if (!snapshot) return false;
      assertBackupDataIntegrity(snapshot.data);
      await yijingDb.notes.clear();
      await yijingDb.reviewAttempts.clear();
      await yijingDb.reviewCardStates.clear();
      await yijingDb.conceptProgress.clear();
      await yijingDb.favorites.clear();
      await yijingDb.preferences.clear();
      await yijingDb.labSnapshots.clear();
      await yijingDb.errata.clear();
      await yijingDb.compassRecords.clear();
      await yijingDb.compassCorrections.clear();
      await yijingDb.notes.bulkPut(snapshot.data.notes);
      await yijingDb.reviewAttempts.bulkPut(snapshot.data.reviewAttempts);
      await yijingDb.reviewCardStates.bulkPut(snapshot.data.reviewCardStates);
      await yijingDb.conceptProgress.bulkPut(snapshot.data.conceptProgress);
      await yijingDb.favorites.bulkPut(snapshot.data.favorites);
      await yijingDb.preferences.bulkPut(snapshot.data.preferences);
      await yijingDb.labSnapshots.bulkPut(snapshot.data.labSnapshots);
      await yijingDb.errata.bulkPut(snapshot.data.errata);
      await yijingDb.compassRecords.bulkPut(snapshot.data.compassRecords);
      await yijingDb.compassCorrections.bulkPut(snapshot.data.compassCorrections);
      await yijingDb.recoverySnapshots.delete("latest-import");
      return true;
    },
  );
}

export async function countUserData(): Promise<UserDataCounts> {
  // Keep the confirmation summary internally consistent when another tab is
  // writing at the same time. The destructive clear itself is transactional;
  // the counts shown immediately before it should come from one snapshot too.
  return yijingDb.transaction("r", userDataTables, async () => {
    const [notes, reviewAttempts, reviewCardStates, conceptProgress, favorites, preferences, labSnapshots, errata, compassRecords, compassCorrections] = await Promise.all([
      yijingDb.notes.count(),
      yijingDb.reviewAttempts.count(),
      yijingDb.reviewCardStates.count(),
      yijingDb.conceptProgress.count(),
      yijingDb.favorites.count(),
      yijingDb.preferences.count(),
      yijingDb.labSnapshots.count(),
      yijingDb.errata.count(),
      yijingDb.compassRecords.count(),
      yijingDb.compassCorrections.count(),
    ]);
    return { notes, reviewAttempts, reviewCardStates, conceptProgress, favorites, preferences, labSnapshots, errata, compassRecords, compassCorrections };
  });
}

export async function clearUserData(): Promise<void> {
  await yijingDb.transaction(
    "rw",
    [
      yijingDb.notes,
      yijingDb.reviewAttempts,
      yijingDb.reviewCardStates,
      yijingDb.conceptProgress,
      yijingDb.favorites,
      yijingDb.preferences,
      yijingDb.labSnapshots,
      yijingDb.errata,
      yijingDb.compassRecords,
      yijingDb.compassCorrections,
      yijingDb.recoverySnapshots,
    ],
    async () => {
      await Promise.all([
        yijingDb.notes.clear(),
        yijingDb.reviewAttempts.clear(),
        yijingDb.reviewCardStates.clear(),
        yijingDb.conceptProgress.clear(),
        yijingDb.favorites.clear(),
        yijingDb.preferences.clear(),
        yijingDb.labSnapshots.clear(),
        yijingDb.errata.clear(),
        yijingDb.compassRecords.clear(),
        yijingDb.compassCorrections.clear(),
        yijingDb.recoverySnapshots.clear(),
      ]);
    },
  );
}
