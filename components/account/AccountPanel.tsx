"use client";

import { useEffect, useState } from "react";
import { AdminUserPanel } from "@/components/account/AdminUserPanel";

type Account = { id: string; email: string; display_name: string; is_admin: boolean; is_disabled: boolean };

export function AccountPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [user, setUser] = useState<Account | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await response.json();
    setUser(data.user ?? null);
    return data.user as Account | null;
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (active) setUser(data.user ?? null); })
      .catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("正在处理…");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      setPassword("");
      const nextUser = await refresh();
      setStatus(mode === "register" && nextUser?.is_admin ? "账户已创建，你是本实例的首位管理员。" : "已登录");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setStatus("已退出登录");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    const name = user.display_name || user.email.split("@")[0] || "学习者";
    return <div className="account-dashboard">
      <section className="account-panel account-signed-in" aria-labelledby="account-current-title">
        <div className="account-user-heading">
          <span className="account-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <div><p className="eyebrow">当前账户</p><h2 id="account-current-title">{name}</h2><p>{user.email}</p></div>
          {user.is_admin && <span className="account-role-badge">管理员</span>}
        </div>
        <div className="account-storage-note"><strong>数据已同步到 PostgreSQL</strong><span>笔记、复习、收藏、偏好、来源模板和工具记录均按账户保存。</span></div>
        <button className="outline-button" type="button" onClick={() => void signOut()} disabled={busy}>退出登录</button>
        {status && <p className="account-status" role="status">{status}</p>}
      </section>
      {user.is_admin && <AdminUserPanel currentUserId={user.id} />}
    </div>;
  }

  return <section className="account-panel account-auth-card" aria-labelledby="account-form-title">
    <div className="account-tabs" role="tablist" aria-label="账户操作">
      <button className={mode === "login" ? "active" : ""} type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setStatus(""); }}>登录</button>
      <button className={mode === "register" ? "active" : ""} type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setStatus(""); }}>注册</button>
    </div>
    <div className="account-form-heading"><p className="eyebrow">{mode === "login" ? "欢迎回来" : "建立你的学习空间"}</p><h2 id="account-form-title">{mode === "login" ? "继续你的易学学习" : "创建账户，开始记录"}</h2><p>{mode === "login" ? "登录后即可在手机和电脑之间同步学习进度。" : "首个注册账户会自动成为本实例管理员。"}</p></div>
    <form onSubmit={submit}>
      {mode === "register" && <label>显示名称<input name="displayName" autoComplete="name" maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：张老师" /></label>}
      <label>邮箱<input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>密码<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></label>
      <button className="primary-button account-submit" type="submit" disabled={busy}>{busy ? "处理中…" : mode === "login" ? "登录账户" : "创建账户"}<span aria-hidden="true">→</span></button>
    </form>
    {status && <p className="account-status" role="status">{status}</p>}
  </section>;
}
