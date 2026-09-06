import {
  HEXAGRAM_SEQUENCE_MEMORY_TIPS,
  HEXAGRAM_SEQUENCE_VERSE,
} from "@/content/hexagram-memory";

export function HexagramMemoryGuide() {
  return (
    <section className="hexagram-memory-guide" aria-labelledby="hexagram-memory-title">
      <div className="hexagram-memory-heading">
        <div>
          <p className="eyebrow">快速记忆 · 卦序口诀</p>
          <h2 id="hexagram-memory-title">上下经卦名次序歌</h2>
        </div>
        <p>先按短句熟悉卦名顺序，再用下面的卦象卡片反向核对。</p>
      </div>
      <div className="hexagram-memory-sections">
        {HEXAGRAM_SEQUENCE_VERSE.map((section) => (
          <article key={section.id}>
            <header><strong>{section.title}</strong><span>{section.subtitle}</span></header>
            <div className="hexagram-memory-verses">
              {section.lines.map((line) => (
                <p key={line.start}>
                  <small>{line.start}—{line.end}</small>
                  <span>{line.text}</span>
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="hexagram-memory-tips" aria-label="背诵方法">
        <strong>三步记法</strong>
        <ol>{HEXAGRAM_SEQUENCE_MEMORY_TIPS.map((tip) => <li key={tip}>{tip}</li>)}</ol>
      </div>
      <small className="hexagram-memory-source">口诀出处：朱熹《周易本义》所载《上下经卦名次序歌》；序号为本平台辅助分段。</small>
    </section>
  );
}
