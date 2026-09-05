import { generateStudyDraft, readOpenAiConfiguration, ModelRequestError } from "@/core/ai/openai";
import { validateStudyRequest } from "@/core/ai/materials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
let active = 0;
let windowStarted = 0;
let requestCount = 0;

export async function GET() {
  try {
    const config = readOpenAiConfiguration(process.env);
    return Response.json({ configured: !!config, model: config?.model ?? null, provider: config ? new URL(config.baseUrl).host : null }, { headers });
  } catch { return Response.json({ configured: false, error: "模型配置无效" }, { headers }); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== allowedOrigin) return Response.json({ error: "请求来源不允许" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "需要 JSON 请求" }, { status: 415, headers });
  // Bound reads before JSON parsing; user notes must not be logged or cached.
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const decoder = new TextDecoder();
    let bytes = 0, text = "";
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 180000) { await reader.cancel(); return Response.json({ error: "材料过多，请缩小选择范围" }, { status: 413, headers }); }
      text += decoder.decode(next.value, { stream: true });
    }
    input = JSON.parse(text + decoder.decode());
    validateStudyRequest(input);
  } catch { return Response.json({ error: "请求无效，请检查授权、任务所需材料并重新生成预览。" }, { status: 400, headers }); }
  let config;
  try { config = readOpenAiConfiguration(process.env); }
  catch { return Response.json({ error: "服务器模型配置无效" }, { status: 503, headers }); }
  if (!config) return Response.json({ error: "尚未配置模型，请在服务器设置 OPENAI_API_KEY 与 OPENAI_MODEL 后重启。" }, { status: 503, headers });
  if (Date.now() - windowStarted > 60000) { windowStarted = Date.now(); requestCount = 0; }
  if (active >= 2 || requestCount >= 10) return Response.json({ error: "请求较频繁，请稍后重试" }, { status: 429, headers });
  active++; requestCount++;
  try { return Response.json(await generateStudyDraft(input, config, fetch, request.signal), { headers }); }
  catch (error) { return Response.json({ error: error instanceof ModelRequestError ? error.message : "模型服务暂不可用，请稍后重试。" }, { status: error instanceof ModelRequestError ? error.status : 502, headers }); }
  finally { active--; }
}
