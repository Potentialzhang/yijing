import { describe, expect, it, vi } from "vitest";
import { downloadBlob, type BlobDownloadAdapter } from "@/core/browser/blob-download";

function makeAdapter(overrides: Partial<BlobDownloadAdapter> = {}) {
  const anchor = {
    href: "",
    download: "",
    style: { display: "" },
    setAttribute: vi.fn(),
    click: vi.fn(),
    remove: vi.fn(),
  } as unknown as HTMLAnchorElement;
  let cleanup: (() => void) | undefined;
  const adapter: BlobDownloadAdapter = {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
    createAnchor: vi.fn(() => anchor),
    appendAnchor: vi.fn(),
    scheduleCleanup: vi.fn((callback) => {
      cleanup = callback;
    }),
    ...overrides,
  };
  return { adapter, anchor, runCleanup: () => cleanup?.() };
}

describe("Blob 下载适配器", () => {
  it("在点击后延迟清理 URL 和隐藏锚点", () => {
    const { adapter, anchor, runCleanup } = makeAdapter();

    downloadBlob(new Blob(["report"]), "audit.json", adapter);

    expect(adapter.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.href).toBe("blob:test");
    expect(anchor.download).toBe("audit.json");
    expect(anchor.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    expect(anchor.style.display).toBe("none");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(adapter.revokeObjectURL).not.toHaveBeenCalled();

    runCleanup();
    expect(adapter.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it("挂载或点击失败时立即清理已创建的资源并重新抛错", () => {
    const error = new Error("click blocked");
    const { adapter, anchor } = makeAdapter({
      appendAnchor: vi.fn(),
    });
    anchor.click = vi.fn(() => {
      throw error;
    });

    expect(() => downloadBlob(new Blob(["report"]), "audit.json", adapter)).toThrow(error);
    expect(adapter.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(adapter.scheduleCleanup).not.toHaveBeenCalled();
  });

  it("创建 URL 失败时不尝试清理不存在的资源", () => {
    const error = new Error("URL unavailable");
    const { adapter, anchor } = makeAdapter({
      createObjectURL: vi.fn(() => {
        throw error;
      }),
    });

    expect(() => downloadBlob(new Blob(["report"]), "audit.json", adapter)).toThrow(error);
    expect(adapter.revokeObjectURL).not.toHaveBeenCalled();
    expect(adapter.createAnchor).not.toHaveBeenCalled();
    expect(anchor.remove).not.toHaveBeenCalled();
  });

  it("清理 API 再次失败时仍完成另一项清理且不抛出定时器异常", () => {
    const { adapter, anchor, runCleanup } = makeAdapter({
      revokeObjectURL: vi.fn(() => {
        throw new Error("already revoked");
      }),
    });

    downloadBlob(new Blob(["report"]), "audit.json", adapter);

    expect(() => runCleanup()).not.toThrow();
    expect(anchor.remove).toHaveBeenCalledOnce();
  });
});
