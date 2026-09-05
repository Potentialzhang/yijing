"use client";

import { useEffect, useState } from "react";
import {
  describeCalendarBoundaries,
  DRAFT_CALENDAR_RULE_SET,
} from "@/core/calendar/rules";
import { buildPendingCalendarReading } from "@/core/calendar/reading";
import type { CalendarReading } from "@/core/calendar/types";
import { calculateCalendar, CALENDAR_RULES, type CalculatedCalendarReading } from "@/core/calendar/calculate";
import { CalendarResult } from "@/components/tools/CalendarResult";

const TIME_ZONES = [
  { value: "Asia/Shanghai", label: "Asia/Shanghai（中国标准时间）" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo（日本标准时间）" },
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles（太平洋时间）" },
] as const;

type CalendarInputMode = "local" | "iso";

function timeStatusLabel(
  status: CalendarReading["timeInterpretation"]["status"],
): string {
  return status === "resolved"
    ? "已解析"
    : status === "ambiguous"
      ? "重复时间"
      : "不存在时间";
}

function formatOffset(minutes: number | null): string {
  if (minutes === null) return "未确定";
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function defaultInstant(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function CalendarInputExplorer() {
  const [inputMode, setInputMode] = useState<CalendarInputMode>("local");
  // The current clock is intentionally read after hydration. Calling
  // `defaultInstant` in the state initializer would make the server-rendered
  // value diverge from the browser when a request crosses a minute boundary.
  const [instant, setInstant] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Shanghai");
  const [ruleVersion, setRuleVersion] = useState(CALENDAR_RULES[0].id);
  const [reading, setReading] = useState<CalendarReading | CalculatedCalendarReading | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setInstant(defaultInstant()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function reviewInput() {
    try {
      setReading(
        ruleVersion === DRAFT_CALENDAR_RULE_SET.id ? buildPendingCalendarReading(
          { instant, timeZone, ruleVersion },
          DRAFT_CALENDAR_RULE_SET,
        ) : calculateCalendar({ instant, timeZone, ruleVersion }),
      );
      setError("");
    } catch (reason) {
      setReading(null);
      setError(reason instanceof Error ? reason.message : "输入无法校验");
    }
  }

  function changeInputMode(nextMode: CalendarInputMode) {
    setInputMode(nextMode);
    if (nextMode === "local") {
      // The native picker only accepts minute precision and no offset. Keep
      // the same wall-clock fields when returning from the ISO editor.
      setInstant((value) => value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "").slice(0, 16));
    } else {
      // Preserve the selected wall time, while leaving the offset for the
      // user to enter explicitly instead of guessing from the chosen zone.
      setInstant((value) => (value.length === 16 ? `${value}:00` : value));
    }
  }

  return (
    <section className="calendar-input-explorer" aria-label="历法输入审阅">
      <div className="calendar-input-form">
        <label htmlFor="calendar-input-mode">
          时间输入方式
          <select
            id="calendar-input-mode"
            value={inputMode}
            onChange={(event) =>
              changeInputMode(event.target.value as CalendarInputMode)
            }
          >
            <option value="local">本地时间选择器</option>
            <option value="iso">ISO 时间（可含显式偏移）</option>
          </select>
        </label>
        <label htmlFor="calendar-instant">
          {inputMode === "local" ? "公历本地时间" : "ISO 时间（可含偏移）"}
          {inputMode === "local" ? (
            <input
              id="calendar-instant"
              type="datetime-local"
              value={instant.slice(0, 16)}
              onChange={(event) => setInstant(event.target.value)}
            />
          ) : (
            <input
              id="calendar-instant"
              type="text"
              value={instant}
              onChange={(event) => setInstant(event.target.value)}
              placeholder="2026-08-26T12:34:56+08:00"
              spellCheck={false}
            />
          )}
        </label>
        <label htmlFor="calendar-time-zone">
          IANA 时区
          <input
            id="calendar-time-zone"
            list="calendar-time-zone-options"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            placeholder="例如 Asia/Shanghai"
            spellCheck={false}
          />
          <datalist id="calendar-time-zone-options">
            {TIME_ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </datalist>
          <small>可直接输入其他 IANA 时区，提交时会校验。</small>
        </label>
        <label htmlFor="calendar-rule-version">
          换日规则
          <select
            id="calendar-rule-version"
            value={ruleVersion}
            onChange={(event) => setRuleVersion(event.target.value)}
          >
            <option value={CALENDAR_RULES[0].id}>午夜换日（00:00）</option>
            <option value={CALENDAR_RULES[1].id}>子初换日（23:00）</option>
            <option value={DRAFT_CALENDAR_RULE_SET.id}>旧版输入审阅（不计算）</option>
          </select>
          <small>年柱按立春、月柱按节换月；支持 1901～2099 年。</small>
        </label>
        <button type="button" className="primary-button" onClick={reviewInput}>
          计算干支与节气
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {reading && "solarTerms" in reading ? <CalendarResult reading={reading} /> : reading ? (
        <article className="calendar-reading" aria-label="待确认历法结果">
          <div className="section-heading">
            <div>
              <p className="eyebrow">输入契约已通过</p>
              <h2>先确认条件，再等待规则。</h2>
            </div>
            <span>待确认规则</span>
          </div>
          <div className="calendar-facts">
            <span>
              输入时间<strong>{reading.input.instant}</strong>
            </span>
            <span>
              时区<strong>{reading.input.timeZone}</strong>
            </span>
            <span>
              规则版本<strong>{reading.ruleSet.id}</strong>
            </span>
            <span>
              公历字段
              <strong>{reading.timeInterpretation.localDateTime}</strong>
            </span>
            <span>
              时区解析
              <strong>{timeStatusLabel(reading.timeInterpretation.status)}</strong>
            </span>
            <span>
              UTC 瞬间
              <strong>{reading.timeInterpretation.utcInstant ?? "暂不构造"}</strong>
            </span>
            <span>
              采用偏移
              <strong>{formatOffset(reading.timeInterpretation.offsetMinutes)}</strong>
            </span>
          </div>
          {reading.timeInterpretation.status !== "resolved" && (
            <p className="form-error" role="alert">
              {reading.timeInterpretation.status === "ambiguous"
                ? "这个本地时间在所选时区出现两次，请改用带显式偏移的 ISO 时间后再核对。"
                : "这个本地时间在所选时区不存在，请调整时间后再核对。"}
            </p>
          )}
          <div className="calendar-pending-boundaries">
            <strong>尚未输出的层</strong>
            <span>农历日期</span>
            <span>干支年</span>
            <span>干支月</span>
            <span>干支日</span>
            <span>干支时</span>
            <span>二十四节气</span>
          </div>
          <div className="calendar-boundary-status" aria-label="规则证据状态">
            <strong>规则证据状态</strong>
            <ul>
              <li data-status={reading.ruleSet.sourceIds.length > 0 ? "configured" : "pending"}>
                <span>来源 ID</span>
                <strong>{reading.ruleSet.sourceIds.length > 0 ? "已登记" : "待补齐"}</strong>
                <small>
                  {reading.ruleSet.sourceIds.length > 0
                    ? reading.ruleSet.sourceIds.join("、")
                    : "尚未登记可核对的历法来源。"}
                </small>
              </li>
              <li data-status={reading.ruleSet.authoritativeSampleIds.length > 0 ? "configured" : "pending"}>
                <span>权威样例 ID</span>
                <strong>{reading.ruleSet.authoritativeSampleIds.length > 0 ? "已登记" : "待补齐"}</strong>
                <small>
                  {reading.ruleSet.authoritativeSampleIds.length > 0
                    ? reading.ruleSet.authoritativeSampleIds.join("、")
                    : "尚未登记带期望结果的权威边界样例。"}
                </small>
              </li>
            </ul>
            <small>证据登记完成并经内容负责人复核后，规则集才可升级为 accepted。</small>
          </div>
          <div className="calendar-boundary-status">
            <strong>边界确认状态</strong>
            <ul>
              {describeCalendarBoundaries(reading.ruleSet).map((boundary) => (
                <li key={boundary.id} data-status={boundary.status}>
                  <span>{boundary.label}</span>
                  <strong>
                    {boundary.status === "pending" ? "待确认" : "已配置"}
                  </strong>
                  <small>{boundary.detail}</small>
                </li>
              ))}
            </ul>
            <small>关联规则：ADR-0002；规则负责人复核前不生成干支结果。</small>
          </div>
          <ul className="calendar-explanation">
            {reading.explanation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : (
        <div className="calendar-empty">
          <strong>输入一个时间，查看四柱与二十四节气</strong>
          <span>默认采用午夜换日，可切换子初换日对照学习。</span>
        </div>
      )}
    </section>
  );
}
