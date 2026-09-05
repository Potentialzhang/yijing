"use client";

import { useEffect, useRef, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

const DISMISS_KEY = "yijing-install-prompt-dismissed";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEventLike | null>(null);
  // These values may differ between the server and browser, but `ready` keeps
  // them out of the first rendered tree so hydration remains deterministic.
  const [ios] = useState(isIosDevice);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    // Keep the server-rendered and first client-rendered trees identical. The
    // prompt is hidden until this effect has established the browser state,
    // which also avoids an iOS hydration mismatch.
    if (isStandalone()) {
      queueMicrotask(() => {
        if (mountedRef.current) setReady(true);
      });
      return () => {
        mountedRef.current = false;
      };
    }
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEventLike);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    queueMicrotask(() => {
      if (mountedRef.current) setReady(true);
    });
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready || (!installEvent && !ios) || installed || dismissed || isStandalone()) return null;

  async function install() {
    if (working) return;
    const currentEvent = installEvent;
    if (!currentEvent) return;
    setWorking(true);
    try {
      await currentEvent.prompt();
      await currentEvent.userChoice;
    } finally {
      if (!mountedRef.current) return;
      setInstallEvent(null);
      setWorking(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sessionStorage is optional. */
    }
  }

  return (
    <aside className="install-prompt" aria-label="安装易境">
      <div>
        <strong>{ios ? "把易境添加到主屏幕" : "把易境放到主屏幕"}</strong>
        <p>{ios ? "在 Safari 中点分享，再选择“添加到主屏幕”，即可使用离线学习。" : "安装后可以更快打开学习地图，并在支持的平台使用离线缓存。"}</p>
      </div>
      <div className="install-prompt-actions">
        {installEvent ? <button type="button" className="primary-button" onClick={() => void install()} disabled={working}>
          {working ? "正在打开…" : "安装易境"}
        </button> : <button type="button" className="primary-button" onClick={dismiss}>知道了</button>}
        {installEvent && <button type="button" className="text-button" onClick={dismiss} disabled={working}>暂不提示</button>}
      </div>
    </aside>
  );
}
