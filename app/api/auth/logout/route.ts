import { logout } from "@/server/auth";
export const runtime = "nodejs";
export async function POST() { try { await logout(); } catch { /* already logged out */ } return Response.json({ ok: true }); }
