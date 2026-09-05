"use client";

import { useEffect, useRef, useState } from "react";
import { formatLocalDate } from "@/core/date/local";
import { watchLocalDateRollover } from "@/core/browser/date-rollover";

function formatTodayLabel(): string {
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `今日学习 · ${parts.month ?? ""} 月 ${parts.day ?? ""} 日`;
}

export function TodayLabel() {
  const [label, setLabel] = useState("今日学习");
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const updateLabel = () => {
      if (!mountedRef.current) return;
      setLabel(formatTodayLabel());
    };
    const initialTimer = window.setTimeout(updateLabel, 0);
    const stopDateWatcher = watchLocalDateRollover(formatLocalDate, updateLabel);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialTimer);
      stopDateWatcher();
    };
  }, []);
  return <span className="eyebrow">{label}</span>;
}
