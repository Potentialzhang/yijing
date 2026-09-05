import Link from "next/link";
import { ReviewSession } from "@/components/review/ReviewSession";
import { WeakPoints } from "@/components/review/WeakPoints";

/** Dedicated session route for links from the daily page and future deep links. */
export default function ReviewSessionPage() {
  return <main className="subpage review-page"><header className="subpage-header"><Link href="/review" className="back-link">← 复习中心</Link><p className="eyebrow">复习会话 · 间隔回忆</p><h1>把这一组回忆完成。</h1><p className="subpage-lead">先在心里回答，再选择回忆质量。每一次结果都会保存到当前浏览器。</p></header><ReviewSession /><WeakPoints /></main>;
}
