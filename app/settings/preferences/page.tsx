import Link from "next/link";
import { Preferences } from "@/components/settings/Preferences";

export default function PreferencesPage() { return <main className="subpage"><header className="subpage-header"><Link href="/settings/data" className="back-link">← 数据与备份</Link><p className="eyebrow">设置 · 学习偏好</p><h1>把学习节奏调成你的。</h1><p className="subpage-lead">这些设置只影响当前账户中的推荐和显示，不会改变历史作答记录或内置内容。</p></header><Preferences /></main>; }
