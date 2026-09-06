"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HEXAGRAMS, TRIGRAMS } from "@/core/iching";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { type FavoriteRecord, type UserNote } from "@/db/schema";
import { readKnowledgeBaseSnapshot } from "@/db/repository";
import { compareIsoTimestamps, formatLocalDateTime } from "@/core/date/local";
import { buildNoteSearchText } from "@/core/notes/search";
import { parseHexagramLineTarget } from "@/core/notes/targets";

type FavoriteItem = FavoriteRecord & {
  title: string;
  typeLabel: string;
  href?: string;
  available: boolean;
};

function favoriteItem(record: FavoriteRecord): FavoriteItem {
  if (record.targetType === "hexagram") {
    const hexagram = HEXAGRAMS.find((item) => item.id === record.targetId);
    return {
      ...record,
      title: hexagram?.name ?? `内容已不可用（${record.targetId}）`,
      typeLabel: hexagram ? "六十四卦" : "六十四卦 · 内容不可用",
      href: hexagram ? `/hexagrams/${hexagram.kingWenNumber}` : undefined,
      available: Boolean(hexagram),
    };
  }
  if (record.targetType === "trigram") {
    const trigram = TRIGRAMS.find((item) => item.id === record.targetId);
    return {
      ...record,
      title: trigram ? `${trigram.name} · ${trigram.nature}` : `内容已不可用（${record.targetId}）`,
      typeLabel: trigram ? "八卦" : "八卦 · 内容不可用",
      href: trigram ? `/trigrams/${trigram.id}` : undefined,
      available: Boolean(trigram),
    };
  }
  const concept = KNOWLEDGE_CONCEPTS.find((item) => item.id === record.targetId);
  return {
    ...record,
    title: concept?.title ?? `内容已不可用（${record.targetId}）`,
    typeLabel: concept ? "知识点" : "知识点 · 内容不可用",
    href: concept ? `/learn/${concept.id}` : undefined,
    available: Boolean(concept),
  };
}

function contentTitle(targetType: UserNote["targetType"] | FavoriteRecord["targetType"], targetId: string): string {
  if (targetType === "hexagram") return HEXAGRAMS.find((item) => item.id === targetId)?.name ?? targetId;
  if (targetType === "trigram") {
    const trigram = TRIGRAMS.find((item) => item.id === targetId);
    return trigram ? `${trigram.name} · ${trigram.nature}` : targetId;
  }
  if (targetType === "concept") return KNOWLEDGE_CONCEPTS.find((item) => item.id === targetId)?.title ?? targetId;
  if (targetType === "hexagram_line") {
    const parsed = parseHexagramLineTarget(targetId);
    const hexagram = parsed ? HEXAGRAMS.find((item) => item.id === parsed.hexagramId) : undefined;
    return parsed
      ? `${hexagram?.name ?? parsed.hexagramId} · 第${parsed.position}爻`
      : `${targetId} · 单爻`;
  }
  return `复习会话 · ${targetId}`;
}

function contextLabel(note: UserNote): string {
  if (note.targetType === "session" && note.targetId.startsWith("ai-draft-")) return "AI 辅学笔记";
  if (note.targetType === "hexagram") return "六十四卦";
  if (note.targetType === "trigram") return "八卦";
  if (note.targetType === "concept") return "知识点";
  if (note.targetType === "hexagram_line") return "单爻";
  return "复习会话";
}

function sourceSummary(note: UserNote): string {
  const sourceRefs = note.sourceRefs ?? [];
  if (sourceRefs.length === 0) return "暂无来源";
  const labels = sourceRefs
    .map((source) => source.label.trim())
    .filter(Boolean)
    .slice(0, 2);
  const overflow = sourceRefs.length - labels.length;
  return `来源 ${sourceRefs.length} 条${labels.length ? ` · ${labels.join("、")}` : ""}${overflow > 0 ? ` 等 ${overflow} 条` : ""}`;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readKnowledgeBaseSnapshot().then(({ notes: nextNotes, favorites: nextFavorites }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      setNotes(nextNotes.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)));
      setFavorites(nextFavorites);
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const activeNotes = notes.filter((note) => {
    if (note.deletedAt) return false;
    // Keep an empty snapshot for editor/restore consistency, but do not show
    // it as a useful aggregate item until it has content or metadata again.
    return Boolean(
      note.title?.trim() ||
        note.markdown.trim() ||
        note.tags.length > 0 ||
        (note.sourceRefs?.length ?? 0) > 0,
    );
  });
  const tags = useMemo(
    () => [...new Set(activeNotes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [activeNotes],
  );
  const targetOptions = useMemo(() => {
    const options = new Map<string, string>();
    activeNotes.forEach((note) => options.set(`${note.targetType}:${note.targetId}`, `${contextLabel(note)} · ${contentTitle(note.targetType, note.targetId)}`));
    favorites.forEach((record) => {
      const item = favoriteItem(record);
      options.set(`${record.targetType}:${record.targetId}`, `${item.typeLabel} · ${item.title}`);
    });
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  }, [activeNotes, favorites]);
  if (loading) {
    return <main className="subpage database-loading" aria-live="polite"><span className="eyebrow">个人知识库</span><h1>正在读取账户笔记…</h1><p className="subpage-lead">正在从账户数据库整理笔记、收藏和来源索引。</p></main>;
  }
  if (loadError) {
    return <main className="subpage error-state" role="alert"><span className="eyebrow">个人知识库</span><h1>笔记暂时无法读取。</h1><p className="subpage-lead">请检查网络和账户会话后重试；数据库中的记录不会因本次读取失败而被删除。</p><div className="error-actions"><button type="button" className="primary-button" onClick={refresh}>重新读取 <span>↻</span></button><Link className="outline-button" href="/">回到今日</Link></div></main>;
  }
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = activeNotes.filter((note) => {
    const sourceRefs = note.sourceRefs ?? [];
    const matchesQuery = buildNoteSearchText(note, contentTitle(note.targetType, note.targetId))
      .toLowerCase()
      .includes(normalizedQuery);
    const matchesType = typeFilter === "all" || note.targetType === typeFilter;
    const matchesTarget = targetFilter === "all" || targetFilter === `${note.targetType}:${note.targetId}`;
    const matchesTag = tagFilter === "all" || note.tags.includes(tagFilter);
    const matchesSource = sourceFilter === "all" || sourceRefs.some((source) => (source.kind ?? "personal") === sourceFilter);
    return matchesQuery && matchesType && matchesTarget && matchesTag && matchesSource;
  }).sort((a, b) => sortOrder === "newest" ? compareIsoTimestamps(b.updatedAt, a.updatedAt) : compareIsoTimestamps(a.updatedAt, b.updatedAt));
  const filteredFavorites = favorites.map(favoriteItem).filter((item) => {
    const matchesQuery = `${item.title} ${item.targetId}`.toLowerCase().includes(normalizedQuery);
    const matchesType = typeFilter === "all" || item.targetType === typeFilter;
    const matchesTarget = targetFilter === "all" || targetFilter === `${item.targetType}:${item.targetId}`;
    // Favorites do not carry tags or source references; selecting either
    // filter therefore intentionally excludes them instead of implying a match.
    return matchesQuery && matchesType && matchesTarget && tagFilter === "all" && sourceFilter === "all";
  }).sort((a, b) => sortOrder === "newest" ? compareIsoTimestamps(b.createdAt, a.createdAt) : compareIsoTimestamps(a.createdAt, b.createdAt));
  const contextHref = (note: UserNote): string | undefined => {
    if (note.targetType === "hexagram") {
      const hexagram = HEXAGRAMS.find((item) => item.id === note.targetId);
      return hexagram ? `/hexagrams/${hexagram.kingWenNumber}` : undefined;
    }
    if (note.targetType === "trigram") {
      return TRIGRAMS.some((item) => item.id === note.targetId) ? `/trigrams/${note.targetId}` : undefined;
    }
    if (note.targetType === "concept") {
      return KNOWLEDGE_CONCEPTS.some((item) => item.id === note.targetId) ? `/learn/${note.targetId}` : undefined;
    }
    if (note.targetType === "hexagram_line") {
      const parsed = parseHexagramLineTarget(note.targetId);
      const hexagram = parsed ? HEXAGRAMS.find((item) => item.id === parsed.hexagramId) : undefined;
      return parsed && hexagram ? `/hexagrams/${hexagram.kingWenNumber}#line-${parsed.position}` : undefined;
    }
    if (note.targetType === "session" && note.targetId.startsWith("ai-draft-")) return `/notes/draft?id=${encodeURIComponent(note.targetId)}`;
    return note.targetType === "session" ? "/review" : undefined;
  };

  const renderNote = (note: UserNote) => {
    const href = contextHref(note);
    const title = contentTitle(note.targetType, note.targetId);
    const summary = note.markdown ? `${note.markdown.slice(0, 48)}${note.markdown.length > 48 ? "…" : ""}` : "未添加正文（仅来源/标签）";
    const meta = `${title} · ${note.tags.length ? `#${note.tags.join(" #")} · ` : ""}${formatLocalDateTime(note.updatedAt)}`;
    const sourceMeta = sourceSummary(note);
    if (!href) {
      return <div className="note-list-item is-unavailable" key={note.id}><span className="note-type">{contextLabel(note)} · 内容不可用</span><strong>{summary}</strong><small>{meta} · 该笔记指向的内容已不在当前内容版本中，请检查数据迁移或备份。</small><small className="note-source-meta">{sourceMeta}</small></div>;
    }
    return <Link href={href} className="note-list-item" key={note.id}><span className="note-type">{contextLabel(note)}</span><strong>{summary}</strong><small>{meta} · 查看上下文 ↗</small><small className="note-source-meta">{sourceMeta}</small></Link>;
  };
  const totalVisible = filtered.length + filteredFavorites.length;

  return (
    <main className="subpage">
      <header className="subpage-header">
        <Link href="/" className="back-link">← 回到今日</Link>
        <p className="eyebrow">个人知识库 · 账户数据库</p>
        <h1>把理解留下来。</h1>
        <p className="subpage-lead">笔记、收藏与来源保存到当前账户数据库。先在详情页留下自己的理解，再回到这里按内容和上下文回看。</p>
      </header>
      <div className="notes-toolbar">
        <label>搜索笔记与收藏<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入卦名、关键词、标签或来源" /></label>
        <label>上下文<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">全部类型</option><option value="concept">知识点</option><option value="trigram">八卦</option><option value="hexagram">六十四卦</option><option value="hexagram_line">单爻</option><option value="session">复习会话</option></select></label>
        <label>标签<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">全部标签</option>{tags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select></label>
        <label>来源<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">全部来源</option><option value="book">书籍</option><option value="video">视频</option><option value="web">网页</option><option value="classic">经典</option><option value="personal">个人</option></select></label>
        <label>排序<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label>
        <label>具体内容<select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">全部内容</option>{targetOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <span>{totalVisible} 条</span>
      </div>
      <section className="notes-list" aria-labelledby="notes-heading">
        <div className="section-heading">
          <div><span className="eyebrow">可回到原上下文</span><h2 id="notes-heading">个人笔记</h2></div>
          <span>{filtered.length} 条</span>
        </div>
        {activeNotes.length === 0 ? <div className="empty-state"><span>✎</span><h2>还没有笔记</h2><p>打开一个六十四卦详情页，写下第一条自己的解释。</p><Link href="/hexagrams/1" className="outline-button">去看乾卦 <span>↗</span></Link></div> : filtered.length === 0 ? <div className="empty-state"><span>⌕</span><h2>没有匹配笔记</h2><p>换一个关键词，或者清空搜索条件。</p></div> : filtered.map(renderNote)}
      </section>
      <section className="favorites-list" aria-labelledby="favorites-heading">
        <div className="section-heading">
          <div><span className="eyebrow">稍后回看的入口</span><h2 id="favorites-heading">我的收藏</h2></div>
          <span>{filteredFavorites.length} 条</span>
        </div>
        {!favorites.length ? <p className="favorites-empty">还没有收藏。打开知识点、八卦或六十四卦详情页即可收藏。</p> : !filteredFavorites.length ? <p className="favorites-empty">当前筛选条件下没有匹配收藏。</p> : filteredFavorites.map((item) => item.available && item.href ? <Link href={item.href} className="note-list-item favorite-list-item" key={item.id}><span className="note-type">★ {item.typeLabel}</span><strong>{item.title}</strong><small>{formatLocalDateTime(item.createdAt)} · 查看详情 ↗</small></Link> : <div className="note-list-item favorite-list-item is-unavailable" key={item.id}><span className="note-type">{item.typeLabel}</span><strong>{item.title}</strong><small>该收藏指向的内容已不在当前内容版本中，请检查数据迁移或备份。</small></div>)}
      </section>
    </main>
  );
}
