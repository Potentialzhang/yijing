"use client";

import { useId } from "react";
import { NoteEditor } from "@/components/notes/NoteEditor";

interface NoteEntryProps {
  targetId: string;
  targetType?: "concept" | "trigram" | "hexagram" | "hexagram_line" | "session";
  label?: string;
}

/** Keeps long-form notes out of the primary reading flow until requested. */
export function NoteEntry({ targetId, targetType = "hexagram", label = "打开个人笔记" }: NoteEntryProps) {
  const id = useId();
  return (
    <details className="note-entry">
      <summary aria-controls={id}>{label}<span aria-hidden="true">＋</span></summary>
      <div id={id} className="note-entry-body"><NoteEditor targetId={targetId} targetType={targetType} /></div>
    </details>
  );
}
