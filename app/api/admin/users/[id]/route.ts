import { currentUser } from "@/server/auth";
import { withDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return origin === configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  return origin === `${proto}://${host}`;
}

async function requireAdmin() {
  const user = await currentUser();
  if (!user) return { response: Response.json({ error: "请先登录" }, { status: 401, headers }) } as const;
  if (!user.is_admin) return { response: Response.json({ error: "无管理员权限" }, { status: 403, headers }) } as const;
  return { user } as const;
}

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "用户 ID 无效" }, { status: 400, headers });
  if (id === auth.user.id) return Response.json({ error: "不能修改当前管理员账户" }, { status: 400, headers });
  try {
    const body = await request.json();
    const changes: { isDisabled?: boolean; isAdmin?: boolean } = {};
    if (typeof body.isDisabled === "boolean") changes.isDisabled = body.isDisabled;
    if (typeof body.isAdmin === "boolean") changes.isAdmin = body.isAdmin;
    if (!Object.keys(changes).length) return Response.json({ error: "没有可更新的字段" }, { status: 400, headers });
    await withDb(async (client) => {
      await client.query("BEGIN");
      try {
        const targetResult = await client.query<{ is_admin: boolean; is_disabled: boolean }>("SELECT is_admin,is_disabled FROM users WHERE id=$1 FOR UPDATE", [id]);
        const target = targetResult.rows[0];
        if (!target) throw new Error("USER_NOT_FOUND");
        const becomesAdmin = changes.isAdmin ?? target.is_admin;
        const becomesDisabled = changes.isDisabled ?? target.is_disabled;
        if (target.is_admin && (!becomesAdmin || becomesDisabled)) {
          const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE is_admin=true AND is_disabled=false");
          if (Number(count.rows[0]?.count ?? 0) <= 1) throw new Error("LAST_ADMIN");
        }
        await client.query("UPDATE users SET is_admin=$1,is_disabled=$2,updated_at=now() WHERE id=$3", [becomesAdmin, becomesDisabled, id]);
        await client.query("DELETE FROM sessions WHERE user_id=$1 AND $2=true", [id, becomesDisabled]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "USER_NOT_FOUND") return Response.json({ error: "用户不存在" }, { status: 404, headers });
    if (message === "LAST_ADMIN") return Response.json({ error: "至少保留一名启用的管理员" }, { status: 400, headers });
    return Response.json({ error: "用户状态更新失败" }, { status: 400, headers });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(_request)) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "用户 ID 无效" }, { status: 400, headers });
  if (id === auth.user.id) return Response.json({ error: "不能删除当前管理员账户" }, { status: 400, headers });
  try {
    await withDb(async (client) => {
      await client.query("BEGIN");
      try {
        const target = await client.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE id=$1 FOR UPDATE", [id]);
        if (!target.rows[0]) throw new Error("USER_NOT_FOUND");
        if (target.rows[0].is_admin) {
          const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE is_admin=true AND is_disabled=false");
          if (Number(count.rows[0]?.count ?? 0) <= 1) throw new Error("LAST_ADMIN");
        }
        await client.query("DELETE FROM users WHERE id=$1", [id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "USER_NOT_FOUND") return Response.json({ error: "用户不存在" }, { status: 404, headers });
    if (message === "LAST_ADMIN") return Response.json({ error: "至少保留一名启用的管理员" }, { status: 400, headers });
    return Response.json({ error: "用户删除失败" }, { status: 400, headers });
  }
}
