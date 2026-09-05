import Link from "next/link";
import { KNOWLEDGE_CONCEPTS, ORDERED_KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { LessonStatus } from "@/components/learning/LessonStatus";

export default function LearnPage() {
  return (
    <main className="subpage">
      <header className="subpage-header"><Link href="/" className="back-link">← 回到今日</Link><p className="eyebrow">学习地图 · 由浅入深</p><h1>沿着关系学习，不再孤立背诵</h1><p className="subpage-lead">每个知识点都标记了前置关系、易混点和下一次练习入口。先建立结构，再逐步增加象意。</p></header>
      <div className="learning-path">{ORDERED_KNOWLEDGE_CONCEPTS.map((concept, index) => <article className="lesson-row" key={concept.id}><div className="lesson-number">{String(index + 1).padStart(2, "0")}</div><div className="lesson-content"><div className="lesson-meta"><span>{concept.stage}</span>{concept.prerequisites.length ? <small>前置：{concept.prerequisites.map((id) => KNOWLEDGE_CONCEPTS.find((item) => item.id === id)?.title).join("、")}</small> : <small>学习起点</small>}</div><h2>{concept.title}</h2><p>{concept.summary}</p><div className="lesson-keywords">{concept.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div><LessonStatus conceptId={concept.id} /></div><Link className="outline-button" href={`/learn/${concept.id}`}>查看内容 <span>↗</span></Link></article>)}</div>
      <div className="subpage-note"><strong>学习提示</strong><span>读完一个知识点后，先合上页面，用自己的话复述，再进入下一节。</span></div>
    </main>
  );
}
