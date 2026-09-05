"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

function LabPlaceholder() {
  return (
    <section className="lab-shell deferred-lab-placeholder" aria-labelledby="lab-placeholder-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">卦象实验室 · 交互练习</p>
          <h2 id="lab-placeholder-title">滚动到这里，开始组合和变爻</h2>
        </div>
      </div>
      <p>实验室会在接近视口时加载，先把首屏留给今天的学习任务。</p>
    </section>
  );
}

const LazyHexagramLab = dynamic(
  () => import("@/components/lab/HexagramLab").then((module) => module.HexagramLab),
  {
    ssr: false,
    loading: () => <LabPlaceholder />,
  },
);

type LabLoadBoundaryState = { hasError: boolean };

class LabLoadBoundary extends Component<
  { children: ReactNode },
  LabLoadBoundaryState
> {
  state: LabLoadBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LabLoadBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="lab-shell deferred-lab-error" role="alert" aria-labelledby="lab-load-error-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">卦象实验室</p>
              <h2 id="lab-load-error-title">实验室暂时没有加载成功</h2>
            </div>
          </div>
          <p>这通常是网络切换或缓存更新造成的。原有学习数据不会受影响，可以重试或打开独立实验室页面。</p>
          <div className="deferred-lab-error-actions">
            <button type="button" className="outline-button" onClick={() => window.location.reload()}>重新加载</button>
            <a className="text-button" href="/lab/hexagram">打开独立实验室</a>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

/**
 * Keep the home page's below-the-fold laboratory out of the initial client
 * bundle until the user approaches it. The stable #lab anchor remains in the
 * document so the hero action and keyboard navigation still have a target.
 */
export function DeferredHexagramLab() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const activateFromHash = () => {
      if (window.location.hash === "#lab") setShouldLoad(true);
    };
    const initialHashTimer = globalThis.setTimeout(activateFromHash, 0);
    // A few WebKit versions do not dispatch an initial IntersectionObserver
    // notification when the observed anchor starts well below the fold. Keep
    // the below-the-fold deferral, but guarantee that the lab becomes usable
    // after a short idle window instead of leaving only the placeholder.
    const idleFallbackTimer = globalThis.setTimeout(() => setShouldLoad(true), 1500);
    window.addEventListener("hashchange", activateFromHash);
    const anchor = anchorRef.current;
    if (!anchor) {
      return () => {
        globalThis.clearTimeout(initialHashTimer);
        globalThis.clearTimeout(idleFallbackTimer);
        window.removeEventListener("hashchange", activateFromHash);
      };
    }
    if (!("IntersectionObserver" in window)) {
      const fallbackTimer = globalThis.setTimeout(() => setShouldLoad(true), 0);
      return () => {
        globalThis.clearTimeout(initialHashTimer);
        globalThis.clearTimeout(fallbackTimer);
        globalThis.clearTimeout(idleFallbackTimer);
        window.removeEventListener("hashchange", activateFromHash);
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(anchor);
    return () => {
      globalThis.clearTimeout(initialHashTimer);
      globalThis.clearTimeout(idleFallbackTimer);
      window.removeEventListener("hashchange", activateFromHash);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={anchorRef}
      id="lab"
      className="deferred-lab"
      aria-busy={!shouldLoad}
    >
      {shouldLoad ? (
        <LabLoadBoundary>
          <LazyHexagramLab id="lab-content" />
        </LabLoadBoundary>
      ) : <LabPlaceholder />}
    </div>
  );
}
