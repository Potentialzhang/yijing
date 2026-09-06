export const LIBRARY_FILTERS = ["all", "classic", "commentary", "knowledge", "source"] as const;

export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];
export type LibraryResultKind = Exclude<LibraryFilter, "all">;

const FILTER_SET = new Set<string>(LIBRARY_FILTERS);

const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  龙: "龍", 强: "強", 无: "無", 丽: "麗", 泽: "澤", 风: "風", 观: "觀", 临: "臨",
  颐: "頤", 复: "復", 讼: "訟", 师: "師", 随: "隨", 蛊: "蠱", 剥: "剝", 兑: "兌",
  涣: "渙", 节: "節", 归: "歸", 丰: "豐", 谦: "謙", 豫: "豫", 晋: "晉", 遁: "遯",
  损: "損", 益: "益", 萃: "萃", 困: "困", 过: "過", 济: "濟", 门: "門", 见: "見",
  君: "君", 马: "馬", 鸣: "鳴", 进: "進", 退: "退", 时: "時", 位: "位", 德: "德",
};
const TRADITIONAL_TO_SIMPLIFIED = Object.fromEntries(
  Object.entries(SIMPLIFIED_TO_TRADITIONAL).map(([simplified, traditional]) => [traditional, simplified]),
) as Record<string, string>;

/** Keep URL-driven search state small, stable and safe to pass to PostgreSQL. */
export function normalizeLibraryQuery(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (candidate ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function normalizeLibraryFilter(value: string | string[] | undefined): LibraryFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && FILTER_SET.has(candidate) ? candidate as LibraryFilter : "all";
}

/** Generate exact substring variants without introducing wildcard semantics. */
export function librarySearchVariants(query: string): string[] {
  const convert = (map: Record<string, string>) => Array.from(query, (character) => map[character] ?? character).join("");
  return Array.from(new Set([query, convert(SIMPLIFIED_TO_TRADITIONAL), convert(TRADITIONAL_TO_SIMPLIFIED)]));
}

export function libraryResultHref(input: {
  kind: LibraryResultKind;
  kingWenNumber: number | null;
  sectionKind?: string | null;
  linePosition?: number | null;
  sourceUrl?: string | null;
  targetHref?: string | null;
}): string | null {
  if (input.kind === "knowledge") return input.targetHref ?? null;
  if (input.kind === "source") return input.sourceUrl ?? null;
  if (!input.kingWenNumber) return null;
  if (input.kind === "commentary") return `/hexagrams/${input.kingWenNumber}#commentaries`;
  if (input.sectionKind === "line" && input.linePosition) {
    return `/hexagrams/${input.kingWenNumber}#line-${input.linePosition}`;
  }
  return `/hexagrams/${input.kingWenNumber}#classic-reading`;
}
