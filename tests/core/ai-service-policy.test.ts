import { describe, expect, it } from "vitest";
import {
  buildAiFallbackNotice,
  buildAiRemoteDeletionRequest,
} from "@/core/ai/service-policy";

describe("M4-006/M4-007 AI 删除与服务降级策略", () => {
  it("离线、超时和授权失效都不伪造结果", () => {
    expect(buildAiFallbackNotice("offline")).toMatchObject({
      action: "continue-local",
      message: expect.stringContaining("不会重试"),
    });
    expect(buildAiFallbackNotice("timeout").action).toBe("retry-later");
    expect(buildAiFallbackNotice("unauthorized").action).toBe("revoke-consent");
    expect(buildAiFallbackNotice("provider-unavailable").message).toContain(
      "不生成伪造结果",
    );
  });

  it("远端删除请求需要明确确认，并去重空 ID", () => {
    expect(() => buildAiRemoteDeletionRequest(["remote-1"], false)).toThrow(
      /用户确认/,
    );
    expect(() => buildAiRemoteDeletionRequest([], true)).toThrow(/没有可删除/);
    const request = buildAiRemoteDeletionRequest(
      [" remote-1 ", "remote-1", "", "remote-2"],
      true,
      "2026-08-26T12:00:00.000Z",
    );
    expect(request).toEqual({
      contractVersion: 1,
      remoteRecordIds: ["remote-1", "remote-2"],
      requestedAt: "2026-08-26T12:00:00.000Z",
      userConfirmed: true,
    });
    expect(() =>
      buildAiRemoteDeletionRequest(["remote-1"], true, "2026-02-30T12:00:00.000Z"),
    ).toThrow(/请求时间无效/);
    expect(() =>
      buildAiRemoteDeletionRequest(["remote-1"], true, "0"),
    ).toThrow(/请求时间无效/);
    expect(() =>
      buildAiRemoteDeletionRequest(["remote-1", 42 as never], true),
    ).toThrow(/ID 必须是字符串/);
    expect(() =>
      buildAiRemoteDeletionRequest(["remote-1"], "yes" as never),
    ).toThrow(/用户确认/);
  });

  it("对请求体过大和无法序列化给出可操作提示", () => {
    expect(buildAiFallbackNotice("payload-too-large")).toMatchObject({
      action: "ask-user",
      title: "选中的内容超过发送上限",
    });
    expect(buildAiFallbackNotice("serialization-failed")).toMatchObject({
      action: "ask-user",
      title: "选中的内容无法安全编码",
    });
  });
});
