import Link from "next/link";
import { CoinDivination } from "@/components/divination/CoinDivination";

export default function DivinationPage() {
  return <main className="subpage divination-page"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">算卦 · 六次铜钱起卦</p><h1>把每一次投掷，变成可复盘的卦象。</h1><p className="subpage-lead">从初爻到上爻依次录入三枚铜钱结果，系统按约定生成本卦、动爻和变卦，并可保存到你的推演记录。</p></header><CoinDivination /></main>;
}
