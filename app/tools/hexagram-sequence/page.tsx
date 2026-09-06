import Link from "next/link";
import { HexagramMemoryGuide } from "@/components/hexagram/HexagramMemoryGuide";

export default function HexagramSequenceToolPage() {
  return (
    <main className="subpage tool-page hexagram-memory-tool-page">
      <header className="subpage-header">
        <Link href="/tools" className="back-link">← 工具</Link>
        <p className="eyebrow">记忆工具 · 六十四卦</p>
        <h1>把卦序念成一首歌。</h1>
        <p className="subpage-lead">按上经三十卦、下经三十四卦分段背诵，再回到卦库用卦象和上下卦核对记忆。</p>
      </header>
      <HexagramMemoryGuide />
      <div className="test-academy-link" aria-label="卦序歌相关入口">
        <span>口诀记熟后，用六十四卦卡片反向核对。</span>
        <Link className="outline-button" href="/hexagrams">打开六十四卦 <span>↗</span></Link>
      </div>
    </main>
  );
}
