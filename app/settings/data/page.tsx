import Link from "next/link";
import { DataBackup } from "@/components/data/DataBackup";

export default function DataSettingsPage() {
  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/" className="back-link">
          ← 回到今日
        </Link>
        <p className="eyebrow">设置 · 数据安全</p>
        <h1>你的学习数据，由你保管。</h1>
        <p className="subpage-lead">
          易境的笔记、作答和学习进度默认只保存在当前浏览器。导出备份后，可以在需要时恢复。
        </p>
      </header>
      <div className="settings-links">
        <Link className="outline-button" href="/settings/content">
          内容与来源复核 →
        </Link>
        <Link className="outline-button" href="/settings/preferences">
          调整学习偏好 →
        </Link>
        <Link className="outline-button" href="/settings/ai">
          AI 辅学授权 →
        </Link>
      </div>
      <DataBackup />
      <section className="pending-content backup-explainer">
        <span className="content-label">当前版本说明</span>
        <h2>账户数据库，跨设备同步</h2>
        <p>
          当前版本不要求登录，也不会把笔记发送到服务器。未来如果增加跨设备同步，会先提供冲突预览、备份和关闭同步选项。
        </p>
      </section>
    </main>
  );
}
