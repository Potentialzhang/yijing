import { AccountPanel } from "@/components/account/AccountPanel";
export default function AccountPage() { return <main className="subpage"><header className="subpage-header"><p className="eyebrow">账户与同步</p><h1>把学习资料带到每台设备。</h1><p className="subpage-lead">登录后，笔记、复习记录、偏好和工具记录会按账户保存到 PostgreSQL；应用不在浏览器保存个人学习数据。</p></header><AccountPanel /></main>; }
