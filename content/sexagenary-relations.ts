import { z } from "zod";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS, type FiveElementName } from "./sexagenary";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

export type SexagenaryRelationKind = "stem-combination" | "branch-combination" | "branch-clash";

export interface SexagenaryRelation {
  id: string;
  kind: SexagenaryRelationKind;
  title: string;
  leftId: string;
  rightId: string;
  resultElement?: FiveElementName;
  explanation: string;
  sourceIds: readonly string[];
  status: "draft" | "reviewed";
}

const SOURCE = ["source-project-editorial"] as const;

export const SEXAGENARY_RELATIONS: readonly SexagenaryRelation[] = [
  { id: "stem-combination-jia-ji", kind: "stem-combination", title: "甲己合", leftId: "jia", rightId: "ji", resultElement: "土", explanation: "天干五合的成对记忆项；合化条件与具体应用规则暂不在本页展开。", sourceIds: SOURCE, status: "draft" },
  { id: "stem-combination-yi-geng", kind: "stem-combination", title: "乙庚合", leftId: "yi", rightId: "geng", resultElement: "金", explanation: "天干五合的成对记忆项；先记配对，再区分是否讨论合化。", sourceIds: SOURCE, status: "draft" },
  { id: "stem-combination-bing-xin", kind: "stem-combination", title: "丙辛合", leftId: "bing", rightId: "xin", resultElement: "水", explanation: "天干五合的成对记忆项；本页不依据它输出个人判断。", sourceIds: SOURCE, status: "draft" },
  { id: "stem-combination-ding-ren", kind: "stem-combination", title: "丁壬合", leftId: "ding", rightId: "ren", resultElement: "木", explanation: "天干五合的成对记忆项；流派和成立条件需另行标注。", sourceIds: SOURCE, status: "draft" },
  { id: "stem-combination-wu-gui", kind: "stem-combination", title: "戊癸合", leftId: "wu", rightId: "gui", resultElement: "火", explanation: "天干五合的成对记忆项；结果五行作为传统字段提示保留。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-zi-chou", kind: "branch-combination", title: "子丑合", leftId: "zi", rightId: "chou", explanation: "地支六合的成对记忆项；不单独推出现实事件或吉凶。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-yin-hai", kind: "branch-combination", title: "寅亥合", leftId: "yin", rightId: "hai", explanation: "地支六合的成对记忆项；先记配对，再学习体系差异。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-mao-xu", kind: "branch-combination", title: "卯戌合", leftId: "mao", rightId: "xu", explanation: "地支六合的成对记忆项；具体成立条件不由本工具自动判断。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-chen-you", kind: "branch-combination", title: "辰酉合", leftId: "chen", rightId: "you", explanation: "地支六合的成对记忆项；只用于关系复习。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-si-shen", kind: "branch-combination", title: "巳申合", leftId: "si", rightId: "shen", explanation: "地支六合的成对记忆项；不延伸到自动排盘。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-combination-wu-wei", kind: "branch-combination", title: "午未合", leftId: "wu", rightId: "wei", explanation: "地支六合的成对记忆项；本阶段不讨论合化条件。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-zi-wu", kind: "branch-clash", title: "子午冲", leftId: "zi", rightId: "wu", explanation: "地支六冲的成对记忆项；冲的解释需带体系和来源。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-chou-wei", kind: "branch-clash", title: "丑未冲", leftId: "chou", rightId: "wei", explanation: "地支六冲的成对记忆项；不单独输出现实判断。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-yin-shen", kind: "branch-clash", title: "寅申冲", leftId: "yin", rightId: "shen", explanation: "地支六冲的成对记忆项；先掌握固定配对。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-mao-you", kind: "branch-clash", title: "卯酉冲", leftId: "mao", rightId: "you", explanation: "地支六冲的成对记忆项；具体解释暂不展开。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-chen-xu", kind: "branch-clash", title: "辰戌冲", leftId: "chen", rightId: "xu", explanation: "地支六冲的成对记忆项；关系卡不等同于判断结果。", sourceIds: SOURCE, status: "draft" },
  { id: "branch-clash-si-hai", kind: "branch-clash", title: "巳亥冲", leftId: "si", rightId: "hai", explanation: "地支六冲的成对记忆项；需等待来源复核和规则版本。", sourceIds: SOURCE, status: "draft" },
] as const;

const relationSchema = z.object({
  id: trimmedIdentifierSchema,
  kind: z.enum(["stem-combination", "branch-combination", "branch-clash"]),
  title: z.string().min(1),
  leftId: trimmedIdentifierSchema,
  rightId: trimmedIdentifierSchema,
  resultElement: z.enum(["木", "火", "土", "金", "水"]).optional(),
  explanation: z.string().min(1),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["draft", "reviewed"]),
}).strict();

export function relationName(relation: SexagenaryRelation): string {
  const pool = relation.kind === "stem-combination" ? HEAVENLY_STEMS : EARTHLY_BRANCHES;
  return `${pool.find((item) => item.id === relation.leftId)?.name ?? relation.leftId}${pool.find((item) => item.id === relation.rightId)?.name ?? relation.rightId}`;
}

export function assertSexagenaryRelations(relations: readonly unknown[] = SEXAGENARY_RELATIONS): void {
  if (!Array.isArray(relations)) throw new Error("干支关系数据必须是数组");
  const parsed = relations.map((relation) => relationSchema.parse(relation));
  const stems = new Set(HEAVENLY_STEMS.map((item) => item.id));
  const branches = new Set(EARTHLY_BRANCHES.map((item) => item.id));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  parsed.forEach((relation) => {
    if (ids.has(relation.id)) throw new Error(`干支关系 ID 存在重复：${relation.id}`);
    ids.add(relation.id);
    const pool = relation.kind === "stem-combination" ? stems : branches;
    if (!pool.has(relation.leftId) || !pool.has(relation.rightId) || relation.leftId === relation.rightId || relation.sourceIds.length === 0) throw new Error(`干支关系字段不完整：${relation.id}`);
    const pair = [relation.leftId, relation.rightId].sort().join(":");
    const pairKey = `${relation.kind}:${pair}`;
    if (pairs.has(pairKey)) throw new Error(`干支关系配对重复：${relation.id}`);
    pairs.add(pairKey);
    if (!relation.title.startsWith(relationName(relation))) throw new Error(`干支关系标题与配对不一致：${relation.id}`);
  });
  if (parsed.filter((item) => item.kind === "stem-combination").length !== 5) throw new Error("天干五合关系数量错误");
  if (parsed.filter((item) => item.kind === "branch-combination").length !== 6) throw new Error("地支六合关系数量错误");
  if (parsed.filter((item) => item.kind === "branch-clash").length !== 6) throw new Error("地支六冲关系数量错误");
}
