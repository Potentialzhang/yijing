import Link from "next/link";
import { notFound } from "next/navigation";
import { getHexagramByNumber, getTrigram, relationHexagrams } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import { NoteEntry } from "@/components/notes/NoteEntry";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { HexagramLearningStatus } from "@/components/hexagram/HexagramLearningStatus";
import { ContentErrata } from "@/components/content/ContentErrata";
import { getHexagramStudy } from "@/content/hexagram-study";

export function generateStaticParams() { return Array.from({ length: 64 }, (_, index) => ({ number: String(index + 1) })); }

function lineLabel(index: number): string { return `${index === 0 ? "初" : index === 5 ? "上" : ["二", "三", "四", "五"][index - 1]}爻`; }
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
  const study = getHexagramStudy(hexagram);

  return (
    <main className="subpage hexagram-detail-page">
      <header className="subpage-header">
        <Link href="/hexagrams" className="back-link">← 六十四卦索引</Link>
        <p className="eyebrow">第 {hexagram.kingWenNumber} 卦 · 卦库详情</p>
        <h1>{study.shortName}</h1>
        <div className="detail-header-actions"><p className="subpage-lead">{lowerTrigram.name}下 · {upperTrigram.name}上 · 六爻从初爻到上爻读取。</p><FavoriteButton targetType="hexagram" targetId={hexagram.id} /></div>
      </header>

      <section className="detail-hero">
        <div className="detail-visual"><HexagramGlyph lines={hexagram.lines} label={`${study.shortName}六爻`} /><strong className="detail-unicode">{hexagram.unicodeSymbol}</strong><span>{study.shortName} · 第 {hexagram.kingWenNumber} 卦</span></div>
        <div className="detail-copy"><span className="content-label">卦象摘要</span><h2>{hexagram.name}</h2><p>{study.image}</p><div className="structure-table hexagram-trigram-table"><div><span>下卦</span><div className="trigram-inline"><TrigramGlyph lines={lowerTrigram.lines} label={`下卦${lowerTrigram.name}三爻`} /><strong>{lowerTrigram.name}</strong></div><small>{lowerTrigram.nature} · {lowerTrigram.element} · {lowerTrigram.direction}</small></div><div><span>上卦</span><div className="trigram-inline"><TrigramGlyph lines={upperTrigram.lines} label={`上卦${upperTrigram.name}三爻`} /><strong>{upperTrigram.name}</strong></div><small>{upperTrigram.nature} · {upperTrigram.element} · {upperTrigram.direction}</small></div></div><div className="structure-table">{hexagram.lines.map((line, index) => <div key={index}><span>{lineLabel(index)}</span><strong>{line === 1 ? "阳爻" : "阴爻"}</strong><small>{line === 1 ? "━━" : "━ ━"}</small></div>)}</div></div>
      </section>
      <HexagramLearningStatus hexagramId={hexagram.id} />
      <div className="test-academy-link" aria-label="统一测试入口"><span>想用题目检验记忆？</span><Link className="outline-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></div>

      <section className="hexagram-study-sections" aria-label="卦辞与学习解读"><article className="study-feature-card"><span className="content-label">卦德</span><h2>这一卦如何立身</h2><p>{study.virtue}</p></article><article className="study-feature-card"><span className="content-label">取象</span><h2>从上下卦看画面</h2><p>{study.image}</p></article><article className="study-feature-card"><span className="content-label">速记方法</span><h2>一句话记住结构</h2><p>{study.mnemonic}</p></article><article className="study-feature-card study-feature-wide"><span className="content-label">卦辞</span><h2>{study.judgment}</h2><p>{study.judgmentInterpretation}</p></article><article className="study-feature-card study-feature-wide"><span className="content-label">彖传</span><h2>《彖》曰</h2><p className="canonical-passage">{study.tuan}</p><p>{study.tuanInterpretation}</p></article><article className="study-feature-card study-feature-wide"><span className="content-label">象传</span><h2>《象》曰</h2><p className="canonical-passage">{study.xiang}</p><p>{study.xiangInterpretation}</p></article></section>
      <section className="text-layer hexagram-lines-section"><div className="text-layer-header"><div><p className="eyebrow">逐爻阅读</p><h2>爻辞与爻位解释</h2></div><span className="pending-badge">六爻</span></div><div className="line-text-list">{study.lines.map((line) => <article key={line.position}><div className="line-text-heading"><strong>{line.label}</strong><span>{hexagram.lines[line.position - 1] === 1 ? "阳爻" : "阴爻"}</span></div><p className="line-canonical">{line.canonical}</p><p className="line-interpretation">{line.interpretation}</p></article>)}</div></section>
      <ContentErrata targetType="hexagram" targetId={hexagram.id} contentVersion={2} />

      <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">关系卦</p><h2>从结构看变化</h2></div></div><div className="relations-grid">
        <RelationCard title="错卦 · 阴阳反转" relation="opposite" href={`/hexagrams/${relations.opposite.kingWenNumber}`} name={relations.opposite.name} number={relations.opposite.kingWenNumber} />
        <RelationCard title="综卦 · 上下倒置" relation="reversed" href={`/hexagrams/${relations.reversed.kingWenNumber}`} name={relations.reversed.name} number={relations.reversed.kingWenNumber} />
        <RelationCard title="互卦 · 取二至五爻" relation="nuclear" href={`/hexagrams/${relations.nuclear.kingWenNumber}`} name={relations.nuclear.name} number={relations.nuclear.kingWenNumber} />
      </div></section>

      <section className="detail-section line-notes"><div className="section-heading"><div><p className="eyebrow">上下文笔记</p><h2>把自己的理解留下来</h2></div></div>{hexagram.lines.map((line, index) => <NoteEntry key={index} targetType="hexagram_line" targetId={`${hexagram.id}-${index + 1}`} label={`${lineLabel(index)}笔记`} />)}</section>
      <NoteEntry targetId={hexagram.id} label="打开本卦个人笔记" />
    </main>
  );
}
