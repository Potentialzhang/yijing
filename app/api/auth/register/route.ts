import { register, validateCredentials } from "@/server/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const body = await request.json(); const { email, password } = validateCredentials(body.email, body.password); await register(email, password, body.displayName); return Response.json({ ok: true }, { status: 201 }); }
  catch (error: unknown) { const message = error instanceof Error ? error.message : "注册失败"; const duplicate = message.includes("users_email_key") || message.includes("duplicate key"); return Response.json({ error: duplicate ? "该邮箱已注册" : message }, { status: duplicate ? 409 : 400 }); }
}
