import { AccountPanel } from "@/components/account/AccountPanel";
export default function AccountPage() {
  return <main className="subpage account-page">
    <header className="subpage-header account-page-header"><p className="eyebrow">账户与同步</p><h1>把学习资料带到每台设备。</h1><p className="subpage-lead">登录后，笔记、复习记录、偏好和工具记录会按账户保存到 PostgreSQL；应用不在浏览器保存个人学习数据。</p></header>
    <div className="account-page-grid">
      <AccountPanel />
      <aside className="account-benefits" aria-label="账户能力">
        <p className="eyebrow">你的学习空间</p>
        <h2>从今天开始，留下自己的理解。</h2>
        <ul><li><strong>跨设备同步</strong><span>电脑整理，手机复习，进度保持一致。</span></li><li><strong>数据归你</strong><span>支持主动导出 JSON 备份，不自动发送个人内容。</span></li><li><strong>首位管理员</strong><span>第一个注册账户可管理本实例的其他用户。</span></li></ul>
      </aside>
    </div>
  </main>;
}
