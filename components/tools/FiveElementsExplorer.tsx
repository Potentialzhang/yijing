"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FIVE_ELEMENTS } from "@/content/five-elements";

type ElementId = (typeof FIVE_ELEMENTS)[number]["id"];

export function FiveElementsExplorer() {
  type RelationMode = "both" | "generate" | "control";
  const [selectedId, setSelectedId] = useState<ElementId>(FIVE_ELEMENTS[0].id);
  const [mode, setMode] = useState<RelationMode>("both");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("element");
      if (FIVE_ELEMENTS.some((element) => element.id === requested)) setSelectedId(requested as ElementId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const selected = FIVE_ELEMENTS.find((element) => element.id === selectedId) ?? FIVE_ELEMENTS[0];
  const generatesMe = FIVE_ELEMENTS.find((element) => element.generates === selected.name);
  const controlsMe = FIVE_ELEMENTS.find((element) => element.controls === selected.name);
  return (
    <section className="five-elements-explorer">
      <div className="element-wheel">
        <div className="relation-mode" role="group" aria-label="关系显示模式">
          <button type="button" className={mode === "both" ? "selected" : ""} onClick={() => setMode("both")} aria-pressed={mode === "both"}>同时显示</button>
          <button type="button" className={mode === "generate" ? "selected" : ""} onClick={() => setMode("generate")} aria-pressed={mode === "generate"}>相生</button>
          <button type="button" className={mode === "control" ? "selected" : ""} onClick={() => setMode("control")} aria-pressed={mode === "control"}>相克</button>
        </div>
        {FIVE_ELEMENTS.map((element) => (
          <button type="button" key={element.id} className={element.id === selected.id ? "selected" : ""} style={{ "--element-color": element.color } as CSSProperties} onClick={() => setSelectedId(element.id)} aria-pressed={element.id === selected.id}>
            <strong>{element.name}</strong>
          </button>
        ))}
      </div>
      <div className="element-detail">
        <span className="content-label">当前元素 · {mode === "both" ? "相生相克" : mode === "generate" ? "相生" : "相克"}</span>
        <h2>{selected.name} · {selected.nature}</h2>
        <p>
          {(mode === "both" || mode === "generate") && <>相生：{selected.name}生{selected.generates}。</>}
          {(mode === "both" || mode === "control") && <>相克：{selected.name}克{selected.controls}。</>}
        </p>
        <div className="element-relations">
          {(mode === "both" || mode === "generate") && <>
            <div><span>我生</span><strong>{selected.generates}</strong></div>
            <div><span>生我</span><strong>{generatesMe?.name}</strong></div>
          </>}
          {(mode === "both" || mode === "control") && <>
            <div><span>我克</span><strong>{selected.controls}</strong></div>
            <div><span>克我</span><strong>{controlsMe?.name}</strong></div>
          </>}
        </div>
        <div
          className="element-relation-explanations"
          aria-label="关系说明"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {(mode === "both" || mode === "generate") && (
            <p><strong>相生方向：</strong>{selected.name}是施生方，{selected.generates}是受生方；本工具只用于记忆关系方向。</p>
          )}
          {(mode === "both" || mode === "control") && (
            <p><strong>相克方向：</strong>{selected.name}是施克方，{selected.controls}是受克方；本工具只用于记忆关系方向。</p>
          )}
        </div>
      </div>
    </section>
  );
}
