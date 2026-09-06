import Link from "next/link";
import { normalizeLibraryFilter, normalizeLibraryQuery, type LibraryResultKind } from "@/core/content/library";
import { getContentLibraryData, type ContentLibraryResult } from "@/server/content-library";

export const dynamic = "force-dynamic";

const FILTER_LABELS = {
  all: "全部内容",
  classic: "经传原文",
  commentary: "名家解读",
  knowledge: "基础知识",
  source: "来源档案",
} as const;

const KIND_LABELS: Record<LibraryResultKind, string> = {
  classic: "经传",
  commentary: "解读",
  knowledge: "知识",
  source: "来源",
};

function ResultCard({ item }: { item: ContentLibraryResult }) {
  const content = (
    <article className="library-result-card">
      <header>
        <span data-kind={item.kind}>{KIND_LABELS[item.kind]}</span>
        <small>{item.subtitle}</small>
      </header>
      <h2>{item.title}</h2>
      <p>{item.body}</p>
      <footer><small>{item.meta}</small><strong>{item.external ? "查看原始来源 ↗" : item.kind === "knowledge" ? "打开相关工具 →" : "定位到本卦 →"}</strong></footer>
    </article>
  );
  if (!item.href) return content;
  return item.external
    ? <a className="library-result-link" href={item.href} target="_blank" rel="noreferrer noopener">{content}</a>
    : <Link className="library-result-link" href={item.href}>{content}</Link>;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = normalizeLibraryQuery(params.q);
  const filter = normalizeLibraryFilter(params.type);
  const data = await getContentLibraryData(query, filter);
  const coveragePercent = Math.round(data.overview.commentaryHexagramCount / 64 * 100);

  return (
    <main className="subpage library-page">
      <header className="subpage-header library-header">
        <Link href="/tools" className="back-link">← 返回工具</Link>
        <p className="eyebrow">经传 · 注疏 · 来源可追溯</p>
        <h1>易学知识库</h1>
        <p className="subpage-lead">从一个词出发，同时检索卦辞、彖传、象传、六爻、历代解读，以及五行、八卦、干支、河洛九宫和二十四山。</p>
      </header>

      <section className="library-search-panel" aria-label="知识库搜索">
        <form action="/library" method="get" className="library-search-form">
          <label htmlFor="library-query">检索内容</label>
          <div className="library-search-row">
            <input id="library-query" name="q" defaultValue={query} maxLength={80} placeholder="例如：亢龙、程颐、相生、甲木、子山" autoComplete="off" />
            <select name="type" defaultValue={filter} aria-label="内容类型">
              {Object.entries(FILTER_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <button type="submit" className="primary-button">搜索</button>
          </div>
        </form>
        <div className="library-search-examples"><span>试着查：</span>{["元亨利贞", "程颐", "相生", "甲木", "子山"].map((example) => <Link key={example} href={`/library?q=${encodeURIComponent(example)}`}>{example}</Link>)}</div>
      </section>

      {!data.databaseAvailable ? (
        <section className="library-message" role="status"><strong>知识库暂时无法连接数据库</strong><p>请确认 PostgreSQL 已启动并完成内容种子同步；其他静态学习工具仍可使用。</p></section>
      ) : query ? (
        <section className="library-results" aria-live="polite">
          <div className="section-heading"><div><p className="eyebrow">搜索结果 · {FILTER_LABELS[filter]}</p><h2>“{query}”找到 {data.total} 条</h2></div>{data.total > 80 ? <small>当前展示前 80 条，请增加关键词缩小范围。</small> : null}</div>
          {data.results.length > 0
            ? <div className="library-result-list">{data.results.map((item) => <ResultCard key={`${item.kind}-${item.id}`} item={item} />)}</div>
            : <div className="library-message"><strong>没有找到匹配内容</strong><p>可以改用卦名、原文短句、作者姓名或“义理”“占筮”等流派词搜索。</p></div>}
        </section>
      ) : (
        <>
          <section className="library-overview" aria-label="内容库概况">
            <div className="library-stat-card library-stat-primary"><span>可检索经传</span><strong>{data.overview.passageCount}</strong><small>64 卦完整分段</small></div>
            <div className="library-stat-card"><span>卦辞 / 彖传 / 象传</span><strong>{data.overview.judgmentCount} / {data.overview.tuanCount} / {data.overview.xiangCount}</strong><small>逐篇可定位</small></div>
            <div className="library-stat-card"><span>六爻原文</span><strong>{data.overview.lineCount}</strong><small>点击结果直达对应爻</small></div>
            <div className="library-stat-card"><span>已审校名家解读</span><strong>{data.overview.commentaryCount}</strong><small>覆盖 {data.overview.commentaryHexagramCount} / 64 卦 · {coveragePercent}%</small></div>
            <div className="library-stat-card"><span>基础知识条目</span><strong>{data.overview.knowledgeCount}</strong><small>五行、八卦、干支、九宫与罗盘</small></div>
          </section>

          <section className="library-guide">
            <div><p className="eyebrow">怎么使用</p><h2>同一句话，分三层查。</h2></div>
            <ol><li><strong>先看经文</strong><span>确认卦辞、彖传、象传和爻辞原句。</span></li><li><strong>再看解读</strong><span>比较注疏、义理和占筮传统的问题意识。</span></li><li><strong>最后回到卦位</strong><span>结合上下卦、爻位和关系卦形成自己的理解。</span></li></ol>
          </section>

          <section className="library-sources-section">
            <div className="section-heading"><div><p className="eyebrow">来源档案 · {data.overview.sourceCount} 部</p><h2>每条内容都能追到出处。</h2></div><Link className="link-arrow" href="/settings/content">查看内容治理 →</Link></div>
            <div className="library-source-grid">{data.sources.map((source) => (
              <article className="library-source-card" key={source.id}>
                <span>{source.dynasty ?? "经文底本"}</span><h3>{source.title}</h3><p>{[source.author, source.edition].filter(Boolean).join(" · ")}</p><small>{source.licenseLabel}</small>
                {source.url ? <a href={source.url} target="_blank" rel="noreferrer noopener">查看原始来源 ↗</a> : null}
              </article>
            ))}</div>
          </section>
        </>
      )}
    </main>
  );
}
