import { z } from "zod";
import { assertHexagramDataset, HEXAGRAMS } from "@/core/iching/hexagrams";
import { TRIGRAMS } from "@/core/iching/trigrams";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { EXERCISES, type Exercise } from "@/content/exercises";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { SOURCE_CITATION_POLICY, SOURCE_REGISTRY, type ContentSource } from "@/content/sources";
import { HEXAGRAM_JUDGMENTS, HEXAGRAM_LINE_TEXTS } from "@/content/hexagrams";
import { assertSexagenaryDataset, EARTHLY_BRANCHES, HEAVENLY_STEMS } from "@/content/sexagenary";
import { assertSexagenaryRelations, SEXAGENARY_RELATIONS } from "@/content/sexagenary-relations";
import { assertHeTuLuoShuDataset, HETU_GROUPS, NINE_PALACES } from "@/content/hetu-luoshu";
import { assertCompassDataset, COMPASS_DIRECTIONS } from "@/content/compass";
import { assertCompassLayers, COMPASS_LAYERS } from "@/content/compass-layers";
import { assertAiEvaluationDataset, AI_EVALUATION_CASES } from "@/content/ai-evaluation";
import { validateCalendarEvidenceRegistry } from "@/content/calendar-evidence";
import { isValidHttpUrl } from "@/core/links";
import { isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { assertTrimmedIdentifier } from "@/core/content/identifiers";

const isoTimestampSchema = z.string().refine(isValidIsoTimestamp, "时间必须是带时区且日期真实存在的 ISO 时间戳");
const localDateSchema = z.string().refine(isValidLocalDate, "日期必须是实际存在的 YYYY-MM-DD 日期");
const fiveElementNameSchema = z.enum(["木", "火", "土", "金", "水"]);

const conceptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  stage: z.string().min(1),
  prerequisites: z.array(z.string()),
  keywords: z.array(z.string()),
  body: z.array(z.string()).min(1),
  blocks: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["canonical", "editorial", "external_view", "computed"]),
    title: z.string().optional(),
    markdown: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
    traditionTags: z.array(z.string().min(1)),
    reviewedAt: isoTimestampSchema.optional(),
  }).strict()).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  reviewStatus: z.enum(["draft", "reviewed", "published"]),
  commonConfusions: z.array(z.string().min(1)).optional(),
  relatedConceptIds: z.array(z.string().min(1)).optional(),
  exerciseTemplateIds: z.array(z.string().min(1)).optional(),
  contentVersion: z.number().int().positive().optional(),
}).strict();

const exerciseSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  prompt: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  display: z.string().min(1),
  // Free-form recall exercises may intentionally have no distractor choices;
  // choice-based exercises are constrained below with response-type-aware
  // invariants.
  choices: z.array(z.string()),
  answer: z.string().min(1),
  explanation: z.string().min(1),
  responseType: z.enum(["choice", "text"]).optional(),
  mode: z.enum(["immediate", "review"]).optional(),
}).strict();
const fiveElementSchema = z.object({
  id: z.enum(["wood", "fire", "earth", "metal", "water"]),
  name: fiveElementNameSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  generates: fiveElementNameSchema,
  controls: fiveElementNameSchema,
  nature: z.string().min(1),
}).strict();
const sourceSchema = z.object({ id: z.string().min(1), kind: z.enum(["classic", "book", "video", "web", "personal"]), title: z.string().min(1), author: z.string().optional(), edition: z.string().optional(), publisher: z.string().optional(), year: z.string().optional(), locator: z.string().optional(), url: z.string().refine(isValidHttpUrl, "来源链接必须使用带主机的 HTTP(S) 地址").optional(), accessedAt: localDateSchema.optional(), status: z.enum(["verified", "needs-review"]), copyrightNote: z.string().min(1), reviewOwner: z.enum(["content-owner", "project-maintainer", "user"]), usePolicy: z.enum(["verbatim-allowed", "metadata-only", "user-supplied"]) }).strict();
const trigramSchema = z.object({ id: z.string().min(1), name: z.string().min(1), symbol: z.string().min(1), lines: z.tuple([z.union([z.literal(0), z.literal(1)]), z.union([z.literal(0), z.literal(1)]), z.union([z.literal(0), z.literal(1)])]), element: z.enum(["木", "火", "土", "金", "水"]), direction: z.string().min(1), directions: z.array(z.object({ system: z.enum(["earlier_heaven", "later_heaven"]), value: z.string().min(1) }).strict()).length(2), nature: z.string().min(1), familyRole: z.string().min(1), bodyAssociations: z.array(z.string().min(1)).min(1), keywords: z.array(z.string().min(1)).min(1), sourceIds: z.array(z.string().min(1)).min(1) }).strict();
const contentBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["canonical", "editorial", "external_view", "computed"]),
  title: z.string().optional(),
  markdown: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  traditionTags: z.array(z.string().min(1)),
  reviewedAt: isoTimestampSchema.optional(),
}).strict();
const judgmentSchema = z.object({ id: z.string().min(1), hexagramId: z.string().min(1), canonicalText: z.string().min(1).nullable(), blocks: z.array(contentBlockSchema), sourceIds: z.array(z.string().min(1)).min(1), status: z.enum(["pending", "verified"]), contentVersion: z.number().int().positive() }).strict();
const lineTextSchema = judgmentSchema.extend({ position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]) }).strict();

/** Validate one registered source for editorial tooling and import guards. */
export function assertContentSource(source: unknown): void {
  const parsed = sourceSchema.parse(source);
  assertTrimmedIdentifier(parsed.id, `来源 ${parsed.id} 的 ID`);
}

/**
 * Validate the editorial registration policy shared by built-in content and
 * reviewer handoff files. Keeping this at the domain boundary prevents a
 * source from passing one path while violating the other path's required
 * metadata or review ownership rules.
 */
export function assertContentSourceRegistration(
  source: unknown,
): asserts source is ContentSource {
  assertContentSource(source);
  const typedSource = source as ContentSource;
  const policy = SOURCE_CITATION_POLICY[typedSource.kind];
  if (typedSource.usePolicy !== policy.allowedUse) {
    throw new TypeError(
      `来源 ${typedSource.id} 的收录策略与 ${typedSource.kind} 类型不一致`,
    );
  }
  if (
    typedSource.status === "verified" &&
    typedSource.reviewOwner === "content-owner" &&
    typedSource.kind !== "classic"
  ) {
    throw new TypeError(`已核验来源 ${typedSource.id} 仍依赖内容负责人复核`);
  }
  if (typedSource.status === "verified") {
    for (const field of policy.requiredFields) {
      const value = typedSource[field as keyof ContentSource];
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`已核验来源 ${typedSource.id} 缺少必要字段：${field}`);
      }
    }
  }
}

function assertTrimmedSourceIds(sourceIds: readonly string[], label: string): void {
  sourceIds.forEach((sourceId) => {
    assertTrimmedIdentifier(sourceId, `${label}来源 ID`);
  });
}

export function assertContentBlockSourcePolicy(
  block: {
    kind: "canonical" | "editorial" | "external_view" | "computed";
    sourceIds: readonly string[];
  },
  label = "内容块",
): void {
  assertTrimmedSourceIds(block.sourceIds, label);
  const citedSources = block.sourceIds
    .map((sourceId) => SOURCE_REGISTRY.find((source) => source.id === sourceId))
    .filter((source): source is (typeof SOURCE_REGISTRY)[number] => Boolean(source));
  if (
    block.kind === "canonical" &&
    !citedSources.some(
      (source) =>
        source.kind === "classic" &&
        source.status === "verified" &&
        source.usePolicy === "verbatim-allowed",
    )
  ) {
    throw new Error(label + "的 canonical 类型必须引用已核验经典来源");
  }
  if (
    block.kind === "external_view" &&
    !citedSources.some((source) =>
      ["book", "video", "web"].includes(source.kind),
    )
  ) {
    throw new Error(label + "的 external_view 类型必须引用书籍、视频或网页来源");
  }
}

export function assertCanonicalTextStatus(
  record: { status: "pending" | "verified"; canonicalText: string | null },
  label = "经典内容",
): void {
  if (record.status === "verified" && !record.canonicalText?.trim()) {
    throw new Error(`${label}标记为已校对时必须包含原文`);
  }
  if (record.status === "pending" && record.canonicalText !== null) {
    throw new Error(`${label}待校对时不得包含原文`);
  }
}

export function assertConceptRelations(
  concept: {
    id: string;
    prerequisites: readonly string[];
    relatedConceptIds?: readonly string[];
  },
  knownConceptIds: ReadonlySet<string>,
): void {
  concept.prerequisites.forEach((id) => {
    if (!knownConceptIds.has(id)) throw new Error(`知识点 ${concept.id} 引用了不存在的前置知识 ${id}`);
  });
  if (new Set(concept.prerequisites).size !== concept.prerequisites.length) {
    throw new Error(`知识点 ${concept.id} 的前置知识存在重复`);
  }
  if (concept.prerequisites.includes(concept.id)) {
    throw new Error(`知识点 ${concept.id} 不能把自己作为前置知识`);
  }
  const relatedConceptIds = concept.relatedConceptIds ?? [];
  if (new Set(relatedConceptIds).size !== relatedConceptIds.length) {
    throw new Error(`知识点 ${concept.id} 的相关知识存在重复`);
  }
  if (relatedConceptIds.includes(concept.id)) {
    throw new Error(`知识点 ${concept.id} 不能把自己作为相关知识`);
  }
  relatedConceptIds.forEach((id) => {
    if (!knownConceptIds.has(id)) throw new Error(`知识点 ${concept.id} 引用了不存在的相关知识 ${id}`);
  });
}

/**
 * Validate the response mechanics independently from target/content checks.
 * This keeps free-form text exercises valid without weakening choice-item
 * guarantees and makes the contract directly testable by content authors.
 */
export function assertExerciseResponseContract(
  exercise: Pick<Exercise, "id" | "kind" | "responseType" | "choices" | "answer">,
): void {
  if (new Set(exercise.choices).size !== exercise.choices.length) {
    throw new Error(`练习题 ${exercise.id} 的选项存在重复`);
  }
  const responseType = exercise.responseType ?? "choice";
  if (responseType === "choice") {
    if (exercise.kind !== "trigram-arrange-lines" && !exercise.choices.includes(exercise.answer)) {
      throw new Error(`练习题 ${exercise.id} 的答案不在选项中`);
    }
    if (exercise.kind !== "trigram-arrange-lines" && exercise.kind !== "stem-yinyang" && exercise.choices.length < 3) {
      throw new Error(`练习题 ${exercise.id} 的选项不足三个`);
    }
  }
  if (responseType === "text" && exercise.kind === "trigram-arrange-lines") {
    throw new Error(`练习题 ${exercise.id} 不能同时使用文本和逐爻排列交互`);
  }
}

/** Validate the five-element seed independently from the rest of the content. */
export function assertFiveElementDataset(items: readonly unknown[] = FIVE_ELEMENTS): void {
  if (!Array.isArray(items) || items.length !== 5) {
    throw new Error(`五行数据数量错误：当前 ${Array.isArray(items) ? items.length : 0} 条`);
  }
  const parsed = items.map((item) => fiveElementSchema.parse(item));
  const names = parsed.map((element) => element.name);
  if (new Set(parsed.map((element) => element.id)).size !== 5 || new Set(names).size !== 5) {
    throw new Error("五行 ID 或名称存在重复");
  }
  const generatingCycle = ["木", "火", "土", "金", "水"] as const;
  const controllingCycle: Record<(typeof generatingCycle)[number], (typeof generatingCycle)[number]> = {
    木: "土",
    火: "金",
    土: "水",
    金: "木",
    水: "火",
  };
  parsed.forEach((element) => {
    const cycleIndex = generatingCycle.indexOf(element.name);
    if (cycleIndex < 0 || element.generates !== generatingCycle[(cycleIndex + 1) % generatingCycle.length] || element.controls !== controllingCycle[element.name]) {
      throw new Error(`五行 ${element.id} 的相生或相克关系不完整`);
    }
  });
}

export function validateSeedContent(): void {
  assertHexagramDataset();
  if (HEXAGRAM_JUDGMENTS.length !== 64) throw new Error(`卦辞记录数量错误：当前 ${HEXAGRAM_JUDGMENTS.length} 条`);
  if (HEXAGRAM_LINE_TEXTS.length !== 384) throw new Error(`爻辞记录数量错误：当前 ${HEXAGRAM_LINE_TEXTS.length} 条`);
  if (KNOWLEDGE_CONCEPTS.length < 12) throw new Error(`基础知识点不足：当前 ${KNOWLEDGE_CONCEPTS.length} 个`);
  assertFiveElementDataset();
  if (TRIGRAMS.length !== 8) throw new Error("八卦数据数量错误");
  assertSexagenaryDataset();
  assertSexagenaryRelations();
  assertHeTuLuoShuDataset();
  assertCompassDataset();
  assertCompassLayers();
  assertAiEvaluationDataset(AI_EVALUATION_CASES);
  validateCalendarEvidenceRegistry();
  const allStaticSourceIds = [...HEAVENLY_STEMS, ...EARTHLY_BRANCHES, ...SEXAGENARY_RELATIONS, ...HETU_GROUPS, ...NINE_PALACES, ...COMPASS_DIRECTIONS, ...COMPASS_LAYERS].flatMap((item) => item.sourceIds);
  const signatures = new Set(TRIGRAMS.map((item) => item.lines.join("")));
  if (signatures.size !== 8) throw new Error("八卦签名存在重复");
  const ids = new Set(KNOWLEDGE_CONCEPTS.map((item) => item.id));
  const sourceIds = new Set(SOURCE_REGISTRY.map((source) => source.id));
  if (sourceIds.size !== SOURCE_REGISTRY.length) throw new Error("来源 ID 存在重复");
  SOURCE_REGISTRY.forEach((source) => {
    assertContentSourceRegistration(source);
  });
  allStaticSourceIds.forEach((sourceId) => {
    assertTrimmedIdentifier(sourceId, "静态内容来源 ID");
    if (!sourceIds.has(sourceId)) throw new Error(`干支数据引用了不存在的来源 ${sourceId}`);
  });
  TRIGRAMS.forEach((trigram) => {
    trigramSchema.parse(trigram);
    assertTrimmedIdentifier(trigram.id, `八卦 ${trigram.id} 的 ID`);
    trigram.sourceIds.forEach((sourceId) => {
      assertTrimmedIdentifier(sourceId, `八卦 ${trigram.id} 的来源 ID`);
      if (!sourceIds.has(sourceId)) throw new Error(`八卦 ${trigram.id} 引用了不存在的来源 ${sourceId}`);
    });
  });
  const judgmentIds = new Set<string>();
  HEXAGRAM_JUDGMENTS.forEach((judgment) => {
    judgmentSchema.parse(judgment);
    assertTrimmedIdentifier(judgment.id, `卦辞 ${judgment.id} 的 ID`);
    assertTrimmedIdentifier(judgment.hexagramId, `卦辞 ${judgment.id} 的卦 ID`);
    if (judgmentIds.has(judgment.id)) throw new Error(`卦辞 ID 存在重复：${judgment.id}`);
    judgmentIds.add(judgment.id);
    if (!HEXAGRAMS.some((hexagram) => hexagram.id === judgment.hexagramId)) throw new Error(`卦辞引用了不存在的卦：${judgment.hexagramId}`);
    judgment.sourceIds.forEach((sourceId) => {
      assertTrimmedIdentifier(sourceId, `卦辞 ${judgment.id} 的来源 ID`);
      if (!sourceIds.has(sourceId)) throw new Error(`卦辞引用了不存在的来源：${sourceId}`);
    });
    judgment.blocks.forEach((block) => {
      assertTrimmedIdentifier(block.id, `卦辞 ${judgment.id} 内容块的 ID`);
      assertContentBlockSourcePolicy(block, "卦辞 " + judgment.id);
      block.sourceIds.forEach((sourceId) => {
        if (!sourceIds.has(sourceId)) throw new Error(`卦辞内容块引用了不存在的来源：${sourceId}`);
      });
    });
    assertCanonicalTextStatus(judgment, `卦辞 ${judgment.id}`);
  });
  HEXAGRAMS.forEach((hexagram) => {
    if (HEXAGRAM_JUDGMENTS.filter((judgment) => judgment.hexagramId === hexagram.id).length !== 1) throw new Error(`每卦必须恰好有一条卦辞：${hexagram.id}`);
  });
  const lineTextIds = new Set<string>();
  HEXAGRAM_LINE_TEXTS.forEach((lineText) => {
    lineTextSchema.parse(lineText);
    assertTrimmedIdentifier(lineText.id, `爻辞 ${lineText.id} 的 ID`);
    assertTrimmedIdentifier(lineText.hexagramId, `爻辞 ${lineText.id} 的卦 ID`);
    if (lineTextIds.has(lineText.id)) throw new Error(`爻辞 ID 存在重复：${lineText.id}`);
    lineTextIds.add(lineText.id);
    if (!HEXAGRAMS.some((hexagram) => hexagram.id === lineText.hexagramId)) throw new Error(`爻辞引用了不存在的卦：${lineText.hexagramId}`);
    lineText.sourceIds.forEach((sourceId) => {
      assertTrimmedIdentifier(sourceId, `爻辞 ${lineText.id} 的来源 ID`);
      if (!sourceIds.has(sourceId)) throw new Error(`爻辞引用了不存在的来源：${sourceId}`);
    });
    lineText.blocks.forEach((block) => {
      assertTrimmedIdentifier(block.id, `爻辞 ${lineText.id} 内容块的 ID`);
      assertContentBlockSourcePolicy(block, "爻辞 " + lineText.id);
      block.sourceIds.forEach((sourceId) => {
        if (!sourceIds.has(sourceId)) throw new Error(`爻辞内容块引用了不存在的来源：${sourceId}`);
      });
    });
    assertCanonicalTextStatus(lineText, `爻辞 ${lineText.id}`);
  });
  HEXAGRAMS.forEach((hexagram) => {
    const lines = HEXAGRAM_LINE_TEXTS.filter((lineText) => lineText.hexagramId === hexagram.id);
    if (lines.length !== 6 || new Set(lines.map((lineText) => lineText.position)).size !== 6) throw new Error(`每卦必须有初至上六条爻辞：${hexagram.id}`);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => { if (visiting.has(id)) throw new Error(`知识依赖存在循环：${id}`); if (visited.has(id)) return; visiting.add(id); const concept = KNOWLEDGE_CONCEPTS.find((item) => item.id === id); concept?.prerequisites.forEach(visit); visiting.delete(id); visited.add(id); };
  KNOWLEDGE_CONCEPTS.forEach((concept) => visit(concept.id));
  KNOWLEDGE_CONCEPTS.forEach((concept) => {
    conceptSchema.parse(concept);
    assertTrimmedIdentifier(concept.id, `知识点 ${concept.id} 的 ID`);
    concept.prerequisites.forEach((id) => assertTrimmedIdentifier(id, `知识点 ${concept.id} 的前置知识 ID`));
    (concept.relatedConceptIds ?? []).forEach((id) => assertTrimmedIdentifier(id, `知识点 ${concept.id} 的相关知识 ID`));
    (concept.exerciseTemplateIds ?? []).forEach((id) => assertTrimmedIdentifier(id, `知识点 ${concept.id} 的练习模板 ID`));
    if (concept.blocks.length !== concept.body.length) throw new Error("知识点 " + concept.id + " 的内容块与 body 数量不一致");
    const blockIds = new Set(concept.blocks.map((block) => block.id));
    if (blockIds.size !== concept.blocks.length) throw new Error("知识点 " + concept.id + " 的内容块 ID 存在重复");
    concept.blocks.forEach((block, index) => {
      assertTrimmedIdentifier(block.id, `知识点 ${concept.id} 内容块的 ID`);
      if (block.markdown !== concept.body[index]) throw new Error("知识点 " + concept.id + " 的内容块与 body 内容不一致");
      assertContentBlockSourcePolicy(block, "知识点 " + concept.id);
      block.sourceIds.forEach((sourceId) => {
        assertTrimmedIdentifier(sourceId, `知识点 ${concept.id} 内容块的来源 ID`);
        if (!sourceIds.has(sourceId)) throw new Error("知识点 " + concept.id + " 的内容块引用了不存在的来源 " + sourceId);
      });
    });
    assertConceptRelations(concept, ids);
    concept.sourceIds.forEach((sourceId) => {
      assertTrimmedIdentifier(sourceId, `知识点 ${concept.id} 的来源 ID`);
      if (!sourceIds.has(sourceId)) throw new Error(`知识点 ${concept.id} 引用了不存在的来源 ${sourceId}`);
    });
  });
  const exerciseIds = new Set(EXERCISES.map((exercise) => exercise.id));
  if (exerciseIds.size !== EXERCISES.length) throw new Error("练习题 ID 存在重复");
  const kinds = new Set(EXERCISES.map((exercise) => exercise.kind));
  if (kinds.size < 8) throw new Error(`练习题类型不足：当前 ${kinds.size} 类`);
  EXERCISES.forEach((exercise) => {
    exerciseSchema.parse(exercise);
    assertTrimmedIdentifier(exercise.id, `练习题 ${exercise.id} 的 ID`);
    assertTrimmedIdentifier(exercise.targetId, `练习题 ${exercise.id} 的目标 ID`);
    assertExerciseResponseContract(exercise);
    const validTarget = exercise.targetType === "concept" ? ids.has(exercise.targetId) : exercise.targetType === "trigram" ? TRIGRAMS.some((item) => item.id === exercise.targetId) : exercise.targetType === "hexagram" ? HEXAGRAMS.some((item) => item.id === exercise.targetId) : exercise.targetType === "five-element" ? ["wood", "fire", "earth", "metal", "water"].includes(exercise.targetId) : false;
    if (!validTarget) throw new Error(`练习题 ${exercise.id} 引用了不存在的目标 ${exercise.targetId}`);
  });
  KNOWLEDGE_CONCEPTS.forEach((concept) => {
    const count = EXERCISES.filter((exercise) => exercise.targetType === "concept" && exercise.targetId === concept.id && exercise.mode !== "review").length;
    if (count < 2 || count > 5) throw new Error(`知识点 ${concept.id} 的即时练习应为 2～5 道，当前 ${count} 道`);
  });
  TRIGRAMS.forEach((trigram) => {
    const count = EXERCISES.filter((exercise) => exercise.targetType === "trigram" && exercise.targetId === trigram.id && exercise.mode !== "review").length;
    if (count < 1) throw new Error(`八卦 ${trigram.id} 缺少即时练习`);
  });
  FIVE_ELEMENTS.forEach((element) => {
    const count = EXERCISES.filter((exercise) => exercise.targetType === "five-element" && exercise.targetId === element.id && exercise.mode !== "review").length;
    if (count < 1) throw new Error(`五行 ${element.id} 缺少即时练习`);
  });
  HEXAGRAMS.forEach((hexagram) => {
    const count = EXERCISES.filter((exercise) => exercise.targetType === "hexagram" && exercise.targetId === hexagram.id && exercise.mode !== "review").length;
    if (count < 1) throw new Error(`六十四卦 ${hexagram.id} 缺少即时练习`);
  });
  if (EXERCISES.length < 80) throw new Error(`首批练习题不足：当前 ${EXERCISES.length} 道`);
}
