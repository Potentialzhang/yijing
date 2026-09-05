import Dexie, { type EntityTable } from "dexie";
import {
  migrateConceptProgressRecord,
  migrateNoteRecord,
  migrateReviewAttemptRecord,
  migrateReviewCardStateRecord,
  migrateErratumRecord,
  migrateCompassRecord,
  migrateCompassCorrectionRecord,
  migratePreferenceRecord,
} from "@/db/migrations";
import type { CompassDirectionId } from "@/core/compass/directions";
import type { BackupData } from "@/core/data/backup";

export const DATABASE_VERSION = 11 as const;

export interface UserNote {
  id: string;
  targetType: "concept" | "trigram" | "hexagram" | "hexagram_line" | "session";
  targetId: string;
  title?: string;
  markdown: string;
  tags: string[];
  sourceRefs: UserSourceRef[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type SourceKind = "classic" | "book" | "video" | "web" | "personal";

export interface UserSourceRef {
  label: string;
  /** Optional for backwards-compatible v1 notes; new references always set it. */
  kind?: SourceKind;
  author?: string;
  edition?: string;
  locator?: string;
  url?: string;
  accessedAt?: string;
}

export interface FavoriteRecord {
  id: string;
  targetType: "concept" | "trigram" | "hexagram";
  targetId: string;
  createdAt: string;
}

export interface ReviewAttempt {
  id: string;
  cardId: string;
  exerciseVersion?: number;
  /** Snapshot of the exercise target type for historical metric grouping. */
  targetType?: "trigram" | "concept" | "hexagram" | "five-element";
  promptSnapshot: string;
  answerSnapshot: string;
  objectiveCorrect?: boolean;
  reviewMode?: "immediate" | "spaced";
  /** Whether the learner opened an optional hint before answering. */
  hintUsed?: boolean;
  /** Optional learner-authored explanation captured at grading time. */
  selfExplanation?: string;
  /** Elapsed time from displaying the prompt to submitting the answer. */
  responseTimeMs?: number;
  recallGrade: "forgot" | "hard" | "remembered" | "mastered";
  reviewedAt: string;
  localDate: string;
}

export interface ReviewCardState {
  cardId: string;
  targetType: string;
  targetId: string;
  /** Scheduler version used to produce the current due date. */
  algorithmVersion?: number;
  stepIndex: number;
  dueDate: string;
  lastReviewedAt?: string;
  lapseCount: number;
  consecutivePasses: number;
  /** Number of immediately consecutive forgotten reviews. */
  consecutiveForgets?: number;
  isWeak: boolean;
  updatedAt: string;
}

export interface ConceptProgress {
  conceptId: string;
  status: "not_started" | "learning" | "reviewing" | "mastered";
  masteryScore: number;
  lastStudiedAt?: string;
  updatedAt: string;
}

export interface PreferenceRecord {
  key: string;
  value: string | number | boolean;
  updatedAt: string;
}

export interface LabSnapshotRecord {
  id: string;
  lowerTrigramId: string;
  upperTrigramId: string;
  movingPositions: number[];
  baseHexagramId: string;
  changedHexagramId: string;
  title: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentErratumRecord {
  id: string;
  targetType: "concept" | "trigram" | "hexagram" | "hexagram_line";
  targetId: string;
  category: "question" | "correction";
  description: string;
  proposedText: string;
  sourceRef: string;
  contentVersion: number;
  status: "open" | "resolved";
  history: ContentErratumHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentErratumHistoryEntry {
  status: "open" | "resolved";
  at: string;
}

export interface CompassRecord {
  id: string;
  /** Manual bearing in degrees; 0° is north and values increase clockwise. */
  degrees: number;
  /** Snapshot of the direction mapping at the time of saving. */
  directionId: CompassDirectionId;
  layerId: "eight-directions-v1";
  ruleVersion: 1;
  title: string;
  environmentNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompassCorrectionRecord {
  id: string;
  /** User-entered offset applied only to live sensor headings. */
  offsetDegrees: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One local safety snapshot kept before the most recent backup merge. It is
 * intentionally excluded from normal exports and can be discarded after the
 * learner chooses to undo the merge.
 */
export interface RecoverySnapshotRecord {
  id: "latest-import";
  createdAt: string;
  data: BackupData;
}

export class YijingDatabase extends Dexie {
  notes!: EntityTable<UserNote, "id">;
  reviewAttempts!: EntityTable<ReviewAttempt, "id">;
  reviewCardStates!: EntityTable<ReviewCardState, "cardId">;
  conceptProgress!: EntityTable<ConceptProgress, "conceptId">;
  favorites!: EntityTable<FavoriteRecord, "id">;
  preferences!: EntityTable<PreferenceRecord, "key">;
  labSnapshots!: EntityTable<LabSnapshotRecord, "id">;
  errata!: EntityTable<ContentErratumRecord, "id">;
  compassRecords!: EntityTable<CompassRecord, "id">;
  compassCorrections!: EntityTable<CompassCorrectionRecord, "id">;
  recoverySnapshots!: EntityTable<RecoverySnapshotRecord, "id">;

  constructor() {
    super("yijing-local");
    this.version(1).stores({
      notes: "id, targetId, updatedAt, deletedAt",
      reviewAttempts: "id, cardId, reviewedAt, localDate",
      reviewCardStates: "cardId, dueDate, isWeak, targetId",
      conceptProgress: "conceptId, status, updatedAt",
    });
    this.version(2)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
      })
      .upgrade((transaction) =>
        transaction
          .table("notes")
          .toCollection()
          .modify((record) => migrateNoteRecord(record)),
      );
    this.version(3)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("notes")
          .toCollection()
          .modify((record) => migrateNoteRecord(record));
        await transaction
          .table("preferences")
          .toCollection()
          .modify((record) => migratePreferenceRecord(record));
        await transaction
          .table("reviewAttempts")
          .toCollection()
          .modify((record) => migrateReviewAttemptRecord(record));
        await transaction
          .table("reviewCardStates")
          .toCollection()
          .modify((record) => migrateReviewCardStateRecord(record));
        await transaction
          .table("conceptProgress")
          .toCollection()
          .modify((record) => migrateConceptProgressRecord(record));
      });
    this.version(4)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots:
          "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
      })
      .upgrade((transaction) =>
        transaction
          .table("notes")
          .toCollection()
          .modify((record) => migrateNoteRecord(record)),
      );
    // Keep the historical schema steps explicit so a database created by an
    // intermediate release has a deterministic path to the current version.
    this.version(5).stores({
      notes: "id, targetId, updatedAt, deletedAt",
      reviewAttempts: "id, cardId, reviewedAt, localDate",
      reviewCardStates: "cardId, dueDate, isWeak, targetId",
      conceptProgress: "conceptId, status, updatedAt",
      favorites: "id, targetType, targetId, createdAt",
      preferences: "key, updatedAt",
      labSnapshots: "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
    });
    this.version(6)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots: "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
        compassRecords: "id, updatedAt, createdAt, degrees, directionId",
      })
      .upgrade((transaction) =>
        transaction
          .table("compassRecords")
          .toCollection()
          .modify((record) => migrateCompassRecord(record)),
      );
    this.version(7)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots: "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
        compassRecords: "id, updatedAt, createdAt, degrees, directionId",
        compassCorrections: "id, updatedAt, createdAt, offsetDegrees",
      })
      .upgrade((transaction) =>
        transaction
          .table("compassCorrections")
          .toCollection()
          .modify((record) => migrateCompassCorrectionRecord(record)),
      );
    this.version(8)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots:
          "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
        errata: "id, targetType, targetId, status, updatedAt, createdAt",
        compassRecords: "id, updatedAt, createdAt, degrees, directionId",
        compassCorrections: "id, updatedAt, createdAt, offsetDegrees",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("notes")
          .toCollection()
          .modify((record) => migrateNoteRecord(record));
        await transaction
          .table("errata")
          .toCollection()
          .modify((record) => migrateErratumRecord(record));
        await transaction
          .table("preferences")
          .toCollection()
          .modify((record) => migratePreferenceRecord(record));
        await transaction
          .table("compassRecords")
          .toCollection()
          .modify((record) => migrateCompassRecord(record));
        await transaction
          .table("compassCorrections")
          .toCollection()
          .modify((record) => migrateCompassCorrectionRecord(record));
      });
    this.version(9)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots:
          "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
        errata: "id, targetType, targetId, status, updatedAt, createdAt",
        compassRecords: "id, updatedAt, createdAt, degrees, directionId",
        compassCorrections: "id, updatedAt, createdAt, offsetDegrees",
      })
      .upgrade((transaction) =>
        transaction
          .table("reviewCardStates")
          .toCollection()
          .modify((record) => migrateReviewCardStateRecord(record)),
      );
    this.version(10)
      .stores({
        notes: "id, targetId, updatedAt, deletedAt",
        reviewAttempts: "id, cardId, reviewedAt, localDate",
        reviewCardStates: "cardId, dueDate, isWeak, targetId",
        conceptProgress: "conceptId, status, updatedAt",
        favorites: "id, targetType, targetId, createdAt",
        preferences: "key, updatedAt",
        labSnapshots:
          "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
        errata: "id, targetType, targetId, status, updatedAt, createdAt",
        compassRecords: "id, updatedAt, createdAt, degrees, directionId",
        compassCorrections: "id, updatedAt, createdAt, offsetDegrees",
      })
      .upgrade((transaction) =>
        transaction
          .table("reviewCardStates")
          .toCollection()
          .modify((record) => migrateReviewCardStateRecord(record)),
      );
    this.version(DATABASE_VERSION).stores({
      notes: "id, targetId, updatedAt, deletedAt",
      reviewAttempts: "id, cardId, reviewedAt, localDate",
      reviewCardStates: "cardId, dueDate, isWeak, targetId",
      conceptProgress: "conceptId, status, updatedAt",
      favorites: "id, targetType, targetId, createdAt",
      preferences: "key, updatedAt",
      labSnapshots:
        "id, updatedAt, createdAt, baseHexagramId, changedHexagramId",
      errata: "id, targetType, targetId, status, updatedAt, createdAt",
      compassRecords: "id, updatedAt, createdAt, degrees, directionId",
      compassCorrections: "id, updatedAt, createdAt, offsetDegrees",
      recoverySnapshots: "id, createdAt",
    });
  }
}

export const yijingDb = new YijingDatabase();
