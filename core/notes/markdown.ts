export type MarkdownInlinePart =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; href: string };

import { isValidHttpUrl } from "@/core/links";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; language: string; value: string };

export function sanitizeMarkdownHref(value: string): string | null {
  const href = value.trim();
  if (/^https:\/\//i.test(href) && isValidHttpUrl(href)) return href;
  if (/^mailto:/i.test(href)) {
    const address = href.slice("mailto:".length).split(/[?#]/, 1)[0] ?? "";
    if (/^[^\s@]+@[^\s@]+$/.test(address)) return href;
  }
  return null;
}

export function tokenizeMarkdownInline(value: string): MarkdownInlinePart[] {
  const parts: MarkdownInlinePart[] = [];
  let cursor = 0;
  const pattern = /\[([^\]]+)\]\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const index = match.index;
    if (index < cursor) continue;
    let depth = 1;
    let end = index + match[0].length;
    while (end < value.length && depth > 0) {
      if (value[end] === "(") depth += 1;
      if (value[end] === ")") depth -= 1;
      end += 1;
    }
    if (depth !== 0) break;
    if (index > cursor)
      parts.push({ kind: "text", value: value.slice(cursor, index) });
    const href = sanitizeMarkdownHref(
      value.slice(index + match[0].length, end - 1),
    );
    const raw = value.slice(index, end);
    if (href) parts.push({ kind: "link", label: match[1], href });
    else parts.push({ kind: "text", value: raw });
    cursor = end;
  }
  if (cursor < value.length)
    parts.push({ kind: "text", value: value.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: "text", value }];
}

export function parseBasicMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage = "";
  let listKind: "unordered-list" | "ordered-list" | null = null;
  let listItems: string[] = [];
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listKind && listItems.length > 0)
      blocks.push({ kind: listKind, items: listItems });
    listKind = null;
    listItems = [];
  };
  const flushQuote = () => {
    if (quoteLines.length > 0) {
      blocks.push({ kind: "quote", lines: quoteLines });
      quoteLines = [];
    }
  };

  for (const line of lines) {
    if (codeLines) {
      if (/^```\s*$/.test(line)) {
        blocks.push({
          kind: "code",
          language: codeLanguage,
          value: codeLines.join("\n"),
        });
        codeLines = null;
        codeLanguage = "";
      } else codeLines.push(line);
      continue;
    }
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      flushQuote();
      codeLines = [];
      codeLanguage = fence[1] ?? "";
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (listKind !== "unordered-list") {
        flushList();
        listKind = "unordered-list";
      }
      listItems.push(unordered[1]);
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listKind !== "ordered-list") {
        flushList();
        listKind = "ordered-list";
      }
      listItems.push(ordered[1]);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line);
  }
  if (codeLines)
    blocks.push({
      kind: "code",
      language: codeLanguage,
      value: codeLines.join("\n"),
    });
  flushParagraph();
  flushList();
  flushQuote();
  return blocks;
}
