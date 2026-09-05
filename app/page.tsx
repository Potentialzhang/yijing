import Link from "next/link";
import { DeferredHexagramLab } from "@/components/lab/DeferredHexagramLab";
import { HEXAGRAMS } from "@/core/iching";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { TodayStats } from "@/components/dashboard/TodayStats";
import { TodayTasks } from "@/components/dashboard/TodayTasks";
import { TodayLabel } from "@/components/dashboard/TodayLabel";
import { LessonStatus } from "@/components/learning/LessonStatus";
import { ResponsiveMenu, type ResponsiveMenuItem } from "@/components/navigation/ResponsiveMenu";

const navItems = [{ href: "#today", label: "今日" }, { href: "/learn", label: "学习地图" }, { href: "/lab/hexagram", label: "卦象实验室" }, { href: "/hexagrams", label: "六十四卦" }, { href: "/review", label: "复习" }, { href: "/notes", label: "笔记" }, { href: "/tools", label: "工具" }, { href: "/settings/data", label: "设置" }] as const satisfies readonly ResponsiveMenuItem[];

export default function Home() {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="#today" className="brand" aria-label="易境首页"><span className="brand-mark">☷</span><span><strong>易境</strong><small>学习你的易学地图</small></span></Link>
        <ResponsiveMenu items={navItems} activeHref="#today" className="main-nav" ariaLabel="主导航" showDots />
        <div className="sidebar-note"><span>今日箴言</span><p>先观其象，再问其理。</p></div><div className="sidebar-footer">本地优先 · 个人学习空间</div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><span className="breadcrumb">我的学习空间 / 今日</span><h1>把看过的，变成会用的。</h1></div><div className="profile-chip"><span className="profile-avatar">易</span><span>学习者</span><span className="chevron">⌄</span></div></header>
        <section className="hero-grid" id="today">
          <div className="hero-card"><TodayLabel /><h2>从一条爻开始，<br /><em>重新认识变化。</em></h2><p>今天用 10 分钟复习八卦结构，再在实验室里亲手改变一个爻。</p><div className="hero-actions"><a className="primary-button" href="#lab">开始今日练习 <span>↗</span></a><Link className="outline-button" href="/self-test">快速自测</Link></div><div className="hero-orbit orbit-one">☰</div><div className="hero-orbit orbit-two">☵</div><div className="hero-orbit orbit-three">☷</div></div>
          <TodayStats />
        </section>
        <TodayTasks />
        <section className="section-block" id="learning-map"><div className="section-heading"><div><p className="eyebrow">学习地图 · 由浅入深</p><h2>沿着关系学习，不再孤立背诵</h2></div><Link className="link-arrow" href="/learn">查看全部 <span>→</span></Link></div><div className="concept-grid">{KNOWLEDGE_CONCEPTS.slice(0, 3).map((concept, index) => <Link className="concept-card" href={`/learn/${concept.id}`} key={concept.id}><div className="concept-index">{String(index + 1).padStart(2, "0")}</div><div className="concept-body"><span>{concept.stage}</span><h3>{concept.title}</h3><p>{concept.summary}</p><div className="concept-meta"><LessonStatus conceptId={concept.id} /><span className="card-arrow">↗</span></div></div></Link>)}</div></section>
        <section className="quick-tools"><div className="section-heading"><div><p className="eyebrow">快速工具</p><h2>把抽象关系放到眼前</h2></div></div><div className="tool-grid"><Link href="/tools/five-elements" className="tool-card element-tool"><div className="tool-icon">◌</div><div><h3>五行生克</h3><p>点击一个元素，看看它生谁、克谁。</p></div><span>↗</span><div className="element-rings">{FIVE_ELEMENTS.map((element) => <i key={element.id} style={{ backgroundColor: element.color }} />)}</div></Link><Link href="/hexagrams" className="tool-card hex-tool"><div className="tool-icon">䷀</div><div><h3>六十四卦</h3><p>按卦序浏览结构，建立整体地图。</p></div><span>↗</span><strong>{HEXAGRAMS.length}<small> 卦</small></strong></Link></div></section>
        <DeferredHexagramLab />
        <footer className="page-footer"><span>易境 · 个人易学学习工具</span><span>结构先于断语 · 学习重于预测</span></footer>
      </main>
    </div>
  );
}
