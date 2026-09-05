import { login, validateCredentials } from "@/server/auth";
export const runtime = "nodejs";
export async function POST(request: Request) { try { const body = await request.json(); const { email, password } = validateCredentials(body.email, body.password); await login(email, password); return Response.json({ ok: true }); } catch (error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 401 }); } }
