import Link from "next/link";
import { HeTuLuoShuExplorer } from "@/components/tools/HeTuLuoShuExplorer";

export default function HeTuLuoShuPage() {
  return <main className="subpage"><header className="subpage-header"><Link href="/tools" className="back-link">← 工具</Link><p className="eyebrow">河图 · 洛书 · 九宫</p><h1>分开看数字，再建立方位。</h1><p className="subpage-lead">河图、洛书和九宫在这里分别呈现，帮助你先记结构，再理解它们之间的关系。当前不进行历法、罗盘或排盘计算。</p></header><HeTuLuoShuExplorer /><section className="pending-content"><span className="content-label">来源与边界</span><h2>学习用静态映射</h2><p>数字、方位和卦的关联均标记为待内容负责人复核。后续若进入罗盘阶段，会先建立流派 ADR、角度边界和权威样例，再增加旋转与测验。</p><div className="cycle-page-links"><Link className="outline-button" href="/learn/heavenly-stems">复习十天干 <span>↗</span></Link><Link className="outline-button" href="/learn/earthly-branches">复习十二地支 <span>↗</span></Link></div></section></main>;
}
