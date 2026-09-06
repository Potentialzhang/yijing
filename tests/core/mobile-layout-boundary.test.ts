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

  it("卦库在大屏八列、小屏四列展示", () => {
    const responsiveIndex = styles.slice(styles.lastIndexOf("/* Responsive 64-hexagram library"));
    expect(responsiveIndex).toContain(".hexagram-index {\n  grid-template-columns: repeat(8, minmax(0, 1fr));");
    expect(responsiveIndex).toContain(".hexagram-index-card > div:last-of-type {\n  grid-column: auto;");
    expect(responsiveIndex).toContain(".hex-index-copy {\n  justify-items: center;\n  text-align: center;");
    expect(responsiveIndex).toContain("@media (max-width: 760px) {\n  .hexagram-index {\n    grid-template-columns: repeat(4, minmax(0, 1fr));");
  });

  it("卦详情先读经典卦文，摘要和上下文笔记保持紧凑", () => {
    const detail = readFileSync(join(process.cwd(), "app/hexagrams/[number]/page.tsx"), "utf8");
    expect(detail).toContain('className="hexagram-reading-card"');
    expect(detail).toContain('aria-label="卦象、卦象摘要与经典卦文"');
    expect(detail).toContain('className="detail-hero hexagram-reading-left"');
    expect(detail).toContain('className="hexagram-classic-sections"');
    expect(detail.indexOf('className="detail-hero hexagram-reading-left"')).toBeLessThan(detail.indexOf('className="hexagram-classic-sections"'));
    expect(detail.indexOf("上卦 <small>四爻至上爻")).toBeLessThan(detail.indexOf("下卦 <small>初爻至三爻"));
    expect(detail).not.toContain('<div className="structure-table">{hexagram.lines.map');
    expect(detail).toContain('className="plain-translation-label">白话解读');
    expect(detail).toContain('<HexagramNotesShortcut hexagramId={hexagram.id} />');
    expect(styles).toContain(".hexagram-reading-layout {\n  display: grid;");
    expect(styles).toContain(".hexagram-reading-card .hexagram-classic-sections {\n  grid-template-columns: 1fr;");
    expect(styles).toContain("@media (min-width: 901px) {\n  .hexagram-reading-layout > .hexagram-classic-sections {");
    expect(styles).toContain(".hexagram-classic-sections {\n  display: grid;");
    expect(styles).toContain(".hexagram-notes-dialog {");
  });

  it("工具集合在手机上收紧为双列卡片", () => {
    const denseTools = styles.slice(styles.lastIndexOf("/* Dense tool and reading layouts"));
    expect(denseTools).toContain(".tools-page .tools-hub-grid {\n  grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(denseTools).toContain(".tools-page .tools-hub-card {\n  min-height: 154px;");
    expect(denseTools).toContain("@media (max-width: 760px) {\n  .tools-page,");
    expect(denseTools).toContain(".tools-page .tools-hub-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    const toolsPage = readFileSync(join(process.cwd(), "app/tools/page.tsx"), "utf8");
    expect(toolsPage).toContain('href="/test-academy"');
  });

  it("工具和内容页面只保留统一测试入口", () => {
    const files = [
      "app/hexagrams/[number]/page.tsx",
      "app/trigrams/[id]/page.tsx",
      "app/learn/[conceptId]/page.tsx",
      "components/learning/CycleStudyPage.tsx",
      "components/tools/FiveElementsExplorer.tsx",
    ];
    files.forEach((file) => {
      expect(readFileSync(join(process.cwd(), file), "utf8")).not.toContain("InstantPractice");
    });
    const compass = readFileSync(join(process.cwd(), "components/tools/CompassExplorer.tsx"), "utf8");
    expect(compass).not.toContain("方位测验");
    expect(compass).not.toContain('type CompassMode = "explore" | "hide-labels" | "quiz"');
  });
});
