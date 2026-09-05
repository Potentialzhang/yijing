import { describe, expect, it } from "vitest";
import { buildAiRequestPreview } from "@/core/ai/consent";
import { createAiDraftOutput } from "@/core/ai/output";
import {
  MAX_AI_PAYLOAD_CHARS,
  MAX_AI_TIMEOUT_MS,
  normalizeAiProviderPayloadChars,
  normalizeAiProviderTimeoutMs,
  runAiProvider,
  type AiProvider,
} from "@/core/ai/provider";

const preview = buildAiRequestPreview("study-draft", ["selected-content"]);
const request = {
  preview,
  selectedData: { "content.conceptId": "trigram-qian" },
  userConfirmed: true as const,
};

describe("M4 供应商无关的 AI 适配层", () => {
  it("只接受通过输出契约和安全评估的草稿", async () => {
    const provider: AiProvider = {
      id: "fake-safe",
      async generateDraft() {
        return createAiDraftOutput({
          kind: "exercise-draft",
          text: "AI 辅助学习草稿：先复述结构，再回到来源核对。",
          inputScopes: ["selected-content"],
          sourceCitations: [{ sourceId: "source-1", label: "已选学习材料" }],
        });
      },
    };
    const result = await runAiProvider(provider, request, { timeoutMs: 50 });
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.draft.status).toBe("draft");
  });

  it("拦截危险草稿而不是把它当成成功结果", async () => {
    const provider: AiProvider = {
      id: "fake-unsafe",
      async generateDraft() {
        return createAiDraftOutput({
          kind: "hexagram-discussion",
          text: "AI 辅助：这个结果必然发财。",
          inputScopes: ["selected-content"],
          sourceCitations: [{ sourceId: "source-1", label: "材料" }],
        });
      },
    };
    const result = await runAiProvider(provider, request, { timeoutMs: 50 });
    expect(result.status).toBe("unsafe-output");
  });

  it("超时会中止信号并回退到稍后重试", async () => {
    let aborted = false;
    const provider: AiProvider = {
      id: "fake-timeout",
      generateDraft(_request, signal) {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => undefined);
      },
    };
    const result = await runAiProvider(provider, request, { timeoutMs: 5 });
    expect(result).toMatchObject({
      status: "failed",
      notice: { action: "retry-later" },
    });
    expect(aborted).toBe(true);
  });

  it("没有用户确认时不调用供应商", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-no-consent",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const result = await runAiProvider(
      provider,
      { ...request, userConfirmed: false as never },
      { timeoutMs: 50 },
    );
    expect(result).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
    expect(called).toBe(false);
  });

  it("拒绝预览白名单之外的字段，并且不调用供应商", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-extra-field",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const result = await runAiProvider(
      provider,
      {
        ...request,
        selectedData: {
          ...request.selectedData,
          "notes.unselectedPrivateText": "不得外传",
        },
      },
      { timeoutMs: 50 },
    );
    expect(result).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
    expect(called).toBe(false);
  });

  it("拒绝被篡改的授权预览或非对象数据，并且不调用供应商", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-invalid-preview",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const invalidPreview = {
      ...preview,
      includedFields: ["all-local-database-records"],
    };
    const invalidPreviewResult = await runAiProvider(provider, {
      ...request,
      preview: invalidPreview,
    });
    expect(invalidPreviewResult).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
    const invalidDataResult = await runAiProvider(provider, {
      ...request,
      selectedData: null as never,
    });
    expect(invalidDataResult).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
    expect(called).toBe(false);
  });

  it("拒绝非对象请求，而不是抛出未处理异常", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-invalid-request",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const result = await runAiProvider(provider, null as never);
    expect(result).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
    expect(called).toBe(false);
  });

  it("拒绝草稿声称使用本次未授权的数据范围", async () => {
    const provider: AiProvider = {
      id: "fake-unauthorized-output-scope",
      async generateDraft() {
        return createAiDraftOutput({
          kind: "exercise-draft",
          text: "AI 辅助学习草稿：请回到来源核对。",
          inputScopes: ["selected-notes"],
          sourceCitations: [{ sourceId: "source-1", label: "学习材料" }],
        });
      },
    };
    const result = await runAiProvider(provider, request, { timeoutMs: 50 });
    expect(result).toMatchObject({
      status: "failed",
      notice: { action: "revoke-consent" },
    });
  });

  it("超过请求体上限时不调用供应商", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-large-payload",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const result = await runAiProvider(
      provider,
      {
        ...request,
        selectedData: { "content.conceptId": "x".repeat(100) },
      },
      { maxPayloadChars: 32 },
    );
    expect(result).toMatchObject({
      status: "failed",
      notice: { failure: "payload-too-large", action: "ask-user" },
    });
    expect(called).toBe(false);
  });

  it("不可序列化的选中数据会在发送前失败", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-bigint",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const result = await runAiProvider(
      provider,
      {
        ...request,
        selectedData: { "content.conceptId": BigInt(1) },
      },
    );
    expect(result).toMatchObject({
      status: "failed",
      notice: { failure: "serialization-failed", action: "ask-user" },
    });
    expect(called).toBe(false);
  });

  it("不会接受 toJSON 逃逸成空值或数组的选中数据快照", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-escaped-snapshot",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const escapedValues = [
      { toJSON: () => undefined },
      { toJSON: () => null },
      { toJSON: () => ["not-an-object"] },
    ];
    for (const value of escapedValues) {
      const selectedData = { "content.conceptId": "ok" } as Record<string, unknown>;
      Object.defineProperty(selectedData, "toJSON", {
        value: value.toJSON,
        enumerable: false,
      });
      const result = await runAiProvider(provider, {
        ...request,
        selectedData: selectedData as never,
      });
      expect(result).toMatchObject({
        status: "failed",
        notice: { failure: "serialization-failed", action: "ask-user" },
      });
    }
    expect(called).toBe(false);
  });

  it("不会接受序列化后新增未授权字段的快照", async () => {
    let called = false;
    const provider: AiProvider = {
      id: "fake-mutated-snapshot",
      async generateDraft() {
        called = true;
        return null;
      },
    };
    const selectedData = { "content.conceptId": "ok" } as Record<string, unknown>;
    Object.defineProperty(selectedData, "toJSON", {
      value: () => ({ "content.conceptId": "ok", "private.secret": "no" }),
      enumerable: false,
    });
    const result = await runAiProvider(provider, {
      ...request,
      selectedData: selectedData as never,
    });
    expect(result).toMatchObject({
      status: "failed",
      notice: { failure: "unauthorized", action: "revoke-consent" },
    });
    expect(called).toBe(false);
  });

  it("NaN 配置回退到安全默认值", async () => {
    const provider: AiProvider = {
      id: "fake-nan-options",
      async generateDraft() {
        return createAiDraftOutput({
          kind: "exercise-draft",
          text: "AI 辅助学习草稿：先复述结构，再回到来源核对。",
          inputScopes: ["selected-content"],
          sourceCitations: [{ sourceId: "source-1", label: "已选学习材料" }],
        });
      },
    };
    const result = await runAiProvider(provider, request, {
      timeoutMs: Number.NaN,
      maxPayloadChars: Number.NaN,
    });
    expect(result.status).toBe("success");
  });

  it("将超时和请求体配置限制在安全范围", () => {
    expect(normalizeAiProviderTimeoutMs(Number.POSITIVE_INFINITY)).toBe(
      MAX_AI_TIMEOUT_MS,
    );
    expect(normalizeAiProviderTimeoutMs(-1)).toBe(1);
    expect(normalizeAiProviderPayloadChars(Number.POSITIVE_INFINITY)).toBe(
      MAX_AI_PAYLOAD_CHARS,
    );
    expect(normalizeAiProviderPayloadChars(Number.NaN)).toBe(50_000);
  });

  it("供应商接收通过 JSON 校验后的快照", async () => {
    let received: Readonly<Record<string, unknown>> | undefined;
    const provider: AiProvider = {
      id: "fake-snapshot",
      async generateDraft(providerRequest) {
        received = providerRequest.selectedData;
        return createAiDraftOutput({
          kind: "exercise-draft",
          text: "AI 辅助学习草稿：先复述结构，再回到来源核对。",
          inputScopes: ["selected-content"],
          sourceCitations: [{ sourceId: "source-1", label: "已选学习材料" }],
        });
      },
    };
    const result = await runAiProvider(provider, {
      ...request,
      selectedData: {
        "content.conceptId": "trigram-qian",
        "content.blocks": [{ type: "heading", text: "乾" }],
      },
    });
    expect(result.status).toBe("success");
    expect(received).toEqual({
      "content.conceptId": "trigram-qian",
      "content.blocks": [{ type: "heading", text: "乾" }],
    });
  });
});
