import {
  parseBasicMarkdown,
  tokenizeMarkdownInline,
  type MarkdownBlock,
} from "@/core/notes/markdown";

function InlineText({ value }: { value: string }) {
  return (
    <>
      {tokenizeMarkdownInline(value).map((part, index) =>
        part.kind === "link" ? (
          <a
            href={part.href}
            target="_blank"
            rel="noreferrer noopener"
            key={`${part.href}-${index}`}
          >
            {part.label}
          </a>
        ) : (
          <span key={`${part.value}-${index}`}>{part.value}</span>
        ),
      )}
    </>
  );
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.kind === "heading") {
    const Heading = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
    return (
      <Heading key={`heading-${index}`}>
        <InlineText value={block.text} />
      </Heading>
    );
  }
  if (block.kind === "unordered-list" || block.kind === "ordered-list") {
    const List = block.kind === "unordered-list" ? "ul" : "ol";
    return (
      <List key={`list-${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`}>
            <InlineText value={item} />
          </li>
        ))}
      </List>
    );
  }
  if (block.kind === "quote")
    return (
      <blockquote key={`quote-${index}`}>
        {block.lines.map((line, lineIndex) => (
          <p key={`${line}-${lineIndex}`}>
            <InlineText value={line} />
          </p>
        ))}
      </blockquote>
    );
  if (block.kind === "code")
    return (
      <pre key={`code-${index}`}>
        <code>{block.value}</code>
      </pre>
    );
  return (
    <p key={`paragraph-${index}`}>
      {block.lines.map((line, lineIndex) => (
        <span key={`${line}-${lineIndex}`}>
          <InlineText value={line} />
          {lineIndex < block.lines.length - 1 && <br />}
        </span>
      ))}
    </p>
  );
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = parseBasicMarkdown(markdown);
  if (blocks.length === 0) return null;
  return (
    <div className="note-preview" aria-label="Markdown 预览">
      <span>Markdown 预览</span>
      {blocks.map(renderBlock)}
    </div>
  );
}
