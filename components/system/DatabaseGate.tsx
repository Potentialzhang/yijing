"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DATABASE_VERSION, getExistingDatabaseVersion, openAndNormalizeDatabase } from "@/db/repository";
import { MIGRATION_WARNING_KEY, serializeMigrationWarning } from "@/core/data/migration-warning";

export function DatabaseGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) setError("本地数据库打开超时，可能有其他标签页正在阻塞升级");
    }, 8_000);
    async function openDatabase(): Promise<void> {
      try {
        const existingVersion = await getExistingDatabaseVersion();
        if (existingVersion && existingVersion < DATABASE_VERSION) {
          const warning = { fromVersion: existingVersion, toVersion: DATABASE_VERSION, detectedAt: new Date().toISOString() };
          try { window.localStorage.setItem(MIGRATION_WARNING_KEY, serializeMigrationWarning(warning)); } catch { /* private browsing may deny localStorage; IndexedDB migration can still continue */ }
          if (active) setMigrationNotice(`检测到本地数据库 v${existingVersion}，将升级到 v${DATABASE_VERSION}。升级完成后建议立即导出一份备份。`);
        }
        await openAndNormalizeDatabase();
        if (active) setReady(true);
      } catch (reason: unknown) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "本地数据库无法打开");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void openDatabase();
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);

  if (error) {
    return <main className="subpage error-state database-error" aria-labelledby="database-error-title"><span className="eyebrow">本地数据保护模式</span><h1 id="database-error-title">数据库升级没有完成。</h1><p className="subpage-lead">为避免继续写入半迁移数据，易境已暂时进入只读错误页。请先重新加载；如果问题持续，请在其他浏览器打开应用并使用已有备份恢复。</p><details><summary>技术信息</summary><code>{error}</code></details><div className="error-actions"><button type="button" className="primary-button" onClick={() => window.location.reload()}>重新加载 <span>↻</span></button><Link className="outline-button" href="/">回到首页</Link></div></main>;
  }

  if (!ready) return <main className="subpage database-loading" aria-live="polite"><span className="eyebrow">本地数据</span><h1>正在检查学习记录…</h1>{migrationNotice && <p>{migrationNotice}</p>}</main>;
  return <>{children}</>;
}
