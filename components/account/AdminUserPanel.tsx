"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isDisabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "尚未登录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminUserPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const readUsers = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/users", { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "用户列表读取失败");
    return (data.users ?? []) as AdminUser[];
  }, []);

  const loadUsers = useCallback(async () => {
    setState("loading");
    try {
      setUsers(await readUsers());
      setState("ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "用户列表读取失败");
      setState("error");
    }
  }, [readUsers]);

  useEffect(() => {
    const controller = new AbortController();
    void readUsers(controller.signal)
      .then((records) => { setUsers(records); setState("ready"); })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(error instanceof Error ? error.message : "用户列表读取失败");
        setState("error");
      });
    return () => controller.abort();
  }, [readUsers]);

  async function updateUser(user: AdminUser, changes: { isDisabled?: boolean; isAdmin?: boolean }) {
    setBusyId(user.id);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "用户状态更新失败");
      setStatus(`${user.displayName || user.email} 已更新`);
      await loadUsers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "用户状态更新失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`确定删除账户“${user.displayName || user.email}”吗？该账户的学习数据也会一并删除，无法撤销。`)) return;
    setBusyId(user.id);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "用户删除失败");
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setStatus(`${user.displayName || user.email} 已删除`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "用户删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-user-panel" aria-labelledby="admin-user-title">
      <div className="admin-user-heading">
        <div>
          <p className="eyebrow">管理员</p>
          <h2 id="admin-user-title">账户管理</h2>
          <p>管理当前易境实例中的账户状态。删除账户会级联清理其学习数据。</p>
        </div>
        <button className="outline-button" type="button" onClick={() => { setState("loading"); void loadUsers(); }} disabled={state === "loading"}>刷新列表</button>
      </div>
      {state === "loading" && <p className="admin-user-state">正在读取账户列表…</p>}
      {state === "error" && <div className="admin-user-state is-error"><p>{status || "用户列表读取失败"}</p><button className="outline-button" type="button" onClick={() => { setState("loading"); void loadUsers(); }}>重试</button></div>}
      {state === "ready" && (
        <div className="admin-user-table-wrap">
          <table className="admin-user-table">
            <caption className="sr-only">账户列表</caption>
            <thead><tr><th scope="col">账户</th><th scope="col">状态</th><th scope="col">注册时间</th><th scope="col">最近登录</th><th scope="col">操作</th></tr></thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const busy = busyId === user.id;
                return <tr key={user.id}>
                  <td data-label="账户"><strong>{user.displayName || "未设置名称"}</strong><small>{user.email}</small></td>
                  <td data-label="状态"><span className={`admin-user-badge ${user.isDisabled ? "is-disabled" : "is-active"}`}>{user.isDisabled ? "已禁用" : "启用"}</span>{user.isAdmin && <span className="admin-user-badge is-admin">管理员</span>}</td>
                  <td data-label="注册时间">{formatDate(user.createdAt)}</td>
                  <td data-label="最近登录">{formatDate(user.lastLoginAt)}</td>
                  <td data-label="操作"><div className="admin-user-actions">
                    {isSelf ? <span className="admin-user-self">当前账户</span> : <>
                      <button className="outline-button" type="button" disabled={busy} onClick={() => void updateUser(user, { isDisabled: !user.isDisabled })}>{user.isDisabled ? "启用" : "禁用"}</button>
                      <button className="text-danger-button" type="button" disabled={busy} onClick={() => void deleteUser(user)}>删除</button>
                    </>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      {status && state !== "error" && <p className="admin-user-status" role="status">{status}</p>}
    </section>
  );
}
