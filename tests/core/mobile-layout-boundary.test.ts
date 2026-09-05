import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const navigation = readFileSync(join(process.cwd(), "components/navigation/ResponsiveMenu.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");

describe("移动端布局边界", () => {
  it("声明设备宽度和 viewport-fit=cover", () => {
    expect(layout).toContain("import type { Metadata, Viewport } from \"next\";");
    expect(layout).toContain('export const viewport: Viewport');
    expect(layout).toContain('width: "device-width"');
    expect(layout).toContain('initialScale: 1');
    expect(layout).toContain('viewportFit: "cover"');
  });

  it("固定和吸顶界面消费上下安全区域", () => {
    expect(styles).toContain("env(safe-area-inset-top, 0px)");
    expect(styles).toContain("env(safe-area-inset-bottom, 0px)");
    expect(styles).toContain("padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px");
    expect(styles).toContain(".install-prompt");
    expect(styles).toContain(".offline-status");
    expect(styles).toContain(".sw-error-status");
  });

  it("首页和子页面使用可访问的手机折叠菜单", () => {
    expect(navigation).toContain("aria-expanded={open}");
    expect(navigation).toContain('aria-haspopup="true"');
    expect(navigation).toContain('aria-label={open ? "关闭菜单" : "打开菜单"}');
    expect(navigation).toContain("closeMenuAndRestoreFocus");
    expect(navigation).toContain('className={`${className}${open ? " is-open" : ""}`}');
    expect(home).toContain("<ResponsiveMenu items={navItems}");
    expect(styles).toContain(".global-navigation .global-menu.is-open");
    expect(styles).toContain(".sidebar .main-nav.is-open");
  });

  it("首页工具入口指向工具集合，而不是单一工具", () => {
    expect(home).toContain('{ href: "/tools", label: "工具" }');
    expect(home).not.toContain('{ href: "/tools/five-elements", label: "工具" }');
    const deferredLab = readFileSync(join(process.cwd(), "components/lab/DeferredHexagramLab.tsx"), "utf8");
    expect(home).toContain('import { DeferredHexagramLab } from "@/components/lab/DeferredHexagramLab";');
    expect(home).toContain("<DeferredHexagramLab />");
    expect(deferredLab).toContain("IntersectionObserver");
    expect(deferredLab).toContain('window.location.hash === "#lab"');
    expect(deferredLab).toContain('window.addEventListener("hashchange"');
    expect(deferredLab).toContain('rootMargin: "600px 0px"');
    expect(deferredLab).toContain("ssr: false");
    expect(deferredLab).toContain('id="lab"');
    expect(deferredLab).toContain('id="lab-content"');
    expect(deferredLab).toContain("class LabLoadBoundary");
    expect(deferredLab).toContain('role="alert"');
    expect(deferredLab).not.toContain('<LazyHexagramLab />');
  });

  it("五行工具返回工具集合而不是跳出工具上下文", () => {
    const fiveElements = readFileSync(join(process.cwd(), "app/tools/five-elements/page.tsx"), "utf8");
    expect(fiveElements).toContain('<Link href="/tools" className="back-link">← 工具</Link>');
    expect(fiveElements).not.toContain('<Link href="/" className="back-link">← 回到今日</Link>');
  });

  it("五行关系轮盘在手机宽度下改用可换行布局", () => {
    expect(styles).toContain("@media (max-width: 900px) {\n  .five-elements-explorer {\n    grid-template-columns: 1fr;");
    expect(styles).toContain(".element-wheel {\n    display: flex;");
    expect(styles).toContain(".element-wheel .relation-mode {\n    flex: 0 0 100%;");
    expect(styles).toContain(".element-wheel > button {\n    flex: 0 0 51px;");
  });

  it("干支关系工具返回工具集合而不是跳出工具上下文", () => {
    const relations = readFileSync(join(process.cwd(), "app/tools/sexagenary-relations/page.tsx"), "utf8");
    expect(relations).toContain('<Link href="/tools" className="back-link">← 工具</Link>');
    expect(relations).not.toContain('<Link href="/learn" className="back-link">← 学习地图</Link>');
  });
});
