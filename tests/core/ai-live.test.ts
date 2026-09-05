import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiRequestPreview } from "@/core/ai/consent";
import { selectedContentData, validateStudyRequest } from "@/core/ai/materials";
import { generateStudyDraft, readOpenAiConfiguration } from "@/core/ai/openai";
import { GET, POST } from "@/app/api/ai/study/route";

const request = () => ({ kind: "exercise-draft", preview: buildAiRequestPreview("study-draft", ["selected-content"]), selectedData: selectedContentData(["hexagram-01"]), userConfirmed: true });
const config = { apiKey: "test-secret-not-real", model: "test-model", baseUrl: "https://api.openai.com/v1" };
const output = () => ({ text: "依据选定的乾卦，练习辨认爻位与进退。", sourceIds: ["hexagram-01"], questions: Array.from({ length: 3 }, (_, i) => ({ question: `第 ${i + 1} 题：潜龙勿用对应哪个阶段？`, options: ["初始蓄养", "飞龙在天", "亢龙有悔", "完成"], answerIndex: 0, explanation: "初九的潜龙尚未显露，适宜蓄养。", sourceIds: ["hexagram-01"] })) });
const response = (data = output()) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("真实 Responses 适配器", () => {
  it("发送实际选中内容、结构化 schema 和 store=false，返回可作答题目", async () => {
    const fetcher = vi.fn(async () => response());
    const result = await generateStudyDraft(request(), config, fetcher);
    expect(result.questions).toHaveLength(3);
    expect(result.draft.text).toContain("AI 辅助");
    expect(result.draft.sourceCitations[0].sourceId).toBe("hexagram-01");
    const [, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0];
    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false); expect(body.model).toBe("test-model");
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toContain("潛龍勿用"); expect(body.input).not.toContain(config.apiKey);
    expect(body.input).not.toContain("all-local-database-records");
  });
  it("未授权数据、嵌套字段、伪造原文、缺少出题依据都在发送前拒绝", async () => {
    const fetcher = vi.fn(async () => response());
    await expect(generateStudyDraft({ ...request(), userConfirmed: false }, config, fetcher)).rejects.toThrow();
    await expect(generateStudyDraft({ ...request(), selectedData: { ...request().selectedData, secret: "no" } }, config, fetcher)).rejects.toThrow();
    await expect(generateStudyDraft({ ...request(), selectedData: { ...request().selectedData, "content.blocks": ["伪造经典"] } }, config, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => validateStudyRequest({ ...request(), kind: "note-draft" })).toThrow();
  });
  it("未知来源、缺题、不完整响应及上游配额错误不会变成演示成功", async () => {
    await expect(generateStudyDraft(request(), config, async () => response({ ...output(), sourceIds: ["invented"] }))).rejects.toThrow(/来源/);
    await expect(generateStudyDraft(request(), config, async () => response({ ...output(), questions: [] }))).rejects.toThrow(/三道/);
    await expect(generateStudyDraft(request(), config, async () => Response.json({ status: "incomplete", output: [] }))).rejects.toThrow(/未完整/);
    await expect(generateStudyDraft(request(), config, async () => new Response("upstream secret", { status: 429 }))).rejects.toThrow(/额度/);
  });
  it("笔记整理和观点对比均使用真实材料且返回独立草稿", async () => {
    for (const kind of ["note-draft", "viewpoint-comparison"] as const) {
      const input = { kind, preview: buildAiRequestPreview("note-organization", ["selected-notes"]), userConfirmed: true, selectedData: {
        "note.markdown": ["我认为乾是主动开创。", "另一个观察：乾也包含潜藏与知止。"], "note.tags": [[], []], "note.sourceRefs": [[], []],
      } };
      const result = await generateStudyDraft(input, config, async () => response({ text: "两篇笔记分别强调开创与适时收敛，可结合爻位理解。", sourceIds: ["selected-note-1", "selected-note-2"], questions: [] }));
      expect(result.draft.kind).toBe(kind); expect(result.draft.sourceCitations).toHaveLength(2);
    }
  });
  it("模型配置只读取服务端变量，禁止带凭据 URL 和远端明文 HTTP", () => {
    expect(readOpenAiConfiguration({})).toBeNull();
    expect(readOpenAiConfiguration({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })?.model).toBe("m");
    expect(() => readOpenAiConfiguration({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m", OPENAI_BASE_URL: "http://remote.test/v1" })).toThrow();
  });
});

describe("AI HTTP 边界", () => {
  const makeRequest = (origin = "http://localhost:3000", data: unknown = request()) => new Request("http://localhost:3000/api/ai/study", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data) });
  it("配置查询不泄露密钥，无配置时明确报错", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_MODEL", "");
    expect(await (await GET()).json()).toMatchObject({ configured: false });
    expect((await POST(makeRequest())).status).toBe(503);
    vi.stubEnv("OPENAI_API_KEY", config.apiKey); vi.stubEnv("OPENAI_MODEL", config.model);
    expect(JSON.stringify(await (await GET()).json())).not.toContain(config.apiKey);
  });
  it("拒绝跨站请求和未确认材料", async () => {
    expect((await POST(makeRequest("https://other.test"))).status).toBe(403);
    expect((await POST(makeRequest("http://localhost:3000", { ...request(), userConfirmed: false }))).status).toBe(400);
  });
  it("路由贯通到 Responses 请求，私有结果禁止缓存", async () => {
    vi.stubEnv("OPENAI_API_KEY", config.apiKey); vi.stubEnv("OPENAI_MODEL", config.model);
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await POST(makeRequest());
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect((await result.json()).questions).toHaveLength(3);
  });
});
