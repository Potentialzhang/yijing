import Link from "next/link";
import { Suspense } from "react";
import { AIDraftNote } from "@/components/notes/AIDraftNote";

export default function DraftNotePage() {
  return <main className="subpage"><header className="subpage-header">
    <Link href="/notes" className="back-link">← 笔记库</Link>
    <p className="eyebrow">AI 辅助 · 账户笔记</p><h1>回看草稿，继续完善理解。</h1>
    <p className="subpage-lead">这里只读取你已接受的账户草稿，不向模型发送请求。编辑、来源、标签和删除沿用笔记库规则。</p>
  </header><Suspense fallback={<p>正在读取笔记…</p>}><AIDraftNote /></Suspense></main>;
}
