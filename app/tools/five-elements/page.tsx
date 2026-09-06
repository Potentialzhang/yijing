import Link from "next/link";
import { FiveElementsExplorer } from "@/components/tools/FiveElementsExplorer";

export default function FiveElementsPage() { return <main className="subpage tool-page"><header className="subpage-header"><Link href="/tools" className="back-link">← 工具</Link><p className="eyebrow">五行工具 · 关系图</p><h1>先看关系，再记名字。</h1><p className="subpage-lead">点击一个元素，查看它的相生与相克。答题请统一前往测试学堂。</p></header><FiveElementsExplorer /><div className="test-academy-link" aria-label="统一测试入口"><span>需要检验五行关系？</span><Link className="outline-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></div><section className="pending-content"><span className="content-label">使用提示</span><h2>把关系留在眼前</h2><p>先在关系图中切换元素和模式，再到测试学堂集中练习。</p></section></main>; }
