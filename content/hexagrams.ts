import { HEXAGRAMS } from "@/core/iching";
import type { ContentBlock } from "@/content/knowledge";
import canonical from "@/content/zhouyi-canonical.json";
import { ZHOUYI_EDITORIAL } from "@/content/zhouyi-editorial";

export type CanonicalTextStatus = "pending" | "verified";
export type HexagramLinePosition = 1 | 2 | 3 | 4 | 5 | 6;

export interface HexagramJudgmentText {
  id: string;
  hexagramId: string;
  canonicalText: string | null;
  /** Typed editorial/computed blocks populated only after source review. */
  blocks: ContentBlock[];
  sourceIds: readonly string[];
  status: CanonicalTextStatus;
  contentVersion: number;
}

export interface HexagramLineText {
  id: string;
  hexagramId: string;
  position: HexagramLinePosition;
  canonicalText: string | null;
  /** Typed editorial/computed blocks populated only after source review. */
  blocks: ContentBlock[];
  sourceIds: readonly string[];
  status: CanonicalTextStatus;
  contentVersion: number;
}

const CLASSIC_SOURCE = "source-zhouyi-kanripo";
function editorialBlock(id: string, markdown: string): ContentBlock {
  return { id, kind: "editorial", title: "学习释义", markdown,
    sourceIds: ["source-project-editorial", CLASSIC_SOURCE], traditionTags: ["项目自编学习释义"] };
}

export function getCanonicalEntry(hexagramId: string) {
  const hexagram = HEXAGRAMS.find(item => item.id === hexagramId);
  if (!hexagram) throw new Error(`未知卦：${hexagramId}`);
  return canonical.rows[hexagram.kingWenNumber - 1];
}

export const HEXAGRAM_JUDGMENTS: readonly HexagramJudgmentText[] = HEXAGRAMS.map((hexagram) => ({
  id: `${hexagram.id}-judgment`,
  hexagramId: hexagram.id,
  canonicalText: getCanonicalEntry(hexagram.id).judgment,
  blocks: [editorialBlock(`${hexagram.id}-judgment-editorial`, ZHOUYI_EDITORIAL[hexagram.kingWenNumber - 1].judgment)],
  sourceIds: [CLASSIC_SOURCE],
  status: "verified" as const,
  contentVersion: 2,
}));

export const HEXAGRAM_LINE_TEXTS: readonly HexagramLineText[] = HEXAGRAMS.flatMap((hexagram) =>
  ([1, 2, 3, 4, 5, 6] as const).map((position) => ({
    id: `${hexagram.id}-line-${position}`,
    hexagramId: hexagram.id,
    position,
    canonicalText: getCanonicalEntry(hexagram.id).lines[position - 1],
    blocks: [editorialBlock(`${hexagram.id}-line-${position}-editorial`, ZHOUYI_EDITORIAL[hexagram.kingWenNumber - 1].lines[position - 1])],
    sourceIds: [CLASSIC_SOURCE],
    status: "verified" as const,
    contentVersion: 2,
  })),
);

export function getHexagramJudgment(hexagramId: string): HexagramJudgmentText {
  const judgment = HEXAGRAM_JUDGMENTS.find((item) => item.hexagramId === hexagramId);
  if (!judgment) throw new Error(`缺少卦辞记录：${hexagramId}`);
  return judgment;
}

export function getHexagramLineTexts(hexagramId: string): readonly HexagramLineText[] {
  return HEXAGRAM_LINE_TEXTS.filter((item) => item.hexagramId === hexagramId);
}
