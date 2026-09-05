import { currentUser } from "@/server/auth";
export const runtime = "nodejs";
export async function GET() { return Response.json({ user: await currentUser() }, { headers: { "Cache-Control": "no-store" } }); }
