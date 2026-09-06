import Link from "next/link";
import { TestAcademy } from "@/components/academy/TestAcademy";

export default function TestAcademyPage() {
  return <main className="subpage test-academy-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">测试学堂 · 统一练习入口</p><h1>把所有知识放进同一套练习。</h1><p className="subpage-lead">先搭好题型和学习路径，题库内容会在下一阶段统一设计、复核和分级；当前页面不再用低质量题目占位。</p></header><TestAcademy /></main>;
}
