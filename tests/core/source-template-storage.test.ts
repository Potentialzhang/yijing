import { describe, expect, it, vi } from "vitest";
import { serializeSourceTemplate, SOURCE_TEMPLATE_CHANGED_EVENT } from "@/core/notes/source-template";
import {
  clearStoredSourceTemplate,
  hasStoredSourceTemplate,
  readStoredSourceTemplate,
  saveStoredSourceTemplate,
} from "@/core/browser/source-template-storage";

describe("来源模板账户数据适配器", () => {
  const source = {
    label: "《周易》校注",
    kind: "book" as const,
    author: "作者甲",
  };

  it("可以安全读取、判断、保存和清理模板，并发送变更事件", async () => {
    const template = JSON.parse(serializeSourceTemplate(source, "2026-08-30T08:00:00.000Z"));
    let records: unknown[] = [{ id: "latest", template, updatedAt: "2026-08-30T08:00:00.000Z" }];
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        records = [body.record];
      }
      if (init?.method === "DELETE") records = [];
      return { ok: true, json: async () => ({ records }) };
    }));

    expect(await hasStoredSourceTemplate()).toBe(true);
    expect((await readStoredSourceTemplate())?.sourceRef.label).toBe(source.label);
    expect(await saveStoredSourceTemplate(source, "2026-08-30T08:00:00.000Z")).toBe(true);
    expect(await clearStoredSourceTemplate()).toBe(true);
    expect(await hasStoredSourceTemplate()).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledTimes(4);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe(SOURCE_TEMPLATE_CHANGED_EVENT);

    vi.unstubAllGlobals();
  });

  it("账户 API 失败时返回安全结果而不抛出", async () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await readStoredSourceTemplate()).toBeNull();
    expect(await hasStoredSourceTemplate()).toBe(false);
    expect(await clearStoredSourceTemplate()).toBe(false);
    vi.unstubAllGlobals();
  });
});
