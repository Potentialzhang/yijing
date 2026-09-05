import type { UserNote } from "@/db/schema";

const SOURCE_KIND_LABELS: Record<string, string> = {
  classic: "经典",
  book: "书籍",
  video: "视频",
  web: "网页",
  personal: "个人",
};

/**
 * Build the searchable projection used by the knowledge-base page.
 *
 * Source metadata is part of a note's context: a learner should be able to
 * find a note by book author, edition/page locator, video timestamp, URL, or
 * web access date—not only by the source label shown in the list.
 */
export function buildNoteSearchText(
  note: Pick<UserNote, "title" | "markdown" | "targetId" | "tags" | "sourceRefs">,
  contextTitle = "",
): string {
  const sourceTokens = (note.sourceRefs ?? []).flatMap((source) => {
    // Legacy notes may omit `kind`; the aggregation filter treats those
    // references as personal, so the text search must expose the same label.
    const kind = source.kind ?? "personal";
    return [
      source.label,
      kind,
      SOURCE_KIND_LABELS[kind] ?? "",
      source.author ?? "",
      source.edition ?? "",
      source.locator ?? "",
      source.url ?? "",
      source.accessedAt ?? "",
    ];
  });
  return [
    note.title ?? "",
    note.markdown,
    note.targetId,
    contextTitle,
    note.tags.join(" "),
    ...sourceTokens,
  ].join(" ");
}
