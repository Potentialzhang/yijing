import type { AiGenerationHistoryItem } from "@/server/ai-history";

const TASK_LABELS: Record<string, string> = {
  "exercise-draft": "个性化出题",
  "note-draft": "笔记整理",
  "viewpoint-comparison": "观点对比",
};

export function AIGenerationHistory({ items }: { items: readonly AiGenerationHistoryItem[] }) {
  return <section className="ai-generation-history" aria-labelledby="ai-history-heading">
    <div><p className="eyebrow">账户审计记录</p><h2 id="ai-history-heading">最近 20 次模型请求</h2><p>只显示当前账户的任务、来源、模型和结果；发送的个人笔记原文不写入审计日志。</p></div>
    {items.length ? <div className="ai-generation-list">{items.map(item => <details key={item.id}>
      <summary><span data-status={item.status}>{item.status === "completed" ? "成功" : "失败"}</span><strong>{TASK_LABELS[item.taskKind] ?? item.taskKind}</strong><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(item.createdAt))}</time></summary>
      <div><p>{item.provider ?? "未记录提供方"} · {item.model ?? "未记录模型"}</p><small>来源：{item.sourceIds.length ? item.sourceIds.join("、") : "无"}</small>{item.status === "failed" ? <p className="error-message">{item.errorMessage ?? "模型请求失败"}</p> : <p>{item.outputText}</p>}</div>
    </details>)}</div> : <p className="empty-state">当前账户还没有真实模型请求记录。</p>}
  </section>;
}
