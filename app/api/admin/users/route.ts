import { currentUser } from "@/server/auth";
import { withDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function requireAdmin() {
  const user = await currentUser();
  if (!user) return { response: Response.json({ error: "请先登录" }, { status: 401, headers }) } as const;
  if (!user.is_admin) return { response: Response.json({ error: "无管理员权限" }, { status: 403, headers }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const result = await withDb((client) => client.query("SELECT id,email,display_name,is_admin,is_disabled,created_at,last_login_at FROM users ORDER BY created_at ASC, id ASC"));
    return Response.json({ users: result.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, isAdmin: row.is_admin, isDisabled: row.is_disabled, createdAt: row.created_at, lastLoginAt: row.last_login_at })) }, { headers });
  } catch {
    return Response.json({ error: "用户列表读取失败" }, { status: 500, headers });
  }
}
