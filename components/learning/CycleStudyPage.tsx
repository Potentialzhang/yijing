import Link from "next/link";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { ContentErrata } from "@/components/content/ContentErrata";
import { PrerequisiteNotice } from "@/components/learning/PrerequisiteNotice";
import { InstantPractice } from "@/components/learning/InstantPractice";
import { LessonProgress } from "@/components/learning/LessonProgress";
import type { EarthlyBranch, HeavenlyStem } from "@/content/sexagenary";
import { SOURCE_REGISTRY } from "@/content/sources";
import { COURSE_ORDER, KNOWLEDGE_CONCEPTS } from "@/content/knowledge";

type CycleItem = HeavenlyStem | EarthlyBranch;

interface CycleStudyPageProps {
  conceptId: "heavenly-stems" | "earthly-branches";
  title: string;
  lead: string;
  intro: string;
  items: readonly CycleItem[];
  relatedConcepts: readonly { id: string; title: string }[];
  prerequisites: readonly { id: string; title: string }[];
}

function isBranch(item: CycleItem): item is EarthlyBranch {
  return "doubleHour" in item;
}

export function CycleStudyPage({ conceptId, title, lead, intro, items, relatedConcepts, prerequisites }: CycleStudyPageProps) {
  const source = SOURCE_REGISTRY.find((item) => item.id === "source-project-editorial");
  const courseIndex = COURSE_ORDER.indexOf(conceptId);
  const nextConceptId = courseIndex >= 0 ? COURSE_ORDER[courseIndex + 1] : undefined;
  const nextConcept = nextConceptId ? KNOWLEDGE_CONCEPTS.find((item) => item.id === nextConceptId) : undefined;
  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/learn" className="back-link">← 学习地图</Link>
        <p className="eyebrow">M2 静态知识 · 内容待复核</p>
        <h1>{title}</h1>
        <div className="detail-header-actions">
          <p className="subpage-lead">{lead}</p>
          <FavoriteButton targetType="concept" targetId={conceptId} />
        </div>
      </header>

      <PrerequisiteNotice prerequisites={prerequisites} />
      <LessonProgress conceptId={conceptId} />

      <section className="cycle-intro pending-content">
        <span className="content-label">编辑释义 · 记忆字段</span>
        <p>{intro}</p>
        <small>本阶段只展示静态记忆提示，不进行干支历法换算，也不输出排盘或吉凶判断。</small>
      </section>

      <section className="cycle-grid" aria-label={title}>
        {items.map((item) => (
          <article className="cycle-card" key={item.id}>
            <div className="cycle-card-heading"><span>{String(item.index).padStart(2, "0")}</span><strong>{item.name}</strong><em>{item.yinYang}</em></div>
            <div className="cycle-facts">
              <span>五行<strong>{item.element}</strong></span>
              {isBranch(item) ? <><span>方位提示<strong>{item.direction}</strong></span><span>时段提示<strong>{item.doubleHour}</strong></span><span>月份提示<strong>{item.monthHint}</strong></span></> : <span>序列位置<strong>第 {item.index} 位</strong></span>}
            </div>
            {!isBranch(item) && <p>{item.mnemonic}</p>}
            {isBranch(item) && <p>{item.mnemonic}</p>}
            <small className="cycle-source">来源：{source?.title ?? "项目自编基础内容"} · {item.status === "reviewed" ? "已复核" : "待内容负责人复核"}</small>
          </article>
        ))}
      </section>

      <p className="cycle-related-link"><Link className="outline-button" href="/tools/sexagenary-relations">查看干支关系图 <span>↗</span></Link></p>

      {nextConcept && <p className="cycle-next-link"><Link className="outline-button" href={`/learn/${nextConcept.id}`}>下一节：{nextConcept.title} <span>↗</span></Link></p>}

      <section className="cycle-related" aria-label="相关知识">
        <span className="content-label">学习关系</span>
        <h2>相关知识</h2>
        <div>{relatedConcepts.length ? relatedConcepts.map((item) => <Link href={`/learn/${item.id}`} key={item.id}>{item.title} ↗</Link>) : <p>暂无已登记的相关知识。</p>}</div>
      </section>

      <InstantPractice targetType="concept" targetId={conceptId} />
      <ContentErrata targetType="concept" targetId={conceptId} contentVersion={1} />
      <NoteEditor targetType="concept" targetId={conceptId} />
    </main>
  );
}
