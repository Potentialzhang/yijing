import Link from "next/link";
import { notFound } from "next/navigation";
import { getHexagramByNumber, getTrigram, relationHexagrams } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { HexagramLearningStatus } from "@/components/hexagram/HexagramLearningStatus";
import { ContentErrata } from "@/components/content/ContentErrata";
import { SOURCE_REGISTRY } from "@/content/sources";
import { getHexagramJudgment, getHexagramLineTexts, getCanonicalEntry } from "@/content/hexagrams";
import { MarkdownPreview } from "@/components/notes/MarkdownPreview";
import { InstantPractice } from "@/components/learning/InstantPractice";

export function generateStaticParams() { return Array.from({ length: 64 }, (_, index) => ({ number: String(index + 1) })); }

function lineLabel(index: number): string { return `${index === 0 ? "初" : index === 5 ? "上" : ["二", "三", "四", "五"][index - 1]}爻`; }
function formatLineComposition(lines: readonly (0 | 1)[]) { return lines.map((line) => line === 1 ? "阳" : "阴").join(" · "); }

type RelationKey = "opposite" | "reversed" | "nuclear";

const RELATION_PROCESS: Record<RelationKey, string> = {
  opposite: "逐爻将六个阴阳值反转：阳爻变阴爻，阴爻变阳爻。",
  reversed: "把六爻从初爻到上爻整体倒序排列，初爻与上爻交换位置。",
  nuclear: "下互取第 2、3、4 爻，上互取第 3、4、5 爻，再将两组三爻组合为六爻。",
};

function RelationCard({
  title,
  relation,
  href,
  name,
  number,
}: {
  title: string;
  relation: RelationKey;
  href: string;
  name: string;
  number: number;
}) {
  return (
    <div className="relation-card">
      <Link href={href} className="relation-card-link">
        <span>{title}</span>
        <strong>{name}</strong>
        <small>第 {number} 卦 ↗</small>
      </Link>
      <details>
        <summary>查看计算过程</summary>
        <p>{RELATION_PROCESS[relation]}</p>
      </details>
    </div>
  );
}

export default async function HexagramDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const kingWenNumber = Number(number);
  if (!Number.isInteger(kingWenNumber) || kingWenNumber < 1 || kingWenNumber > 64) notFound();
  const hexagram = getHexagramByNumber(kingWenNumber);
  const lowerTrigram = getTrigram(hexagram.lowerTrigramId);
  const upperTrigram = getTrigram(hexagram.upperTrigramId);
  const relations = relationHexagrams(hexagram.lines);
  const judgment = getHexagramJudgment(hexagram.id);
  const lineTexts = getHexagramLineTexts(hexagram.id);
  const canonicalEntry = getCanonicalEntry(hexagram.id);
  const referencedSourceIds = new Set([
    ...judgment.sourceIds,
    ...judgment.blocks.flatMap((block) => block.sourceIds),
    ...lineTexts.flatMap((lineText) => [
      ...lineText.sourceIds,
      ...lineText.blocks.flatMap((block) => block.sourceIds),
    ]),
  ]);
  const sources = SOURCE_REGISTRY.filter((source) => referencedSourceIds.has(source.id));

  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/hexagrams" className="back-link">← 六十四卦索引</Link>
        <p className="eyebrow">第 {hexagram.kingWenNumber} 卦 · 结构卡</p>
        <h1>{hexagram.name}</h1>
        <div className="detail-header-actions"><p className="subpage-lead">下卦 {lowerTrigram.name}（{lowerTrigram.symbol}）· 上卦 {upperTrigram.name}（{upperTrigram.symbol}）· 六爻按从下往上保存。</p><FavoriteButton targetType="hexagram" targetId={hexagram.id} /></div>
      </header>

      <section className="detail-hero">
        <div className="detail-visual"><HexagramGlyph lines={hexagram.lines} label={`${hexagram.name}六爻`} /><strong className="detail-unicode">{hexagram.unicodeSymbol}</strong><span>{hexagram.name} · 第 {hexagram.kingWenNumber} 卦</span></div>
        <div className="detail-copy"><span className="content-label">程序计算 · 结构</span><h2>本卦的六爻骨架</h2><p>对照六爻结构阅读下方卦辞和爻辞。经典原文与项目自编学习释义分开呈现，后者不是原典或唯一解释。</p><div className="structure-table hexagram-trigram-table"><div><span>下卦</span><strong>{lowerTrigram.name} · {lowerTrigram.symbol}</strong><small>初爻 → 三爻：{formatLineComposition(lowerTrigram.lines)}</small></div><div><span>上卦</span><strong>{upperTrigram.name} · {upperTrigram.symbol}</strong><small>四爻 → 上爻：{formatLineComposition(upperTrigram.lines)}</small></div></div><div className="structure-table">{hexagram.lines.map((line, index) => <div key={index}><span>{lineLabel(index)}</span><strong>{line === 1 ? "阳爻" : "阴爻"}</strong><small>{line === 1 ? "实线" : "断线"}</small></div>)}</div></div>
      </section>
      <HexagramLearningStatus hexagramId={hexagram.id} />
      <InstantPractice targetType="hexagram" targetId={hexagram.id} />

      <section className="text-layer">
        <div className="text-layer-header"><div><p className="eyebrow">经典内容</p><h2>卦辞与爻辞</h2></div><span className="pending-badge">{judgment.status === "verified" ? "已校对" : "内容待校对"}</span></div>
        <div className="canonical-placeholder"><strong>卦辞</strong><p>{judgment.canonicalText ?? "经典原文待底本确认，当前不展示未经校对的文本。"}</p></div>
        {judgment.blocks.length > 0 && <div className="hexagram-content-blocks">{judgment.blocks.map((block) => <article className="hexagram-content-block" key={block.id}><span className="content-block-kind">{block.kind} · {block.traditionTags.join("、")}</span><span className="content-block-source">来源：{block.sourceIds.map((sourceId) => SOURCE_REGISTRY.find((source) => source.id === sourceId)?.title ?? sourceId).join("、")}</span><MarkdownPreview markdown={block.markdown} /></article>)}</div>}
        <div className="line-text-list">{lineTexts.map((lineText, index) => <div key={lineText.id}><strong>{lineLabel(index)}</strong><span>{lineText.canonicalText ?? "爻辞待来源复核"}</span>{lineText.blocks.length > 0 && <div className="hexagram-line-blocks">{lineText.blocks.map((block) => <article className="hexagram-content-block" key={block.id}><span className="content-block-kind">{block.kind} · {block.traditionTags.join("、")}</span><span className="content-block-source">来源：{block.sourceIds.map((sourceId) => SOURCE_REGISTRY.find((source) => source.id === sourceId)?.title ?? sourceId).join("、")}</span><MarkdownPreview markdown={block.markdown} /></article>)}</div>}</div>)}</div>
        <div className="detail-source-list"><strong>可用来源</strong>{sources.map((source) => <span key={source.id}>{source.title} · {source.status === "verified" ? "已登记" : "待校对"}</span>)}</div>
        {canonicalEntry.extras.map((text) => <div className="canonical-placeholder" key={text}><strong>特别用辞（不计入六爻）</strong><p>{text}</p><p>{kingWenNumber === 1 ? "学习释义：群龙各尽其能而不争为首，表现刚健中的不专断。" : "学习释义：柔顺承载须有长久稳定的原则，不能流于无主见。"}</p></div>)}
        <p><a href={canonicalEntry.sourceUrl} target="_blank" rel="noreferrer">查看本卦固定版本原文 ↗</a></p>
        <small>原文保留底本繁体、异体字及标点。学习释义为项目自编概括，疑难字与异文可通过勘误入口记录。</small>
      </section>
      <ContentErrata targetType="hexagram" targetId={hexagram.id} contentVersion={judgment.contentVersion} />

      <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">关系卦</p><h2>从结构看变化</h2></div></div><div className="relations-grid">
        <RelationCard title="错卦 · 阴阳反转" relation="opposite" href={`/hexagrams/${relations.opposite.kingWenNumber}`} name={relations.opposite.name} number={relations.opposite.kingWenNumber} />
        <RelationCard title="综卦 · 上下倒置" relation="reversed" href={`/hexagrams/${relations.reversed.kingWenNumber}`} name={relations.reversed.name} number={relations.reversed.kingWenNumber} />
        <RelationCard title="互卦 · 取二至五爻" relation="nuclear" href={`/hexagrams/${relations.nuclear.kingWenNumber}`} name={relations.nuclear.name} number={relations.nuclear.kingWenNumber} />
      </div></section>

      <section className="detail-section line-notes"><div className="section-heading"><div><p className="eyebrow">上下文笔记</p><h2>逐爻记录自己的理解</h2></div></div>{hexagram.lines.map((line, index) => <details id={`line-${index + 1}`} key={index}><summary>{lineLabel(index)} · {line === 1 ? "阳爻" : "阴爻"}</summary><NoteEditor targetType="hexagram_line" targetId={`${hexagram.id}-${index + 1}`} /></details>)}</section>
      <NoteEditor targetId={hexagram.id} />
    </main>
  );
}
