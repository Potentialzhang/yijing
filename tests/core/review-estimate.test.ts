import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESPONSE_TIME_MS,
  MAX_USABLE_RESPONSE_TIME_MS,
  estimateReviewMinutes,
} from "@/core/review/estimate";

describe("复习剩余时间估算", () => {
  it("没有历史耗时时保持透明的一分钟每题默认值", () => {
    expect(estimateReviewMinutes(3, [])).toBe(3);
    expect(DEFAULT_RESPONSE_TIME_MS).toBe(60_000);
  });

  it("使用有效耗时的中位数，并随着作答完成即时更新估算", () => {
    expect(estimateReviewMinutes(4, [30_000, 90_000, 60_000])).toBe(4);
    expect(estimateReviewMinutes(2, [30_000])).toBe(1);
  });

  it("忽略非法值和后台停留等超长样本，避免污染预计时间", () => {
    expect(estimateReviewMinutes(2, [-1, 1.5, "60s", MAX_USABLE_RESPONSE_TIME_MS + 1])).toBe(2);
    expect(estimateReviewMinutes(2, [0, 0])).toBe(1);
  });

  it("没有剩余卡片或数量异常时返回零", () => {
    expect(estimateReviewMinutes(0, [60_000])).toBe(0);
    expect(estimateReviewMinutes(-1, [60_000])).toBe(0);
    expect(estimateReviewMinutes(Number.NaN, [60_000])).toBe(0);
  });
});
