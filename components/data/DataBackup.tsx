"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { captureLocalNow } from "@/core/date/local";
import { setPreference, syncConceptProgress } from "@/db/repository";
import {
  assertBackupDataIntegrity,
  BACKUP_FORMAT,
  calculateBackupChecksum,
  parseBackupEnvelope,
  summarizeImport,
  type ImportSummary,
  type BackupData,
} from "@/core/data/backup";
import {
  MIGRATION_WARNING_KEY,
  parseMigrationWarning,
} from "@/core/data/migration-warning";
import { buildBackupAgeReminder } from "@/core/data/backup-reminder";
import { buildClearDataStatus } from "@/core/data/clear-status";
import { buildExportCompletionStatus } from "@/core/data/export-status";
import { downloadBlob } from "@/core/browser/blob-download";
import { isSupportedReviewAlgorithm } from "@/core/review/scheduler";
import {
  clearStoredSourceTemplate,
  hasStoredSourceTemplate,
} from "@/core/browser/source-template-storage";
import { REVIEW_EXERCISES } from "@/content/exercises";
import {
  clearUserData,
  countUserData,
  mergeBackupData,
  normalizeImportedBackupData,
  readBackupData,
  readBackupMetadataSnapshot,
  undoLatestImport,
} from "@/db/backup-repository";

type PendingImport = BackupData & { importSummary: ImportSummary };

type ExportSummary = {
  notes: number;
  reviewAttempts: number;
  reviewCardStates: number;
  unsupportedReviewCardStates: number;
  conceptProgress: number;
  favorites: number;
  preferences: number;
  labSnapshots: number;
  errata: number;
  compassRecords: number;
  compassCorrections: number;
};

type PendingExport = {
  data: BackupData;
  summary: ExportSummary;
};

const IMPORT_TABLE_LABELS: Record<keyof BackupData, string> = {
  notes: "笔记",
  reviewAttempts: "作答历史",
  reviewCardStates: "复习卡",
  conceptProgress: "学习进度",
  favorites: "收藏",
  preferences: "偏好",
  labSnapshots: "推演快照",
  errata: "内容勘误",
  compassRecords: "坐向记录",
  compassCorrections: "罗盘修正",
};

function readMigrationWarning() {
  try {
    return parseMigrationWarning(
      window.localStorage.getItem(MIGRATION_WARNING_KEY),
    );
  } catch {
    return null;
  }
}

export function DataBackup() {
  const [status, setStatus] = useState("建议定期导出一份备份。");
  const [backupReminder, setBackupReminder] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState(false);
  const metadataSequence = useRef(0);
  const mountedRef = useRef(false);
  const [clearing, setClearing] = useState(false);
  const [exportPreview, setExportPreview] = useState<PendingExport | null>(
    null,
  );
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
  );
  const busy = importing || exporting || clearing;

  const refreshMetadata = useCallback(() => {
    const sequence = ++metadataSequence.current;
    setMetadataLoading(true);
    setMetadataError(false);
    void Promise.resolve().then(async () => {
      const warning = readMigrationWarning();
      const { recoveryAvailable: available, lastExportAt } = await readBackupMetadataSnapshot();
      if (sequence !== metadataSequence.current) return;
      setRecoveryAvailable(available);
      setBackupReminder(warning
        ? `数据库已从 v${warning.fromVersion} 升级到 v${warning.toVersion}，建议现在导出一份备份`
        : buildBackupAgeReminder(lastExportAt ?? ""));
      setMetadataLoading(false);
      setMetadataError(false);
    }).catch(() => {
      if (sequence !== metadataSequence.current) return;
      setMetadataLoading(false);
      setMetadataError(true);
      setBackupReminder("备份提醒暂时无法读取，请检查浏览器存储权限后重试。");
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refreshMetadata, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refreshMetadata);
    return () => {
      mountedRef.current = false;
      metadataSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshMetadata);
    };
  }, [refreshMetadata]);

  async function prepareExport() {
    if (busy) return;
    setExporting(true);
    try {
      const data = await readBackupData();
      assertBackupDataIntegrity(data);
      if (!mountedRef.current) return;
      setExportPreview({
        data,
        summary: {
          notes: data.notes.length,
          reviewAttempts: data.reviewAttempts.length,
          reviewCardStates: data.reviewCardStates.length,
          unsupportedReviewCardStates: data.reviewCardStates.filter((item) => !isSupportedReviewAlgorithm(item)).length,
          conceptProgress: data.conceptProgress.length,
          favorites: data.favorites.length,
          preferences: data.preferences.length,
          labSnapshots: data.labSnapshots.length,
          errata: data.errata.length,
          compassRecords: data.compassRecords.length,
          compassCorrections: data.compassCorrections.length,
        },
      });
      setStatus("已读取当前数据范围，请确认后导出。应用内置内容不会重复导出。");
    } catch (error) {
      if (mountedRef.current) setStatus(
          `读取导出范围失败：${error instanceof Error ? error.message : "本地数据无法读取"}`,
        );
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }

  async function exportData(data: BackupData) {
    if (busy) return;
    setExporting(true);
    try {
      assertBackupDataIntegrity(data);
      const { iso: exportedAt, localDate: exportDate } = captureLocalNow();
      const envelope = {
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        appVersion: "0.1.0",
        contentVersion: "seed-1",
        exportedAt,
        checksum: calculateBackupChecksum(data),
        data,
      };
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `yijing-backup-${exportDate}.json`);
      let metadataSaved = true;
      try {
        await setPreference("lastExportAt", exportedAt);
      } catch {
        // The file has already been handed to the browser. Keep that success
        // visible while explaining that only the reminder metadata failed.
        metadataSaved = false;
      }
      try {
        window.localStorage.removeItem(MIGRATION_WARNING_KEY);
      } catch {
        /* localStorage is optional; the IndexedDB export already succeeded */
      }
      if (!mountedRef.current) return;
      if (metadataSaved) setBackupReminder("");
      setExportPreview(null);
      setStatus(buildExportCompletionStatus(data.notes.length, data.reviewAttempts.length, metadataSaved));
    } catch (error) {
      if (mountedRef.current) setStatus(
          `导出失败：${error instanceof Error ? error.message : "本地数据无法读取"}`,
        );
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }

  async function prepareImport(file: File) {
    if (busy) return;
    setImporting(true);
    try {
      const data = normalizeImportedBackupData(
        parseBackupEnvelope(JSON.parse(await file.text())),
      );
      assertBackupDataIntegrity(data);
      const existingData = await readBackupData();
      if (!mountedRef.current) return;
      setPendingImport({
        ...data,
        importSummary: summarizeImport(data, existingData),
      });
      setStatus("文件校验通过，请确认下面的导入摘要。");
    } catch (error) {
      if (mountedRef.current) {
        setPendingImport(null);
        setStatus(
          `导入失败：${error instanceof Error ? error.message : "文件无法读取"}`,
        );
      }
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  }

  async function confirmImport() {
    if (!pendingImport || busy) return;
    setImporting(true);
    try {
      const data = pendingImport;
      const confirmedSummary = await mergeBackupData(data);
      // conceptProgress is a derived table. Rebuild concepts represented by
      // imported review attempts so a backup with missing or stale derived
      // rows cannot leave the dashboard inconsistent with its history.
      const importedConceptIds = new Set(
        [
          ...data.reviewAttempts.flatMap((attempt) => {
            const exercise = REVIEW_EXERCISES.find((candidate) => candidate.id === attempt.cardId);
            return exercise?.targetType === "concept" ? [exercise.targetId] : [];
          }),
          ...data.conceptProgress.map((progress) => progress.conceptId),
        ],
      );
      let progressRebuildFailed = false;
      for (const conceptId of importedConceptIds) {
        try {
          await syncConceptProgress(conceptId);
        } catch {
          progressRebuildFailed = true;
        }
      }
      notifyDataChanged();
      if (!mountedRef.current) return;
      setPendingImport(null);
      setRecoveryAvailable(true);
      const { additions, updates, skipped } =
        confirmedSummary ?? data.importSummary;
      setStatus(
        `已合并备份：新增 ${additions} 条、更新 ${updates} 条、跳过 ${skipped} 条（含同 ID 冲突）。${progressRebuildFailed ? "掌握度正在等待下次刷新重建。" : "掌握度已按作答历史重算。"}`,
      );
    } catch (error) {
      if (mountedRef.current) setStatus(
          `写入失败：${error instanceof Error ? error.message : "数据库无法写入"}`,
        );
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  }

  async function undoImport() {
    if (busy || pendingImport) return;
    setImporting(true);
    try {
      const restored = await undoLatestImport();
      if (!restored) {
        if (mountedRef.current) {
          setRecoveryAvailable(false);
          setStatus("没有可撤销的导入记录。");
        }
        return;
      }
      if (!mountedRef.current) return;
      setRecoveryAvailable(false);
      notifyDataChanged();
      setStatus("已撤销最近一次导入，数据恢复到导入前状态。");
    } catch (error) {
      if (mountedRef.current) setStatus(`撤销导入失败：${error instanceof Error ? error.message : "本地数据无法恢复"}`);
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  }

  async function clearData() {
    if (busy) return;
    setClearing(true);
    try {
      const { notes, reviewAttempts: attempts, reviewCardStates: states, conceptProgress: progress, favorites, preferences, labSnapshots, errata, compassRecords, compassCorrections } = await countUserData();
      const hadSourceTemplate = hasStoredSourceTemplate();
      const sourceTemplateSummary = hadSourceTemplate ? "、1 个来源模板" : "";
      const summary = `将删除：${notes} 条笔记、${attempts} 条作答、${states} 张复习卡、${progress} 条学习进度、${favorites} 个收藏、${preferences} 项偏好、${labSnapshots} 个推演快照、${errata} 条内容勘误、${compassRecords} 条坐向记录、${compassCorrections} 条罗盘修正历史${sourceTemplateSummary}。\n请输入“清空易境”确认删除本浏览器中的学习数据：`;
      if (window.prompt(summary) !== "清空易境") return;
      await clearUserData();
      const sourceTemplateCleared = clearStoredSourceTemplate();
      notifyDataChanged();
      if (!mountedRef.current) return;
      setRecoveryAvailable(false);
      setBackupReminder("还没有导出过备份");
      setStatus(buildClearDataStatus(hadSourceTemplate, sourceTemplateCleared));
    } catch (error) {
      if (mountedRef.current) setStatus(
          `清空失败：${error instanceof Error ? error.message : "数据库无法写入，原有数据未确认删除"}`,
        );
    } finally {
      if (mountedRef.current) setClearing(false);
    }
  }

  return (
    <section className="backup-panel">
      <div className="backup-status">{status}</div>
      {metadataLoading && <small className="backup-meta-status" role="status">正在读取备份提醒…</small>}
      {metadataError && <small className="backup-meta-error" role="alert">备份提醒暂时无法读取。<button type="button" className="text-button" onClick={refreshMetadata}>重试读取</button></small>}
      {backupReminder && (
        <div className="backup-reminder" role="status">
          {backupReminder}。建议先导出一份备份，数据文件由你自行保管。
        </div>
      )}
      <div className="backup-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => void prepareExport()}
          disabled={busy}
        >
          {exporting ? "读取导出范围…" : "导出 JSON 备份"} <span>↓</span>
        </button>
        <label className={`outline-button ${busy ? "is-disabled" : ""}`}>
          选择备份文件{" "}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void prepareImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="danger-button"
          onClick={() => void clearData()}
          disabled={busy}
        >
          {clearing ? "正在清空…" : "清空本地数据"}
        </button>
        {recoveryAvailable && (
          <button
            type="button"
            className="outline-button"
            onClick={() => void undoImport()}
            disabled={busy || metadataLoading || Boolean(pendingImport)}
          >
            撤销最近一次导入
          </button>
        )}
      </div>
      {exportPreview && (
        <div className="export-preview" role="region" aria-labelledby="export-preview-title">
          <strong id="export-preview-title">导出范围预览</strong>
          <span>
            将导出当前浏览器中的用户数据；不会导出经典正文、来源模板、传感器读数、平台诊断或账户信息。来源模板仅保留在当前浏览器，清空本地数据时会一并移除。
          </span>
          <div className="export-summary-grid">
            <span>笔记 {exportPreview.summary.notes} 条</span>
            <span>作答 {exportPreview.summary.reviewAttempts} 条</span>
            <span>复习卡 {exportPreview.summary.reviewCardStates} 张</span>
            {exportPreview.summary.unsupportedReviewCardStates > 0 && <span className="export-warning">其中 {exportPreview.summary.unsupportedReviewCardStates} 张算法版本待兼容</span>}
            <span>学习进度 {exportPreview.summary.conceptProgress} 条</span>
            <span>收藏 {exportPreview.summary.favorites} 个</span>
            <span>偏好 {exportPreview.summary.preferences} 项</span>
            <span>推演快照 {exportPreview.summary.labSnapshots} 个</span>
            <span>内容勘误 {exportPreview.summary.errata} 条</span>
            <span>坐向记录 {exportPreview.summary.compassRecords} 条</span>
            <span>罗盘修正 {exportPreview.summary.compassCorrections} 条</span>
          </div>
          <small>导出文件可能包含私人笔记，请确认后自行妥善保管。</small>
          <div>
            <button
              type="button"
              className="primary-button"
              onClick={() => void exportData(exportPreview.data)}
              disabled={busy}
            >
              确认导出
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setExportPreview(null)}
              disabled={busy}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {pendingImport && (
        <div className="import-preview">
          <strong>导入摘要</strong>
          <span>
            {pendingImport.notes.length} 条笔记 ·{" "}
            {pendingImport.reviewAttempts.length} 条作答 ·{" "}
            {pendingImport.reviewCardStates.length} 张复习卡 ·{" "}
            {pendingImport.conceptProgress.length} 条学习进度 ·{" "}
            {pendingImport.favorites.length} 个收藏 ·{" "}
            {pendingImport.preferences.length} 项偏好 ·{" "}
            {pendingImport.labSnapshots.length} 个推演快照 ·{" "}
            {pendingImport.errata.length} 条内容勘误 ·{" "}
            {pendingImport.compassRecords.length} 条坐向记录 ·{" "}
            {pendingImport.compassCorrections.length} 条罗盘修正历史
          </span>
          <div className="import-summary-table" role="table" aria-label="导入冲突处理摘要">
            <div className="import-summary-row import-summary-header" role="row">
              <span role="columnheader">数据类型</span>
              <span role="columnheader">新增</span>
              <span role="columnheader">更新</span>
              <span role="columnheader">跳过</span>
            </div>
            {pendingImport.importSummary.tables.map((table) => (
              <div className="import-summary-row" role="row" key={table.key}>
                <span role="cell">{IMPORT_TABLE_LABELS[table.key]}</span>
                <span role="cell">{table.additions}</span>
                <span role="cell">{table.updates}</span>
                <span role="cell">{table.skipped}</span>
              </div>
            ))}
          </div>
          <small>
            共 {pendingImport.importSummary.conflicts} 条同 ID 冲突；更新仅在备份版本较新时发生，作答历史同 ID 始终跳过。
          </small>
          <div>
            <button
              type="button"
              className="primary-button"
              onClick={() => void confirmImport()}
              disabled={busy}
            >
              确认合并
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setPendingImport(null)}
              disabled={busy}
            >
              取消
            </button>
          </div>
        </div>
      )}
      <small>
        导入采用合并写入，不会静默删除当前记录；成功后会保留最近一次导入前的本地恢复快照，可在本页撤销；恢复快照不进入导出文件。导出文件可能包含你的私人笔记，请自行妥善保管。
      </small>
    </section>
  );
}
