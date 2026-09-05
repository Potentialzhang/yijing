import Link from "next/link";
import { SexagenaryRelationsExplorer } from "@/components/tools/SexagenaryRelationsExplorer";

export default function SexagenaryRelationsPage() {
  return <main className="subpage"><header className="subpage-header"><Link href="/tools" className="back-link">← 工具</Link><p className="eyebrow">干支基础 · 关系练习</p><h1>先记配对，再谈规则。</h1><p className="subpage-lead">把天干五合、地支六合和地支六冲分层查看。这里是静态记忆工具，不会把关系卡片直接解释成现实判断。</p></header><SexagenaryRelationsExplorer /><section className="pending-content"><span className="content-label">学习边界</span><h2>关系不是自动结论</h2><p>合、冲的成立条件和流派解释需要单独的来源与规则版本。当前页面只保存可回忆的成对关系，后续再根据权威样例扩展。</p><div className="cycle-page-links"><Link className="outline-button" href="/learn/heavenly-stems">复习十天干 <span>↗</span></Link><Link className="outline-button" href="/learn/earthly-branches">复习十二地支 <span>↗</span></Link></div></section></main>;
}
