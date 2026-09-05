import Link from "next/link";
import { HexagramIndex } from "@/components/hexagram/HexagramIndex";

export default function HexagramsPage() {
  return (
    <main className="subpage"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">六十四卦 · 文王卦序</p><h1>先看结构，再读文字</h1><p className="subpage-lead">卦序、上下卦和六爻结构是稳定的骨架。经典原文和后续释义会以来源标签分别补充。</p></header><HexagramIndex /></main>
  );
}
