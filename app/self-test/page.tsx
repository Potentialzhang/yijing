import Link from "next/link";
import { SelfTest } from "@/components/onboarding/SelfTest";

export default function SelfTestPage() {
  return <main className="subpage"><header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">学习起点 · 快速自测</p><h1>先测自己的起点。</h1><p className="subpage-lead">用几道基础题了解当前熟悉度，再从合适的位置开始学习。结果只用于推荐，不替代正式练习。</p></header><SelfTest /></main>;
}

