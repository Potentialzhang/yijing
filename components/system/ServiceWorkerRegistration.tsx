"use client";

import { useEffect } from "react";
import { useState } from "react";

export function ServiceWorkerRegistration() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          if (active) setFailed(true);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);
  return failed ? (
    <div className="sw-error-status" role="status">
      离线缓存暂不可用 · 当前页面仍可继续学习，恢复网络后请重新加载
    </div>
  ) : null;
}
