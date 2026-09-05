import { HEXAGRAM_JUDGMENTS, HEXAGRAM_LINE_TEXTS } from "@/content/hexagrams";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { SOURCE_REGISTRY } from "@/content/sources";
import { HEXAGRAMS } from "@/core/iching";
import { isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { isValidHttpUrl } from "@/core/links";
import {
  CALENDAR_EVIDENCE_BOUNDARIES,
  inspectCalendarEvidenceCoverage,
} from "@/core/calendar/evidence";
import {
  CALENDAR_EVIDENCE_RULE_SET,
  CALENDAR_EVIDENCE_SAMPLES,
  getCalendarEvidenceCoverage,
} from "@/content/calendar-evidence";
import type { CalendarEvidenceBoundary } from "@/core/calendar/types";
import { z } from "zod";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";
import { assertContentSourceRegistration } from "@/core/content/validate";

export interface ContentAuditReport {
  reportVersion: 2;
  generatedAt: string;
  policy: {
    includesCanonicalText: false;
    purpose: "content-review";
  };
  concepts: {
    total: number;
    reviewed: number;
    published: number;
    items: Array<{ id: string; title: string; reviewStatus: string; sourceIds: string[] }>;
  };
  judgments: {
    total: number;
    verified: number;
    items: Array<{ id: string; hexagramId: string; status: string; contentVersion: number; sourceIds: string[] }>;
  };
  lines: {
    total: number;
    verified: number;
    items: Array<{ id: string; hexagramId: string; position: number; status: string; contentVersion: number; sourceIds: string[] }>;
  };
  sources: {
    total: number;
    verified: number;
    items: Array<{
      id: string;
      kind: string;
      title: string;
      status: string;
      reviewOwner: string;
      usePolicy: string;
      author?: string;
      edition?: string;
      publisher?: string;
      year?: string;
      locator?: string;
      url?: string;
      accessedAt?: string;
      copyrightNote: string;
    }>;
  };
  calendarEvidence: {
    ruleVersion: string;
    ruleStatus: "draft" | "accepted";
    sourceIds: string[];
    authoritativeSampleIds: string[];
    sampleCount: number;
    verifiedSampleCount: number;
    boundaries: Array<{
      id: CalendarEvidenceBoundary;
      sampleIds: string[];
      verifiedSampleIds: string[];
    }>;
    missingBoundaries: CalendarEvidenceBoundary[];
    unverifiedSampleIds: string[];
    complete: boolean;
  };
  releaseGate: {
    ready: boolean;
    blockers: string[];
  };
}

const auditConceptItemSchema = z.object({
  id: trimmedIdentifierSchema,
  title: z.string().min(1),
  reviewStatus: z.enum(["draft", "reviewed", "published"]),
  sourceIds: z.array(trimmedIdentifierSchema),
}).strict();

const auditJudgmentItemSchema = z.object({
  id: trimmedIdentifierSchema,
  hexagramId: trimmedIdentifierSchema,
  status: z.enum(["pending", "verified"]),
  contentVersion: z.number().int().positive(),
  sourceIds: z.array(trimmedIdentifierSchema),
}).strict();

const auditLineItemSchema = z.object({
  id: trimmedIdentifierSchema,
  hexagramId: trimmedIdentifierSchema,
  position: z.number().int().min(1).max(6),
  status: z.enum(["pending", "verified"]),
  contentVersion: z.number().int().positive(),
  sourceIds: z.array(trimmedIdentifierSchema),
}).strict();

const auditSourceItemSchema = z.object({
  id: trimmedIdentifierSchema,
  kind: z.enum(["classic", "book", "video", "web", "personal"]),
  title: z.string().min(1),
  status: z.enum(["verified", "needs-review"]),
  reviewOwner: z.enum(["content-owner", "project-maintainer", "user"]),
  usePolicy: z.enum(["verbatim-allowed", "metadata-only", "user-supplied"]),
  author: z.string().min(1).optional(),
  edition: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  year: z.string().min(1).optional(),
  locator: z.string().min(1).optional(),
  url: z.string().refine(isValidHttpUrl, "来源链接必须使用带主机的 HTTP(S) 地址").optional(),
  accessedAt: z.string().refine(isValidLocalDate, "来源访问日期无效").optional(),
  copyrightNote: z.string().min(1),
}).strict();

const calendarEvidenceBoundarySchema = z.enum([
  "year",
  "month",
  "day",
  "zi-hour",
  "time-zone",
  "solar-term",
]);
const calendarEvidenceAuditSchema = z.object({
  ruleVersion: trimmedIdentifierSchema,
  ruleStatus: z.enum(["draft", "accepted"]),
  sourceIds: z.array(trimmedIdentifierSchema),
  authoritativeSampleIds: z.array(trimmedIdentifierSchema),
  sampleCount: z.number().int().nonnegative(),
  verifiedSampleCount: z.number().int().nonnegative(),
  boundaries: z.array(z.object({
    id: calendarEvidenceBoundarySchema,
    sampleIds: z.array(trimmedIdentifierSchema),
    verifiedSampleIds: z.array(trimmedIdentifierSchema),
  }).strict()),
  missingBoundaries: z.array(calendarEvidenceBoundarySchema),
  unverifiedSampleIds: z.array(trimmedIdentifierSchema),
  complete: z.boolean(),
}).strict();

const contentAuditReportSchema = z.object({
  reportVersion: z.literal(2),
  generatedAt: z.string().refine(isValidIsoTimestamp, "内容复核报告时间无效"),
  policy: z.object({
    includesCanonicalText: z.literal(false),
    purpose: z.literal("content-review"),
  }).strict(),
  concepts: z.object({
    total: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    items: z.array(auditConceptItemSchema),
  }).strict(),
  judgments: z.object({
    total: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    items: z.array(auditJudgmentItemSchema),
  }).strict(),
  lines: z.object({
    total: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    items: z.array(auditLineItemSchema),
  }).strict(),
  sources: z.object({
    total: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    items: z.array(auditSourceItemSchema),
  }).strict(),
  calendarEvidence: calendarEvidenceAuditSchema,
  releaseGate: z.object({
    ready: z.boolean(),
    blockers: z.array(z.string().min(1)),
  }).strict(),
}).strict();

/** Validate a reviewer hand-off report at the serialization boundary. */
export function assertContentAuditReport(
  report: unknown,
): asserts report is ContentAuditReport {
  const parsed = contentAuditReportSchema.safeParse(report);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.message.includes("已修剪"))) {
      throw new TypeError("内容复核报告标识符必须是已修剪的非空字符串");
    }
    throw new TypeError("内容复核报告字段无效");
  }
  const value = parsed.data;
  const assertUniqueIds = (items: readonly { id: string }[], label: string): void => {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      throw new TypeError(`内容复核报告${label}存在重复 ID`);
    }
  };
  const assertSourceReferences = (
    items: readonly { id: string; sourceIds: string[] }[],
    label: string,
    sourceIds: ReadonlySet<string>,
  ): void => {
    items.forEach((item) => {
      if (item.sourceIds.length === 0)
        throw new TypeError(`内容复核报告${label}缺少来源引用：${item.id}`);
      if (new Set(item.sourceIds).size !== item.sourceIds.length)
        throw new TypeError(`内容复核报告${label}存在重复来源引用：${item.id}`);
      if (item.sourceIds.some((sourceId) => !sourceIds.has(sourceId)))
        throw new TypeError(`内容复核报告${label}引用了未知来源：${item.id}`);
    });
  };
  assertUniqueIds(value.concepts.items, "知识点清单");
  assertUniqueIds(value.judgments.items, "卦辞清单");
  assertUniqueIds(value.lines.items, "爻辞清单");
  assertUniqueIds(value.sources.items, "来源清单");
  if (value.calendarEvidence.boundaries.length !== CALENDAR_EVIDENCE_BOUNDARIES.length) {
    throw new TypeError("历法样例覆盖必须包含六类边界");
  }
  const assertUniqueStrings = (values: readonly string[], label: string): void => {
    if (new Set(values).size !== values.length) throw new TypeError(`${label}不能重复`);
  };
  assertUniqueStrings(value.calendarEvidence.sourceIds, "历法规则来源");
  assertUniqueStrings(value.calendarEvidence.authoritativeSampleIds, "历法权威样例");
  const calendarBoundaryIds = value.calendarEvidence.boundaries.map((item) => item.id);
  if (
    new Set(calendarBoundaryIds).size !== calendarBoundaryIds.length ||
    CALENDAR_EVIDENCE_BOUNDARIES.some((boundary) => !calendarBoundaryIds.includes(boundary))
  ) {
    throw new TypeError("历法样例覆盖边界存在重复或缺失");
  }
  const allCalendarSampleIds = value.calendarEvidence.boundaries.flatMap((item) => item.sampleIds);
  const verifiedCalendarSampleIds = value.calendarEvidence.boundaries.flatMap((item) => item.verifiedSampleIds);
  assertUniqueStrings(allCalendarSampleIds, "历法边界样例");
  assertUniqueStrings(verifiedCalendarSampleIds, "历法已核验样例");
  const expectedMissingBoundaries = value.calendarEvidence.boundaries
    .filter((item) => item.sampleIds.length === 0)
    .map((item) => item.id);
  value.calendarEvidence.boundaries.forEach((boundary) => {
    if (boundary.verifiedSampleIds.some((sampleId) => !boundary.sampleIds.includes(sampleId))) {
      throw new TypeError(`历法边界 ${boundary.id} 的已核验样例不属于该边界`);
    }
  });
  const expectedUnverifiedSampleIds = allCalendarSampleIds.filter(
    (sampleId) => !verifiedCalendarSampleIds.includes(sampleId),
  );
  if (
    allCalendarSampleIds.length !== value.calendarEvidence.sampleCount ||
    verifiedCalendarSampleIds.length !== value.calendarEvidence.verifiedSampleCount ||
    value.calendarEvidence.authoritativeSampleIds.some((id) => !allCalendarSampleIds.includes(id)) ||
    allCalendarSampleIds.some((id) => !value.calendarEvidence.authoritativeSampleIds.includes(id)) ||
    verifiedCalendarSampleIds.some((id) => !allCalendarSampleIds.includes(id)) ||
    expectedMissingBoundaries.length !== value.calendarEvidence.missingBoundaries.length ||
    expectedMissingBoundaries.some((id, index) => id !== value.calendarEvidence.missingBoundaries[index]) ||
    expectedUnverifiedSampleIds.length !== value.calendarEvidence.unverifiedSampleIds.length ||
    expectedUnverifiedSampleIds.some((id, index) => id !== value.calendarEvidence.unverifiedSampleIds[index])
  ) {
    throw new TypeError("历法样例覆盖清单与权威样例 ID 不一致");
  }
  if (
    value.calendarEvidence.verifiedSampleCount > value.calendarEvidence.sampleCount ||
    value.calendarEvidence.unverifiedSampleIds.length !==
      value.calendarEvidence.sampleCount - value.calendarEvidence.verifiedSampleCount ||
    value.calendarEvidence.complete !== (
      value.calendarEvidence.missingBoundaries.length === 0 &&
      value.calendarEvidence.unverifiedSampleIds.length === 0
    )
  ) {
    throw new TypeError("历法样例覆盖统计或完成状态不一致");
  }
  if (value.calendarEvidence.ruleStatus === "accepted" && !value.calendarEvidence.complete) {
    throw new TypeError("accepted 历法规则的样例覆盖尚未完成");
  }
  value.sources.items.forEach((source) => {
    try {
      assertContentSourceRegistration(source);
    } catch (error) {
      throw new TypeError(
        `内容复核报告来源 ${source.id} 校验失败：${error instanceof Error ? error.message : "登记字段无效"}`,
      );
    }
  });
  const knownSourceIds = new Set(value.sources.items.map((item) => item.id));
  const verifiedSourceIds = new Set(
    value.sources.items
      .filter((source) => source.status === "verified")
      .map((source) => source.id),
  );
  if (value.calendarEvidence.sourceIds.some((sourceId) => !knownSourceIds.has(sourceId))) {
    throw new TypeError("内容复核报告历法规则引用了未知来源");
  }
  if (
    value.calendarEvidence.ruleStatus === "accepted" &&
    value.calendarEvidence.sourceIds.length === 0
  ) {
    throw new TypeError("accepted 历法规则必须关联来源");
  }
  if (
    value.calendarEvidence.ruleStatus === "accepted" &&
    value.calendarEvidence.sourceIds.some((sourceId) => !verifiedSourceIds.has(sourceId))
  ) {
    throw new TypeError("accepted 历法规则引用了未核验来源");
  }
  assertSourceReferences(value.concepts.items, "知识点清单", knownSourceIds);
  assertSourceReferences(value.judgments.items, "卦辞清单", knownSourceIds);
  assertSourceReferences(value.lines.items, "爻辞清单", knownSourceIds);
  value.concepts.items.forEach((item) => {
    if (
      item.reviewStatus !== "draft" &&
      !item.sourceIds.some((sourceId) => verifiedSourceIds.has(sourceId))
    ) {
      throw new TypeError(`内容复核报告已复核知识点缺少已核验来源：${item.id}`);
    }
  });
  value.judgments.items.forEach((item) => {
    if (
      item.status === "verified" &&
      !item.sourceIds.some((sourceId) => verifiedSourceIds.has(sourceId))
    ) {
      throw new TypeError(`内容复核报告已核验卦辞缺少已核验来源：${item.id}`);
    }
  });
  value.lines.items.forEach((item) => {
    if (
      item.status === "verified" &&
      !item.sourceIds.some((sourceId) => verifiedSourceIds.has(sourceId))
    ) {
      throw new TypeError(`内容复核报告已核验爻辞缺少已核验来源：${item.id}`);
    }
  });
  const expectedHexagramIds = new Set(HEXAGRAMS.map((hexagram) => hexagram.id));
  if (
    value.judgments.items.length !== expectedHexagramIds.size ||
    new Set(value.judgments.items.map((item) => item.hexagramId)).size !== value.judgments.items.length ||
    value.judgments.items.some((item) => !expectedHexagramIds.has(item.hexagramId))
  ) {
    throw new TypeError("内容复核报告卦辞映射必须覆盖 64 个唯一卦象");
  }
  const lineKeys = new Set(value.lines.items.map((item) => `${item.hexagramId}:${item.position}`));
  if (lineKeys.size !== value.lines.items.length || value.lines.items.length !== expectedHexagramIds.size * 6) {
    throw new TypeError("内容复核报告爻辞映射存在重复或数量错误");
  }
  for (const hexagramId of expectedHexagramIds) {
    const lines = value.lines.items.filter((item) => item.hexagramId === hexagramId);
    if (
      lines.length !== 6 ||
      new Set(lines.map((item) => item.position)).size !== 6 ||
      lines.some((item) => !expectedHexagramIds.has(item.hexagramId))
    ) {
      throw new TypeError(`内容复核报告爻辞映射必须为每卦初至上六个爻位：${hexagramId}`);
    }
  }
  const expectedConceptIds = new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id));
  if (
    value.concepts.items.length !== expectedConceptIds.size ||
    new Set(value.concepts.items.map((item) => item.id)).size !== value.concepts.items.length ||
    value.concepts.items.some((item) => !expectedConceptIds.has(item.id))
  ) {
    throw new TypeError("内容复核报告知识点清单必须覆盖当前目录中的全部唯一知识点");
  }
  const expectedJudgmentTargets = new Map(
    HEXAGRAM_JUDGMENTS.map((judgment) => [judgment.id, judgment.hexagramId]),
  );
  if (
    value.judgments.items.length !== expectedJudgmentTargets.size ||
    value.judgments.items.some((item) =>
      expectedJudgmentTargets.get(item.id) !== item.hexagramId,
    ) ||
    [...expectedJudgmentTargets.keys()].some((id) =>
      !value.judgments.items.some((item) => item.id === id),
    )
  ) {
    throw new TypeError("内容复核报告卦辞条目 ID 与当前目录映射不一致");
  }
  const expectedLineTargets = new Map(
    HEXAGRAM_LINE_TEXTS.map((line) => [line.id, `${line.hexagramId}:${line.position}`]),
  );
  if (
    value.lines.items.length !== expectedLineTargets.size ||
    value.lines.items.some((item) =>
      expectedLineTargets.get(item.id) !== `${item.hexagramId}:${item.position}`,
    ) ||
    [...expectedLineTargets.keys()].some((id) =>
      !value.lines.items.some((item) => item.id === id),
    )
  ) {
    throw new TypeError("内容复核报告爻辞条目 ID 与当前目录映射不一致");
  }
  const expectedBlockers: string[] = [];
  if (value.concepts.items.some((item) => item.reviewStatus !== "published")) {
    expectedBlockers.push("仍有知识点未发布");
  }
  if (value.judgments.items.some((item) => item.status !== "verified")) {
    expectedBlockers.push("64 条卦辞尚未全部核验");
  }
  if (value.lines.items.some((item) => item.status !== "verified")) {
    expectedBlockers.push("384 条爻辞尚未全部核验");
  }
  if (value.sources.items.some((item) => item.status !== "verified")) {
    expectedBlockers.push("仍有来源未完成版本、授权和收录复核");
  }
  if (
    value.concepts.total !== value.concepts.items.length ||
    value.concepts.reviewed !== value.concepts.items.filter((item) => item.reviewStatus === "reviewed").length ||
    value.concepts.published !== value.concepts.items.filter((item) => item.reviewStatus === "published").length ||
    value.judgments.total !== value.judgments.items.length ||
    value.judgments.verified !== value.judgments.items.filter((item) => item.status === "verified").length ||
    value.lines.total !== value.lines.items.length ||
    value.lines.verified !== value.lines.items.filter((item) => item.status === "verified").length ||
    value.sources.total !== value.sources.items.length ||
    value.sources.verified !== value.sources.items.filter((item) => item.status === "verified").length ||
    value.releaseGate.ready !== (expectedBlockers.length === 0) ||
    value.releaseGate.blockers.length !== expectedBlockers.length ||
    value.releaseGate.blockers.some((blocker, index) => blocker !== expectedBlockers[index])
  ) {
    throw new TypeError("内容复核报告统计或发布门禁不一致");
  }
}

/**
 * Build a reviewer hand-off report from the static registry.  The report is
 * deliberately metadata-only: it never includes canonical text or editorial
 * markdown, so exporting it cannot accidentally redistribute source content.
 */
export function buildContentAuditReport(generatedAt = new Date().toISOString()): ContentAuditReport {
  if (typeof generatedAt !== "string" || !isValidIsoTimestamp(generatedAt))
    throw new TypeError("内容复核报告时间无效");
  const concepts = KNOWLEDGE_CONCEPTS.map((item) => ({
    id: item.id,
    title: item.title,
    reviewStatus: item.reviewStatus,
    sourceIds: [...item.sourceIds],
  }));
  const judgments = HEXAGRAM_JUDGMENTS.map((item) => ({
    id: item.id,
    hexagramId: item.hexagramId,
    status: item.status,
    contentVersion: item.contentVersion,
    sourceIds: [...item.sourceIds],
  }));
  const lines = HEXAGRAM_LINE_TEXTS.map((item) => ({
    id: item.id,
    hexagramId: item.hexagramId,
    position: item.position,
    status: item.status,
    contentVersion: item.contentVersion,
    sourceIds: [...item.sourceIds],
  }));
  const sources = SOURCE_REGISTRY.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    status: item.status,
    reviewOwner: item.reviewOwner,
    usePolicy: item.usePolicy,
    ...(item.author ? { author: item.author } : {}),
    ...(item.edition ? { edition: item.edition } : {}),
    ...(item.publisher ? { publisher: item.publisher } : {}),
    ...(item.year ? { year: item.year } : {}),
    ...(item.locator ? { locator: item.locator } : {}),
    ...(item.url ? { url: item.url } : {}),
    ...(item.accessedAt ? { accessedAt: item.accessedAt } : {}),
    copyrightNote: item.copyrightNote,
  }));
  const calendarCoverage = getCalendarEvidenceCoverage();
  const calendarEvidence = {
    ruleVersion: CALENDAR_EVIDENCE_RULE_SET.id,
    ruleStatus: CALENDAR_EVIDENCE_RULE_SET.status,
    sourceIds: [...CALENDAR_EVIDENCE_RULE_SET.sourceIds],
    authoritativeSampleIds: [...CALENDAR_EVIDENCE_RULE_SET.authoritativeSampleIds],
    sampleCount: calendarCoverage.sampleCount,
    verifiedSampleCount: calendarCoverage.verifiedSampleCount,
    boundaries: CALENDAR_EVIDENCE_BOUNDARIES.map((id) => ({
      id,
      sampleIds: [...calendarCoverage.byBoundary[id].sampleIds],
      verifiedSampleIds: [...calendarCoverage.byBoundary[id].verifiedSampleIds],
    })),
    missingBoundaries: [...calendarCoverage.missingBoundaries],
    unverifiedSampleIds: [...calendarCoverage.unverifiedSampleIds],
    complete: calendarCoverage.complete,
  };
  // Keep this assertion close to the report builder so a future registry
  // change cannot make the exported coverage drift from the checked-in data.
  const recomputedCoverage = inspectCalendarEvidenceCoverage(
    CALENDAR_EVIDENCE_SAMPLES,
    CALENDAR_EVIDENCE_RULE_SET,
  );
  if (
    recomputedCoverage.sampleCount !== calendarEvidence.sampleCount ||
    recomputedCoverage.verifiedSampleCount !== calendarEvidence.verifiedSampleCount ||
    recomputedCoverage.complete !== calendarEvidence.complete
  ) {
    throw new TypeError("历法样例覆盖报告无法与登记表一致");
  }
  const blockers: string[] = [];
  if (concepts.some((item) => item.reviewStatus !== "published")) blockers.push("仍有知识点未发布");
  if (judgments.some((item) => item.status !== "verified")) blockers.push("64 条卦辞尚未全部核验");
  if (lines.some((item) => item.status !== "verified")) blockers.push("384 条爻辞尚未全部核验");
  if (sources.some((item) => item.status !== "verified")) blockers.push("仍有来源未完成版本、授权和收录复核");

  return {
    reportVersion: 2,
    generatedAt,
    policy: { includesCanonicalText: false, purpose: "content-review" },
    concepts: {
      total: concepts.length,
      reviewed: concepts.filter((item) => item.reviewStatus === "reviewed").length,
      published: concepts.filter((item) => item.reviewStatus === "published").length,
      items: concepts,
    },
    judgments: {
      total: judgments.length,
      verified: judgments.filter((item) => item.status === "verified").length,
      items: judgments,
    },
    lines: {
      total: lines.length,
      verified: lines.filter((item) => item.status === "verified").length,
      items: lines,
    },
    sources: {
      total: sources.length,
      verified: sources.filter((item) => item.status === "verified").length,
      items: sources,
    },
    calendarEvidence,
    releaseGate: { ready: blockers.length === 0, blockers },
  };
}

export function serializeContentAuditReport(report: ContentAuditReport): string {
  assertContentAuditReport(report);
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Parse a reviewer hand-off report at the browser/file boundary.
 *
 * The report is metadata-only and is never merged into the checked-in
 * content registry.  Keeping parsing here lets the settings page and future
 * CLI tooling share the same strict schema and cross-record invariants.
 */
export function parseContentAuditReport(input: unknown): ContentAuditReport {
  let value: unknown = input;
  if (typeof input === "string") {
    if (!input.trim()) throw new TypeError("请先选择内容复核清单");
    try {
      value = JSON.parse(input);
    } catch {
      throw new TypeError("内容复核清单 JSON 无法解析");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("内容复核清单必须是对象");
  }
  assertContentAuditReport(value);
  return value;
}
