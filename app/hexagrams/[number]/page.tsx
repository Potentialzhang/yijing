import Link from "next/link";
import { notFound } from "next/navigation";
import { getHexagramByNumber, getTrigram, relationHexagrams } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { HexagramLearningStatus } from "@/components/hexagram/HexagramLearningStatus";
import { ContentErrata } from "@/components/content/ContentErrata";
import { getHexagramStudy } from "@/content/hexagram-study";
import { CommentaryWorkbench } from "@/components/hexagram/CommentaryWorkbench";
import { getHexagramCommentaries, getHexagramPassages } from "@/server/content-commentaries";
import { HexagramNotesShortcut } from "@/components/hexagram/HexagramNotesShortcut";

export const dynamic = "force-dynamic";

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
  const baseStudy = getHexagramStudy(hexagram);
  const [passages, commentaries] = await Promise.all([
    getHexagramPassages(hexagram.id),
    getHexagramCommentaries(hexagram.id),
  ]);
  const passage = (kind: "judgment" | "tuan" | "xiang") => passages.find((item) => item.sectionKind === kind)?.originalText;
  const study = {
    ...baseStudy,
    judgment: passage("judgment") ?? baseStudy.judgment,
    tuan: passage("tuan") ?? baseStudy.tuan,
    xiang: passage("xiang") ?? baseStudy.xiang,
    lines: baseStudy.lines.map((line) => ({
      ...line,
      canonical: passages.find((item) => item.sectionKind === "line" && item.linePosition === line.position)?.originalText ?? line.canonical,
    })),
  };

  return (
    <main className="subpage hexagram-detail-page">
      <header className="subpage-header">
        <Link href="/hexagrams" className="back-link">← 六十四卦索引</Link>
        <p className="eyebrow">第 {hexagram.kingWenNumber} 卦 · 卦库详情</p>
        <h1>{study.shortName}</h1>
        <div className="detail-header-actions"><p className="subpage-lead">{lowerTrigram.name}下 · {upperTrigram.name}上 · 六爻从初爻到上爻读取。</p><div className="detail-header-tools"><Link className="outline-button" href={`/library?q=${encodeURIComponent(study.shortName)}`}>查知识库</Link><HexagramNotesShortcut hexagramId={hexagram.id} /><FavoriteButton targetType="hexagram" targetId={hexagram.id} /></div></div>
      </header>

      <nav className="hexagram-tool-nav" aria-label="本卦工具导航"><a href="#classic-reading">卦文与卦象</a><a href="#commentaries">历代解读</a><a href="#line-reading">六爻详解</a><a href="#relation-reading">关系卦</a></nav>

      <section id="classic-reading" className="hexagram-reading-card" aria-label="卦象、卦象摘要与经典卦文">
        <div className="hexagram-reading-card-header"><span className="content-label">卦文与卦象</span><small>原文 · 白话 · 上下卦结构</small></div>
        <div className="hexagram-reading-layout">
          <div className="detail-hero hexagram-reading-left">
          <div className="detail-visual"><HexagramGlyph lines={hexagram.lines} label={`${study.shortName}六爻`} /><strong className="detail-unicode">{hexagram.unicodeSymbol}</strong><span>{study.shortName} · 第 {hexagram.kingWenNumber} 卦</span></div>
          <div className="detail-copy"><span className="content-label">卦象摘要</span><h2>{hexagram.name}</h2><p>{study.image}</p><div className="structure-table hexagram-trigram-table"><div><span>上卦 <small>四爻至上爻</small></span><div className="trigram-inline"><TrigramGlyph lines={upperTrigram.lines} label={`上卦${upperTrigram.name}三爻`} /><strong>{upperTrigram.name}</strong></div><small>{upperTrigram.nature} · {upperTrigram.element} · {upperTrigram.direction}</small></div><div><span>下卦 <small>初爻至三爻</small></span><div className="trigram-inline"><TrigramGlyph lines={lowerTrigram.lines} label={`下卦${lowerTrigram.name}三爻`} /><strong>{lowerTrigram.name}</strong></div><small>{lowerTrigram.nature} · {lowerTrigram.element} · {lowerTrigram.direction}</small></div></div></div>
          </div>
          <section className="hexagram-classic-sections" aria-label="经典卦文">
            <article className="study-feature-card classic-text-card">
              <span className="content-label">卦辞</span>
              <h2>{study.judgment}</h2>
              <p>{study.judgmentInterpretation}</p>
            </article>
            <article className="study-feature-card classic-text-card">
              <span className="content-label">彖传</span>
              <h2>《彖》曰</h2>
              <p className="canonical-passage">{study.tuan}</p>
              <p className="plain-translation-label">白话解读</p>
              <p className="plain-translation">{study.tuanInterpretation}</p>
            </article>
            <article className="study-feature-card classic-text-card">
              <span className="content-label">象传</span>
              <h2>《象》曰</h2>
              <p className="canonical-passage">{study.xiang}</p>
              <p className="plain-translation-label">白话解读</p>
              <p className="plain-translation">{study.xiangInterpretation}</p>
            </article>
          </section>
        </div>
      </section>
      <HexagramLearningStatus hexagramId={hexagram.id} />
      <div className="test-academy-link" aria-label="统一测试入口"><span>想用题目检验记忆？</span><Link className="outline-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></div>

      <section className="hexagram-study-sections" aria-label="卦象学习解读"><article className="study-feature-card"><span className="content-label">卦德</span><h2>这一卦如何立身</h2><p>{study.virtue}</p></article><article className="study-feature-card"><span className="content-label">取象</span><h2>从上下卦看画面</h2><p>{study.image}</p></article><article className="study-feature-card"><span className="content-label">速记方法</span><h2>一句话记住结构</h2><p>{study.mnemonic}</p></article></section>
      <CommentaryWorkbench items={commentaries} />
      <section id="line-reading" className="text-layer hexagram-lines-section"><div className="text-layer-header"><div><p className="eyebrow">逐爻阅读</p><h2>爻辞与爻位解释</h2></div><span className="pending-badge">六爻</span></div><div className="line-text-list">{study.lines.map((line) => <article id={`line-${line.position}`} key={line.position}><div className="line-text-heading"><strong>{line.label}</strong><span>{hexagram.lines[line.position - 1] === 1 ? "阳爻" : "阴爻"}</span></div><p className="line-canonical">{line.canonical}</p><p className="line-interpretation">{line.interpretation}</p></article>)}</div></section>
      <ContentErrata targetType="hexagram" targetId={hexagram.id} contentVersion={2} />

      <section id="relation-reading" className="detail-section"><div className="section-heading"><div><p className="eyebrow">关系卦</p><h2>从结构看变化</h2></div></div><div className="relations-grid">
        <RelationCard title="错卦 · 阴阳反转" relation="opposite" href={`/hexagrams/${relations.opposite.kingWenNumber}`} name={relations.opposite.name} number={relations.opposite.kingWenNumber} />
        <RelationCard title="综卦 · 上下倒置" relation="reversed" href={`/hexagrams/${relations.reversed.kingWenNumber}`} name={relations.reversed.name} number={relations.reversed.kingWenNumber} />
        <RelationCard title="互卦 · 取二至五爻" relation="nuclear" href={`/hexagrams/${relations.nuclear.kingWenNumber}`} name={relations.nuclear.name} number={relations.nuclear.kingWenNumber} />
      </div></section>

    </main>
  );
}
