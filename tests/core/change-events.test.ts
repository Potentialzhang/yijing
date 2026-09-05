import { describe, expect, it, vi } from "vitest";
import { tryPostDataChanged } from "@/core/browser/change-events";

describe("跨标签数据变更通知", () => {
  it("没有通道时安全降级", () => {
    expect(tryPostDataChanged(null, 1)).toBe(false);
  });

  it("发送带时间戳的不可变消息", () => {
    const postMessage = vi.fn();
    expect(tryPostDataChanged({ postMessage }, 123)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ changedAt: 123 });
  });

  it("通道关闭或实现异常时不向写入调用方抛错", () => {
    const postMessage = vi.fn(() => {
      throw new DOMException("channel is closed", "InvalidStateError");
    });
    expect(tryPostDataChanged({ postMessage }, 456)).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
