"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="subpage error-state"><span className="eyebrow">页面遇到一点阻滞</span><h1>先停一下，再重新进入。</h1><p className="subpage-lead">本地学习数据仍在浏览器中。你可以重试当前页面，或回到今日页继续学习。</p><div className="error-actions"><button type="button" className="primary-button" onClick={reset}>重试 <span>↻</span></button><Link className="outline-button" href="/">回到今日</Link></div></main>;
}
