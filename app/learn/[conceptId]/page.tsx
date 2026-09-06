import Link from "next/link";
import { notFound } from "next/navigation";
import { COURSE_ORDER, KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { LessonProgress } from "@/components/learning/LessonProgress";
import { SOURCE_REGISTRY } from "@/content/sources";
import { NoteEntry } from "@/components/notes/NoteEntry";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { ContentErrata } from "@/components/content/ContentErrata";
import { CycleStudyPage } from "@/components/learning/CycleStudyPage";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS } from "@/content/sexagenary";
import { MarkdownPreview } from "@/components/notes/MarkdownPreview";
import { PrerequisiteNotice } from "@/components/learning/PrerequisiteNotice";

export function generateStaticParams() { return KNOWLEDGE_CONCEPTS.map((concept) => ({ conceptId: concept.id })); }

export default async function ConceptDetailPage({ params }: { params: Promise<{ conceptId: string }> }) {
  const { conceptId } = await params;
  const concept = KNOWLEDGE_CONCEPTS.find((item) => item.id === conceptId);
  if (!concept) notFound();
  const relatedConcepts = KNOWLEDGE_CONCEPTS.filter((item) => item.id !== concept.id && (concept.relatedConceptIds?.includes(item.id) || item.prerequisites.includes(concept.id)));
  const prerequisites = concept.prerequisites.map((id) => KNOWLEDGE_CONCEPTS.find((item) => item.id === id)).filter(Boolean);
  if (conceptId === "heavenly-stems") {
    return <CycleStudyPage conceptId="heavenly-stems" title="十天干基础" lead="先记住十个天干的顺序、阴阳和五行归组。" intro="甲乙、丙丁、戊己、庚辛、壬癸分别成对归入木、火、土、金、水。先把同一五行的一对认熟，再观察阴阳差别。" items={HEAVENLY_STEMS} relatedConcepts={relatedConcepts} prerequisites={prerequisites.filter((item): item is (typeof KNOWLEDGE_CONCEPTS)[number] => Boolean(item)).map((item) => ({ id: item.id, title: item.title }))} />;
  }
  if (conceptId === "earthly-branches") {
    return <CycleStudyPage conceptId="earthly-branches" title="十二地支基础" lead="把十二地支连接到序列、方位和时段记忆提示。" intro="子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥是一条可回忆的序列；方位、月份和时段字段只作为静态提示。" items={EARTHLY_BRANCHES} relatedConcepts={relatedConcepts} prerequisites={prerequisites.filter((item): item is (typeof KNOWLEDGE_CONCEPTS)[number] => Boolean(item)).map((item) => ({ id: item.id, title: item.title }))} />;
  }
  const sources = concept.sourceIds.map((id) => SOURCE_REGISTRY.find((source) => source.id === id)).filter(Boolean);
  const courseIndex = COURSE_ORDER.indexOf(concept.id as (typeof COURSE_ORDER)[number]);
  const nextConceptId = courseIndex >= 0 ? COURSE_ORDER[courseIndex + 1] : undefined;
  const nextConcept = nextConceptId ? KNOWLEDGE_CONCEPTS.find((item) => item.id === nextConceptId) : undefined;
  const nextHref = conceptId === "hetu-luoshu" || conceptId === "nine-palaces"
    ? "/tools/hetu-luoshu"
    : nextConcept
      ? `/learn/${nextConcept.id}`
      : "/review";
  const nextLabel = conceptId === "hetu-luoshu" || conceptId === "nine-palaces"
    ? "打开河图洛书九宫工具"
    : nextConcept
      ? `下一节：${nextConcept.title}`
      : "进入复习队列";
  return <main className="subpage"><header className="subpage-header"><Link href="/learn" className="back-link">← 学习内容索引</Link><p className="eyebrow">{concept.stage}</p><h1>{concept.title}</h1><div className="detail-header-actions"><p className="subpage-lead">{concept.summary}</p><FavoriteButton targetType="concept" targetId={concept.id} /></div></header><PrerequisiteNotice prerequisites={prerequisites.filter((item): item is (typeof KNOWLEDGE_CONCEPTS)[number] => Boolean(item)).map((item) => ({ id: item.id, title: item.title }))} /><LessonProgress conceptId={concept.id} /><section className="lesson-detail-body"><div className="lesson-detail-main"><span className="content-label">编辑释义 · 入门</span>{concept.blocks.map((block) => <div className="content-block" key={block.id}><span className="content-block-kind">{block.kind === "editorial" ? "编辑释义" : block.kind} · {block.traditionTags.join("、")}</span><span className="content-block-source">来源：{block.sourceIds.map((sourceId) => SOURCE_REGISTRY.find((source) => source.id === sourceId)?.title ?? sourceId).join("、")}</span><MarkdownPreview markdown={block.markdown} /></div>)}<h2>本节关键词</h2><div className="lesson-keywords">{concept.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>{concept.commonConfusions?.length ? <><h2>容易混淆</h2><ul className="confusion-list">{concept.commonConfusions.map((item) => <li key={item}>{item}</li>)}</ul></> : null}<h2>来源状态</h2><div className="source-status-list">{sources.map((source) => <div key={source!.id}><strong>{source!.title}</strong><span className={source!.status === "verified" ? "source-verified" : "source-pending"}>{source!.status === "verified" ? "已登记" : "待校对"}</span></div>)}</div></div><aside className="lesson-detail-side" aria-label="学习关系"><span className="content-label">学习关系</span><h2>前置知识</h2>{prerequisites.length ? prerequisites.map((item) => <Link href={`/learn/${item!.id}`} key={item!.id}>{item!.title} ↗</Link>) : <p>这是当前学习内容索引的起点。</p>}<h2>相关知识</h2>{relatedConcepts.length ? relatedConcepts.map((item) => <Link href={`/learn/${item.id}`} key={item.id}>{item.title} ↗</Link>) : <p>暂无已登记的相关知识。</p>}<h2>下一步</h2><Link href={nextHref}>{nextLabel} ↗</Link></aside></section><div className="test-academy-link" aria-label="统一测试入口"><span>需要答题时，进入统一题库。</span><Link className="outline-button" href="/test-academy">进入测试学堂 <span>↗</span></Link></div><ContentErrata targetType="concept" targetId={concept.id} contentVersion={concept.contentVersion ?? 1} /><NoteEntry targetType="concept" targetId={concept.id} label="打开本节个人笔记" /></main>;
}
