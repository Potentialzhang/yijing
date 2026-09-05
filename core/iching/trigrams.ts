import type { LineValue, TrigramId, TrigramIdentity, TrigramLines } from "./types";

const PROJECT_SOURCE = ["source-project-editorial"] as const;

export const TRIGRAMS: readonly TrigramIdentity[] = [
  { id: "qian", name: "乾", symbol: "☰", lines: [1, 1, 1], element: "金", direction: "西北", directions: [{ system: "earlier_heaven", value: "南" }, { system: "later_heaven", value: "西北" }], nature: "天", familyRole: "父", bodyAssociations: ["头"], keywords: ["刚健", "创造", "主动"], sourceIds: PROJECT_SOURCE },
  { id: "dui", name: "兑", symbol: "☱", lines: [1, 1, 0], element: "金", direction: "西", directions: [{ system: "earlier_heaven", value: "东南" }, { system: "later_heaven", value: "西" }], nature: "泽", familyRole: "少女", bodyAssociations: ["口"], keywords: ["喜悦", "言说", "交流"], sourceIds: PROJECT_SOURCE },
  { id: "li", name: "离", symbol: "☲", lines: [1, 0, 1], element: "火", direction: "南", directions: [{ system: "earlier_heaven", value: "东" }, { system: "later_heaven", value: "南" }], nature: "火", familyRole: "中女", bodyAssociations: ["目"], keywords: ["明", "附丽", "看见"], sourceIds: PROJECT_SOURCE },
  { id: "zhen", name: "震", symbol: "☳", lines: [1, 0, 0], element: "木", direction: "东", directions: [{ system: "earlier_heaven", value: "东北" }, { system: "later_heaven", value: "东" }], nature: "雷", familyRole: "长男", bodyAssociations: ["足"], keywords: ["行动", "震动", "开始"], sourceIds: PROJECT_SOURCE },
  { id: "xun", name: "巽", symbol: "☴", lines: [0, 1, 1], element: "木", direction: "东南", directions: [{ system: "earlier_heaven", value: "西南" }, { system: "later_heaven", value: "东南" }], nature: "风", familyRole: "长女", bodyAssociations: ["股"], keywords: ["进入", "渐进", "顺从"], sourceIds: PROJECT_SOURCE },
  { id: "kan", name: "坎", symbol: "☵", lines: [0, 1, 0], element: "水", direction: "北", directions: [{ system: "earlier_heaven", value: "西" }, { system: "later_heaven", value: "北" }], nature: "水", familyRole: "中男", bodyAssociations: ["耳"], keywords: ["险", "流动", "陷"], sourceIds: PROJECT_SOURCE },
  { id: "gen", name: "艮", symbol: "☶", lines: [0, 0, 1], element: "土", direction: "东北", directions: [{ system: "earlier_heaven", value: "西北" }, { system: "later_heaven", value: "东北" }], nature: "山", familyRole: "少男", bodyAssociations: ["手"], keywords: ["止", "边界", "静守"], sourceIds: PROJECT_SOURCE },
  { id: "kun", name: "坤", symbol: "☷", lines: [0, 0, 0], element: "土", direction: "西南", directions: [{ system: "earlier_heaven", value: "北" }, { system: "later_heaven", value: "西南" }], nature: "地", familyRole: "母", bodyAssociations: ["腹"], keywords: ["承载", "顺势", "包容"], sourceIds: PROJECT_SOURCE },
];

const bySignature = new Map(
  TRIGRAMS.map((trigram) => [trigram.lines.join(""), trigram]),
);

export function getTrigram(id: TrigramId): TrigramIdentity {
  const trigram = TRIGRAMS.find((item) => item.id === id);
  if (!trigram) throw new Error(`未知八卦：${id}`);
  return trigram;
}

export function trigramFromLines(lines: TrigramLines): TrigramIdentity {
  const trigram = bySignature.get(lines.join(""));
  if (!trigram) throw new Error(`无法识别三爻签名：${lines.join("")}`);
  return trigram;
}

export function toggleLine(line: LineValue): LineValue {
  return line === 1 ? 0 : 1;
}
