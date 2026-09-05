"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type UserNote } from "@/db/schema";
import { getNote, updateNoteAtomically, upsertNoteAtomically } from "@/db/repository";
import { SourceRefEditor } from "@/components/notes/SourceRefEditor";
import { MarkdownPreview } from "@/components/notes/MarkdownPreview";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { formatLocalDateTime } from "@/core/date/local";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";

interface NoteEditorProps {
  targetId: string;
  targetType?: "concept" | "trigram" | "hexagram" | "hexagram_line" | "session";
}

export function NoteEditor({
  targetId,
  targetType = "hexagram",
}: NoteEditorProps) {
  const noteId = `${targetType}:${targetId}`;
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("还没有笔记");
  const [deleted, setDeleted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<UserNote | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const dirtyRef = useRef(false);
  const valueRef = useRef("");
  const tagsRef = useRef("");
  const deletedRef = useRef(false);
  const saveQueue = useRef(createSerialTaskQueue());
  const refreshSequence = useRef(0);
  const hasExistingSnapshot = useRef(false);
  const lastLocalWriteAt = useRef<string | null>(null);
  const undoClearTimer = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const mutationBusyRef = useRef(false);
  const headingId = `note-editor-title-${targetType}-${targetId}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  );

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    dirtyRef.current = false;
    valueRef.current = "";
    tagsRef.current = "";
    deletedRef.current = false;
    hasExistingSnapshot.current = false;
    lastLocalWriteAt.current = null;
    const refresh = () => {
      const sequence = ++refreshSequence.current;
      void getNote(noteId)
        .then((note) => {
          if (!mounted || sequence !== refreshSequence.current || dirtyRef.current) return;
          valueRef.current = note?.markdown ?? "";
          tagsRef.current = note?.tags.join(", ") ?? "";
          deletedRef.current = Boolean(note?.deletedAt);
          hasExistingSnapshot.current = Boolean(note);
          setValue(valueRef.current);
          setTags(tagsRef.current);
          setDeleted(deletedRef.current);
          // Keep the immediate local-save/delete/undo acknowledgement when
          // its own change notification loops back through this tab. A later
          // snapshot from another writer has a different updatedAt and may
          // replace the status with the generic last-saved message.
          if (note?.updatedAt !== lastLocalWriteAt.current) {
            setStatus(
              note?.deletedAt
                ? "这条笔记已删除"
                : note
                  ? `上次保存于 ${formatLocalDateTime(note.updatedAt)}`
                  : "还没有笔记",
            );
          }
        })
        .finally(() => {
          if (mounted && sequence === refreshSequence.current) setLoaded(true);
        })
        .catch(() => {
          if (mounted && sequence === refreshSequence.current) setStatus("笔记读取失败，请检查浏览器存储权限后重试");
        });
    };
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mounted = false;
      mountedRef.current = false;
      mutationBusyRef.current = false;
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      if (undoClearTimer.current !== null) {
        window.clearTimeout(undoClearTimer.current);
        undoClearTimer.current = null;
      }
    };
  }, [noteId]);

  const saveCurrent = useCallback(async () => {
    const currentValue = valueRef.current;
    const currentTags = tagsRef.current;
    // The initial debounce effect runs after every load. Avoid rewriting an
    // existing source-only note (and its updatedAt) until the user actually
    // edits this editor; clearing an existing note still sets dirtyRef and is
    // handled by the empty-snapshot branch below.
    if (deletedRef.current || !dirtyRef.current) return;
    const operation = saveQueue.current.enqueue(async () => {
      if (deletedRef.current) return;
      if (mountedRef.current) setStatus("正在保存…");
      const now = new Date().toISOString();
      const nextTags = [
        ...new Set(
          currentTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      try {
        const buildNextNote = (existing?: UserNote): UserNote | undefined => {
          // Do not create an empty record from a pristine editor, but do
          // persist an empty snapshot when an existing note is cleared. The
          // loaded-snapshot guard also prevents a pristine empty editor from
          // overwriting a note that another tab created just before this
          // editor's debounce timer runs.
          if (!currentValue && !currentTags.trim() && (!existing || !hasExistingSnapshot.current)) return undefined;
          return {
            id: noteId,
            targetType,
            targetId,
            markdown: currentValue,
            tags: nextTags,
            sourceRefs: existing?.sourceRefs ?? [],
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
        };
        const didWrite = await upsertNoteAtomically(noteId, () => buildNextNote(), (existing) => buildNextNote(existing));
        if (didWrite) hasExistingSnapshot.current = true;
        if (!didWrite) {
          if (valueRef.current === currentValue && tagsRef.current === currentTags)
            dirtyRef.current = false;
          if (mountedRef.current) setStatus("还没有笔记");
          return;
        }
        if (valueRef.current === currentValue && tagsRef.current === currentTags) {
          dirtyRef.current = false;
        }
        lastLocalWriteAt.current = now;
        notifyDataChanged();
        if (mountedRef.current) setStatus(`已保存于 ${formatLocalDateTime(now)}`);
      } catch {
        if (mountedRef.current) setStatus("保存失败，请检查浏览器存储权限后重试");
      }
    });
    await operation;
  }, [noteId, targetId, targetType]);

  useEffect(() => {
    if (deleted) return;
    const timer = window.setTimeout(() => {
      void saveCurrent();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [deleted, value, tags, saveCurrent]);

  async function deleteNote() {
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    if (mountedRef.current) setMutationBusy(true);
    try {
      const existing = await getNote(noteId);
      if (
        !existing ||
        window.confirm("确认删除这条笔记？删除后 30 秒内可以撤销。") === false
      )
        return;
      const didWrite = await saveQueue.current.enqueue(async () => {
        const now = new Date().toISOString();
        if (mountedRef.current) setStatus("正在删除…");
        const didWrite = await updateNoteAtomically(noteId, (current) => ({
          ...current,
          deletedAt: now,
          updatedAt: now,
        }));
        if (didWrite) {
          // Set the ref inside the shared queue so any autosave enqueued
          // behind this mutation observes the deleted state and exits.
          deletedRef.current = true;
          dirtyRef.current = false;
        }
        return { didWrite, now };
      });
      if (!didWrite.didWrite) {
        if (mountedRef.current) setStatus("笔记已被其他标签页移除，请刷新后重试");
        return;
      }
      lastLocalWriteAt.current = didWrite.now;
      notifyDataChanged();
      if (!mountedRef.current) return;
      setUndoSnapshot(existing);
      setDeleted(true);
      if (mountedRef.current) setStatus("已删除，可在 30 秒内撤销");
      if (undoClearTimer.current !== null) window.clearTimeout(undoClearTimer.current);
      undoClearTimer.current = window.setTimeout(() => {
        undoClearTimer.current = null;
        setUndoSnapshot(null);
      }, 30_000);
    } catch {
      if (mountedRef.current) setStatus("删除失败，请检查浏览器存储权限后重试");
    } finally {
      mutationBusyRef.current = false;
      if (mountedRef.current) setMutationBusy(false);
    }
  }

  async function undoDelete() {
    if (!undoSnapshot || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    if (mountedRef.current) setMutationBusy(true);
    try {
      const result = await saveQueue.current.enqueue(async () => {
        const now = new Date().toISOString();
        if (mountedRef.current) setStatus("正在撤销删除…");
        const didWrite = await updateNoteAtomically(noteId, (current) => {
          if (!current.deletedAt) return false;
          const restored = { ...current };
          delete restored.deletedAt;
          return { ...restored, updatedAt: now };
        });
        if (didWrite) {
          deletedRef.current = false;
          dirtyRef.current = false;
        }
        return { didWrite, now };
      });
      if (!result.didWrite) {
        if (mountedRef.current) setUndoSnapshot(null);
        if (undoClearTimer.current !== null) {
          window.clearTimeout(undoClearTimer.current);
          undoClearTimer.current = null;
        }
        if (mountedRef.current) setStatus("撤销失败：笔记已被其他标签页恢复或移除");
        return;
      }
      lastLocalWriteAt.current = result.now;
      notifyDataChanged();
      if (!mountedRef.current) return;
      setDeleted(false);
      setUndoSnapshot(null);
      if (undoClearTimer.current !== null) {
        window.clearTimeout(undoClearTimer.current);
        undoClearTimer.current = null;
      }
      setStatus("已撤销删除");
    } catch {
      if (mountedRef.current) setStatus("撤销删除失败，请稍后重试");
    } finally {
      mutationBusyRef.current = false;
      if (mountedRef.current) setMutationBusy(false);
    }
  }

  return (
    <section className="note-editor" aria-labelledby={headingId}>
      <div className="note-editor-heading">
        <div>
          <span className="content-label">个人笔记</span>
          <h2 id={headingId}>写下你自己的理解</h2>
        </div>
        <span>{loaded ? status : "正在读取…"}</span>
      </div>
      {deleted ? (
        <div className="deleted-note">
          <p>这条笔记已软删除，聚合页默认不显示。</p>
          {undoSnapshot && (
            <button
              type="button"
              className="outline-button"
              onClick={() => void undoDelete()}
              disabled={mutationBusy}
            >
              {mutationBusy ? "正在撤销…" : "撤销删除"}
            </button>
          )}
        </div>
      ) : (
        <>
          <textarea
            value={value}
            disabled={!loaded || mutationBusy}
            onChange={(event) => {
              dirtyRef.current = true;
              valueRef.current = event.target.value;
              setValue(event.target.value);
            }}
            onBlur={() => void saveCurrent()}
            placeholder="例如：我从这个卦的上下卦结构看到了……"
            aria-label="个人笔记"
          />
          <MarkdownPreview markdown={value} />
          <label className="note-tags">
            标签（用逗号分隔）
            <input
              value={tags}
              disabled={!loaded || mutationBusy}
              onChange={(event) => {
                dirtyRef.current = true;
                tagsRef.current = event.target.value;
                setTags(event.target.value);
              }}
              onBlur={() => void saveCurrent()}
              placeholder="例如：结构, 待复习, 我的例子"
            />
          </label>
          <SourceRefEditor
            noteId={noteId}
            targetType={targetType}
            targetId={targetId}
          />
          <div className="note-editor-actions">
            <button
              type="button"
              className="text-button delete-note"
              onClick={() => void deleteNote()}
              disabled={!loaded || mutationBusy}
            >
              {mutationBusy ? "正在删除…" : "删除笔记"}
            </button>
          </div>
        </>
      )}
      <small>笔记只保存在当前浏览器，可在数据设置页导出备份。</small>
    </section>
  );
}
