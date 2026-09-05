import Link from "next/link";
import { notFound } from "next/navigation";
import { TRIGRAMS } from "@/core/iching";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { FavoriteButton } from "@/components/notes/FavoriteButton";
import { ContentErrata } from "@/components/content/ContentErrata";
import { TrigramLearningStatus } from "@/components/trigram/TrigramLearningStatus";
import { SOURCE_REGISTRY } from "@/content/sources";
import { InstantPractice } from "@/components/learning/InstantPractice";

function formatLineComposition(lines: readonly (0 | 1)[]) {
  return lines.map((line) => line === 1 ? "阳" : "阴").join(" · ");
}

export function generateStaticParams() { return TRIGRAMS.map((trigram) => ({ id: trigram.id })); }

export default async function TrigramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trigram = TRIGRAMS.find((item) => item.id === id);
  if (!trigram) notFound();
  const source = SOURCE_REGISTRY.find((item) => item.id === "source-project-editorial");
  return <main className="subpage"><header className="subpage-header"><Link href="/trigrams" className="back-link">← 八卦卡片</Link><p className="eyebrow">八卦 · 三爻结构</p><h1>{trigram.name} · {trigram.nature}</h1><div className="detail-header-actions"><p className="subpage-lead">从下往上是 {formatLineComposition(trigram.lines)}。在本应用的基础资料中，五行属{trigram.element}，后天方位为{trigram.direction}。</p><FavoriteButton targetType="trigram" targetId={trigram.id} /></div></header><section className="trigram-detail-hero"><div className="detail-visual"><TrigramGlyph lines={trigram.lines} label={`${trigram.name}三爻`} /><strong>{trigram.symbol}</strong><span>{trigram.keywords.join(" · ")}</span></div><div className="detail-copy"><span className="content-label">基础象意 · 编辑释义</span><h2>把符号连到关系</h2><p>先确认三爻结构，再把自然象、五行、方位和家庭角色分别记忆。不同体系的象意会在后续内容中单独标注。</p><div className="structure-table"><div><span>阴阳构成</span><strong>{formatLineComposition(trigram.lines)}</strong><small>初爻 → 上爻</small></div><div><span>五行</span><strong>{trigram.element}</strong><small>基础字段</small></div><div><span>后天方位</span><strong>{trigram.direction}</strong><small>后天体系</small></div><div><span>先天方位</span><strong>{trigram.directions.find((item) => item.system === "earlier_heaven")?.value}</strong><small>先天体系</small></div><div><span>家庭角色</span><strong>{trigram.familyRole}</strong><small>象意字段</small></div><div><span>身体对应</span><strong>{trigram.bodyAssociations.join("、")}</strong><small>记忆联想</small></div></div><p className="detail-source-note">来源：{source?.title ?? "项目自编基础内容"} · {source?.status === "verified" ? "已登记" : "待校对"}</p><Link className="outline-button" href="/review">开始八卦识别练习 <span>↗</span></Link></div></section><TrigramLearningStatus trigramId={trigram.id} /><InstantPractice targetType="trigram" targetId={trigram.id} /><ContentErrata targetType="trigram" targetId={trigram.id} contentVersion={1} /><NoteEditor targetType="trigram" targetId={trigram.id} /></main>;
}
