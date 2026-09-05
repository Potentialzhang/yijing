import { z } from "zod";
import { TRIGRAMS } from "@/core/iching";
import type { TrigramId } from "@/core/iching";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

export interface HeTuGroup {
  id: string;
  direction: string;
  element: "木" | "火" | "土" | "金" | "水";
  numbers: readonly [number, number];
  mnemonic: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

export interface LuoShuCell {
  row: number;
  column: number;
  number: number;
  direction: string;
  mnemonic: string;
}

export interface NinePalace {
  id: string;
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  name: string;
  direction: string;
  trigramId: TrigramId;
  element: "木" | "火" | "土" | "金" | "水";
  mnemonic: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

const SOURCE = ["source-project-editorial"] as const;

export const HETU_GROUPS: readonly HeTuGroup[] = [
  { id: "hetu-north", direction: "北", element: "水", numbers: [1, 6], mnemonic: "一六同宗，先记北方水。", sourceIds: SOURCE, status: "draft" },
  { id: "hetu-south", direction: "南", element: "火", numbers: [2, 7], mnemonic: "二七同道，先记南方火。", sourceIds: SOURCE, status: "draft" },
  { id: "hetu-east", direction: "东", element: "木", numbers: [3, 8], mnemonic: "三八为朋，先记东方木。", sourceIds: SOURCE, status: "draft" },
  { id: "hetu-west", direction: "西", element: "金", numbers: [4, 9], mnemonic: "四九为友，先记西方金。", sourceIds: SOURCE, status: "draft" },
  { id: "hetu-center", direction: "中", element: "土", numbers: [5, 10], mnemonic: "五十居中，先记中央土。", sourceIds: SOURCE, status: "draft" },
] as const;

/** Luo Shu is kept as a number grid, separate from He Tu groups and nine-palace labels. */
export const LUOSHU_GRID: readonly LuoShuCell[] = [
  { row: 1, column: 1, number: 4, direction: "东南学习位", mnemonic: "四" },
  { row: 1, column: 2, number: 9, direction: "南学习位", mnemonic: "九" },
  { row: 1, column: 3, number: 2, direction: "西南学习位", mnemonic: "二" },
  { row: 2, column: 1, number: 3, direction: "东学习位", mnemonic: "三" },
  { row: 2, column: 2, number: 5, direction: "中宫学习位", mnemonic: "五" },
  { row: 2, column: 3, number: 7, direction: "西学习位", mnemonic: "七" },
  { row: 3, column: 1, number: 8, direction: "东北学习位", mnemonic: "八" },
  { row: 3, column: 2, number: 1, direction: "北学习位", mnemonic: "一" },
  { row: 3, column: 3, number: 6, direction: "西北学习位", mnemonic: "六" },
] as const;

export const NINE_PALACES: readonly NinePalace[] = [
  { id: "kan-1", number: 1, name: "一白坎宫", direction: "北", trigramId: "kan", element: "水", mnemonic: "一宫先记北方坎水。", sourceIds: SOURCE, status: "draft" },
  { id: "kun-2", number: 2, name: "二黑坤宫", direction: "西南", trigramId: "kun", element: "土", mnemonic: "二宫先记西南坤土。", sourceIds: SOURCE, status: "draft" },
  { id: "zhen-3", number: 3, name: "三碧震宫", direction: "东", trigramId: "zhen", element: "木", mnemonic: "三宫先记东方震木。", sourceIds: SOURCE, status: "draft" },
  { id: "xun-4", number: 4, name: "四绿巽宫", direction: "东南", trigramId: "xun", element: "木", mnemonic: "四宫先记东南巽木。", sourceIds: SOURCE, status: "draft" },
  { id: "center-5", number: 5, name: "五黄中宫", direction: "中", trigramId: "kun", element: "土", mnemonic: "五宫居中，卦象字段仅作学习关联。", sourceIds: SOURCE, status: "draft" },
  { id: "qian-6", number: 6, name: "六白乾宫", direction: "西北", trigramId: "qian", element: "金", mnemonic: "六宫先记西北乾金。", sourceIds: SOURCE, status: "draft" },
  { id: "dui-7", number: 7, name: "七赤兑宫", direction: "西", trigramId: "dui", element: "金", mnemonic: "七宫先记西方兑金。", sourceIds: SOURCE, status: "draft" },
  { id: "gen-8", number: 8, name: "八白艮宫", direction: "东北", trigramId: "gen", element: "土", mnemonic: "八宫先记东北艮土。", sourceIds: SOURCE, status: "draft" },
  { id: "li-9", number: 9, name: "九紫离宫", direction: "南", trigramId: "li", element: "火", mnemonic: "九宫先记南方离火。", sourceIds: SOURCE, status: "draft" },
] as const;

const elementSchema = z.enum(["木", "火", "土", "金", "水"]);
const trigramIdSchema = z.enum(["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"]);
const heTuGroupSchema = z.object({
  id: trimmedIdentifierSchema,
  direction: z.string().min(1),
  element: elementSchema,
  numbers: z.tuple([z.number().int().min(1).max(10), z.number().int().min(1).max(10)]),
  mnemonic: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();
const luoShuCellSchema = z.object({
  row: z.number().int().min(1).max(3),
  column: z.number().int().min(1).max(3),
  number: z.number().int().min(1).max(9),
  direction: z.string().min(1),
  mnemonic: z.string().min(1),
}).strict();
const ninePalaceSchema = z.object({
  id: trimmedIdentifierSchema,
  number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
  name: z.string().min(1),
  direction: z.string().min(1),
  trigramId: trigramIdSchema,
  element: elementSchema,
  mnemonic: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();

export function getNinePalace(number: number): NinePalace {
  const palace = NINE_PALACES.find((item) => item.number === number);
  if (!palace) throw new Error(`找不到九宫：${number}`);
  return palace;
}

export function assertHeTuLuoShuDataset(
  heTuGroups: readonly unknown[] = HETU_GROUPS,
  luoShuGrid: readonly unknown[] = LUOSHU_GRID,
  ninePalaces: readonly unknown[] = NINE_PALACES,
): void {
  if (!Array.isArray(heTuGroups) || heTuGroups.length !== 5) throw new Error(`河图组数据数量错误：当前 ${Array.isArray(heTuGroups) ? heTuGroups.length : 0} 组`);
  if (!Array.isArray(luoShuGrid) || luoShuGrid.length !== 9) throw new Error(`洛书九宫格数据数量错误：当前 ${Array.isArray(luoShuGrid) ? luoShuGrid.length : 0} 格`);
  if (!Array.isArray(ninePalaces) || ninePalaces.length !== 9) throw new Error(`九宫数据数量错误：当前 ${Array.isArray(ninePalaces) ? ninePalaces.length : 0} 宫`);
  const parsedHeTuGroups = heTuGroups.map((item) => heTuGroupSchema.parse(item));
  const parsedLuoShuGrid = luoShuGrid.map((item) => luoShuCellSchema.parse(item));
  const parsedNinePalaces = ninePalaces.map((item) => ninePalaceSchema.parse(item));
  if (new Set(parsedHeTuGroups.map((item) => item.id)).size !== 5 || new Set(parsedHeTuGroups.flatMap((item) => item.numbers)).size !== 10) throw new Error("河图组数据数量或数字重复");
  if (new Set(parsedLuoShuGrid.map((item) => `${item.row}:${item.column}`)).size !== 9 || new Set(parsedLuoShuGrid.map((item) => item.number)).size !== 9 || parsedLuoShuGrid.reduce((sum, item) => sum + item.number, 0) !== 45) throw new Error("洛书九宫格数据不完整");
  if (new Set(parsedNinePalaces.map((item) => item.id)).size !== 9 || new Set(parsedNinePalaces.map((item) => item.number)).size !== 9) throw new Error("九宫数据数量或序号重复");
  const trigramIds = new Set(TRIGRAMS.map((item) => item.id));
  parsedNinePalaces.forEach((palace) => { if (!trigramIds.has(palace.trigramId) || palace.sourceIds.length === 0 || !palace.direction || !palace.element) throw new Error(`九宫 ${palace.id} 字段不完整`); });
}
