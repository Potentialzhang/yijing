"use client";

import { useState } from "react";
import type { HexagramCommentary } from "@/server/content-commentaries";

export function CommentaryWorkbench({ items }: { items: readonly HexagramCommentary[] }) {
  const [selectedIds, setSelectedIds] = useState(() => items.map((item) => item.id));

  if (items.length === 0) {
    return (
      <section id="commentaries" className="commentary-workbench commentary-empty" aria-labelledby="commentary-heading">
        <div>
          <p className="eyebrow">历代解读</p>
          <h2 id="commentary-heading">本卦观点正在整理</h2>
        </div>
        <p>当前未从数据库读取到本卦解读。请检查服务启动时的内容同步；经文、白话和卦象工具仍可正常使用。</p>
        <small>内置内容包应覆盖 64 卦程颐、朱熹与王弼·孔颖达三家开篇原注。</small>
      </section>
    );
  }

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const toggle = (id: string) => {
    setSelectedIds((current) => {
      if (!current.includes(id)) return [...current, id];
      return current.length === 1 ? current : current.filter((item) => item !== id);
    });
  };

  return (
    <section id="commentaries" className="commentary-workbench" aria-labelledby="commentary-heading">
      <div className="commentary-heading">
        <div><p className="eyebrow">历代解读 · 观点对照</p><h2 id="commentary-heading">同一卦，从不同问题读</h2></div>
        <p>这里并列原书观点的项目摘要，不把诸家强行合并成一个答案。</p>
      </div>
      <div className="commentary-selector" aria-label="选择要对照的解读者">
        {items.map((item) => <button key={item.id} type="button" aria-pressed={selectedIds.includes(item.id)} onClick={() => toggle(item.id)}><strong>{item.commentator}</strong><span>{item.tradition}</span></button>)}
      </div>
      <p className="commentary-selection-status" role="status">正在对照 {selected.length} 位解读者</p>
      <div className="commentary-grid" style={{ "--commentary-count": Math.min(selected.length, 3) } as React.CSSProperties}>
        {selected.map((item) => (
          <article key={item.id} className="commentary-card">
            <header><div><strong>{item.commentator}</strong><span>{item.dynasty}</span></div><small>{item.tradition}</small></header>
            <div className="commentary-question"><span>他在回答</span><h3>{item.focus}</h3></div>
            <blockquote>{item.excerpt}</blockquote>
            <div className="commentary-summary"><span>平台阅读提示</span><p>{item.summary}</p></div>
            <div className="commentary-practice"><span>转成今日问题</span><p>{item.practicalHint}</p></div>
            <details className="commentary-source"><summary>查看版本与出处</summary><div><strong>{item.source.title}</strong><span>{item.source.edition}</span><span>{item.locator}</span><small>{item.source.licenseLabel}</small>{item.source.url && <a href={item.source.url} target="_blank" rel="noreferrer noopener">打开原始来源 ↗</a>}</div></details>
          </article>
        ))}
      </div>
    </section>
  );
}
