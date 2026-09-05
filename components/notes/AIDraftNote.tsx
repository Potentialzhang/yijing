"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getNote } from "@/db/repository";
import { NoteEditor } from "./NoteEditor";

function DraftLoader({ id }: { id: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => {
    let active = true;
    void getNote(`session:${id}`).then(note => {
      if (active) setState(note?.targetType === "session" && note.targetId === id ? "ready" : "missing");
    }).catch(() => { if (active) setState("missing"); });
    return () => { active = false; };
  }, [id]);
  if (state === "loading") return <p role="status">正在读取笔记…</p>;
  if (state === "missing") return <p role="status">当前浏览器没有这篇草稿，请回到笔记库查找或导入备份。</p>;
  return <NoteEditor targetType="session" targetId={id} />;
}

export function AIDraftNote() {
  const id = useSearchParams().get("id") ?? "";
  if (!/^ai-draft-[a-f0-9-]{36}$/.test(id)) return <p>请选择笔记库中的 AI 辅学笔记。</p>;
  return <DraftLoader key={id} id={id} />;
}
