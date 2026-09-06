import { generateStudyDraft, readOpenAiConfiguration, ModelRequestError } from "@/core/ai/openai";
import { validateStudyRequest } from "@/core/ai/materials";
import { currentUser } from "@/server/auth";
import { withDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const activeByUser = new Map<string, number>();
type RouteUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
type StudyRouteDependencies = {
  resolveUser: () => Promise<RouteUser | null>;
  query: (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};
const defaultDependencies: StudyRouteDependencies = {
  resolveUser: currentUser,
  query: (sql, values) => withDb(client => client.query(sql, values)),
};

export async function GET() {
  try {
    const config = readOpenAiConfiguration(process.env);
    return Response.json({ configured: !!config, model: config?.model ?? null, provider: config ? new URL(config.baseUrl).host : null }, { headers });
  } catch { return Response.json({ configured: false, error: "模型配置无效" }, { headers }); }
}

export async function POST(request: Request) {
  return handleStudyPost(request);
}

/** Exported separately so the authenticated HTTP boundary can be tested without a live database. */
export async function handleStudyPost(request: Request, dependencies: StudyRouteDependencies = defaultDependencies) {
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== allowedOrigin) return Response.json({ error: "请求来源不允许" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "需要 JSON 请求" }, { status: 415, headers });
  const user = await dependencies.resolveUser();
  if (!user) return Response.json({ error: "请先登录后使用 AI 辅学" }, { status: 401, headers });
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
  const recent = await dependencies.query(
    "SELECT count(*)::text AS count FROM ai_generations WHERE user_id=$1 AND created_at>now()-interval '1 minute'",
    [user.id],
  ).catch(() => ({ rows: [{ count: "10" }] }));
  const active = activeByUser.get(user.id) ?? 0;
  if (active >= 2 || Number(recent.rows[0]?.count ?? 0) >= 10) return Response.json({ error: "当前账户请求较频繁，请稍后重试" }, { status: 429, headers });
  activeByUser.set(user.id, active + 1);
  try {
    const result = await generateStudyDraft(input, config, fetch, request.signal);
    await dependencies.query(
      `INSERT INTO ai_generations(user_id,task_kind,input_scopes,source_ids,output_text,status,provider,model)
       VALUES($1,$2,$3,$4,$5,'completed',$6,$7)`,
      [user.id, result.draft.kind, result.draft.inputScopes, result.draft.sourceCitations.map(item => item.sourceId), result.draft.text, new URL(config.baseUrl).host, config.model],
    );
    return Response.json(result, { headers });
  } catch (error) {
    const message = error instanceof ModelRequestError ? error.message : "模型服务暂不可用，请稍后重试。";
    await dependencies.query(
      `INSERT INTO ai_generations(user_id,task_kind,input_scopes,source_ids,output_text,status,provider,model,error_message)
       VALUES($1,$2,$3,$4,'','failed',$5,$6,$7)`,
      [user.id, (input as { kind?: string }).kind ?? "unknown", (input as { preview?: { scopes?: unknown } }).preview?.scopes ?? [], [], new URL(config.baseUrl).host, config.model, message.slice(0, 500)],
    ).catch(() => undefined);
    return Response.json({ error: message }, { status: error instanceof ModelRequestError ? error.status : 502, headers });
  } finally {
    const next = (activeByUser.get(user.id) ?? 1) - 1;
    if (next > 0) activeByUser.set(user.id, next); else activeByUser.delete(user.id);
  }
}
