import { describe, expect, it, vi } from "vitest";
import {
  captureLocalNow,
  formatLocalDate,
  formatLocalDateLabel,
  formatLocalDateTime,
  compareIsoTimestamps,
  compareLocalDateStrings,
  isValidIsoTimestamp,
  isValidLocalDate,
} from "@/core/date/local";
import {
  LOCAL_DATE_ROLLOVER_POLL_MS,
  MAX_LOCAL_DATE_ROLLOVER_POLL_MS,
  MIN_LOCAL_DATE_ROLLOVER_POLL_MS,
  watchLocalDateRollover,
} from "@/core/browser/date-rollover";

describe("本地日历日期", () => {
  it("只在本地日期变化时通知，并支持清理轮询", () => {
    vi.useFakeTimers();
    let current = "2026-08-31";
    let changes = 0;
    const stop = watchLocalDateRollover(() => current, () => { changes += 1; }, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(changes).toBe(0);
    current = "2026-09-01";
    vi.advanceTimersByTime(1_000);
    expect(changes).toBe(1);
    vi.advanceTimersByTime(3_000);
    expect(changes).toBe(1);
    stop();
    current = "2026-09-02";
    vi.advanceTimersByTime(2_000);
    expect(changes).toBe(1);
    vi.useRealTimers();
  });

  it("对无效轮询间隔回退到安全默认值，并限制上下界", () => {
    vi.useFakeTimers();
    let current = "2026-08-31";
    let changes = 0;
    const stop = watchLocalDateRollover(() => current, () => { changes += 1; }, Number.NaN);
    current = "2026-09-01";
    vi.advanceTimersByTime(LOCAL_DATE_ROLLOVER_POLL_MS - 1);
    expect(changes).toBe(0);
    vi.advanceTimersByTime(1);
    expect(changes).toBe(1);
    stop();

    current = "2026-09-01";
    const stopInfinite = watchLocalDateRollover(() => current, () => { changes += 1; }, Number.POSITIVE_INFINITY);
    current = "2026-09-02";
    vi.advanceTimersByTime(LOCAL_DATE_ROLLOVER_POLL_MS - 1);
    expect(changes).toBe(1);
    vi.advanceTimersByTime(1);
    expect(changes).toBe(2);
    stopInfinite();

    current = "2026-09-02";
    const stopTooSmall = watchLocalDateRollover(() => current, () => { changes += 1; }, 0);
    current = "2026-09-03";
    vi.advanceTimersByTime(MIN_LOCAL_DATE_ROLLOVER_POLL_MS - 1);
    expect(changes).toBe(2);
    vi.advanceTimersByTime(1);
    expect(changes).toBe(3);
    stopTooSmall();

    current = "2026-09-03";
    const stopTooLarge = watchLocalDateRollover(() => current, () => { changes += 1; }, Number.MAX_VALUE);
    current = "2026-09-04";
    vi.advanceTimersByTime(MAX_LOCAL_DATE_ROLLOVER_POLL_MS - 1);
    expect(changes).toBe(3);
    vi.advanceTimersByTime(1);
    expect(changes).toBe(4);
    stopTooLarge();
    vi.useRealTimers();
  });

  it("页面恢复可见时立即检查日期，并在清理后移除监听", () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    let visibilityState: "hidden" | "visible" = "hidden";
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    });
    const removeEventListener = vi.fn((type: string) => {
      listeners.delete(type);
    });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener,
      removeEventListener,
    });
    const windowListeners = new Map<string, () => void>();
    const windowAddEventListener = vi.fn((type: string, listener: () => void) => {
      windowListeners.set(type, listener);
    });
    const windowRemoveEventListener = vi.fn((type: string) => {
      windowListeners.delete(type);
    });
    vi.stubGlobal("window", { addEventListener: windowAddEventListener, removeEventListener: windowRemoveEventListener });

    let current = "2026-08-31";
    let changes = 0;
    const stop = watchLocalDateRollover(() => current, () => { changes += 1; }, 1_000);

    current = "2026-09-01";
    listeners.get("visibilitychange")?.();
    expect(changes).toBe(0);
    visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    expect(changes).toBe(1);
    visibilityState = "hidden";
    current = "2026-09-02";
    listeners.get("visibilitychange")?.();
    expect(changes).toBe(1);
    visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    expect(changes).toBe(2);
    current = "2026-09-03";
    windowListeners.get("pageshow")?.();
    expect(changes).toBe(3);

    const staleVisibilityListener = listeners.get("visibilitychange");
    const stalePageShowListener = windowListeners.get("pageshow");
    stop();
    expect(removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(listeners.has("visibilitychange")).toBe(false);
    expect(windowRemoveEventListener).toHaveBeenCalledWith("pageshow", expect.any(Function));
    expect(windowListeners.has("pageshow")).toBe(false);
    current = "2026-09-04";
    visibilityState = "visible";
    staleVisibilityListener?.();
    stalePageShowListener?.();
    expect(changes).toBe(3);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("按本地年月日格式化而不经过 UTC 转换", () => {
    const date = new Date(2026, 7, 27, 0, 5, 0);
    expect(formatLocalDate(date)).toBe("2026-08-27");
  });

  it("从同一个时间快照派生 ISO 时间戳和本地日期", () => {
    const date = new Date(2026, 7, 27, 0, 5, 0);
    const snapshot = captureLocalNow(date);
    expect(snapshot.iso).toBe(date.toISOString());
    expect(snapshot.localDate).toBe("2026-08-27");
  });

  it("拒绝无效日期", () => {
    expect(() => formatLocalDate(new Date("invalid"))).toThrow("日期无效");
  });

  it("校验本地日历日期而不是只匹配字符串格式", () => {
    expect(isValidLocalDate("2026-02-28")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("2026/08/27")).toBe(false);
  });

  it("安全显示持久化时间并为损坏值提供回退文案", () => {
    expect(formatLocalDateTime("not-a-date")).toBe("日期待校验");
    expect(formatLocalDateLabel("not-a-date")).toBe("日期待校验");
    expect(formatLocalDateTime("0")).toBe("日期待校验");
    expect(formatLocalDateLabel("2026-02-30T10:00:00.000Z")).toBe("日期待校验");
    expect(formatLocalDateTime(new Date(2026, 7, 27, 9, 30))).not.toContain("Invalid");
    expect(formatLocalDateLabel(new Date(2026, 7, 27, 9, 30))).not.toContain("Invalid");
  });

  it("按实际瞬间比较带不同时区偏移的时间戳，并把损坏值排在末尾", () => {
    expect(compareIsoTimestamps("2026-08-27T01:30:00+08:00", "2026-08-26T17:00:00Z")).toBeGreaterThan(0);
    expect(compareIsoTimestamps("2026-08-26T17:00:00Z", "2026-08-27T01:30:00+08:00")).toBeLessThan(0);
    expect(compareIsoTimestamps("not-a-date", "2026-08-26T17:00:00Z")).toBeGreaterThan(0);
  });

  it("两个损坏时间的排序不依赖浏览器语言环境", () => {
    expect(compareIsoTimestamps("z-invalid", "a-invalid")).toBeGreaterThan(0);
    expect(compareIsoTimestamps("a-invalid", "z-invalid")).toBeLessThan(0);
    expect(compareIsoTimestamps("same-invalid", "same-invalid")).toBe(0);
  });

  it("本地日期字符串排序不依赖浏览器语言环境", () => {
    expect(compareLocalDateStrings("2026-08-01", "2026-08-10")).toBeLessThan(0);
    expect(compareLocalDateStrings("2026-08-10", "2026-08-01")).toBeGreaterThan(0);
    expect(compareLocalDateStrings("z-invalid", "a-invalid")).toBeGreaterThan(0);
  });

  it("拒绝 Date.parse 可误认的非 ISO 时间格式", () => {
    expect(isValidIsoTimestamp("2026-08-28T10:00:00.000Z")).toBe(true);
    expect(isValidIsoTimestamp("2026-08-28T10:00:00+08:00")).toBe(true);
    expect(isValidIsoTimestamp("0")).toBe(false);
    expect(isValidIsoTimestamp("2026")).toBe(false);
    expect(isValidIsoTimestamp("2026-08-28")).toBe(false);
    expect(isValidIsoTimestamp("2026-02-30T10:00:00.000Z")).toBe(false);
    expect(isValidIsoTimestamp("2026-01-01T24:00:00.000Z")).toBe(false);
    expect(isValidIsoTimestamp("2026-01-01T23:60:00.000Z")).toBe(false);
    expect(isValidIsoTimestamp(42 as never)).toBe(false);
    expect(compareIsoTimestamps("0", "2026-08-28T10:00:00.000Z")).toBeGreaterThan(0);
  });
});
