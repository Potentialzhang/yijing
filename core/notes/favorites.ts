import { isValidIsoTimestamp } from "@/core/date/local";
import { HEXAGRAMS } from "@/core/iching/hexagrams";
import { TRIGRAMS } from "@/core/iching/trigrams";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import type { FavoriteRecord } from "@/db/schema";

const TARGET_TYPES = ["concept", "trigram", "hexagram"] as const;

const TARGET_IDS: Record<FavoriteRecord["targetType"], ReadonlySet<string>> = {
  concept: new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id)),
  trigram: new Set(TRIGRAMS.map((trigram) => trigram.id)),
  hexagram: new Set(HEXAGRAMS.map((hexagram) => hexagram.id)),
};

/**
 * Validate a favorite at the repository boundary so a future caller cannot
 * create a record that the notes page or detail route cannot resolve.
 */
export function normalizeFavoriteForWrite(
  record: FavoriteRecord,
): FavoriteRecord {
  if (!TARGET_TYPES.includes(record.targetType)) {
    throw new TypeError("收藏目标类型无效");
  }
  if (typeof record.targetId !== "string" || !TARGET_IDS[record.targetType].has(record.targetId)) {
    throw new TypeError("收藏目标不存在");
  }
  const expectedId = `${record.targetType}:${record.targetId}`;
  if (record.id !== expectedId) {
    throw new TypeError("收藏记录 ID 必须与目标一致");
  }
  if (typeof record.createdAt !== "string" || !isValidIsoTimestamp(record.createdAt)) {
    throw new TypeError("收藏时间无效");
  }
  return record;
}
