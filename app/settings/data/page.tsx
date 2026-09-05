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
          易境的笔记、作答和学习进度统一保存在 PostgreSQL 账户数据库，可跨设备访问；导出备份后，也可以在需要时恢复。
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
          当前账户的学习数据已由 PostgreSQL 统一管理。JSON 备份是用户主动下载的副本，不会绕过账户权限或自动上传到第三方。
        </p>
      </section>
    </main>
  );
}
