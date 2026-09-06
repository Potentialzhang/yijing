import Link from "next/link";
import { HEXAGRAM_JUDGMENTS, HEXAGRAM_LINE_TEXTS } from "@/content/hexagrams";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { SOURCE_REGISTRY } from "@/content/sources";
import { HEXAGRAMS } from "@/core/iching";
import { ContentAuditFeedback } from "@/components/content/ContentAuditFeedback";
import { ContentAuditExport } from "@/components/content/ContentAuditExport";
import { CalendarEvidenceInspector } from "@/components/content/CalendarEvidenceInspector";
import {
  CALENDAR_EVIDENCE_BOUNDARIES,
  CALENDAR_EVIDENCE_RULE_SET,
  getCalendarEvidenceCoverage,
} from "@/content/calendar-evidence";

const calendarBoundaryLabels: Record<(typeof CALENDAR_EVIDENCE_BOUNDARIES)[number], string> = {
  year: "换年边界",
  month: "换月边界",
  day: "换日边界",
  "zi-hour": "子时边界",
  "time-zone": "时区解析",
  "solar-term": "二十四节气",
};

function statusLabel(status: "verified" | "needs-review") {
  return status === "verified" ? "已登记" : "待校对";
}

function hexagramTitle(hexagramId: string): string {
  const hexagram = HEXAGRAMS.find((item) => item.id === hexagramId);
  return hexagram ? `第 ${hexagram.kingWenNumber} 卦 · ${hexagram.name}` : hexagramId;
}

function hexagramHref(hexagramId: string, hash?: string): string {
  const hexagram = HEXAGRAMS.find((item) => item.id === hexagramId);
  return hexagram ? `/hexagrams/${hexagram.kingWenNumber}${hash ? `#${hash}` : ""}` : "/hexagrams";
}

function sourceTitles(sourceIds: readonly string[]): string {
  return sourceIds.map((sourceId) => SOURCE_REGISTRY.find((source) => source.id === sourceId)?.title ?? sourceId).join("、");
}

function sourceMetadata(source: (typeof SOURCE_REGISTRY)[number]): string {
  return [
    source.author ? `作者：${source.author}` : "",
    source.edition ? `版本：${source.edition}` : "",
    source.publisher ? `出版方：${source.publisher}` : "",
    source.year ? `年份：${source.year}` : "",
    source.locator ? `定位：${source.locator}` : "",
    source.accessedAt ? `访问日期：${source.accessedAt}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ContentSettingsPage() {
  const reviewedConcepts = KNOWLEDGE_CONCEPTS.filter((item) => item.reviewStatus === "reviewed").length;
  const publishedConcepts = KNOWLEDGE_CONCEPTS.filter((item) => item.reviewStatus === "published").length;
  const verifiedJudgments = HEXAGRAM_JUDGMENTS.filter((item) => item.status === "verified").length;
  const verifiedLines = HEXAGRAM_LINE_TEXTS.filter((item) => item.status === "verified").length;
  const verifiedSources = SOURCE_REGISTRY.filter((item) => item.status === "verified").length;
  const calendarCoverage = getCalendarEvidenceCoverage();

  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/settings/data" className="back-link">← 数据安全</Link>
        <p className="eyebrow">设置 · 内容治理</p>
        <h1>先确认来源，再扩展解释。</h1>
        <p className="subpage-lead">
          这里集中显示内置内容、经典文本和来源的复核状态。此页只读，不会替内容负责人确认版本；已核验的经典正文会标明来源，待复核资料仍保持独立状态。
        </p>
      </header>

      <section className="stats-summary-grid content-audit-summary" aria-label="内容复核概览">
        <div><strong>{reviewedConcepts}</strong><span>已复核知识点</span><small>共 {KNOWLEDGE_CONCEPTS.length} 个</small></div>
        <div><strong>{publishedConcepts}</strong><span>已发布知识点</span><small>未发布内容仍可标注状态</small></div>
        <div><strong>{verifiedJudgments} / {HEXAGRAM_JUDGMENTS.length}</strong><span>已核验卦辞</span><small>待复核不会显示原文</small></div>
        <div><strong>{verifiedLines} / {HEXAGRAM_LINE_TEXTS.length}</strong><span>已核验爻辞</span><small>按卦与爻位映射</small></div>
        <div><strong>{verifiedSources} / {SOURCE_REGISTRY.length}</strong><span>已登记来源</span><small>授权和版本仍需逐条确认</small></div>
      </section>

      <section className="pending-content content-audit-section" aria-labelledby="content-audit-gate">
        <span className="content-label">发布门禁</span>
        <h2 id="content-audit-gate">经典正文已核验，仍有资料待复核</h2>
        <p>
          64 条卦辞和 384 条爻辞已按 Kanripo 固定修订转录登记，学习页面可直接展示经典正文与项目释义。当前发布门禁仍由未发布知识点和现代资料版本/授权复核控制，不会用 AI 内容冒充经典。
        </p>
        <ol className="content-audit-checklist">
          <li>确认经典底本、版本、出版信息和可收录范围。</li>
          <li>逐卦核对卦序、上下卦、六爻位置与来源定位。</li>
          <li>逐爻核对 384 条卦-爻位映射，并记录版本。</li>
          <li>现代书籍、视频和网页只登记必要摘要、定位与授权说明。</li>
        </ol>
        <Link className="outline-button" href="/hexagrams/1">查看内容状态示例：乾卦 <span>↗</span></Link>
        <ContentAuditExport />
      </section>

      <section className="content-audit-calendar" aria-labelledby="content-audit-calendar-heading">
        <div className="section-heading-row">
          <div><span className="content-label">内容校验 · 规则边界</span><h2 id="content-audit-calendar-heading">历法边界样例</h2></div>
          <span>{calendarCoverage.verifiedSampleCount} / {calendarCoverage.sampleCount} 已核验</span>
        </div>
        <p className="content-audit-manifest-intro">
          当前规则集 <code>{CALENDAR_EVIDENCE_RULE_SET.id}</code> 已接受，六类边界均有已核验样例。历法工具会按选定规则计算农历、年月日时干支和二十四节气；这里仍保留只读的样例交接检查。
        </p>
        <ol className="content-audit-calendar-list">
          {CALENDAR_EVIDENCE_BOUNDARIES.map((boundary) => {
            const item = calendarCoverage.byBoundary[boundary];
            const complete = item.sampleIds.length > 0 && item.verifiedSampleIds.length === item.sampleIds.length;
            return (
              <li key={boundary} className="content-audit-calendar-item">
                <div>
                  <strong>{calendarBoundaryLabels[boundary]}</strong>
                  <small>{item.sampleIds.length ? `样例：${item.sampleIds.join("、")}` : "尚未登记权威样例"}</small>
                </div>
                <span className={complete ? "source-verified" : "source-pending"}>{complete ? "已覆盖" : "待补齐"}</span>
              </li>
            );
          })}
        </ol>
        <p className="content-audit-calendar-note" role="note">
          交接时请为每个边界填写输入、期望结果、来源 ID 和规则版本；只有六类边界样例全部标记为 verified，规则集才能进入 accepted。
        </p>
      </section>

      <CalendarEvidenceInspector />

      <section className="content-audit-manifest" aria-labelledby="content-audit-manifest-heading">
        <div className="section-heading-row">
          <div><span className="content-label">逐项复核清单</span><h2 id="content-audit-manifest-heading">经典文本映射</h2></div>
          <span>64 条卦辞 · 384 条爻辞</span>
        </div>
        <p className="content-audit-manifest-intro">展开后可按卦序检查每一条记录的状态、内容版本和来源定位；点击记录会回到对应的卦象详情或单爻笔记位置。此清单仅展示复核元数据，不重复粘贴经典原文。</p>
        <details className="content-audit-record-group">
          <summary>卦辞清单 · {verifiedJudgments} / {HEXAGRAM_JUDGMENTS.length} 已核验</summary>
          <ol className="content-audit-records">
            {HEXAGRAM_JUDGMENTS.map((judgment) => (
              <li key={judgment.id} className="content-audit-record">
                <Link href={hexagramHref(judgment.hexagramId)}>{hexagramTitle(judgment.hexagramId)} ↗</Link>
                <span className={judgment.status === "verified" ? "source-verified" : "source-pending"}>{judgment.status === "verified" ? "已核验" : "待校对"}</span>
                <small>v{judgment.contentVersion} · {sourceTitles(judgment.sourceIds)}</small>
              </li>
            ))}
          </ol>
        </details>
        <details className="content-audit-record-group">
          <summary>爻辞清单 · {verifiedLines} / {HEXAGRAM_LINE_TEXTS.length} 已核验</summary>
          <ol className="content-audit-records">
            {HEXAGRAM_LINE_TEXTS.map((lineText) => (
              <li key={lineText.id} className="content-audit-record">
                <Link href={hexagramHref(lineText.hexagramId, `line-${lineText.position}`)}>{hexagramTitle(lineText.hexagramId)} · 第 {lineText.position} 爻 ↗</Link>
                <span className={lineText.status === "verified" ? "source-verified" : "source-pending"}>{lineText.status === "verified" ? "已核验" : "待校对"}</span>
                <small>v{lineText.contentVersion} · {sourceTitles(lineText.sourceIds)}</small>
              </li>
            ))}
          </ol>
        </details>
      </section>

      <section className="content-audit-sources" aria-labelledby="content-audit-sources-heading">
        <div className="section-heading-row">
          <div><span className="content-label">来源登记表</span><h2 id="content-audit-sources-heading">来源与收录策略</h2></div>
          <span>{SOURCE_REGISTRY.length} 条</span>
        </div>
        <div className="source-status-list">
          {SOURCE_REGISTRY.map((source) => {
            const metadata = sourceMetadata(source);
            return (
              <article key={source.id}>
                <div>
                  <strong>{source.title}</strong>
                  <small>{source.kind} · {source.usePolicy}</small>
                  {metadata && <small>{metadata}</small>}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="source-link"
                      aria-label={`在新标签页打开来源链接：${source.title}`}
                    >
                      打开来源链接 ↗
                    </a>
                  )}
                  <small>{source.copyrightNote}</small>
                </div>
                <span className={source.status === "verified" ? "source-verified" : "source-pending"}>{statusLabel(source.status)}</span>
              </article>
            );
          })}
        </div>
      </section>
      <ContentAuditFeedback />
    </main>
  );
}
