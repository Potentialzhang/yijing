"use client";

import { useEffect, useRef, useState } from "react";

export function OfflineStatus() {
  const [offline, setOffline] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    const update = () => {
      if (!mountedRef.current) return;
      setOffline(!navigator.onLine);
    };
    // Register first so an offline transition cannot land between the
    // initial snapshot and listener setup during hydration/navigation.
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? <div className="offline-status" role="status">当前处于离线状态 · 账户数据库同步暂停，恢复网络后自动重试</div> : null;
}
