import {
  getHexagramByLines,
  getHexagramByPair,
} from "@/core/iching/hexagrams";
import { toggleLines } from "@/core/iching/transforms";
import type { LinePosition, TrigramId } from "@/core/iching/types";
import type { LabSnapshotRecord } from "@/db/schema";

const TRIGRAM_IDS: readonly TrigramId[] = [
  "qian",
  "dui",
  "li",
  "zhen",
  "xun",
  "kan",
  "gen",
  "kun",
];

function isTrigramId(value: unknown): value is TrigramId {
  return typeof value === "string" && TRIGRAM_IDS.includes(value as TrigramId);
}

function isLinePosition(value: unknown): value is LinePosition {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

/**
 * Rebuild derived hexagram IDs at the persistence boundary. The lab UI
 * already computes these values, but repository callers must not be able to
 * save a contradictory pair, moving-line list, or changed-hexagram snapshot.
 */
export function normalizeLabSnapshotForWrite(
  record: LabSnapshotRecord,
): LabSnapshotRecord {
  if (!isTrigramId(record.lowerTrigramId) || !isTrigramId(record.upperTrigramId)) {
    throw new TypeError("推演快照的上下卦无效");
  }
  if (!Array.isArray(record.movingPositions) || !record.movingPositions.every(isLinePosition)) {
    throw new TypeError("推演快照的动爻位置无效");
  }
  if (new Set(record.movingPositions).size !== record.movingPositions.length) {
    throw new TypeError("推演快照的动爻位置不能重复");
  }
  const movingPositions = [...record.movingPositions].sort((a, b) => a - b);
  const base = getHexagramByPair(record.lowerTrigramId, record.upperTrigramId);
  const changed = getHexagramByLines(
    toggleLines(base.lines, new Set(movingPositions)),
  );
  return {
    ...record,
    movingPositions,
    baseHexagramId: base.id,
    changedHexagramId: changed.id,
  };
}
