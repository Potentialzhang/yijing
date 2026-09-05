import type { CompassDirectionId } from "@/core/compass/directions";
import type { BackupData } from "@/core/data/backup";
import type { SourceTemplate } from "@/core/notes/source-template";

/** Version of the server-side schema. Browser storage has no schema anymore. */
export const DATABASE_VERSION = 4 as const;

export interface UserNote { id: string; targetType: "concept" | "trigram" | "hexagram" | "hexagram_line" | "session"; targetId: string; title?: string; markdown: string; tags: string[]; sourceRefs: UserSourceRef[]; createdAt: string; updatedAt: string; deletedAt?: string; }
export type SourceKind = "classic" | "book" | "video" | "web" | "personal";
export interface UserSourceRef { label: string; kind?: SourceKind; author?: string; edition?: string; locator?: string; url?: string; accessedAt?: string; }
export interface FavoriteRecord { id: string; targetType: "concept" | "trigram" | "hexagram"; targetId: string; createdAt: string; }
export interface ReviewAttempt { id: string; cardId: string; exerciseVersion?: number; targetType?: "trigram" | "concept" | "hexagram" | "five-element"; promptSnapshot: string; answerSnapshot: string; objectiveCorrect?: boolean; reviewMode?: "immediate" | "spaced"; hintUsed?: boolean; selfExplanation?: string; responseTimeMs?: number; recallGrade: "forgot" | "hard" | "remembered" | "mastered"; reviewedAt: string; localDate: string; }
export interface ReviewCardState { cardId: string; targetType: string; targetId: string; algorithmVersion?: number; stepIndex: number; dueDate: string; lastReviewedAt?: string; lapseCount: number; consecutivePasses: number; consecutiveForgets?: number; isWeak: boolean; updatedAt: string; }
export interface ConceptProgress { conceptId: string; status: "not_started" | "learning" | "reviewing" | "mastered"; masteryScore: number; lastStudiedAt?: string; updatedAt: string; }
export interface PreferenceRecord { key: string; value: string | number | boolean; updatedAt: string; }
export interface LabSnapshotRecord { id: string; lowerTrigramId: string; upperTrigramId: string; movingPositions: number[]; baseHexagramId: string; changedHexagramId: string; title: string; note: string; createdAt: string; updatedAt: string; }
export interface ContentErratumRecord { id: string; targetType: "concept" | "trigram" | "hexagram" | "hexagram_line"; targetId: string; category: "question" | "correction"; description: string; proposedText: string; sourceRef: string; contentVersion: number; status: "open" | "resolved"; history: ContentErratumHistoryEntry[]; createdAt: string; updatedAt: string; }
export interface ContentErratumHistoryEntry { status: "open" | "resolved"; at: string; }
export interface CompassRecord { id: string; degrees: number; directionId: CompassDirectionId; layerId: "eight-directions-v1"; ruleVersion: 1; title: string; environmentNote: string; createdAt: string; updatedAt: string; }
export interface CompassCorrectionRecord { id: string; offsetDegrees: number; reason: string; createdAt: string; updatedAt: string; }
export interface RecoverySnapshotRecord { id: "latest-import"; createdAt: string; data: BackupData; }
export interface SourceTemplateRecord { id: "latest"; template: SourceTemplate; updatedAt: string; }

type AnyRecord = { id?: string; key?: string; cardId?: string; conceptId?: string };
function recordKey(value: AnyRecord) { const key = value.id ?? value.cardId ?? value.conceptId ?? value.key; if (!key) throw new Error("记录缺少主键"); return key; }

/** Thin client repository. It only talks to server APIs; no browser persistence. */
class RemoteTable<T> {
  constructor(private readonly table: string) {}
  private async all(): Promise<T[]> { const response = await fetch(`/api/data?table=${encodeURIComponent(this.table)}`, { cache: "no-store" }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "请先登录"); return (await response.json()).records as T[]; }
  async toArray() { return this.all(); }
  async get(id: string) { return (await this.all()).find(item => recordKey(item as AnyRecord) === id); }
  async bulkGet(ids: string[]) { const all = await this.all(); return ids.map(id => all.find(item => recordKey(item as AnyRecord) === id)); }
  async put(record: T) { const key = recordKey(record as AnyRecord); const response = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: this.table, key, record }) }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "保存失败"); return key; }
  async add(record: T) { return this.put(record); }
  async bulkPut(records: T[]) { for (const record of records) await this.put(record); }
  async delete(id: string) { const response = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: this.table, id }) }); if (!response.ok) throw new Error("删除失败"); }
  async clear() { for (const item of await this.all()) await this.delete(recordKey(item as AnyRecord)); }
  async count() { return (await this.all()).length; }
  where(index: string) { const field = (item: T) => (item as Record<string, unknown>)[index]; const filtered = (predicate: (item: T) => boolean) => ({ toArray: async () => (await this.all()).filter(predicate), count: async () => (await this.all()).filter(predicate).length }); return { anyOf: (values: readonly unknown[]) => filtered(item => values.includes(field(item))), equals: (value: unknown) => filtered(item => field(item) === value), toArray: async () => this.all(), count: async () => (await this.all()).length }; }
}

class RemoteDatabase {
  notes = new RemoteTable<UserNote>("notes"); reviewAttempts = new RemoteTable<ReviewAttempt>("reviewAttempts"); reviewCardStates = new RemoteTable<ReviewCardState>("reviewCardStates"); conceptProgress = new RemoteTable<ConceptProgress>("conceptProgress"); favorites = new RemoteTable<FavoriteRecord>("favorites"); preferences = new RemoteTable<PreferenceRecord>("preferences"); labSnapshots = new RemoteTable<LabSnapshotRecord>("labSnapshots"); errata = new RemoteTable<ContentErratumRecord>("errata"); compassRecords = new RemoteTable<CompassRecord>("compassRecords"); compassCorrections = new RemoteTable<CompassCorrectionRecord>("compassCorrections"); recoverySnapshots = new RemoteTable<RecoverySnapshotRecord>("recoverySnapshots"); sourceTemplates = new RemoteTable<SourceTemplateRecord>("sourceTemplates");
  async open() {}
  async transaction<T>(_mode: string, ...args: unknown[]) { const fn = args.at(-1) as (() => Promise<T>) | undefined; if (!fn) throw new Error("事务回调缺失"); return fn(); }
}

export const yijingDb = new RemoteDatabase();
