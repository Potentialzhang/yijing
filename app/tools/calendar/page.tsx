import Link from "next/link";
import { CalendarInputExplorer } from "@/components/tools/CalendarInputExplorer";

export default function CalendarPage() {
  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/tools" className="back-link">
          ← 工具
        </Link>
        <p className="eyebrow">时间工具 · 四柱与节气</p>
        <h1>读懂时间里的干支变化。</h1>
        <p className="subpage-lead">
          输入公历本地时间和 IANA
          时区，计算年、月、日、时干支，查看农历与二十四节气，并对照两种换日规则。
        </p>
      </header>
      <CalendarInputExplorer />
      <section className="pending-content">
        <span className="content-label">规则边界</span>
        <h2>明确边界，理解变化。</h2>
        <p>
          年柱在立春交接时刻换年，月柱以十二个节换月。日柱和时柱使用所选时区的钟表时间，换日可选午夜或子初。农历单独按中国标准时间展示。
        </p>
        <p>
          算法采用 lunar-typescript 1.8.6，规则登记见 ADR-0009；没有真太阳时修正。节气展示精度为分钟，接近交界时可对照天文年历。
        </p>
        <div className="cycle-page-links">
          <Link className="outline-button" href="/learn/heavenly-stems">
            复习十天干 <span>↗</span>
          </Link>
          <Link className="outline-button" href="/tools/sexagenary-relations">
            查看干支关系 <span>↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
