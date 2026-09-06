import { FIVE_ELEMENTS } from "@/content/five-elements";
import { HETU_GROUPS, LUOSHU_GRID, NINE_PALACES } from "@/content/hetu-luoshu";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { COMPASS_DIRECTIONS } from "@/content/compass";
import { MOUNTAINS } from "@/content/mountains";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS } from "@/content/sexagenary";
import { SEXAGENARY_RELATIONS } from "@/content/sexagenary-relations";
import { TRIGRAMS } from "@/core/iching";
import { withDb } from "@/server/db";

type PlatformEntry = {
  id: string;
  category: string;
  title: string;
  summary: string;
  keywords: readonly string[];
  payload: unknown;
  sourceIds: readonly string[];
  targetHref: string;
  reviewStatus?: string;
  contentVersion?: number;
};

const entries: readonly PlatformEntry[] = [
  ...KNOWLEDGE_CONCEPTS.map((item) => ({
    id: `concept-${item.id}`, category: "学习主题", title: item.title, summary: `${item.summary}\n${item.body.join("\n")}`,
    keywords: item.keywords, payload: item, sourceIds: item.sourceIds, targetHref: `/learn/${item.id}`,
    reviewStatus: item.reviewStatus, contentVersion: item.contentVersion ?? 1,
  })),
  ...FIVE_ELEMENTS.map((item) => ({
    id: `five-element-${item.id}`, category: "五行", title: `${item.name}行`, summary: `${item.name}：${item.nature}。相生：${item.name}生${item.generates}；相克：${item.name}克${item.controls}。`,
    keywords: [item.name, item.generates, item.controls, "相生", "相克"], payload: item, sourceIds: ["source-project-editorial"], targetHref: "/tools/five-elements",
  })),
  ...TRIGRAMS.map((item) => ({
    id: `trigram-${item.id}`, category: "八卦", title: `${item.name}卦 ${item.symbol}`, summary: `${item.name}为${item.nature}，五行属${item.element}，后天方位${item.direction}，家庭角色${item.familyRole}。`,
    keywords: [item.name, item.symbol, item.nature, item.element, item.direction, item.familyRole, ...item.bodyAssociations], payload: item, sourceIds: ["source-project-editorial"], targetHref: `/trigrams/${item.id}`,
  })),
  ...HEAVENLY_STEMS.map((item) => ({
    id: `stem-${item.id}`, category: "十天干", title: `${item.name}·${item.yinYang}${item.element}`, summary: `第 ${item.index} 位天干，${item.yinYang}干，五行属${item.element}。`,
    keywords: [item.name, item.yinYang, item.element, "天干"], payload: item, sourceIds: item.sourceIds, targetHref: "/learn/heavenly-stems",
  })),
  ...EARTHLY_BRANCHES.map((item) => ({
    id: `branch-${item.id}`, category: "十二地支", title: `${item.name}·${item.direction}`, summary: `第 ${item.index} 位地支，${item.yinYang}${item.element}，方位${item.direction}，时段${item.doubleHour}。`,
    keywords: [item.name, item.yinYang, item.element, item.direction, item.doubleHour, item.monthHint, "地支"], payload: item, sourceIds: item.sourceIds, targetHref: "/learn/earthly-branches",
  })),
  ...HETU_GROUPS.map((item) => ({
    id: `hetu-${item.id}`, category: "河图", title: `河图·${item.direction}方`, summary: `${item.direction}方数字${item.numbers.join("、")}，五行属${item.element}。`,
    keywords: ["河图", item.direction, item.element, ...item.numbers.map(String)], payload: item, sourceIds: item.sourceIds, targetHref: "/tools/hetu-luoshu",
  })),
  ...LUOSHU_GRID.map((item) => ({
    id: `luoshu-${item.number}`, category: "洛书", title: `洛书·${item.number}`, summary: `洛书九格第 ${item.number} 数，位于第 ${item.row} 行第 ${item.column} 列，${item.direction}。`,
    keywords: ["洛书", "九格", item.direction, String(item.number)], payload: item, sourceIds: ["source-project-editorial"], targetHref: "/tools/hetu-luoshu",
  })),
  ...NINE_PALACES.map((item) => ({
    id: `palace-${item.id}`, category: "九宫", title: `${item.number}·${item.name}`, summary: `${item.name}，方位${item.direction}，关联${item.trigramId}卦，五行${item.element}。`,
    keywords: ["九宫", item.name, item.direction, item.trigramId, item.element, String(item.number)], payload: item, sourceIds: item.sourceIds, targetHref: "/tools/hetu-luoshu",
  })),
  ...COMPASS_DIRECTIONS.map((item) => ({
    id: `direction-${item.id}`, category: "罗盘方位", title: `${item.label}·${item.centerDegrees}°`, summary: `${item.rangeLabel}。${item.mnemonic}`, keywords: [item.label, item.shortLabel, item.rangeLabel, "方位"], payload: item, sourceIds: item.sourceIds, targetHref: "/tools/compass",
  })),
  ...MOUNTAINS.map((item) => ({
    id: item.id, category: "二十四山", title: `${item.name}山·${item.centerDegrees}°`, summary: `地盘正针${item.name}山，中心 ${item.centerDegrees}°，正五行属${item.element}。`,
    keywords: [item.name, item.element, "二十四山", "地盘正针"], payload: item, sourceIds: item.sourceIds, targetHref: "/tools/compass",
  })),
  ...SEXAGENARY_RELATIONS.map((item) => ({
    id: item.id, category: "干支关系", title: item.title, summary: item.explanation, keywords: [item.title, item.kind, item.resultElement ?? ""].filter(Boolean), payload: item, sourceIds: item.sourceIds, targetHref: item.kind === "stem-combination" ? "/learn/heavenly-stems" : "/learn/earthly-branches", reviewStatus: item.status,
  })),
];

export async function seedPlatformContent(): Promise<number> {
  return withDb(async (client) => {
    for (const entry of entries) {
      await client.query(
        `INSERT INTO content_entries(id,category,title,summary,keywords,payload,source_ids,target_href,review_status,content_version)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
         ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,summary=EXCLUDED.summary,keywords=EXCLUDED.keywords,payload=EXCLUDED.payload,source_ids=EXCLUDED.source_ids,target_href=EXCLUDED.target_href,review_status=EXCLUDED.review_status,content_version=EXCLUDED.content_version,updated_at=now()`,
        [entry.id, entry.category, entry.title, entry.summary, JSON.stringify(entry.keywords), JSON.stringify(entry.payload), JSON.stringify(entry.sourceIds), entry.targetHref, entry.reviewStatus ?? "reviewed", entry.contentVersion ?? 1],
      );
    }
    return entries.length;
  });
}

export const PLATFORM_CONTENT_ENTRY_COUNT = entries.length;
