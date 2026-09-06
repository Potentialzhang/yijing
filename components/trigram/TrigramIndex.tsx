import Link from "next/link";
import { TRIGRAMS } from "@/core/iching";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import { SOURCE_REGISTRY } from "@/content/sources";

const editorialSource = SOURCE_REGISTRY.find((source) => source.id === "source-project-editorial");

function formatLineComposition(lines: readonly (0 | 1)[]) {
  return lines.map((line) => line === 1 ? "阳" : "阴").join(" · ");
}

interface TrigramIndexProps {
  backHref: string;
  backLabel: string;
}

/** Shared trigram index with a context-specific return link. */
export function TrigramIndex({ backHref, backLabel }: TrigramIndexProps) {
  return (
    <main className="subpage trigram-index-page">
      <header className="subpage-header">
        <Link href={backHref} className="back-link">{backLabel}</Link>
        <p className="eyebrow">八卦卡片 · 三爻结构</p>
        <h1>先认出卦，再扩展象意。</h1>
        <p className="subpage-lead">每张卡片把三爻、阴阳构成、五行、先天/后天方位和基本自然象分开。不同体系的内容不会在页面里悄悄混用。</p>
      </header>
      <div className="trigram-grid">
        {TRIGRAMS.map((trigram) => (
          <article className="trigram-card" key={trigram.id}>
            <div className="trigram-card-visual">
              <TrigramGlyph lines={trigram.lines} label={`${trigram.name}三爻`} />
              <strong>{trigram.symbol}</strong>
            </div>
            <div className="trigram-card-copy">
              <span className="content-label">{trigram.nature} · {trigram.element}</span>
              <h2>{trigram.name}</h2>
              <p>{trigram.keywords.join(" · ")}</p>
              <div className="trigram-facts">
                <span>阴阳构成<strong>{formatLineComposition(trigram.lines)}</strong></span>
                <span>后天方位<strong>{trigram.direction}</strong></span>
                <span>先天方位<strong>{trigram.directions.find((item) => item.system === "earlier_heaven")?.value}</strong></span>
                <span>家庭角色<strong>{trigram.familyRole}</strong></span>
                <span>身体<strong>{trigram.bodyAssociations[0]}</strong></span>
              </div>
              <small className="trigram-source-status">来源：{editorialSource?.title ?? "项目自编基础内容"} · {editorialSource?.status === "verified" ? "已登记" : "待校对"}</small>
              <Link className="outline-button" href={`/trigrams/${trigram.id}`}>查看详情 <span>↗</span></Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
