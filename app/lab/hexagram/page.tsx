import Link from "next/link";
import { HexagramLab } from "@/components/lab/HexagramLab";

export default function HexagramLabPage() {
  return <main className="subpage lab-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">卦象实验室 · 独立工具</p><h1>亲手组合，理解变化。</h1><p className="subpage-lead">选择上下卦、设置动爻，再查看变卦与关系卦的计算过程。所有推演只保存在当前浏览器。</p></header><HexagramLab /></main>;
}
