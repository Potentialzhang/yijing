import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { withDb } from "./db";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;
const secureCookie = process.env.AUTH_COOKIE_SECURE === "1" || process.env.APP_ORIGIN?.startsWith("https://") === true;
const FIRST_ACCOUNT_LOCK_KEY = 20260906;
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt}$${key.toString("hex")}`; }
async function verifyPassword(password: string, encoded: string) { const [, salt, hex] = encoded.split("$"); if (!salt || !hex) return false; const key = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hex, "hex"); return expected.length === key.length && timingSafeEqual(expected, key); }

export function validateCredentials(email: unknown, password: unknown) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 320) throw new Error("请输入有效邮箱");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("密码长度需为 8～128 位");
  return { email: email.trim().toLowerCase(), password };
}

export function validateDisplayName(value: unknown) {
  if (typeof value !== "string") return "";
  const displayName = value.trim();
  if (displayName.length > 80) throw new Error("名称不能超过 80 个字符");
  return displayName;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await withDb(client => client.query("INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,now()+interval '30 days')", [userId, hashToken(token)]).then(() => undefined));
  (await cookies()).set("yijing_session", token, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function currentUser() {
  const token = (await cookies()).get("yijing_session")?.value;
  if (!token) return null;
  try {
    const result = await withDb(client => client.query<{ id: string; email: string; display_name: string; is_admin: boolean; is_disabled: boolean }>("SELECT u.id,u.email,u.display_name,u.is_admin,u.is_disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_disabled=false", [hashToken(token)]));
    return result.rows[0] ?? null;
  } catch { return null; }
}

export async function register(email: string, password: string, displayName = "") {
  const hash = await hashPassword(password);
  const userId = await withDb(async client => {
    await client.query("BEGIN");
    try {
      // Serialize the first-account check so concurrent registrations cannot
      // both receive administrator privileges.
      await client.query("SELECT pg_advisory_xact_lock($1)", [FIRST_ACCOUNT_LOCK_KEY]);
      const result = await client.query<{ id: string }>("INSERT INTO users(email,password_hash,display_name,is_admin) VALUES($1,$2,$3,NOT EXISTS (SELECT 1 FROM users)) RETURNING id", [email, hash, displayName.trim().slice(0, 80)]);
      await client.query("COMMIT");
      return result.rows[0].id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  await createSession(userId);
}

export async function login(email: string, password: string) {
  const result = await withDb(client => client.query<{ id: string; password_hash: string; is_disabled: boolean }>("SELECT id,password_hash,is_disabled FROM users WHERE email=$1", [email]));
  if (!result.rows[0] || result.rows[0].is_disabled || !(await verifyPassword(password, result.rows[0].password_hash))) throw new Error("邮箱或密码不正确");
  await withDb(client => client.query("UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1", [result.rows[0].id]));
  await createSession(result.rows[0].id);
}

export async function logout() { const jar = await cookies(); const token = jar.get("yijing_session")?.value; if (token) await withDb(client => client.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)])); jar.delete("yijing_session"); }
