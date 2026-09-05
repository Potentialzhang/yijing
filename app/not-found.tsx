import Link from "next/link";

export default function NotFound() {
  return <main className="subpage error-state"><span className="eyebrow">页面不存在</span><h1>这条路径还没有卦象。</h1><p className="subpage-lead">可以回到今日页，或从六十四卦索引重新开始。</p><div className="error-actions"><Link className="primary-button" href="/">回到今日 <span>↗</span></Link><Link className="outline-button" href="/hexagrams">打开六十四卦</Link></div></main>;
}
