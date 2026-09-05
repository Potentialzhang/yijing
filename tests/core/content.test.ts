import { describe, expect, it } from "vitest";
import {
  assertCanonicalTextStatus,
  assertContentBlockSourcePolicy,
  assertContentSource,
  assertConceptRelations,
  assertExerciseResponseContract,
  assertFiveElementDataset,
  validateSeedContent,
} from "@/core/content/validate";
import { HEXAGRAMS } from "@/core/iching";
import { TRIGRAMS } from "@/core/iching";
import { EXERCISES } from "@/content/exercises";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { KNOWLEDGE_CONCEPTS, ORDERED_KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { HEXAGRAM_JUDGMENTS, HEXAGRAM_LINE_TEXTS } from "@/content/hexagrams";
import { HETU_GROUPS, LUOSHU_GRID, NINE_PALACES, assertHeTuLuoShuDataset } from "@/content/hetu-luoshu";
import { SOURCE_CITATION_POLICY, SOURCE_REGISTRY } from "@/content/sources";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS, assertSexagenaryDataset } from "@/content/sexagenary";
import { SEXAGENARY_RELATIONS, assertSexagenaryRelations } from "@/content/sexagenary-relations";
import { COMPASS_DIRECTIONS, assertCompassDataset } from "@/content/compass";
import { COMPASS_LAYERS, assertCompassLayers } from "@/content/compass-layers";
import { createSelfTestResult, getSelfTestExercises, parseSelfTestResult, SELF_TEST_EXERCISE_IDS } from "@/core/onboarding/self-test";
import { normalizeErratumForWrite } from "@/core/content/errata";
import { validateCalendarEvidenceRegistry } from "@/content/calendar-evidence";
import { DRAFT_CALENDAR_RULE_SET } from "@/core/calendar/rules";
import { assertTrimmedIdentifier } from "@/core/content/identifiers";
import { parseContentSourceHandoff, serializeContentSourceHandoff } from "@/core/content/source-handoff";
import type { ContentErratumRecord } from "@/db/schema";

describe("首批内容完整性", () => {
  it("通过八卦、六十四卦和知识依赖校验", () => {
    expect(() => validateSeedContent()).not.toThrow();
    expect(HEXAGRAMS.every((hexagram) => hexagram.unicodeSymbol.length > 0)).toBe(true);
    expect(KNOWLEDGE_CONCEPTS.length).toBeGreaterThanOrEqual(12);
    expect(HEAVENLY_STEMS).toHaveLength(10);
    expect(EARTHLY_BRANCHES).toHaveLength(12);
    expect(new Set(HEAVENLY_STEMS.map((item) => item.name)).size).toBe(10);
    expect(new Set(EARTHLY_BRANCHES.map((item) => item.name)).size).toBe(12);
    expect(HEAVENLY_STEMS.every((item) => item.sourceIds.length > 0 && item.element && item.yinYang)).toBe(true);
    expect(EARTHLY_BRANCHES.every((item) => item.sourceIds.length > 0 && item.element && item.yinYang && item.direction && item.doubleHour)).toBe(true);
    expect(() => assertSexagenaryDataset(
      HEAVENLY_STEMS.map((item, index) => index === 0 ? { ...item, index: 2 } : item),
      EARTHLY_BRANCHES,
    )).toThrow(/顺序错误/);
    expect(() => assertSexagenaryDataset(
      HEAVENLY_STEMS.map((item, index) => index === 0 ? { ...item, unexpected: true } : item),
      EARTHLY_BRANCHES,
    )).toThrow();
    expect(TRIGRAMS.every((trigram) => trigram.sourceIds.length > 0)).toBe(true);
    expect(KNOWLEDGE_CONCEPTS.every((concept) =>
      concept.blocks.length === concept.body.length &&
      concept.blocks.every((block) =>
        block.kind === "editorial" &&
        block.traditionTags.includes("通用基础") &&
        block.sourceIds.length > 0,
      ),
    )).toBe(true);
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
    expect(() => assertFiveElementDataset(FIVE_ELEMENTS.map((element, index) => index === 0 ? { ...element, generates: "木" } : element))).toThrow(/相生或相克/);
    expect(() => assertFiveElementDataset(FIVE_ELEMENTS.map((element, index) => index === 0 ? { ...element, color: "red" } : element))).toThrow();
    expect(() => assertFiveElementDataset(FIVE_ELEMENTS.map((element, index) => index === 0 ? { ...element, unexpected: true } : element))).toThrow();
    expect(() => assertHeTuLuoShuDataset(
      HETU_GROUPS.map((group, index) => index === 0 ? { ...group, unexpected: true } : group),
      LUOSHU_GRID,
      NINE_PALACES,
    )).toThrow();
    expect(() => assertHeTuLuoShuDataset(
      HETU_GROUPS,
      LUOSHU_GRID.map((cell, index) => index === 0 ? { ...cell, number: 1 } : cell),
      NINE_PALACES,
    )).toThrow(/九宫格/);
    expect(() => assertCompassDataset(COMPASS_DIRECTIONS.map((direction, index) => index === 0 ? { ...direction, unexpected: true } : direction))).toThrow();
    expect(() => assertCompassDataset(COMPASS_DIRECTIONS.map((direction, index) => index === 0 ? { ...direction, centerDegrees: 1 } : direction))).toThrow(/字段不完整/);
    expect(() => assertCompassDataset(COMPASS_DIRECTIONS.map((direction, index) => index === 0 ? { ...direction, id: "east" as const } : index === 2 ? { ...direction, id: "north" as const } : direction))).toThrow(/顺序错误/);
    expect(() => assertCompassLayers(COMPASS_LAYERS.map((layer, index) => index === 0 ? { ...layer, unexpected: true } : layer))).toThrow();
    expect(TRIGRAMS.every((trigram) => EXERCISES.some((exercise) => exercise.targetType === "trigram" && exercise.targetId === trigram.id && exercise.mode !== "review"))).toBe(true);
    expect(FIVE_ELEMENTS.every((element) => EXERCISES.some((exercise) => exercise.targetType === "five-element" && exercise.targetId === element.id && exercise.mode !== "review"))).toBe(true);
    expect(HEXAGRAMS.every((hexagram) => EXERCISES.some((exercise) => exercise.targetType === "hexagram" && exercise.targetId === hexagram.id && exercise.mode !== "review"))).toBe(true);
    expect(HEXAGRAM_JUDGMENTS).toHaveLength(64);
    expect(HEXAGRAM_LINE_TEXTS).toHaveLength(384);
    expect(HEXAGRAM_LINE_TEXTS.every((item) => item.status === "verified" && !!item.canonicalText?.trim() && item.blocks.length > 0)).toBe(true);
    expect(HEXAGRAM_JUDGMENTS.every((item) => item.status === "verified" && !!item.canonicalText?.trim() && item.blocks.length > 0)).toBe(true);
    expect(HEXAGRAM_LINE_TEXTS.every((item) => item.blocks.length > 0)).toBe(true);
    expect(ORDERED_KNOWLEDGE_CONCEPTS.map((concept) => concept.id)).toEqual([
      "yin-yang-lines", "five-elements", "trigrams", "trigram-images", "earlier-later-heaven",
      "hexagram-composition", "line-positions", "king-wen-sequence", "changing-lines", "relation-hexagrams",
      "content-sources", "heavenly-stems", "earthly-branches", "hetu-luoshu", "nine-palaces", "active-recall",
    ]);
  });

  it("快速自测题目固定且结果只保存推荐分层", () => {
    expect(getSelfTestExercises().map((exercise) => exercise.id)).toEqual(SELF_TEST_EXERCISE_IDS);
    const result = createSelfTestResult([true, false, true, true, false], "2026-08-26T00:00:00.000Z");
    expect(result).toMatchObject({ score: 3, total: 5, level: "developing" });
    expect(parseSelfTestResult(JSON.stringify(result))).toEqual(result);
    expect(parseSelfTestResult(JSON.stringify({ ...result, score: 5 }))).toBeNull();
    expect(parseSelfTestResult(JSON.stringify({ ...result, completedAt: "0" }))).toBeNull();
    expect(() => createSelfTestResult([true], "2026-02-30T00:00:00.000Z")).toThrow(/完成时间无效/);
    expect(() => createSelfTestResult([true, "yes" as never])).toThrow(/答案必须是布尔值/);
  });

  it("来源登记覆盖内容类别并遵循收录策略", () => {
    expect(new Set(SOURCE_REGISTRY.map((source) => source.kind))).toEqual(new Set(["classic", "book", "video", "web", "personal"]));
    for (const source of SOURCE_REGISTRY) {
      expect(source.usePolicy).toBe(SOURCE_CITATION_POLICY[source.kind].allowedUse);
      expect(source.reviewOwner).toBeTruthy();
      expect(source.copyrightNote).toBeTruthy();
    }
    expect(SOURCE_REGISTRY.filter((source) => source.status === "needs-review").length).toBeGreaterThanOrEqual(4);
  });

  it("来源登记交接表可以严格回载且不接受重复或未知字段", () => {
    const serialized = serializeContentSourceHandoff(SOURCE_REGISTRY);
    const parsed = parseContentSourceHandoff(serialized);
    expect(parsed.sources).toHaveLength(SOURCE_REGISTRY.length);
    expect(parsed.sources.map((source) => source.id)).toEqual(SOURCE_REGISTRY.map((source) => source.id));
    expect(() => parseContentSourceHandoff(JSON.stringify({
      templateVersion: 1,
      purpose: "content-source-registration",
      sources: [SOURCE_REGISTRY[0], SOURCE_REGISTRY[0]],
    }))).toThrow(/重复 ID/);
    expect(() => parseContentSourceHandoff(JSON.stringify({
      templateVersion: 1,
      purpose: "content-source-registration",
      sources: [{ ...SOURCE_REGISTRY[0], unexpected: true }],
    }))).toThrow(/第 1 条无效/);
  });

  it("来源登记回载会校验收录策略和已核验来源的必要元数据", () => {
    const pendingWeb = SOURCE_REGISTRY.find((source) => source.kind === "web" && source.status === "needs-review");
    expect(pendingWeb).toBeTruthy();
    expect(() => parseContentSourceHandoff({
      templateVersion: 1,
      purpose: "content-source-registration",
      sources: [{
        ...pendingWeb!,
        status: "verified",
        reviewOwner: "user",
      }],
    })).toThrow(/缺少必要字段：url/);
    expect(() => parseContentSourceHandoff({
      templateVersion: 1,
      purpose: "content-source-registration",
      sources: [{
        ...pendingWeb!,
        usePolicy: "verbatim-allowed",
      }],
    })).toThrow(/收录策略/);
    expect(() => parseContentSourceHandoff({
      templateVersion: 1,
      purpose: "content-source-registration",
      sources: [{
        ...pendingWeb!,
        status: "verified",
        reviewOwner: "content-owner",
        url: "https://example.com/source",
        accessedAt: "2026-09-04",
      }],
    })).toThrow(/仍依赖内容负责人复核/);
  });

  it("历法交接登记只能引用全局来源表中的来源", () => {
    expect(() => validateCalendarEvidenceRegistry([], {
      ...DRAFT_CALENDAR_RULE_SET,
      sourceIds: ["source-does-not-exist"],
    })).toThrow(/未登记来源/);
    expect(() => validateCalendarEvidenceRegistry([], DRAFT_CALENDAR_RULE_SET, ["source-project-editorial", "source-project-editorial"])).toThrow(/重复/);
    expect(() => validateCalendarEvidenceRegistry([], DRAFT_CALENDAR_RULE_SET, [" "])).toThrow(/空 ID/);
  });

  it("accepted 历法规则集不能引用待核验来源", () => {
    expect(() => validateCalendarEvidenceRegistry([], {
      ...DRAFT_CALENDAR_RULE_SET,
      yearBoundary: "lunar-new-year",
      monthBoundary: "solar-term-month",
      dayBoundary: "civil-midnight",
      timeZoneBasis: "standard-time",
      status: "accepted",
      sourceIds: ["source-modern-book-pending"],
      authoritativeSampleIds: ["sample-year", "sample-month", "sample-day", "sample-zi", "sample-time-zone", "sample-solar-term"],
    })).toThrow(/accepted 历法规则集 .*未核验来源/);
  });

  it("历法样例的节气来源必须属于规则集来源清单", () => {
    const ruleSet = {
      ...DRAFT_CALENDAR_RULE_SET,
      sourceIds: ["source-project-editorial"],
    };
    const sample = {
      id: "sample-solar-term-source-policy",
      title: "节气来源归属边界",
      ruleVersion: ruleSet.id,
      boundary: "solar-term" as const,
      input: {
        instant: "2026-08-26T12:00",
        timeZone: "Asia/Shanghai",
        ruleVersion: ruleSet.id,
      },
      expected: {
        localDateTime: "2026-08-26T12:00:00",
        utcInstant: null,
        lunar: null,
        solarTerm: {
          name: "待核对节气",
          occurredAt: "2026-08-26T04:00:00.000Z",
          timeZone: "Asia/Shanghai",
          precision: "instant" as const,
          sourceIds: ["source-modern-book-pending"],
        },
        sexagenary: {},
      },
      sourceIds: ["source-project-editorial"],
      status: "pending" as const,
    };
    expect(() => validateCalendarEvidenceRegistry([sample], ruleSet)).toThrow(/节气结果引用了规则集未登记的来源/);
  });

  it("来源链接只接受带主机的 HTTP(S) 地址", () => {
    const base = {
      id: "source-test",
      kind: "web",
      title: "测试网页",
      url: "https://example.com/reference",
      accessedAt: "2026-08-29",
      status: "needs-review",
      copyrightNote: "测试来源",
      reviewOwner: "content-owner",
      usePolicy: "metadata-only",
    } as const;
    expect(() => assertContentSource(base)).not.toThrow();
    expect(() => assertContentSource({ ...base, unexpected: true })).toThrow();
    expect(() => assertContentSource({ ...base, url: "mailto:test@example.com" })).toThrow(/HTTP\(S\)/);
    expect(() => assertContentSource({ ...base, url: "http:opaque" })).toThrow(/HTTP\(S\)/);
    expect(() => assertContentSource({ ...base, accessedAt: "2026-02-30" })).toThrow(/实际存在/);
    expect(() => assertContentSource({ ...base, id: " source-test" })).toThrow(/已修剪/);
    expect(() => assertContentBlockSourcePolicy({ kind: "external_view", sourceIds: [" source-modern-web-pending"] })).toThrow(/已修剪/);
  });

  it("共享业务标识符契约拒绝空白和前后空格", () => {
    expect(() => assertTrimmedIdentifier("", "测试 ID")).toThrow(/已修剪/);
    expect(() => assertTrimmedIdentifier(" test-id", "测试 ID")).toThrow(/已修剪/);
    expect(() => assertTrimmedIdentifier("test-id ", "测试 ID")).toThrow(/已修剪/);
    expect(() => assertTrimmedIdentifier("test-id", "测试 ID")).not.toThrow();
  });

  it("静态内容模块的独立校验器也拒绝未修剪标识符", () => {
    expect(() => assertSexagenaryDataset(
      HEAVENLY_STEMS.map((item, index) => index === 0 ? { ...item, sourceIds: [" source-project-editorial"] } : item),
      EARTHLY_BRANCHES,
    )).toThrow(/已修剪/);
    expect(() => assertSexagenaryRelations(
      SEXAGENARY_RELATIONS.map((item, index) => index === 0 ? { ...item, leftId: " jia" } : item),
    )).toThrow();
    expect(() => assertHeTuLuoShuDataset(
      HETU_GROUPS.map((item, index) => index === 0 ? { ...item, sourceIds: [" source-project-editorial"] } : item),
      LUOSHU_GRID,
      NINE_PALACES,
    )).toThrow(/已修剪/);
    expect(() => assertCompassDataset(
      COMPASS_DIRECTIONS.map((item, index) => index === 0 ? { ...item, sourceIds: [" source-project-editorial"] } : item),
    )).toThrow(/已修剪/);
    expect(() => assertCompassLayers(
      COMPASS_LAYERS.map((item, index) => index === 0 ? { ...item, sourceIds: [" source-project-editorial"] } : item),
    )).toThrow(/已修剪/);
  });

  it("内容块类型不会越过来源使用策略", () => {
    expect(() =>
      assertContentBlockSourcePolicy({
        kind: "canonical",
        sourceIds: ["source-zhouyi-classic-pending"],
      }),
    ).toThrow(/已核验经典来源/);
    expect(() =>
      assertContentBlockSourcePolicy({
        kind: "external_view",
        sourceIds: ["source-project-editorial"],
      }),
    ).toThrow(/书籍、视频或网页来源/);
  });

  it("经典内容的校对状态必须与原文存在性一致", () => {
    expect(() => assertCanonicalTextStatus({ status: "verified", canonicalText: null }, "测试卦辞")).toThrow(/已校对时必须包含原文/);
    expect(() => assertCanonicalTextStatus({ status: "verified", canonicalText: "   " }, "测试爻辞")).toThrow(/已校对时必须包含原文/);
    expect(() => assertCanonicalTextStatus({ status: "pending", canonicalText: "不应展示" }, "测试卦辞")).toThrow(/待校对时不得包含原文/);
    expect(() => assertCanonicalTextStatus({ status: "verified", canonicalText: "乾：元亨" })).not.toThrow();
    expect(() => assertCanonicalTextStatus({ status: "pending", canonicalText: null })).not.toThrow();
  });

  it("勘误写入必须保留可追溯的状态历史", () => {
    const record: ContentErratumRecord = {
      id: "erratum-write",
      targetType: "concept",
      targetId: "yin-yang-lines",
      category: "question",
      description: "需要核对这个定义。",
      proposedText: "",
      sourceRef: "",
      contentVersion: 1,
      status: "open",
      history: [{ status: "open", at: "2026-08-30T00:00:00.000Z" }],
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    };
    expect(normalizeErratumForWrite(record)).toMatchObject({ id: "erratum-write" });
    expect(() => normalizeErratumForWrite({ ...record, history: [] })).toThrow(/状态历史不能为空/);
    expect(() => normalizeErratumForWrite({ ...record, status: "resolved" })).toThrow(/状态与状态历史不一致/);
    expect(() => normalizeErratumForWrite({ ...record, history: [{ status: "resolved", at: "2026-08-30T00:00:00.000Z" }] })).toThrow(/首个状态/);
    expect(() => normalizeErratumForWrite({ ...record, description: "   " })).toThrow(/描述不能为空/);
    expect(() => normalizeErratumForWrite({ ...record, unexpected: true } as never)).toThrow(/未声明字段/);
  });

  it("干支复习模板覆盖静态字段且不挤占即时练习配额", () => {
    const stemKinds = new Set(EXERCISES.filter((exercise) => exercise.id.startsWith("stem-")).map((exercise) => exercise.kind));
    const branchKinds = new Set(EXERCISES.filter((exercise) => exercise.id.startsWith("branch-")).map((exercise) => exercise.kind));
    expect(stemKinds).toEqual(new Set(["stem-element", "stem-yinyang", "stem-name"]));
    expect(branchKinds).toEqual(new Set(["branch-element", "branch-direction", "branch-hour", "branch-name"]));
    expect(EXERCISES.filter((exercise) => exercise.targetId === "heavenly-stems" && exercise.mode !== "review")).toHaveLength(3);
    expect(EXERCISES.filter((exercise) => exercise.targetId === "earthly-branches" && exercise.mode !== "review")).toHaveLength(3);
    expect(EXERCISES.filter((exercise) => exercise.mode === "review")).toHaveLength(137);
  });

  it("干支关系按五合、六合、六冲分层且数量固定", () => {
    expect(() => assertSexagenaryRelations()).not.toThrow();
    expect(() => assertSexagenaryRelations(SEXAGENARY_RELATIONS.map((relation, index) => index === 0 ? { ...relation, unexpected: true } : relation))).toThrow();
    expect(SEXAGENARY_RELATIONS.filter((item) => item.kind === "stem-combination")).toHaveLength(5);
    expect(SEXAGENARY_RELATIONS.filter((item) => item.kind === "branch-combination")).toHaveLength(6);
    expect(SEXAGENARY_RELATIONS.filter((item) => item.kind === "branch-clash")).toHaveLength(6);
    expect(EXERCISES.filter((exercise) => exercise.kind === "sexagenary-relation")).toHaveLength(17);
    expect(EXERCISES.filter((exercise) => exercise.kind === "sexagenary-relation").every((exercise) => exercise.mode === "review")).toBe(true);
  });

  it("河洛九宫复习模板覆盖方向、数字和关联卦", () => {
    const kinds = new Set(EXERCISES.filter((exercise) => exercise.mode === "review" && (exercise.id.startsWith("hetu-") || exercise.id.startsWith("palace-"))).map((exercise) => exercise.kind));
    expect(kinds).toEqual(new Set(["hetu-direction", "hetu-element", "hetu-numbers", "palace-direction", "palace-number", "palace-trigram"]));
  });

  it("知识点相关关系只引用已登记的概念", () => {
    const ids = new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id));
    for (const concept of KNOWLEDGE_CONCEPTS) {
      expect(concept.relatedConceptIds ?? []).not.toContain(concept.id);
      expect((concept.relatedConceptIds ?? []).every((id) => ids.has(id))).toBe(true);
    }
    expect(KNOWLEDGE_CONCEPTS.filter((concept) => concept.id.startsWith("heavenly") || concept.id.startsWith("earthly") || concept.id === "hetu-luoshu" || concept.id === "nine-palaces").every((concept) => (concept.relatedConceptIds?.length ?? 0) > 0)).toBe(true);
  });

  it("知识点关系拒绝自指、重复和未知目标", () => {
    const known = new Set(["a", "b"]);
    expect(() => assertConceptRelations({ id: "a", prerequisites: ["a"] }, known)).toThrow(/自己作为前置知识/);
    expect(() => assertConceptRelations({ id: "a", prerequisites: [], relatedConceptIds: ["b", "b"] }, known)).toThrow(/相关知识存在重复/);
    expect(() => assertConceptRelations({ id: "a", prerequisites: [], relatedConceptIds: ["missing"] }, known)).toThrow(/不存在的相关知识/);
    expect(() => assertConceptRelations({ id: "a", prerequisites: [], relatedConceptIds: ["a"] }, known)).toThrow(/自己作为相关知识/);
  });

  it("文本练习允许空选项，但选择题仍保持答案和干扰项约束", () => {
    expect(() => assertExerciseResponseContract({ id: "text", kind: "trigram-direction", responseType: "text", choices: [], answer: "东北" })).not.toThrow();
    expect(() => assertExerciseResponseContract({ id: "choice", kind: "trigram-name", choices: ["乾", "乾", "坤"], answer: "乾" })).toThrow(/选项存在重复/);
    expect(() => assertExerciseResponseContract({ id: "arrange", kind: "trigram-arrange-lines", responseType: "text", choices: [], answer: "101" })).toThrow(/不能同时使用文本/);
  });
});
