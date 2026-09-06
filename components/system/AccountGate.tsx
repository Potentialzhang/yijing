"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Account = { id: string; email: string; display_name: string };
export function AccountGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [, setUser] = useState<Account | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    void fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        setUser(data.user ?? null);
        setState(data.user ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setState("signed-out");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [pathname]);
  if (pathname === "/account") return <>{children}</>;
  if (state === "checking") return <main className="subpage account-loading" aria-live="polite"><span className="eyebrow">账户</span><h1>正在检查登录状态…</h1></main>;
  if (state === "signed-out") return <main className="subpage account-required"><span className="eyebrow">需要账户</span><h1>登录后进入你的易学工具空间。</h1><p className="subpage-lead">本实例统一采用账户访问：学习内容、工具与个人记录都在登录后使用；笔记、复习、收藏、偏好和 AI 草稿只保存到 PostgreSQL，不写入浏览器业务存储。</p><Link className="primary-button" href="/account">登录或注册</Link></main>;
  return <>{children}</>;
}
