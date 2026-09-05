import { currentUser } from "@/server/auth";
import { withDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const tables = new Set(["notes", "favorites", "reviewAttempts", "reviewCardStates", "conceptProgress", "preferences", "labSnapshots", "errata", "compassRecords", "compassCorrections", "recoverySnapshots", "sourceTemplates"]);
function tableName(value: unknown) { if (typeof value !== "string" || !tables.has(value)) throw new Error("数据表名无效"); return value; }
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return origin === configured;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!forwardedHost) return origin === new URL(request.url).origin;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  return origin === `${forwardedProto}://${forwardedHost}`;
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  try { const table = tableName(new URL(request.url).searchParams.get("table")); const result = await withDb(client => client.query<{ payload: unknown }>("SELECT payload FROM user_records WHERE user_id=$1 AND record_type=$2 ORDER BY updated_at DESC", [user.id, table])); return Response.json({ records: result.rows.map(row => row.payload) }, { headers }); }
  catch { return Response.json({ error: "数据读取失败" }, { status: 500, headers }); }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  const user = await currentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  try { const body = await request.json(); const table = tableName(body.table); const record = body.record; const key = typeof body.key === "string" ? body.key : record?.id ?? record?.cardId ?? record?.conceptId ?? record?.key; if (!record || typeof record !== "object" || Array.isArray(record) || typeof key !== "string" || !key.trim() || key.length > 256) throw new Error(); await withDb(client => client.query("INSERT INTO user_records(user_id,record_type,record_key,payload,version,updated_at) VALUES($1,$2,$3,$4,1,now()) ON CONFLICT(user_id,record_type,record_key) DO UPDATE SET payload=EXCLUDED.payload,version=user_records.version+1,updated_at=now()", [user.id, table, key, record])); return Response.json({ ok: true }, { headers }); }
  catch { return Response.json({ error: "数据写入失败" }, { status: 400, headers }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  const user = await currentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });
  try { const body = await request.json(); const table = tableName(body.table); if (typeof body.id !== "string" || !body.id.trim()) throw new Error(); await withDb(client => client.query("DELETE FROM user_records WHERE user_id=$1 AND record_type=$2 AND record_key=$3", [user.id, table, body.id])); return Response.json({ ok: true }, { headers }); }
  catch { return Response.json({ error: "数据删除失败" }, { status: 400, headers }); }
}
