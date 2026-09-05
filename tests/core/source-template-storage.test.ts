import { describe, expect, it, vi } from "vitest";
import { serializeSourceTemplate, SOURCE_TEMPLATE_CHANGED_EVENT, SOURCE_TEMPLATE_STORAGE_KEY } from "@/core/notes/source-template";
import {
  clearStoredSourceTemplate,
  hasStoredSourceTemplate,
  readStoredSourceTemplate,
} from "@/core/browser/source-template-storage";

describe("来源模板浏览器存储适配器", () => {
  const source = {
    label: "《周易》校注",
    kind: "book" as const,
    author: "作者甲",
  };

  it("可以安全读取、判断和清理模板，并发送变更事件", () => {
    const storage = {
      value: serializeSourceTemplate(source, "2026-08-30T08:00:00.000Z") as string | null,
      getItem: vi.fn((key: string) => key === SOURCE_TEMPLATE_STORAGE_KEY ? storage.value : null),
      removeItem: vi.fn((key: string) => {
        if (key === SOURCE_TEMPLATE_STORAGE_KEY) storage.value = null;
      }),
    };
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { localStorage: storage, dispatchEvent });

    expect(hasStoredSourceTemplate()).toBe(true);
    expect(readStoredSourceTemplate()?.sourceRef.label).toBe(source.label);
    expect(clearStoredSourceTemplate()).toBe(true);
    expect(hasStoredSourceTemplate()).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe(SOURCE_TEMPLATE_CHANGED_EVENT);

    vi.unstubAllGlobals();
  });

  it("存储 API 失败时返回安全结果而不抛出", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => { throw new Error("blocked"); }),
        removeItem: vi.fn(() => { throw new Error("blocked"); }),
      },
      dispatchEvent: vi.fn(),
    });
    expect(readStoredSourceTemplate()).toBeNull();
    expect(hasStoredSourceTemplate()).toBe(false);
    expect(clearStoredSourceTemplate()).toBe(false);
    vi.unstubAllGlobals();
  });
});
