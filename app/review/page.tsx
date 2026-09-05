import Link from "next/link";
import { ReviewSession } from "@/components/review/ReviewSession";
import { WeakPoints } from "@/components/review/WeakPoints";
import { ReviewConfusions } from "@/components/review/ReviewConfusions";

export default function ReviewPage() {
  return <main className="subpage review-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">复习中心 · 间隔回忆</p><h1>先回忆，再打开答案。</h1><p className="subpage-lead">每次复习都记录在本地。答错的知识点会回到更近的复习间隔，连续掌握后再逐步拉开距离。</p></header><ReviewSession /><ReviewConfusions /><WeakPoints /></main>;
}
