import { z } from "zod";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

export type CompassLayerId = "eight-directions-v1" | "twenty-four-mountains";

export interface CompassLayer {
  id: CompassLayerId;
  label: string;
  system: string;
  description: string;
  ruleVersion: 1;
  sourceIds: readonly string[];
  status: "reviewed" | "pending";
  enabled: boolean;
  pendingReason?: string;
}

const SOURCE = ["source-project-editorial"] as const;

export const COMPASS_LAYERS: readonly CompassLayer[] = [
  {
    id: "eight-directions-v1",
    label: "通用八方",
    system: "360° 几何方位",
    description: "以北为 0°、顺时针增加，每 45° 一个方向中心。",
    ruleVersion: 1,
    sourceIds: SOURCE,
    status: "reviewed",
    enabled: true,
  },
  {
    id: "twenty-four-mountains",
    label: "二十四山",
    system: "地盘正针 · 二十四山",
    description: "子山中心为北 0°，顺时针每山 15°；区间含起点、不含终点。展示正五行。",
    ruleVersion: 1,
    sourceIds: ["source-mountains-zhengzhen"],
    status: "reviewed",
    enabled: true,
  },
] as const;

const compassLayerSchema = z.object({
  id: z.enum(["eight-directions-v1", "twenty-four-mountains"]),
  label: z.string().min(1),
  system: z.string().min(1),
  description: z.string().min(1),
  ruleVersion: z.literal(1),
  sourceIds: z.array(trimmedIdentifierSchema),
  status: z.enum(["reviewed", "pending"]),
  enabled: z.boolean(),
  pendingReason: z.string().min(1).optional(),
}).strict();

export function assertCompassLayers(layers: readonly unknown[] = COMPASS_LAYERS): void {
  if (!Array.isArray(layers) || layers.length < 1) throw new Error("罗盘盘层数据不能为空");
  const parsed = layers.map((layer) => compassLayerSchema.parse(layer));
  const ids = new Set(parsed.map((layer) => layer.id));
  if (ids.size !== parsed.length) throw new Error("罗盘盘层 ID 存在重复或为空");
  if (!parsed.some((layer) => layer.enabled)) throw new Error("罗盘至少有一个可用盘层");
  parsed.forEach((layer) => {
    if (!layer.label || !layer.system || !layer.description || !Number.isInteger(layer.ruleVersion) || (layer.enabled && (layer.status !== "reviewed" || layer.sourceIds.length === 0)) || (!layer.enabled && layer.status !== "pending")) throw new Error(`罗盘盘层字段或状态不完整：${layer.id}`);
    if (layer.status === "pending" && !layer.pendingReason) throw new Error(`待确认盘层必须说明原因：${layer.id}`);
  });
}
