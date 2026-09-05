import { z } from "zod";
import { directionIdAt, type CompassDirectionId } from "@/core/compass/directions";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

export interface CompassDirection {
  id: CompassDirectionId;
  label: string;
  shortLabel: string;
  centerDegrees: number;
  rangeLabel: string;
  mnemonic: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

const SOURCE = ["source-project-editorial"] as const;

export const COMPASS_DIRECTIONS: readonly CompassDirection[] = [
  { id: "north", label: "北", shortLabel: "N", centerDegrees: 0, rangeLabel: "337.5°–22.5°", mnemonic: "以北为 0°，顺时针增加。", sourceIds: SOURCE, status: "reviewed" },
  { id: "northeast", label: "东北", shortLabel: "NE", centerDegrees: 45, rangeLabel: "22.5°–67.5°", mnemonic: "东北位于北与东之间。", sourceIds: SOURCE, status: "reviewed" },
  { id: "east", label: "东", shortLabel: "E", centerDegrees: 90, rangeLabel: "67.5°–112.5°", mnemonic: "以北为起点，顺时针 90° 为东。", sourceIds: SOURCE, status: "reviewed" },
  { id: "southeast", label: "东南", shortLabel: "SE", centerDegrees: 135, rangeLabel: "112.5°–157.5°", mnemonic: "东南位于东与南之间。", sourceIds: SOURCE, status: "reviewed" },
  { id: "south", label: "南", shortLabel: "S", centerDegrees: 180, rangeLabel: "157.5°–202.5°", mnemonic: "以北为起点，顺时针 180° 为南。", sourceIds: SOURCE, status: "reviewed" },
  { id: "southwest", label: "西南", shortLabel: "SW", centerDegrees: 225, rangeLabel: "202.5°–247.5°", mnemonic: "西南位于南与西之间。", sourceIds: SOURCE, status: "reviewed" },
  { id: "west", label: "西", shortLabel: "W", centerDegrees: 270, rangeLabel: "247.5°–292.5°", mnemonic: "以北为起点，顺时针 270° 为西。", sourceIds: SOURCE, status: "reviewed" },
  { id: "northwest", label: "西北", shortLabel: "NW", centerDegrees: 315, rangeLabel: "292.5°–337.5°", mnemonic: "西北位于西与北之间。", sourceIds: SOURCE, status: "reviewed" },
] as const;

const compassDirectionSchema = z.object({
  id: z.enum(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]),
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  centerDegrees: z.number().finite().min(0).lt(360),
  rangeLabel: z.string().min(1),
  mnemonic: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();

export function compassDirectionAt(degrees: number): CompassDirection {
  const item = COMPASS_DIRECTIONS.find((direction) => direction.id === directionIdAt(degrees));
  if (!item) throw new Error(`找不到方位：${degrees}`);
  return item;
}

export function assertCompassDataset(directions: readonly unknown[] = COMPASS_DIRECTIONS): void {
  if (!Array.isArray(directions) || directions.length !== 8) throw new Error("基础罗盘应有八个方位");
  const parsed = directions.map((direction) => compassDirectionSchema.parse(direction));
  const ids = new Set(parsed.map((item) => item.id));
  const labels = new Set(parsed.map((item) => item.label));
  if (ids.size !== 8 || labels.size !== 8) throw new Error("基础罗盘方位存在重复");
  const expectedIds: readonly CompassDirectionId[] = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  parsed.forEach((item, index) => {
    if (item.id !== expectedIds[index] || item.centerDegrees !== index * 45 || item.sourceIds.length === 0 || !item.rangeLabel || !item.mnemonic) throw new Error(`基础罗盘字段不完整或顺序错误：${item.id}`);
  });
}
