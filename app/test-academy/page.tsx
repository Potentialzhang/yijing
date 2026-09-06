import Link from "next/link";
import { TestAcademy } from "@/components/academy/TestAcademy";

export default function TestAcademyPage() {
  return <main className="subpage test-academy-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">测试学堂 · 统一练习入口</p><h1>把所有知识放进同一套练习。</h1><p className="subpage-lead">认卦、认爻、卦辞、爻辞、五行、干支、九宫和猜卦都在这里练习；每轮随机抽题，作答会同步到账户数据库并进入复习队列。</p></header><TestAcademy /></main>;
}
