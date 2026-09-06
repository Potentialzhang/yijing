import { HEXAGRAMS } from "@/core/iching";
import type { LibraryFilter, LibraryResultKind } from "@/core/content/library";
import { libraryResultHref, librarySearchVariants } from "@/core/content/library";
import { withDb } from "@/server/db";

export interface ContentLibrarySource {
  id: string;
  title: string;
  author: string | null;
  dynasty: string | null;
  edition: string | null;
  url: string | null;
  licenseLabel: string;
  rightsNote: string;
}

export interface ContentLibraryResult {
  id: string;
  kind: LibraryResultKind;
  title: string;
  subtitle: string;
  body: string;
  meta: string;
  href: string | null;
  external: boolean;
}

export interface ContentLibraryData {
  overview: {
    passageCount: number;
    judgmentCount: number;
    tuanCount: number;
    xiangCount: number;
    lineCount: number;
    commentaryCount: number;
    commentaryHexagramCount: number;
    sourceCount: number;
    knowledgeCount: number;
  };
  sources: ContentLibrarySource[];
  results: ContentLibraryResult[];
  total: number;
  databaseAvailable: boolean;
}

interface SearchRow {
  id: string;
  result_kind: LibraryResultKind;
  hexagram_id: string | null;
  line_position: number | null;
  section_kind: string | null;
  heading: string;
  body: string;
  meta: string;
  source_url: string | null;
  target_href: string | null;
  total_count: string;
}

const EMPTY_DATA: ContentLibraryData = {
  overview: {
    passageCount: 0,
    judgmentCount: 0,
    tuanCount: 0,
    xiangCount: 0,
    lineCount: 0,
    commentaryCount: 0,
    commentaryHexagramCount: 0,
    sourceCount: 0,
    knowledgeCount: 0,
  },
  sources: [],
  results: [],
  total: 0,
  databaseAvailable: false,
};

const HEXAGRAM_BY_ID = new Map(HEXAGRAMS.map((hexagram) => [hexagram.id, hexagram]));
const SEARCH_IGNORED_CHARACTERS = "，。；：、！？“”‘’「」『』《》〈〉（） ";

function sectionLabel(sectionKind: string | null, linePosition: number | null): string {
  if (sectionKind === "judgment") return "卦辞";
  if (sectionKind === "tuan") return "彖传";
  if (sectionKind === "xiang") return "象传";
  if (sectionKind === "line") return `第 ${linePosition ?? "?"} 爻`;
  return "附辞";
}

function mapSearchRow(row: SearchRow): ContentLibraryResult {
  const hexagram = row.hexagram_id ? HEXAGRAM_BY_ID.get(row.hexagram_id) : undefined;
  const prefix = hexagram ? `第 ${hexagram.kingWenNumber} 卦 · ${hexagram.name}` : "来源档案";
  const title = row.result_kind === "classic"
    ? `${prefix} · ${sectionLabel(row.section_kind, row.line_position)}`
    : row.result_kind === "commentary"
      ? `${prefix} · ${row.heading}`
      : row.heading;
  const href = libraryResultHref({
    kind: row.result_kind,
    kingWenNumber: hexagram?.kingWenNumber ?? null,
    sectionKind: row.section_kind,
    linePosition: row.line_position,
    sourceUrl: row.source_url,
    targetHref: row.target_href,
  });
  return {
    id: row.id,
    kind: row.result_kind,
    title,
    subtitle: row.result_kind === "classic" ? row.heading : row.result_kind === "knowledge" ? row.meta : prefix,
    body: row.body,
    meta: row.meta,
    href,
    external: row.result_kind === "source" && Boolean(href),
  };
}

export async function getContentLibraryData(query: string, filter: LibraryFilter): Promise<ContentLibraryData> {
  try {
    return await withDb(async (client) => {
      const [overviewResult, sourcesResult] = await Promise.all([
        client.query<{
          passage_count: string;
          judgment_count: string;
          tuan_count: string;
          xiang_count: string;
          line_count: string;
          commentary_count: string;
          commentary_hexagram_count: string;
          source_count: string;
          knowledge_count: string;
        }>(`SELECT
          (SELECT count(*) FROM content_passages WHERE review_status='verified') AS passage_count,
          (SELECT count(*) FROM content_passages WHERE review_status='verified' AND section_kind='judgment') AS judgment_count,
          (SELECT count(*) FROM content_passages WHERE review_status='verified' AND section_kind='tuan') AS tuan_count,
          (SELECT count(*) FROM content_passages WHERE review_status='verified' AND section_kind='xiang') AS xiang_count,
          (SELECT count(*) FROM content_passages WHERE review_status='verified' AND section_kind='line') AS line_count,
          (SELECT count(*) FROM content_commentaries WHERE review_status='reviewed') AS commentary_count,
          (SELECT count(DISTINCT hexagram_id) FROM content_commentaries WHERE review_status='reviewed') AS commentary_hexagram_count,
          (SELECT count(*) FROM content_sources WHERE review_status='verified') AS source_count,
          (SELECT count(*) FROM content_entries WHERE review_status IN ('reviewed','published')) AS knowledge_count`),
        client.query<{
          id: string;
          title: string;
          author: string | null;
          dynasty: string | null;
          edition: string | null;
          url: string | null;
          license_label: string;
          rights_note: string;
        }>(`SELECT id,title,author,dynasty,edition,url,license_label,rights_note
            FROM content_sources WHERE review_status='verified'
            ORDER BY CASE WHEN id='source-zhouyi-kanripo' THEN 0 ELSE 1 END,dynasty NULLS FIRST,title`),
      ]);

      const overviewRow = overviewResult.rows[0];
      const overview = {
        passageCount: Number(overviewRow.passage_count),
        judgmentCount: Number(overviewRow.judgment_count),
        tuanCount: Number(overviewRow.tuan_count),
        xiangCount: Number(overviewRow.xiang_count),
        lineCount: Number(overviewRow.line_count),
        commentaryCount: Number(overviewRow.commentary_count),
        commentaryHexagramCount: Number(overviewRow.commentary_hexagram_count),
        sourceCount: Number(overviewRow.source_count),
        knowledgeCount: Number(overviewRow.knowledge_count),
      };
      const sources = sourcesResult.rows.map((source) => ({
        id: source.id,
        title: source.title,
        author: source.author,
        dynasty: source.dynasty,
        edition: source.edition,
        url: source.url,
        licenseLabel: source.license_label,
        rightsNote: source.rights_note,
      }));

      if (!query) return { overview, sources, results: [], total: 0, databaseAvailable: true };

      const matchingHexagramIds = HEXAGRAMS
        .filter((hexagram) => `${hexagram.kingWenNumber} ${hexagram.name}`.includes(query))
        .map((hexagram) => hexagram.id);
      const variants = librarySearchVariants(query);
      const searchResult = await client.query<SearchRow>(
        `WITH matches AS (
          SELECT p.id,'classic'::text AS result_kind,p.hexagram_id,p.line_position,p.section_kind,
                 p.locator AS heading,p.original_text AS body,
                 concat_ws(' · ',s.title,p.locator) AS meta,NULL::text AS source_url,NULL::text AS target_href,1 AS kind_order
          FROM content_passages p JOIN content_sources s ON s.id=p.source_id
          WHERE $2 IN ('all','classic') AND p.review_status='verified'
            AND (EXISTS (SELECT 1 FROM unnest($1::text[]) term WHERE strpos(lower(translate(concat_ws(' ',p.original_text,p.locator),$4,'')),lower(translate(term,$4,''))) > 0)
                 OR p.hexagram_id=ANY($3::text[]))
          UNION ALL
          SELECT c.id,'commentary'::text,c.hexagram_id,c.line_position,NULL::text,
                 concat_ws(' · ',c.commentator,c.focus),concat_ws(E'\n',c.excerpt,c.summary,c.practical_hint),
                 concat_ws(' · ',c.dynasty,c.tradition,s.title,c.locator),s.url,NULL::text,2
          FROM content_commentaries c JOIN content_sources s ON s.id=c.source_id
          WHERE $2 IN ('all','commentary') AND c.review_status='reviewed'
            AND (EXISTS (SELECT 1 FROM unnest($1::text[]) term WHERE strpos(lower(translate(concat_ws(' ',c.commentator,c.dynasty,c.tradition,c.focus,c.excerpt,c.summary,c.practical_hint,s.title),$4,'')),lower(translate(term,$4,''))) > 0)
                 OR c.hexagram_id=ANY($3::text[]))
          UNION ALL
          SELECT e.id,'knowledge'::text,NULL::text,NULL::smallint,NULL::text,e.title,e.summary,
                 concat_ws(' · ',e.category,array_to_string(ARRAY(SELECT jsonb_array_elements_text(e.keywords)), '、')),NULL::text,e.target_href,3
          FROM content_entries e
          WHERE $2 IN ('all','knowledge') AND e.review_status IN ('reviewed','published')
            AND EXISTS (SELECT 1 FROM unnest($1::text[]) term WHERE strpos(lower(translate(concat_ws(' ',e.title,e.summary,e.category,e.keywords::text),$4,'')),lower(translate(term,$4,''))) > 0)
          UNION ALL
          SELECT s.id,'source'::text,NULL::text,NULL::smallint,NULL::text,s.title,
                 concat_ws(' · ',s.author,s.dynasty,s.edition),concat_ws(' · ',s.license_label,s.rights_note),s.url,NULL::text,4
          FROM content_sources s
          WHERE $2 IN ('all','source') AND s.review_status='verified'
            AND EXISTS (SELECT 1 FROM unnest($1::text[]) term WHERE strpos(lower(translate(concat_ws(' ',s.title,s.author,s.dynasty,s.edition,s.license_label,s.rights_note),$4,'')),lower(translate(term,$4,''))) > 0)
        )
        SELECT id,result_kind::text,hexagram_id,line_position,section_kind,heading,body,meta,source_url,target_href,
               count(*) OVER()::text AS total_count
        FROM matches
        ORDER BY kind_order,hexagram_id,line_position NULLS FIRST,id
        LIMIT 80`,
        [variants, filter, matchingHexagramIds, SEARCH_IGNORED_CHARACTERS],
      );
      return {
        overview,
        sources,
        results: searchResult.rows.map(mapSearchRow),
        total: Number(searchResult.rows[0]?.total_count ?? 0),
        databaseAvailable: true,
      };
    });
  } catch {
    return EMPTY_DATA;
  }
}
