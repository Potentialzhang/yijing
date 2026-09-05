"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  readPreferenceSnapshot,
  setPreferencesAtomically,
  type PreferenceUpdate,
} from "@/db/repository";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { applyVisualPreferences } from "@/components/settings/visualPreferences";

function lockVisualPreferences() {
  document.documentElement.dataset.preferenceLocked = "true";
}

export function Preferences() {
  const [theme, setTheme] = useState<string>(DEFAULT_PREFERENCES.theme);
  const [fontScale, setFontScale] = useState<string>(DEFAULT_PREFERENCES.fontScale);
  const [dailyNewCardLimit, setDailyNewCardLimit] = useState<number>(DEFAULT_PREFERENCES.dailyNewCardLimit);
  const [sessionBatchSize, setSessionBatchSize] = useState<number>(DEFAULT_PREFERENCES.sessionBatchSize);
  const [status, setStatus] = useState("设置只保存在当前浏览器。");
  const [loading, setLoading] = useState(true);
  const userChanged = useRef(false);
  // Event handlers can run back-to-back before React commits the state from
  // the previous handler. Keep the visual preference pair in refs so a rapid
  // theme/font-size change never applies one control with a stale sibling.
  const themeRef = useRef<string>(DEFAULT_PREFERENCES.theme);
  const fontScaleRef = useRef<string>(DEFAULT_PREFERENCES.fontScale);
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);
  const initialSettled = useRef(false);
  // Keep rapid changes in the same order the user made them. This matters
  // when two controls are changed before the first database write resolves.
  const preferenceWriteQueue = useRef(createSerialTaskQueue());

  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readPreferenceSnapshot()
      .then((snapshot) => {
        if (sequence !== refreshSequence.current) return;
        setLoading(false);
        // A user can change a control before the first database read settles.
        // Do not let that older read overwrite the visible choice; subsequent
        // cross-tab notifications still refresh the form from persisted data.
        if (!initialSettled.current && userChanged.current) {
          initialSettled.current = true;
          return;
        }
        initialSettled.current = true;
        themeRef.current = snapshot.theme;
        fontScaleRef.current = snapshot.fontScale;
        setTheme(snapshot.theme); setFontScale(snapshot.fontScale); setDailyNewCardLimit(snapshot.dailyNewCardLimit); setSessionBatchSize(snapshot.sessionBatchSize); applyVisualPreferences(snapshot.theme, snapshot.fontScale);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setLoading(false);
        setStatus("设置读取失败，将使用默认值");
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);
  function enqueuePreferenceWrite(update: PreferenceUpdate) {
    return preferenceWriteQueue.current.enqueue(() => setPreferencesAtomically([update]));
  }

  async function save(key: PreferenceUpdate["key"], value: PreferenceUpdate["value"]) {
    try {
      await enqueuePreferenceWrite({ key, value });
      notifyDataChanged();
      if (mountedRef.current) setStatus("设置已保存");
    } catch {
      if (mountedRef.current) setStatus("设置保存失败，请检查浏览器存储权限后重试");
    }
  }
  return <section className="preferences-panel"><div className="preference-status" role="status">{loading ? "正在读取设置…" : status}</div><div className="preference-grid"><label>主题<select disabled={loading} value={theme} onChange={(event) => { userChanged.current = true; lockVisualPreferences(); const value = event.target.value; themeRef.current = value; setTheme(value); applyVisualPreferences(value, fontScaleRef.current); void save("theme", value); }}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label><label>字号<select disabled={loading} value={fontScale} onChange={(event) => { userChanged.current = true; lockVisualPreferences(); const value = event.target.value; fontScaleRef.current = value; setFontScale(value); applyVisualPreferences(themeRef.current, value); void save("fontScale", value); }}><option value="normal">标准</option><option value="large">大字号</option></select></label><label>每日新卡上限<select disabled={loading} value={dailyNewCardLimit} onChange={(event) => { userChanged.current = true; lockVisualPreferences(); const value = Number(event.target.value); setDailyNewCardLimit(value); void save("dailyNewCardLimit", value); }}><option value={5}>5 张</option><option value={10}>10 张</option><option value={15}>15 张</option><option value={20}>20 张</option><option value={30}>30 张</option></select></label><label>每组复习上限<select disabled={loading} value={sessionBatchSize} onChange={(event) => { userChanged.current = true; lockVisualPreferences(); const value = Number(event.target.value); setSessionBatchSize(value); void save("sessionBatchSize", value); }}><option value={10}>10 张</option><option value={20}>20 张</option><option value={30}>30 张</option><option value={40}>40 张</option></select></label></div><p className="preference-impact" aria-live="polite">当前每天最多加入 {dailyNewCardLimit} 张未开始新卡；每组最多展示 {sessionBatchSize} 张。到期卡仍然优先，调整不会删除历史作答或改变内置内容。</p><div className="preference-availability" role="note"><strong>文字版本</strong><span>当前内置内容仅提供简体版。待内容负责人提供繁体字段并完成来源复核后，这里会开放繁简切换；在此之前不做未经核验的自动转换。</span></div><p className="preference-help">新卡上限只限制未开始卡片；到期复习会优先进入队列。每组完成后可以继续下一组。</p></section>;
}
