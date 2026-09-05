import { z } from "zod";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

/**
 * M2 静态知识：天干与地支。
 *
 * 这些字段用于记忆和检索，不承担公历换算、节气换月或排盘结论。
 * 等规则版本和权威样例集确定后，再在 core/calendar 中实现计算。
 */
export type SexagenaryYinYang = "阳" | "阴";
export type FiveElementName = "木" | "火" | "土" | "金" | "水";

export interface HeavenlyStem {
  id: string;
  index: number;
  name: string;
  yinYang: SexagenaryYinYang;
  element: FiveElementName;
  mnemonic: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

export interface EarthlyBranch {
  id: string;
  index: number;
  name: string;
  yinYang: SexagenaryYinYang;
  element: FiveElementName;
  direction: string;
  monthHint: string;
  doubleHour: string;
  mnemonic: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

const SOURCE = ["source-project-editorial"] as const;

export const HEAVENLY_STEMS: readonly HeavenlyStem[] = [
  { id: "jia", index: 1, name: "甲", yinYang: "阳", element: "木", mnemonic: "阳木之始，先记为生发的起点。", sourceIds: SOURCE, status: "draft" },
  { id: "yi", index: 2, name: "乙", yinYang: "阴", element: "木", mnemonic: "阴木承接甲，先记同属木而阴阳相对。", sourceIds: SOURCE, status: "draft" },
  { id: "bing", index: 3, name: "丙", yinYang: "阳", element: "火", mnemonic: "阳火外显，与丁同属火。", sourceIds: SOURCE, status: "draft" },
  { id: "ding", index: 4, name: "丁", yinYang: "阴", element: "火", mnemonic: "阴火内守，与丙同属火。", sourceIds: SOURCE, status: "draft" },
  { id: "wu", index: 5, name: "戊", yinYang: "阳", element: "土", mnemonic: "阳土居中，与己同属土。", sourceIds: SOURCE, status: "draft" },
  { id: "ji", index: 6, name: "己", yinYang: "阴", element: "土", mnemonic: "阴土承载，与戊同属土。", sourceIds: SOURCE, status: "draft" },
  { id: "geng", index: 7, name: "庚", yinYang: "阳", element: "金", mnemonic: "阳金肃整，与辛同属金。", sourceIds: SOURCE, status: "draft" },
  { id: "xin", index: 8, name: "辛", yinYang: "阴", element: "金", mnemonic: "阴金精细，与庚同属金。", sourceIds: SOURCE, status: "draft" },
  { id: "ren", index: 9, name: "壬", yinYang: "阳", element: "水", mnemonic: "阳水流动，与癸同属水。", sourceIds: SOURCE, status: "draft" },
  { id: "gui", index: 10, name: "癸", yinYang: "阴", element: "水", mnemonic: "阴水滋润，与壬同属水。", sourceIds: SOURCE, status: "draft" },
] as const;

export const EARTHLY_BRANCHES: readonly EarthlyBranch[] = [
  { id: "zi", index: 1, name: "子", yinYang: "阳", element: "水", direction: "北", monthHint: "子月 · 农历十一月", doubleHour: "23:00–01:00", mnemonic: "子为一轮地支的起点，先记北方与水。", sourceIds: SOURCE, status: "draft" },
  { id: "chou", index: 2, name: "丑", yinYang: "阴", element: "土", direction: "东北偏北", monthHint: "丑月 · 农历十二月", doubleHour: "01:00–03:00", mnemonic: "丑承接子，先记东北与土。", sourceIds: SOURCE, status: "draft" },
  { id: "yin", index: 3, name: "寅", yinYang: "阳", element: "木", direction: "东北偏东", monthHint: "寅月 · 农历正月", doubleHour: "03:00–05:00", mnemonic: "寅为春初记忆点，先记东北与木。", sourceIds: SOURCE, status: "draft" },
  { id: "mao", index: 4, name: "卯", yinYang: "阴", element: "木", direction: "东", monthHint: "卯月 · 农历二月", doubleHour: "05:00–07:00", mnemonic: "卯在东方，与寅同属木。", sourceIds: SOURCE, status: "draft" },
  { id: "chen", index: 5, name: "辰", yinYang: "阳", element: "土", direction: "东南偏东", monthHint: "辰月 · 农历三月", doubleHour: "07:00–09:00", mnemonic: "辰在春末，先记东南与土。", sourceIds: SOURCE, status: "draft" },
  { id: "si", index: 6, name: "巳", yinYang: "阴", element: "火", direction: "东南偏南", monthHint: "巳月 · 农历四月", doubleHour: "09:00–11:00", mnemonic: "巳在东南，与午同属火。", sourceIds: SOURCE, status: "draft" },
  { id: "wu", index: 7, name: "午", yinYang: "阳", element: "火", direction: "南", monthHint: "午月 · 农历五月", doubleHour: "11:00–13:00", mnemonic: "午在正南，先记阳火。", sourceIds: SOURCE, status: "draft" },
  { id: "wei", index: 8, name: "未", yinYang: "阴", element: "土", direction: "西南偏南", monthHint: "未月 · 农历六月", doubleHour: "13:00–15:00", mnemonic: "未在夏末，先记西南与土。", sourceIds: SOURCE, status: "draft" },
  { id: "shen", index: 9, name: "申", yinYang: "阳", element: "金", direction: "西南偏西", monthHint: "申月 · 农历七月", doubleHour: "15:00–17:00", mnemonic: "申为秋初记忆点，先记西南与金。", sourceIds: SOURCE, status: "draft" },
  { id: "you", index: 10, name: "酉", yinYang: "阴", element: "金", direction: "西", monthHint: "酉月 · 农历八月", doubleHour: "17:00–19:00", mnemonic: "酉在正西，与申同属金。", sourceIds: SOURCE, status: "draft" },
  { id: "xu", index: 11, name: "戌", yinYang: "阳", element: "土", direction: "西北偏西", monthHint: "戌月 · 农历九月", doubleHour: "19:00–21:00", mnemonic: "戌在秋末，先记西北与土。", sourceIds: SOURCE, status: "draft" },
  { id: "hai", index: 12, name: "亥", yinYang: "阴", element: "水", direction: "西北偏北", monthHint: "亥月 · 农历十月", doubleHour: "21:00–23:00", mnemonic: "亥在冬初，与子同属水。", sourceIds: SOURCE, status: "draft" },
] as const;

const fiveElementSchema = z.enum(["木", "火", "土", "金", "水"]);
const yinYangSchema = z.enum(["阳", "阴"]);
const heavenlyStemSchema = z.object({
  id: trimmedIdentifierSchema,
  index: z.number().int().min(1).max(10),
  name: z.string().min(1),
  yinYang: yinYangSchema,
  element: fiveElementSchema,
  mnemonic: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();
const earthlyBranchSchema = z.object({
  id: trimmedIdentifierSchema,
  index: z.number().int().min(1).max(12),
  name: z.string().min(1),
  yinYang: yinYangSchema,
  element: fiveElementSchema,
  direction: z.string().min(1),
  monthHint: z.string().min(1),
  doubleHour: z.string().min(1),
  mnemonic: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();

export function getHeavenlyStem(id: string): HeavenlyStem {
  const item = HEAVENLY_STEMS.find((stem) => stem.id === id);
  if (!item) throw new Error(`找不到天干：${id}`);
  return item;
}

export function getEarthlyBranch(id: string): EarthlyBranch {
  const item = EARTHLY_BRANCHES.find((branch) => branch.id === id);
  if (!item) throw new Error(`找不到地支：${id}`);
  return item;
}

/** Build-time guard for the static M2 dataset; it deliberately does not validate calendar rules. */
export function assertSexagenaryDataset(
  heavenlyStems: readonly unknown[] = HEAVENLY_STEMS,
  earthlyBranches: readonly unknown[] = EARTHLY_BRANCHES,
): void {
  if (!Array.isArray(heavenlyStems) || heavenlyStems.length !== 10) throw new Error(`天干数据数量错误：当前 ${Array.isArray(heavenlyStems) ? heavenlyStems.length : 0} 个`);
  if (!Array.isArray(earthlyBranches) || earthlyBranches.length !== 12) throw new Error(`地支数据数量错误：当前 ${Array.isArray(earthlyBranches) ? earthlyBranches.length : 0} 个`);
  const stems = heavenlyStems.map((item) => heavenlyStemSchema.parse(item));
  const branches = earthlyBranches.map((item) => earthlyBranchSchema.parse(item));
  const checkCommon = (items: readonly (HeavenlyStem | EarthlyBranch)[], label: string) => {
    const ids = new Set(items.map((item) => item.id));
    const names = new Set(items.map((item) => item.name));
    if (ids.size !== items.length || names.size !== items.length) throw new Error(`${label} ID 或名称存在重复`);
    items.forEach((item, index) => {
      if (item.index !== index + 1 || !item.name || !item.element || !item.yinYang || item.sourceIds.length === 0) throw new Error(`${label} ${item.id} 字段不完整或顺序错误`);
    });
  };
  checkCommon(stems, "天干");
  checkCommon(branches, "地支");
  if (branches.some((branch) => !branch.direction || !branch.monthHint || !branch.doubleHour || !branch.mnemonic)) throw new Error("地支方位、月份或时段提示不完整");
}
