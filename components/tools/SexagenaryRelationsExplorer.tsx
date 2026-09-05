"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EARTHLY_BRANCHES, HEAVENLY_STEMS } from "@/content/sexagenary";
import { SEXAGENARY_RELATIONS, type SexagenaryRelationKind, relationName } from "@/content/sexagenary-relations";

const modes: readonly { id: SexagenaryRelationKind; label: string; description: string }[] = [
  { id: "stem-combination", label: "天干五合", description: "先记五组配对；结果五行和成立条件暂作为来源待复核字段。" },
  { id: "branch-combination", label: "地支六合", description: "先记六组相合配对，不由工具自动推导个人结论。" },
  { id: "branch-clash", label: "地支六冲", description: "先记六组相冲配对，解释必须带流派和来源。" },
];

export function SexagenaryRelationsExplorer() {
  const [mode, setMode] = useState<SexagenaryRelationKind>("stem-combination");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const modeFocusTarget = useRef<SexagenaryRelationKind | null>(null);
  const currentMode = modes.find((item) => item.id === mode) ?? modes[0];
  const relations = useMemo(() => SEXAGENARY_RELATIONS.filter((item) => item.kind === mode), [mode]);
  const selected = relations.find((item) => item.id === selectedId) ?? relations[0];
  const pool = mode === "stem-combination" ? HEAVENLY_STEMS : EARTHLY_BRANCHES;
  const getName = (id: string) => pool.find((item) => item.id === id)?.name ?? id;

  function changeMode(next: SexagenaryRelationKind) {
    setMode(next);
    setSelectedId(null);
  }

  useEffect(() => {
    const target = modeFocusTarget.current;
    if (target === null) return;
    modeFocusTarget.current = null;
    document.querySelector<HTMLButtonElement>(
      `.sexagenary-relations .relation-mode button[data-mode="${target}"]`,
    )?.focus();
  }, [mode]);

  function moveMode(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? modes.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + modes.length) % modes.length
          : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = modes[nextIndex];
    modeFocusTarget.current = next.id;
    changeMode(next.id);
  }

  return (
    <section className="sexagenary-relations" aria-label="干支关系图">
      <div className="relation-mode" role="tablist" aria-label="干支关系体系">
        {modes.map((item, index) => (
          <button
            type="button"
            role="tab"
            id={`sexagenary-mode-${item.id}`}
            data-mode={item.id}
            tabIndex={mode === item.id ? 0 : -1}
            key={item.id}
            className={mode === item.id ? "selected" : ""}
            aria-selected={mode === item.id}
            aria-controls="sexagenary-mode-panel"
            onKeyDown={(event) => moveMode(event, index)}
            onClick={() => changeMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="sexagenary-mode-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`sexagenary-mode-${mode}`}
      >
        <p className="relation-description">{currentMode.description}</p>
        <div className="sexagenary-relation-layout">
          <div className="sexagenary-relation-list">
            {relations.map((relation) => (
              <button
                type="button"
                key={relation.id}
                className={selected?.id === relation.id ? "selected" : ""}
                aria-pressed={selected?.id === relation.id}
                onClick={() => setSelectedId(relation.id)}
              >
                <span>{relationName(relation)}</span>
                <strong>{relation.title}</strong>
              </button>
            ))}
          </div>
          {selected && (
            <article className="sexagenary-relation-detail" role="status" aria-live="polite" aria-atomic="true">
              <span className="content-label">关系字段 · 待复核</span>
              <h2>{selected.title}</h2>
              <p>
                {getName(selected.leftId)} + {getName(selected.rightId)} 是一组
                {mode === "stem-combination"
                  ? "天干五合"
                  : mode === "branch-combination"
                    ? "地支六合"
                    : "地支六冲"}
                记忆项。
              </p>
              {selected.resultElement && (
                <div className="relation-result">
                  <span>传统结果五行提示</span>
                  <strong>{selected.resultElement}</strong>
                </div>
              )}
              <p className="relation-caution">{selected.explanation}</p>
              <small>当前只作为学习卡片，不进行历法计算、合化判断或吉凶预测。</small>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
