"use client";

import { useEffect, useRef } from "react";
import { NoteEntry } from "@/components/notes/NoteEntry";
import { shouldOpenNoteShortcut } from "@/core/notes/shortcut";

function lineLabel(index: number): string {
  return `${index === 0 ? "初" : index === 5 ? "上" : ["二", "三", "四", "五"][index - 1]}爻`;
}

function editableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.isContentEditable || element?.closest("input, textarea, select, [contenteditable='true']"));
}

export function HexagramNotesShortcut({ hexagramId }: { hexagramId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldOpenNoteShortcut({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        editableTarget: editableTarget(event.target),
      })) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button type="button" className="notes-shortcut-button" onClick={open} aria-keyshortcuts="N">
        打开本卦笔记 <kbd>N</kbd>
      </button>
      <dialog className="hexagram-notes-dialog" ref={dialogRef} onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}>
        <div className="hexagram-notes-dialog-shell">
          <header><div><span className="eyebrow">个人笔记 · 自动保存至账户数据库</span><h2>本卦与六爻笔记</h2></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="关闭笔记">×</button></header>
          <div className="hexagram-notes-dialog-content">
            <NoteEntry targetId={hexagramId} label="本卦整体笔记" />
            {Array.from({ length: 6 }, (_, index) => (
              <NoteEntry key={index} targetType="hexagram_line" targetId={`${hexagramId}-${index + 1}`} label={`${lineLabel(index)}笔记`} />
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
