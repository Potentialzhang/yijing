import Link from "next/link";

export default function SelfTestPage() {
  return <main className="subpage"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">测试学堂 · 统一入口</p><h1>所有测试都在测试学堂。</h1><p className="subpage-lead">快速自测已经并入统一题库，认卦、认爻、卦辞、爻辞和工具知识都从同一个入口开始。</p><Link className="primary-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></header></main>;
}
