import { describe, expect, it } from "vitest";
import {
  buildContentAuditReport,
  parseContentAuditReport,
  serializeContentAuditReport,
} from "@/core/content/audit";

describe("内容复核交接包", () => {
  it("只导出复核元数据并保留发布门禁", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(report).toMatchObject({
      reportVersion: 2,
      generatedAt: "2026-08-27T00:00:00.000Z",
      policy: { includesCanonicalText: false, purpose: "content-review" },
      concepts: { total: 16, published: 0 },
      judgments: { total: 64, verified: 64 },
      lines: { total: 384, verified: 384 },
      calendarEvidence: {
        ruleVersion: "calendar-draft-1",
        ruleStatus: "draft",
        sampleCount: 0,
        verifiedSampleCount: 0,
        complete: false,
      },
      releaseGate: { ready: false },
    });
    expect(report.releaseGate.blockers).toEqual(expect.arrayContaining([
      "仍有来源未完成版本、授权和收录复核",
    ]));
    expect(report.judgments.items[0]).not.toHaveProperty("canonicalText");
    expect(report.lines.items[0]).not.toHaveProperty("canonicalText");
    expect(report.concepts.items[0]).not.toHaveProperty("body");
    expect(report.sources.items[0]).toHaveProperty("copyrightNote");
    expect(report.calendarEvidence.missingBoundaries).toEqual([
      "year", "month", "day", "zi-hour", "time-zone", "solar-term",
    ]);
    expect(report.calendarEvidence.authoritativeSampleIds).toEqual([]);
  });

  it("序列化结果是带换行的有效 JSON", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    const serialized = serializeContentAuditReport(report);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized).policy.includesCanonicalText).toBe(false);
    expect(() => serializeContentAuditReport({
      ...report,
      policy: { ...report.policy, includesCanonicalText: true },
    } as never)).toThrow(/内容复核报告/);
    expect(() => serializeContentAuditReport({
      ...report,
      concepts: { ...report.concepts, total: report.concepts.total + 1 },
    } as never)).toThrow(/内容复核报告/);
    expect(() => serializeContentAuditReport({
      ...report,
      concepts: {
        ...report.concepts,
        items: report.concepts.items.map((item, index) => index === 1
          ? { ...item, id: report.concepts.items[0].id }
          : item),
      },
    } as never)).toThrow(/重复 ID/);
    expect(() => serializeContentAuditReport({
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item, index) => index === 0
          ? { ...item, url: "javascript:alert(1)" }
          : item),
      },
    } as never)).toThrow(/内容复核报告/);
    expect(() => serializeContentAuditReport({
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item, index) => index === 0
          ? { ...item, accessedAt: "2026-02-30" }
          : item),
      },
    } as never)).toThrow(/内容复核报告/);
    const reportWithSourceMetadata = {
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item, index) => index === 0
          ? {
              ...item,
              author: "易境项目组",
              edition: "内部编辑版 v0.1",
              publisher: "易境",
              year: "2026",
              locator: "content/sources.ts",
              url: "https://example.com/yijing-source",
              accessedAt: "2026-08-30",
            }
          : item),
      },
    };
    const parsedSourceMetadata = JSON.parse(serializeContentAuditReport(reportWithSourceMetadata));
    expect(parsedSourceMetadata.sources.items[0]).toMatchObject({
      author: "易境项目组",
      edition: "内部编辑版 v0.1",
      publisher: "易境",
      year: "2026",
      locator: "content/sources.ts",
      url: "https://example.com/yijing-source",
      accessedAt: "2026-08-30",
    });
    expect(() => serializeContentAuditReport({
      ...report,
      concepts: {
        ...report.concepts,
        items: report.concepts.items.map((item, index) => index === 0
          ? { ...item, sourceIds: ["source-does-not-exist"] }
          : item),
      },
    } as never)).toThrow(/未知来源/);
    expect(() => serializeContentAuditReport({
      ...report,
      judgments: {
        ...report.judgments,
        items: report.judgments.items.map((item, index) => index === 0
          ? { ...item, sourceIds: [item.sourceIds[0], item.sourceIds[0]] }
          : item),
      },
    } as never)).toThrow(/重复来源/);
    expect(() => serializeContentAuditReport({
      ...report,
      lines: {
        ...report.lines,
        items: report.lines.items.map((item, index) => index === 0
          ? { ...item, sourceIds: [] }
        : item),
      },
    } as never)).toThrow(/缺少来源/);
  });

  it("可以严格回载导出的复核清单而不改变内容登记", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    const loaded = parseContentAuditReport(serializeContentAuditReport(report));
    expect(loaded).toEqual(report);
    expect(loaded.policy.includesCanonicalText).toBe(false);
    expect(loaded.releaseGate.ready).toBe(false);
  });

  it("拒绝空文本、非法 JSON 和带未知字段的复核清单", () => {
    expect(() => parseContentAuditReport(" ")).toThrow(/选择内容复核清单/);
    expect(() => parseContentAuditReport("{")).toThrow(/JSON 无法解析/);
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => parseContentAuditReport(JSON.stringify({ ...report, extra: true }))).toThrow(/字段无效/);
  });

  it("拒绝交接报告中的未修剪业务标识符", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      concepts: {
        ...report.concepts,
        items: report.concepts.items.map((item, index) => index === 0
          ? { ...item, id: ` ${item.id}` }
          : item),
      },
    } as never)).toThrow(/已修剪/);
  });

  it("拒绝卦辞或爻辞的结构性重复映射", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      judgments: {
        ...report.judgments,
        items: report.judgments.items.map((item, index) => index === 0
          ? { ...item, hexagramId: report.judgments.items[1].hexagramId }
          : item),
      },
    } as never)).toThrow(/卦辞映射/);
    expect(() => serializeContentAuditReport({
      ...report,
      lines: {
        ...report.lines,
        items: report.lines.items.map((item, index) => index === 1
          ? { ...item, position: 1 }
          : item),
      },
    } as never)).toThrow(/爻辞映射/);
    expect(() => serializeContentAuditReport({
      ...report,
      judgments: {
        ...report.judgments,
        items: report.judgments.items.map((item, index) => index === 0
          ? { ...item, id: "judgment-replaced" }
          : item),
      },
    } as never)).toThrow(/卦辞条目 ID/);
    expect(() => serializeContentAuditReport({
      ...report,
      lines: {
        ...report.lines,
        items: report.lines.items.map((item, index) => index === 0
          ? { ...item, id: "line-replaced" }
          : item),
      },
    } as never)).toThrow(/爻辞条目 ID/);
    expect(() => serializeContentAuditReport({
      ...report,
      lines: {
        ...report.lines,
        items: report.lines.items.map((item, index) => index === 0
          ? { ...item, hexagramId: "unknown-hexagram" }
          : item),
      },
    } as never)).toThrow(/爻辞映射/);
  });

  it("拒绝替换为当前目录之外的知识点条目", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      concepts: {
        ...report.concepts,
        items: report.concepts.items.map((item, index) => index === 0
          ? { ...item, id: "concept-replaced" }
          : item),
      },
    } as never)).toThrow(/知识点清单/);
  });

  it("拒绝历法证据引用交接包之外的来源", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        sourceIds: ["source-not-in-report"],
      },
    } as never)).toThrow(/历法规则引用了未知来源/);
  });

  it("拒绝无法追溯的复核报告时间", () => {
    expect(() => buildContentAuditReport("2026-02-30T00:00:00.000Z")).toThrow(
      /报告时间无效/,
    );
    expect(() => buildContentAuditReport("0")).toThrow(/报告时间无效/);
    expect(() => buildContentAuditReport(42 as never)).toThrow(/报告时间无效/);
  });

  it("拒绝来源策略漂移或缺少已核验类型的必填字段", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item, index) => index === 2
          ? { ...item, usePolicy: "user-supplied" }
          : item),
      },
    } as never)).toThrow(/收录策略/);

    expect(() => serializeContentAuditReport({
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item) => item.id === "source-zhouyi-classic-pending"
          ? { ...item, status: "verified" }
          : item),
      },
    } as never)).toThrow(/缺少必要字段：edition/);

    expect(() => serializeContentAuditReport({
      ...report,
      sources: {
        ...report.sources,
        items: report.sources.items.map((item, index) => index === 0
          ? { ...item, copyrightNote: undefined }
          : item),
      },
    } as never)).toThrow(/内容复核报告字段无效/);
  });

  it("拒绝内容状态引用待复核来源或篡改发布门禁", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      judgments: {
        ...report.judgments,
        verified: 64,
        items: report.judgments.items.map((item, index) => index === 0
          ? { ...item, status: "verified", sourceIds: ["source-zhouyi-classic-pending"] }
          : item),
      },
    } as never)).toThrow(/已核验卦辞缺少已核验来源/);

    expect(() => serializeContentAuditReport({
      ...report,
      releaseGate: { ready: true, blockers: [] },
    } as never)).toThrow(/统计或发布门禁不一致/);
  });

  it("拒绝历法样例覆盖统计漂移或边界缺失", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    expect(() => serializeContentAuditReport({
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        boundaries: report.calendarEvidence.boundaries.slice(1),
      },
    } as never)).toThrow(/六类边界/);
    expect(() => serializeContentAuditReport({
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        sampleCount: 1,
      },
    } as never)).toThrow(/清单与权威样例 ID/);
    expect(() => serializeContentAuditReport({
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        ruleStatus: "accepted",
      },
    } as never)).toThrow(/accepted 历法规则/);
  });

  it("拒绝历法边界明细与汇总覆盖不一致", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    const withBoundarySample = {
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        sampleCount: 1,
        authoritativeSampleIds: ["sample-year"],
        boundaries: report.calendarEvidence.boundaries.map((boundary) =>
          boundary.id === "year"
            ? { ...boundary, sampleIds: ["sample-year"], verifiedSampleIds: [] }
            : boundary,
        ),
        unverifiedSampleIds: ["sample-year"],
      },
    };
    expect(() => serializeContentAuditReport({
      ...withBoundarySample,
      calendarEvidence: {
        ...withBoundarySample.calendarEvidence,
        boundaries: withBoundarySample.calendarEvidence.boundaries.map((boundary) =>
          boundary.id === "month"
            ? { ...boundary, verifiedSampleIds: ["sample-year"] }
            : boundary,
        ),
      },
    } as never)).toThrow(/已核验样例不属于该边界/);
    expect(() => serializeContentAuditReport({
      ...withBoundarySample,
      calendarEvidence: {
        ...withBoundarySample.calendarEvidence,
        missingBoundaries: ["year", "month", "day", "zi-hour", "time-zone", "solar-term"],
      },
    } as never)).toThrow(/覆盖清单与权威样例 ID 不一致/);
    expect(() => serializeContentAuditReport({
      ...withBoundarySample,
      calendarEvidence: {
        ...withBoundarySample.calendarEvidence,
        unverifiedSampleIds: [],
      },
    } as never)).toThrow(/覆盖清单与权威样例 ID 不一致/);
  });

  it("拒绝 accepted 历法规则引用未核验来源", () => {
    const report = buildContentAuditReport("2026-08-27T00:00:00.000Z");
    const sampleIds = ["sample-year", "sample-month", "sample-day", "sample-zi", "sample-zone", "sample-term"];
    const acceptedReport = {
      ...report,
      calendarEvidence: {
        ...report.calendarEvidence,
        ruleStatus: "accepted",
        sourceIds: ["source-modern-book-pending"],
        authoritativeSampleIds: sampleIds,
        sampleCount: sampleIds.length,
        verifiedSampleCount: sampleIds.length,
        boundaries: report.calendarEvidence.boundaries.map((boundary, index) => ({
          ...boundary,
          sampleIds: [sampleIds[index]],
          verifiedSampleIds: [sampleIds[index]],
        })),
        missingBoundaries: [],
        unverifiedSampleIds: [],
        complete: true,
      },
    };
    expect(() => serializeContentAuditReport(acceptedReport as never)).toThrow(
      /accepted 历法规则引用了未核验来源/,
    );
  });
});
