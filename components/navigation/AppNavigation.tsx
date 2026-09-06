"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResponsiveMenu, type ResponsiveMenuItem } from "@/components/navigation/ResponsiveMenu";
import { isNavigationItemCurrent } from "@/core/navigation/navigation";

const items = [
  { href: "/", label: "今日" },
  { href: "/test-academy", label: "测试学堂" },
  { href: "/divination", label: "算卦" },
  { href: "/lab/hexagram", label: "卦象实验室" },
  { href: "/hexagrams", label: "六十四卦" },
  { href: "/library", label: "知识库" },
  { href: "/review", label: "复习" },
  { href: "/notes", label: "笔记" },
  { href: "/tools", label: "工具" },
  { href: "/settings/data", label: "设置" },
  { href: "/account", label: "账户" },
] as const satisfies readonly ResponsiveMenuItem[];

/** Shared navigation for every route except the home page, which has its own desktop shell. */
export function AppNavigation() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <header className="global-navigation">
      <Link href="/" className="global-brand" aria-label="易境首页">
        <span className="brand-mark" aria-hidden="true">☷</span>
        <span><strong>易境</strong><small>个人易学学习空间</small></span>
      </Link>
      <ResponsiveMenu
        key={pathname}
        items={items}
        activeHref={items.find((item) => isNavigationItemCurrent(pathname, item.href))?.href}
        className="global-menu"
        ariaLabel="主导航"
      />
    </header>
  );
}
