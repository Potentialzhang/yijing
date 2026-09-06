import { getTrigram } from "./trigrams";
import type { HexagramIdentity, HexagramLines, TrigramId } from "./types";

type Pair = readonly [TrigramId, TrigramId];

const NAMES = [
  "乾为天", "坤为地", "水雷屯", "山水蒙", "水天需", "天水讼", "地水师", "水地比",
  "风天小畜", "天泽履", "地天泰", "天地否", "天火同人", "火天大有", "地山谦", "雷地豫",
  "泽雷随", "山风蛊", "地泽临", "风地观", "火雷噬嗑", "山火贲", "山地剥", "地雷复",
  "天雷无妄", "山天大畜", "山雷颐", "泽风大过", "坎为水", "离为火", "泽山咸", "雷风恒",
  "天山遁", "雷天大壮", "火地晋", "地火明夷", "风火家人", "火泽睽", "水山蹇", "雷水解",
  "山泽损", "风雷益", "泽天夬", "天风姤", "泽地萃", "地风升", "泽水困", "水风井",
  "泽火革", "火风鼎", "震为雷", "艮为山", "风山渐", "雷泽归妹", "雷火丰", "火山旅",
  "巽为风", "兑为泽", "风水涣", "水泽节", "风泽中孚", "雷山小过", "水火既济", "火水未济",
] as const;

// 每项按 [下卦, 上卦] 保存，数组顺序与文王卦序一致。
const KING_WEN_PAIRS: readonly Pair[] = [
  ["qian", "qian"], ["kun", "kun"], ["zhen", "kan"], ["kan", "gen"], ["qian", "kan"], ["kan", "qian"], ["kan", "kun"], ["kun", "kan"],
  ["qian", "xun"], ["dui", "qian"], ["qian", "kun"], ["kun", "qian"], ["li", "qian"], ["qian", "li"], ["gen", "kun"], ["kun", "zhen"],
  ["zhen", "dui"], ["xun", "gen"], ["dui", "kun"], ["kun", "xun"], ["zhen", "li"], ["li", "gen"], ["kun", "gen"], ["zhen", "kun"],
  ["zhen", "qian"], ["qian", "gen"], ["zhen", "gen"], ["xun", "dui"], ["kan", "kan"], ["li", "li"], ["gen", "dui"], ["xun", "zhen"],
  ["gen", "qian"], ["qian", "zhen"], ["kun", "li"], ["li", "kun"], ["li", "xun"], ["dui", "li"], ["gen", "kan"], ["kan", "zhen"],
  ["dui", "gen"], ["zhen", "xun"], ["qian", "dui"], ["xun", "qian"], ["kun", "dui"], ["xun", "kun"], ["kan", "dui"], ["xun", "kan"],
  ["li", "dui"], ["xun", "li"], ["zhen", "zhen"], ["gen", "gen"], ["gen", "xun"], ["dui", "zhen"], ["li", "zhen"], ["gen", "li"],
  ["xun", "xun"], ["dui", "dui"], ["kan", "xun"], ["dui", "kan"], ["dui", "xun"], ["gen", "zhen"], ["li", "kan"], ["kan", "li"],
];

function makeHexagram(number: number, [lowerId, upperId]: Pair): HexagramIdentity {
  const lower = getTrigram(lowerId);
  const upper = getTrigram(upperId);
  const lines = [...lower.lines, ...upper.lines] as HexagramLines;
  return {
    id: `hexagram-${String(number).padStart(2, "0")}`,
    kingWenNumber: number,
    name: NAMES[number - 1],
    unicodeSymbol: String.fromCodePoint(0x4dc0 + number - 1),
    lowerTrigramId: lowerId,
    upperTrigramId: upperId,
    lines,
    signature: lines.join(""),
  };
}

export const HEXAGRAMS: readonly HexagramIdentity[] = KING_WEN_PAIRS.map((pair, index) => makeHexagram(index + 1, pair));

const byPair = new Map(HEXAGRAMS.map((hexagram) => [`${hexagram.lowerTrigramId}:${hexagram.upperTrigramId}`, hexagram]));
const bySignature = new Map(HEXAGRAMS.map((hexagram) => [hexagram.signature, hexagram]));

export function getHexagramByNumber(number: number): HexagramIdentity {
  const hexagram = HEXAGRAMS[number - 1];
  if (!hexagram) throw new Error(`未知卦序：${number}`);
  return hexagram;
}

export function getHexagramByPair(lowerId: TrigramId, upperId: TrigramId): HexagramIdentity {
  const hexagram = byPair.get(`${lowerId}:${upperId}`);
  if (!hexagram) throw new Error(`无法找到上下卦组合：${lowerId}/${upperId}`);
  return hexagram;
}

export function getHexagramByLines(lines: HexagramLines): HexagramIdentity {
  const hexagram = bySignature.get(lines.join(""));
  if (!hexagram) throw new Error(`无法找到六爻签名：${lines.join("")}`);
  return hexagram;
}

/**
 * 六十四卦的通行别称按“上卦之象在前、下卦之象在后”书写。
 * 数据内部仍按 [下卦, 上卦] 保存，避免把展示顺序误当成爻序。
 */
export function getHexagramNaturePair(hexagram: HexagramIdentity): string {
  const upper = getTrigram(hexagram.upperTrigramId);
  const lower = getTrigram(hexagram.lowerTrigramId);
  return `${upper.nature}${lower.nature}`;
}

export function assertHexagramDataset(): void {
  if (HEXAGRAMS.length !== 64) throw new Error("六十四卦数据数量错误");
  const signatures = new Set(HEXAGRAMS.map((hexagram) => hexagram.signature));
  if (signatures.size !== 64) throw new Error("六十四卦签名存在重复");
}
