"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildContentAuditReport,
  parseContentAuditReport,
  serializeContentAuditReport,
} from "@/core/content/audit";
import type { ContentAuditReport } from "@/core/content/audit";
import { formatLocalDate } from "@/core/date/local";
import { downloadBlob } from "@/core/browser/blob-download";
import { SOURCE_REGISTRY } from "@/content/sources";
import {
  parseContentSourceHandoff,
  serializeContentSourceHandoff,
} from "@/core/content/source-handoff";

export function ContentAuditExport() {
  const [status, setStatus] = useState("导出内容仅包含复核元数据，不包含经典原文。");
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState<ContentAuditReport | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState("");
  const [sourceSummary, setSourceSummary] = useState<{
    total: number;
    verified: number;
    needsReview: number;
    ids: string[];
  } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function downloadReport() {
    try {
      const reportData = buildContentAuditReport();
      const report = serializeContentAuditReport(reportData);
      const blob = new Blob([report], { type: "application/json;charset=utf-8" });
      downloadBlob(blob, `yijing-content-audit-${formatLocalDate()}.json`);
      setLoadError("");
      setSummary(reportData);
      setStatus("复核清单已生成，请交给内容负责人逐条核对。");
    } catch (error) {
      setStatus(`复核清单导出失败：${error instanceof Error ? error.message : "浏览器无法创建下载文件"}`);
    }
  }

  function downloadSourceRegistry() {
    try {
      const payload = serializeContentSourceHandoff(SOURCE_REGISTRY);
      downloadBlob(
        new Blob([payload], { type: "application/json;charset=utf-8" }),
        `yijing-content-sources-${formatLocalDate()}.json`,
      );
      setLoadError("");
      setStatus("来源登记表已下载，可交给内容负责人补齐版本、授权和复核信息。文件不会写回应用。");
    } catch (error) {
      setStatus(`来源登记表导出失败：${error instanceof Error ? error.message : "浏览器无法创建下载文件"}`);
    }
  }

  async function loadSourceRegistry(file: File) {
    try {
      const handoff = parseContentSourceHandoff(await file.text());
      if (!mountedRef.current) return;
      setSourceLoadError("");
      setSourceSummary({
        total: handoff.sources.length,
        verified: handoff.sources.filter((source) => source.status === "verified").length,
        needsReview: handoff.sources.filter((source) => source.status === "needs-review").length,
        ids: handoff.sources.map((source) => source.id),
      });
      setStatus(`已载入来源登记表：${handoff.sources.length} 条来源，${handoff.sources.filter((source) => source.status === "verified").length} 条已登记。文件不会写回应用。`);
    } catch (error) {
      if (!mountedRef.current) return;
      setSourceSummary(null);
      setSourceLoadError(error instanceof Error ? error.message : "来源登记表无法载入");
      setStatus("未载入来源登记表；当前内置来源没有被修改。");
    }
  }

  async function loadReport(file: File) {
    try {
      const report = parseContentAuditReport(await file.text());
      if (!mountedRef.current) return;
      const gate = report.releaseGate.ready
        ? "发布门禁暂未发现阻塞"
        : `仍有 ${report.releaseGate.blockers.length} 项阻塞`;
      setLoadError("");
      setSummary(report);
      setStatus(
        `已载入复核清单（${report.generatedAt}）：卦辞 ${report.judgments.verified}/${report.judgments.total}、爻辞 ${report.lines.verified}/${report.lines.total}，${gate}。`,
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setSummary(null);
      setLoadError(error instanceof Error ? error.message : "内容复核清单无法载入");
      setStatus("未载入复核清单；当前内置内容没有被修改。");
    }
  }

  return (
    <div className="content-audit-export">
      <div className="content-audit-export-actions">
        <button type="button" className="outline-button" onClick={downloadReport}>
          导出内容复核清单
        </button>
        <button type="button" className="outline-button" onClick={downloadSourceRegistry}>
          下载来源登记表
        </button>
        <label className="outline-button content-audit-file-label">
          载入复核清单
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void loadReport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="outline-button content-audit-file-label">
          载入来源登记表
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void loadSourceRegistry(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {loadError && <small className="form-error" role="alert">载入失败：{loadError}</small>}
      {sourceLoadError && <small className="form-error" role="alert">来源登记表载入失败：{sourceLoadError}</small>}
      <small role="status" aria-live="polite">{status}</small>
      {sourceSummary && (
        <section className="content-audit-export-summary" aria-labelledby="content-source-handoff-summary-heading">
          <div className="section-heading-row">
            <div>
              <span className="content-label">只读摘要</span>
              <h3 id="content-source-handoff-summary-heading">来源登记表已重新校验</h3>
            </div>
            <span>{sourceSummary.total} 条</span>
          </div>
          <div className="content-audit-export-summary-grid">
            <span>来源总数<strong>{sourceSummary.total}</strong></span>
            <span>已登记<strong>{sourceSummary.verified}</strong></span>
            <span>待校对<strong>{sourceSummary.needsReview}</strong></span>
          </div>
          <p className={sourceSummary.needsReview === 0 ? "source-verified" : "source-pending"}>
            {sourceSummary.needsReview === 0 ? "所有来源均已登记。" : `仍有 ${sourceSummary.needsReview} 条来源待补齐版本、授权或复核信息。`}
          </p>
          <small>来源 ID：{sourceSummary.ids.join("、")}</small>
          <small>摘要由载入文件重新计算，仅供交接复核；不会写入内置来源表。</small>
        </section>
      )}
      {summary && (
        <section className="content-audit-export-summary" aria-labelledby="content-audit-export-summary-heading">
          <div className="section-heading-row">
            <div>
              <span className="content-label">只读摘要</span>
              <h3 id="content-audit-export-summary-heading">复核清单已重新校验</h3>
            </div>
            <span>{summary.generatedAt}</span>
          </div>
          <div className="content-audit-export-summary-grid">
            <span>知识点<strong>{summary.concepts.published}/{summary.concepts.total} 已发布</strong></span>
            <span>卦辞<strong>{summary.judgments.verified}/{summary.judgments.total} 已核验</strong></span>
            <span>爻辞<strong>{summary.lines.verified}/{summary.lines.total} 已核验</strong></span>
            <span>来源<strong>{summary.sources.verified}/{summary.sources.total} 已登记</strong></span>
            <span>历法样例<strong>{summary.calendarEvidence.verifiedSampleCount}/{summary.calendarEvidence.sampleCount} 已核验</strong></span>
          </div>
          <p className={summary.releaseGate.ready ? "source-verified" : "source-pending"}>
            {summary.releaseGate.ready ? "当前报告未发现发布阻塞。" : `当前报告仍有 ${summary.releaseGate.blockers.length} 项发布阻塞。`}
          </p>
          {!summary.releaseGate.ready && (
            <ul className="content-audit-export-blockers">
              {summary.releaseGate.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
          <small>摘要由载入文件重新计算，仅供复核参考；不会写入内置内容，也不包含经典原文。</small>
        </section>
      )}
    </div>
  );
}
