"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseCalendarEvidenceValidationReport,
  serializeCalendarEvidenceValidationReport,
  previewCalendarEvidencePayload,
  type CalendarEvidencePayloadPreview,
} from "@/core/calendar/evidence-payload";
import { CALENDAR_EVIDENCE_BOUNDARIES } from "@/core/calendar/evidence";
import { formatLocalDate } from "@/core/date/local";
import { downloadBlob } from "@/core/browser/blob-download";
import {
  CALENDAR_EVIDENCE_RULE_SET,
  validateCalendarEvidenceRegistry,
} from "@/content/calendar-evidence";
import { DRAFT_CALENDAR_RULE_SET } from "@/core/calendar/rules";

const BOUNDARY_LABELS: Record<(typeof CALENDAR_EVIDENCE_BOUNDARIES)[number], string> = {
  year: "换年",
  month: "换月",
  day: "换日",
  "zi-hour": "子时",
  "time-zone": "时区",
  "solar-term": "节气",
};

const EMPTY_TEMPLATE = JSON.stringify(
  {
    ruleSet: DRAFT_CALENDAR_RULE_SET,
    samples: [],
  },
  null,
  2,
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "样例包无法校验";
}

function missingLabels(
  coverage: CalendarEvidencePayloadPreview["ruleCoverage"],
): string {
  return coverage.missingBoundaries.length
    ? coverage.missingBoundaries.map((boundary) => BOUNDARY_LABELS[boundary]).join("、")
    : "无";
}

function looksLikeValidationReport(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && "reportVersion" in parsed);
  } catch {
    return false;
  }
}

type EvidenceArtifactKind = "payload" | "report";

function previewPayloadOrReport(value: string): {
  preview: CalendarEvidencePayloadPreview;
  kind: EvidenceArtifactKind;
} {
  try {
    return {
      preview: previewCalendarEvidencePayload(value, CALENDAR_EVIDENCE_RULE_SET),
      kind: "payload",
    };
  } catch (payloadReason) {
    try {
      const report = parseCalendarEvidenceValidationReport(value, CALENDAR_EVIDENCE_RULE_SET);
      return {
        preview: previewCalendarEvidencePayload(
          { ruleSet: report.ruleSet, samples: report.samples },
          CALENDAR_EVIDENCE_RULE_SET,
        ),
        kind: "report",
      };
    } catch (reportReason) {
      // Preserve ordinary payload errors, but expose the actionable report
      // error when a report-shaped artifact was explicitly supplied.
      if (looksLikeValidationReport(value)) throw reportReason;
      throw payloadReason;
    }
  }
}

export function CalendarEvidenceInspector() {
  const [payloadText, setPayloadText] = useState("");
  const [preview, setPreview] = useState<CalendarEvidencePayloadPreview | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [artifactKind, setArtifactKind] = useState<EvidenceArtifactKind | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function inspect(value = payloadText) {
    try {
      const { preview: next, kind } = previewPayloadOrReport(value);
      // The core parser validates shape and rule references. The content
      // layer additionally checks that every cited source exists in the
      // checked-in source registry before a reviewer trusts this preview.
      validateCalendarEvidenceRegistry(next.samples, next.ruleSet);
      setPreview(next);
      setArtifactKind(kind);
      setError("");
      setReportStatus("");
    } catch (reason) {
      setPreview(null);
      setArtifactKind(null);
      setError(errorMessage(reason));
      setReportStatus("");
    }
  }

  async function readFile(file: File) {
    try {
      const text = await file.text();
      if (!mountedRef.current) return;
      setPayloadText(text);
      setFileName(file.name);
      inspect(text);
    } catch (reason) {
      if (!mountedRef.current) return;
      setPreview(null);
      setArtifactKind(null);
      setError(`读取样例文件失败：${errorMessage(reason)}`);
      setReportStatus("");
    }
  }

  function loadTemplate() {
    setPayloadText(EMPTY_TEMPLATE);
    setFileName("");
    setPreview(null);
    setArtifactKind(null);
    setError("");
    setReportStatus("");
  }

  function clear() {
    setPayloadText("");
    setFileName("");
    setPreview(null);
    setArtifactKind(null);
    setError("");
    setReportStatus("");
  }

  function downloadReport() {
    if (!preview) return;
    try {
      const report = serializeCalendarEvidenceValidationReport(
        { ruleSet: preview.ruleSet, samples: preview.samples },
        CALENDAR_EVIDENCE_RULE_SET,
      );
      downloadBlob(
        new Blob([report], { type: "application/json;charset=utf-8" }),
        `yijing-calendar-evidence-validation-${formatLocalDate()}.json`,
      );
      setReportStatus("校验报告已下载，可与内容负责人交接。报告不会写入应用。");
    } catch (reason) {
      setReportStatus(`校验报告下载失败：${errorMessage(reason)}`);
    }
  }

  function downloadTemplate() {
    try {
      downloadBlob(
        new Blob([EMPTY_TEMPLATE], { type: "application/json;charset=utf-8" }),
        "yijing-calendar-evidence-template.json",
      );
      setReportStatus("空白样例模板已下载，可交给内容负责人填写。模板不会写入应用。");
    } catch (reason) {
      setReportStatus(`空白样例模板下载失败：${errorMessage(reason)}`);
    }
  }

  return (
    <section className="content-audit-evidence-inspector" aria-labelledby="calendar-evidence-inspector-heading">
      <div className="section-heading-row">
        <div>
          <span className="content-label">交接前工具</span>
          <h2 id="calendar-evidence-inspector-heading">校验外部历法样例</h2>
        </div>
        <span>只读预览</span>
      </div>
      <p>
        可粘贴或选择内容负责人提供的 JSON 样例包，也可以重新载入本工具生成的校验报告。这里会检查字段、规则版本、来源引用和六类边界覆盖，
        但不会写入内置内容，也不会改变账户数据库或生成农历、节气和干支结果。
      </p>
      <div className="content-audit-evidence-actions">
        <label className="outline-button content-audit-file-label">
          选择 JSON 文件
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button type="button" className="outline-button" onClick={loadTemplate}>
          填入空白模板
        </button>
        <button type="button" className="outline-button" onClick={downloadTemplate}>
          下载空白模板
        </button>
        <button type="button" className="outline-button" onClick={clear} disabled={!payloadText && !preview && !error}>
          清空
        </button>
        {fileName && <small>已载入：{fileName}</small>}
      </div>
      {reportStatus && !preview && (
        <p className="content-audit-evidence-status" role="status" aria-live="polite">
          {reportStatus}
        </p>
      )}
      <label className="content-audit-evidence-input" htmlFor="calendar-evidence-payload">
        样例包 JSON
        <textarea
          id="calendar-evidence-payload"
          value={payloadText}
          onChange={(event) => {
            setPayloadText(event.target.value);
            setPreview(null);
            setArtifactKind(null);
            setError("");
            setReportStatus("");
            setFileName("");
          }}
          placeholder={EMPTY_TEMPLATE}
          spellCheck={false}
        />
      </label>
      <div className="content-audit-evidence-submit">
        <button type="button" className="primary-button" onClick={() => inspect()} disabled={!payloadText.trim()}>
          校验样例包
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      {preview && (
        <div className="content-audit-evidence-result" role="status" aria-live="polite">
          <strong>{artifactKind === "report" ? "校验报告重新载入并通过" : "结构与来源校验通过"}</strong>
          <div className="content-audit-evidence-facts">
            <span>规则版本<strong>{preview.ruleSet.id}</strong></span>
            <span>规则状态<strong>{preview.ruleSet.status === "accepted" ? "accepted" : "draft"}</strong></span>
            <span>样例数量<strong>{preview.sampleCoverage.sampleCount}</strong></span>
            <span>已核验<strong>{preview.sampleCoverage.verifiedSampleCount}</strong></span>
          </div>
          <p>
            全部输入样例覆盖：{preview.sampleCoverage.missingBoundaries.length ? `缺少 ${missingLabels(preview.sampleCoverage)}` : "六类边界均有样例"}。
            规则集登记覆盖：{preview.ruleCoverage.complete ? "完整" : `待补齐 ${missingLabels(preview.ruleCoverage)}`}。
          </p>
          <ul className="content-audit-evidence-boundaries" aria-label="历法边界逐项覆盖">
            {CALENDAR_EVIDENCE_BOUNDARIES.map((boundary) => {
              const item = preview.ruleCoverage.byBoundary[boundary];
              const complete = item.sampleIds.length > 0 && item.verifiedSampleIds.length === item.sampleIds.length;
              return (
                <li key={boundary}>
                  <div>
                    <strong>{BOUNDARY_LABELS[boundary]}</strong>
                    <small>
                      {item.sampleIds.length
                        ? `样例：${item.sampleIds.join("、")} · 已核验 ${item.verifiedSampleIds.length}/${item.sampleIds.length}`
                        : "尚未登记权威样例"}
                    </small>
                  </div>
                  <span className={complete ? "source-verified" : "source-pending"}>{complete ? "已覆盖" : "待补齐"}</span>
                </li>
              );
            })}
          </ul>
          <p className="content-audit-evidence-sources">
            规则集来源：{preview.ruleSet.sourceIds.length ? preview.ruleSet.sourceIds.join("、") : "尚未登记"}
          </p>
          <div className="content-audit-evidence-report-actions">
            <button type="button" className="outline-button" onClick={downloadReport}>
              下载校验报告
            </button>
            {reportStatus && <small aria-live="polite">{reportStatus}</small>}
          </div>
          {preview.ruleSet.status === "accepted" && !preview.ruleCoverage.complete && (
            <p className="form-error" role="alert">accepted 规则集仍缺少完整的已核验边界样例，不能用于发布。</p>
          )}
        </div>
      )}
      <small className="content-audit-evidence-note">
        通过此处仅表示交接包可被程序读取；仍需将样例写入内容登记表并由内容负责人确认来源后，才可更新规则集。
      </small>
    </section>
  );
}
