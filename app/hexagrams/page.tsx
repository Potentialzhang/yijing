import Link from "next/link";
import { HexagramIndex } from "@/components/hexagram/HexagramIndex";

export default function HexagramsPage() {
  return (
    <main className="subpage hexagrams-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">卦库 · 六十四卦</p><h1>先看结构，再读文字</h1><p className="subpage-lead">用紧凑卡片快速浏览卦象、上下卦和学习状态，点进详情再展开卦德、取象、卦辞与逐爻解释。</p><Link className="outline-button" href="/test-academy">需要答题？进入测试学堂 <span>↗</span></Link></header><HexagramIndex /></main>
  );
}
