"use client";
import { useEffect, useState } from "react";

export function AccountPanel() {
  const [mode, setMode] = useState<"login" | "register">("login"); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState(""); const [user, setUser] = useState<{ email: string; display_name: string } | null>(null); const [status, setStatus] = useState("");
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then(response => response.json()).then(data => { setUser(data.user ?? null); }).catch(() => undefined); }, []);
  async function refresh() { const response = await fetch("/api/auth/me", { cache: "no-store" }); setUser((await response.json()).user); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setStatus("处理中…"); const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName }) }); const data = await response.json(); if (!response.ok) { setStatus(data.error ?? "操作失败"); return; } setStatus("已登录"); setPassword(""); await refresh(); }
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setStatus("已退出"); }
  if (user) return <section className="account-panel"><h2>当前账户</h2><p>{user.display_name || "学习者"} · {user.email}</p><p>账户数据库已连接。笔记、复习、收藏、偏好、来源模板和工具记录均保存到 PostgreSQL。</p><button className="outline-button" onClick={signOut}>退出登录</button><p role="status">{status}</p></section>;
  return <section className="account-panel"><div className="account-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>注册</button></div><form onSubmit={submit}><label>邮箱<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>{mode === "register" && <label>显示名称<input value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>}<label>密码（至少 8 位）<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary-button" type="submit">{mode === "login" ? "登录" : "创建账户"}</button></form><p role="status">{status}</p></section>;
}
