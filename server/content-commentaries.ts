import { withDb } from "@/server/db";

export interface HexagramCommentary {
  id: string;
  hexagramId: string;
  commentator: string;
  dynasty: string;
  tradition: string;
  focus: string;
  excerpt: string;
  summary: string;
  practicalHint: string;
  locator: string;
  source: {
    id: string;
    title: string;
    author: string | null;
    edition: string | null;
    url: string | null;
    licenseLabel: string;
  };
}

export interface HexagramPassage {
  id: string;
  sectionKind: "judgment" | "tuan" | "xiang" | "line" | "extra";
  linePosition: number | null;
  originalText: string;
  locator: string;
  contentVersion: number;
}

interface CommentaryRow {
  id: string;
  hexagram_id: string;
  commentator: string;
  dynasty: string;
  tradition: string;
  focus: string;
  excerpt: string;
  summary: string;
  practical_hint: string;
  locator: string;
  source_id: string;
  source_title: string;
  source_author: string | null;
  source_edition: string | null;
  source_url: string | null;
  license_label: string;
}

/**
 * Read reviewed built-in knowledge from PostgreSQL. Missing content is a valid
 * editorial state: the detail page keeps all canonical tools available and
 * shows which hexagrams are in the next commentary batch.
 */
export async function getHexagramCommentaries(hexagramId: string): Promise<HexagramCommentary[]> {
  try {
    const result = await withDb((client) => client.query<CommentaryRow>(
      `SELECT c.id,c.hexagram_id,c.commentator,c.dynasty,c.tradition,c.focus,c.excerpt,c.summary,c.practical_hint,c.locator,
              s.id AS source_id,s.title AS source_title,s.author AS source_author,s.edition AS source_edition,s.url AS source_url,s.license_label
       FROM content_commentaries c
       JOIN content_sources s ON s.id=c.source_id
       WHERE c.hexagram_id=$1 AND c.line_position IS NULL AND c.review_status='reviewed'
       ORDER BY c.display_order,c.commentator`,
      [hexagramId],
    ));
    return result.rows.map((row) => ({
      id: row.id,
      hexagramId: row.hexagram_id,
      commentator: row.commentator,
      dynasty: row.dynasty,
      tradition: row.tradition,
      focus: row.focus,
      excerpt: row.excerpt,
      summary: row.summary,
      practicalHint: row.practical_hint,
      locator: row.locator,
      source: {
        id: row.source_id,
        title: row.source_title,
        author: row.source_author,
        edition: row.source_edition,
        url: row.source_url,
        licenseLabel: row.license_label,
      },
    }));
  } catch {
    return [];
  }
}

/** Canonical text is served from the versioned content tables after startup seeding. */
export async function getHexagramPassages(hexagramId: string): Promise<HexagramPassage[]> {
  try {
    const result = await withDb((client) => client.query<{
      id: string;
      section_kind: HexagramPassage["sectionKind"];
      line_position: number | null;
      original_text: string;
      locator: string;
      content_version: number;
    }>(
      `SELECT id,section_kind,line_position,original_text,locator,content_version
       FROM content_passages
       WHERE hexagram_id=$1 AND review_status='verified'
       ORDER BY CASE section_kind WHEN 'judgment' THEN 1 WHEN 'tuan' THEN 2 WHEN 'xiang' THEN 3 WHEN 'line' THEN 4 ELSE 5 END,line_position,id`,
      [hexagramId],
    ));
    return result.rows.map((row) => ({
      id: row.id,
      sectionKind: row.section_kind,
      linePosition: row.line_position,
      originalText: row.original_text,
      locator: row.locator,
      contentVersion: row.content_version,
    }));
  } catch {
    return [];
  }
}
