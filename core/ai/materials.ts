import { z } from "zod";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { HEXAGRAMS } from "@/core/iching";
import { getHexagramJudgment, getHexagramLineTexts } from "@/content/hexagrams";
import { AI_OUTPUT_KINDS, type AiSourceCitation } from "./output";
import { assertAiRequestPreview } from "./consent";
import type { AiProviderRequest } from "./provider";

export const AI_TASKS = [
  { id: "exercise-draft", label: "个性化出题", instruction: "生成3道四选一学习题，依据所选知识和实际错误记录优先训练薄弱点。每题有唯一答案，给出解释和所用材料编号。没有错误记录时说明仅按所选内容出题。text写练习目标，questions写实际题目。" },
  { id: "note-draft", label: "笔记整理", instruction: "整理所选笔记，输出主题提纲、关键概念、关联与待核对问题；保留原意，区别个人观察与原典陈述，不补造事实。questions为空。" },
  { id: "viewpoint-comparison", label: "观点对比", instruction: "逐一引用所选材料编号，对比至少两份材料的共同点、差异、成立条件与无法确认处。不把用户笔记冒充注家观点，不强行得出统一定论。questions为空。" },
  { id: "confusion-analysis", label: "错题分析", instruction: "根据实际作答记录找出反复混淆，引用具体题目与回忆等级，解释可能原因并制定可执行复习步骤，不推断人格。questions为空。" },
  { id: "socratic-question", label: "启发式追问", instruction: "针对所选知识给出3个循序渐进的问题，引导用户观察与解释，先不给答案。questions为空。" },
  { id: "hexagram-discussion", label: "卦象学习讨论", instruction: "结合选中的卦辞、爻辞与结构展开学习讨论，明确引用材料，区分原文和解释；以学习问题收尾。questions为空。" },
] as const;

export function selectedContentData(ids: readonly string[]) {
  const blocks = ids.flatMap(id => {
    const concept = KNOWLEDGE_CONCEPTS.find(item => item.id === id);
    if (concept) return concept.blocks;
    const hexagram = HEXAGRAMS.find(item => item.id === id);
    if (!hexagram) throw new Error("选中的知识不存在");
    return [getHexagramJudgment(id), ...getHexagramLineTexts(id)].flatMap(record => [
      { id: record.id, kind: "canonical" as const, title: hexagram.name, markdown: record.canonicalText!, sourceIds: [...record.sourceIds], traditionTags: ["周易经文"] },
      ...record.blocks,
    ]);
  });
  return { "content.conceptId": [...ids], "content.blocks": blocks, "content.sourceIds": [...new Set(blocks.flatMap(block => block.sourceIds))] };
}

const sourceRef = z.object({ label: z.string().max(300), kind: z.enum(["classic", "book", "video", "web", "personal"]).optional(), author: z.string().max(300).optional(), edition: z.string().max(300).optional(), locator: z.string().max(500).optional(), url: z.string().max(2000).optional(), accessedAt: z.string().max(30).optional() }).strict();
const dataSchema = z.object({
  "note.markdown": z.array(z.string().min(1).max(15000)).max(10).optional(),
  "note.tags": z.array(z.array(z.string().max(100)).max(30)).max(10).optional(),
  "note.sourceRefs": z.array(z.array(sourceRef).max(30)).max(10).optional(),
  "reviewAttempts.promptSnapshot": z.array(z.string().max(3000)).max(30).optional(),
  "reviewAttempts.recallGrade": z.array(z.enum(["forgot", "hard", "remembered", "mastered"])).max(30).optional(),
  "conceptProgress.masteryScore": z.array(z.number().min(0).max(100)).max(100).optional(),
  "content.conceptId": z.array(z.string().min(1).max(100)).max(4).optional(),
  "content.blocks": z.array(z.unknown()).max(100).optional(),
  "content.sourceIds": z.array(z.string().max(100)).max(30).optional(),
}).strict();

export const requestSchema = z.object({ kind: z.enum(AI_OUTPUT_KINDS), preview: z.unknown(), selectedData: dataSchema, userConfirmed: z.literal(true) }).strict();

export function validateStudyRequest(input: unknown) {
  const request = requestSchema.parse(input);
  assertAiRequestPreview(request.preview);
  const expectedPurpose = request.kind === "confusion-analysis" ? "confusion-analysis" : request.kind === "note-draft" || request.kind === "viewpoint-comparison" ? "note-organization" : "study-draft";
  if (request.preview.purpose !== expectedPurpose) throw new Error("任务类型与授权用途不一致");
  const allowed = new Set(request.preview.includedFields);
  if (Object.keys(request.selectedData).some(key => !allowed.has(key))) throw new Error("请求包含未授权字段");
  const data = request.selectedData;
  const noteCount = data["note.markdown"]?.length ?? 0;
  if (noteCount !== (data["note.tags"]?.length ?? 0) || noteCount !== (data["note.sourceRefs"]?.length ?? 0)) throw new Error("笔记字段未逐条对应");
  const reviewCount = data["reviewAttempts.promptSnapshot"]?.length ?? 0;
  if (reviewCount !== (data["reviewAttempts.recallGrade"]?.length ?? 0)) throw new Error("作答字段未逐条对应");
  const ids = data["content.conceptId"] ?? [];
  if (new Set(ids).size !== ids.length) throw new Error("知识选择重复");
  if (ids.length || data["content.blocks"] || data["content.sourceIds"]) {
    const expected = selectedContentData(ids);
    for (const key of ["content.blocks", "content.sourceIds"] as const) {
      if (JSON.stringify(data[key]) !== JSON.stringify(expected[key])) throw new Error("知识内容版本已变化，请重新生成预览");
    }
  }
  const materialCount = noteCount + ids.length;
  if (!materialCount && !reviewCount) throw new Error("请先选择实际材料");
  if (request.kind === "note-draft" && !noteCount) throw new Error("笔记整理至少选择一篇笔记");
  if (request.kind === "viewpoint-comparison" && materialCount < 2) throw new Error("观点对比至少选择两份笔记或知识材料");
  if (request.kind === "confusion-analysis" && !reviewCount) throw new Error("错题分析需要选择作答记录");
  if (request.kind === "exercise-draft" && !ids.length) throw new Error("出题至少选择一项知识作为答案依据");
  const citations: AiSourceCitation[] = [
    ...ids.map(id => ({ sourceId: id, label: KNOWLEDGE_CONCEPTS.find(item => item.id === id)?.title ?? HEXAGRAMS.find(item => item.id === id)!.name })),
    ...Array.from({ length: noteCount }, (_, index) => ({ sourceId: `selected-note-${index + 1}`, label: `选定笔记 ${index + 1}` })),
    ...(reviewCount ? [{ sourceId: "selected-review-history", label: `选定的 ${reviewCount} 条作答记录` }] : []),
  ];
  return { kind: request.kind, request: { preview: request.preview, selectedData: data, userConfirmed: true } as AiProviderRequest, citations };
}

export const questionSchema = z.object({ question: z.string().min(1).max(1500), options: z.array(z.string().min(1).max(500)).length(4), answerIndex: z.number().int().min(0).max(3), explanation: z.string().min(1).max(3000), sourceIds: z.array(z.string()).min(1).max(10) }).strict();
export type StudyQuestion = z.infer<typeof questionSchema>;
export const modelOutputSchema = z.object({ text: z.string().min(1).max(18000), sourceIds: z.array(z.string()).min(1).max(20), questions: z.array(questionSchema).max(5) }).strict();
