import Link from "next/link";
import { StudyStats } from "@/components/dashboard/StudyStats";

export default function StatsPage() {
  return <main className="subpage"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">学习统计 · 账户重算</p><h1>看见自己的学习节奏。</h1><p className="subpage-lead">按 7 天或 30 天回看作答、正确率、活跃天数和长期记忆指标。数据来自当前账户数据库。</p></header><StudyStats /></main>;
}
