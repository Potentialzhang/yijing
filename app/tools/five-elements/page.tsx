import Link from "next/link";
import { FiveElementsExplorer } from "@/components/tools/FiveElementsExplorer";

export default function FiveElementsPage() { return <main className="subpage"><header className="subpage-header"><Link href="/tools" className="back-link">← 工具</Link><p className="eyebrow">五行工具 · 关系练习</p><h1>先看关系，再记名字。</h1><p className="subpage-lead">点击一个元素，观察它的相生与相克。这里专注基础关系，不直接扩展到现实判断。</p></header><FiveElementsExplorer /><section className="pending-content"><span className="content-label">学习提示</span><h2>用一句话复述</h2><p>看完关系图后合上页面，尝试不看答案说出“木生什么、木克什么”，再进入下一张卡。</p></section></main>; }
