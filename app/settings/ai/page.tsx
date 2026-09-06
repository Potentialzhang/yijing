import Link from "next/link";
import { AIAssistSettings } from "@/components/settings/AIAssistSettings";
import { AIGenerationHistory } from "@/components/settings/AIGenerationHistory";
import { currentUser } from "@/server/auth";
import { getAiGenerationHistory } from "@/server/ai-history";

export const dynamic = "force-dynamic";

export default async function AIAssistPage() {
  const user = await currentUser();
  const history = user ? await getAiGenerationHistory(user.id) : [];
  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/settings/data" className="back-link">
          ← 数据与备份
        </Link>
        <p className="eyebrow">设置 · AI 辅学边界</p>
        <h1>先决定哪些内容可以被看见。</h1>
        <p className="subpage-lead">
          AI
          辅学默认关闭。开启后可选择知识、笔记和作答记录，核对实际发送材料，再请求模型出题、整理或对比观点。
        </p>
      </header>
      <AIAssistSettings />
      <AIGenerationHistory items={history} />
      <section className="pending-content">
        <span className="content-label">AI 辅学 · 授权说明</span>
        <h2>授权、来源和原文保持分层。</h2>
        <p>
          模型请求携带选定范围、用途、契约版本和来源编号。AI
          输出只能作为草稿，不能覆盖经典原文、程序计算结果或你的原笔记。
        </p>
        <p>
          当前规则登记：ADR-0008（AI 辅学授权与发送预览）。关闭 AI
          后，其他学习功能不受影响。
        </p>
      </section>
    </main>
  );
}
