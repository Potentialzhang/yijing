import Link from "next/link";
import { DeferredHexagramLab } from "@/components/lab/DeferredHexagramLab";
import { HEXAGRAMS } from "@/core/iching";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { TodayStats } from "@/components/dashboard/TodayStats";
import { TodayTasks } from "@/components/dashboard/TodayTasks";
import { TodayLabel } from "@/components/dashboard/TodayLabel";
import { ResponsiveMenu, type ResponsiveMenuItem } from "@/components/navigation/ResponsiveMenu";
import { ProfileChip } from "@/components/account/ProfileChip";

const navItems = [{ href: "#today", label: "今日" }, { href: "/test-academy", label: "测试学堂" }, { href: "/divination", label: "算卦" }, { href: "/lab/hexagram", label: "卦象实验室" }, { href: "/hexagrams", label: "卦库" }, { href: "/review", label: "复习" }, { href: "/notes", label: "笔记" }, { href: "/tools", label: "工具" }, { href: "/settings/data", label: "设置" }] as const satisfies readonly ResponsiveMenuItem[];

export default function Home() {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="#today" className="brand" aria-label="易境首页"><span className="brand-mark">☷</span><span><strong>易境</strong><small>学习你的易学地图</small></span></Link>
        <ResponsiveMenu items={navItems} activeHref="#today" className="main-nav" ariaLabel="主导航" showDots />
        <div className="sidebar-note"><span>今日箴言</span><p>先观其象，再问其理。</p></div><div className="sidebar-footer">账户同步 · 个人学习空间</div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><span className="breadcrumb">我的学习空间 / 今日</span><h1>把看过的，变成会用的。</h1></div><ProfileChip /></header>
        <section className="hero-grid" id="today">
          <div className="hero-card"><TodayLabel /><h2>从一条爻开始，<br /><em>重新认识变化。</em></h2><p>今天用 10 分钟复习八卦结构，再在实验室里亲手改变一个爻。</p><div className="hero-actions"><a className="primary-button" href="#lab">开始今日练习 <span>↗</span></a><Link className="outline-button" href="/self-test">快速自测</Link></div><div className="hero-orbit orbit-one">☰</div><div className="hero-orbit orbit-two">☵</div><div className="hero-orbit orbit-three">☷</div></div>
          <TodayStats />
        </section>
        <TodayTasks />
        <section className="section-block home-academy" id="academy"><div className="section-heading"><div><p className="eyebrow">测试学堂 · 统一入口</p><h2>今天练什么，由你选择。</h2></div><Link className="link-arrow" href="/test-academy">进入测试学堂 <span>→</span></Link></div><div className="home-academy-grid"><Link href="/test-academy" className="home-academy-card"><strong>认卦与认爻</strong><span>从三爻、六爻结构开始</span></Link><Link href="/test-academy" className="home-academy-card"><strong>卦辞与爻辞</strong><span>先读原文，再做含义配对</span></Link><Link href="/divination" className="home-academy-card"><strong>六次铜钱起卦</strong><span>记录、生成并复盘本卦变卦</span></Link></div></section>
        <section className="quick-tools"><div className="section-heading"><div><p className="eyebrow">快速工具</p><h2>把抽象关系放到眼前</h2></div></div><div className="tool-grid"><Link href="/tools/five-elements" className="tool-card element-tool"><div className="tool-icon">◌</div><div><h3>五行生克</h3><p>点击一个元素，看看它生谁、克谁。</p></div><span>↗</span><div className="element-rings">{FIVE_ELEMENTS.map((element) => <i key={element.id} style={{ backgroundColor: element.color }} />)}</div></Link><Link href="/hexagrams" className="tool-card hex-tool"><div className="tool-icon">䷀</div><div><h3>六十四卦</h3><p>按卦序浏览结构，建立整体地图。</p></div><span>↗</span><strong>{HEXAGRAMS.length}<small> 卦</small></strong></Link></div></section>
        <DeferredHexagramLab />
        <footer className="page-footer"><span>易境 · 个人易学学习工具</span><span>结构先于断语 · 学习重于预测</span></footer>
      </main>
    </div>
  );
}
