import pg from "pg";
import { readFileSync } from "node:fs";
const { Pool } = pg;
const commentarySeed = JSON.parse(readFileSync(new URL("../content/commentary-seed.json", import.meta.url), "utf8"));
const canonicalSeed = JSON.parse(readFileSync(new URL("../content/zhouyi-canonical.json", import.meta.url), "utf8"));
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL 未配置"); process.exit(1); }
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const migrations = [
    `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz); CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id); CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at); CREATE TABLE IF NOT EXISTS user_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, record_type text NOT NULL, record_key text NOT NULL, payload jsonb NOT NULL, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, record_type, record_key)); CREATE INDEX IF NOT EXISTS user_records_user_type_idx ON user_records(user_id, record_type);`,
    `CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at);`,
    `CREATE TABLE IF NOT EXISTS notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, title text NOT NULL DEFAULT '', markdown text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]', source_refs jsonb NOT NULL DEFAULT '[]', deleted_at timestamptz, version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, target_type, target_id)); CREATE TABLE IF NOT EXISTS favorites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,target_type,target_id)); CREATE TABLE IF NOT EXISTS review_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, card_id text NOT NULL, prompt_snapshot text NOT NULL, answer_snapshot text NOT NULL, recall_grade text NOT NULL, objective_correct boolean, response_time_ms integer, reviewed_at timestamptz NOT NULL, local_date date NOT NULL); CREATE TABLE IF NOT EXISTS review_card_states (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, card_id text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, algorithm_version integer NOT NULL DEFAULT 1, step_index integer NOT NULL DEFAULT 0, due_date date NOT NULL, lapse_count integer NOT NULL DEFAULT 0, consecutive_passes integer NOT NULL DEFAULT 0, is_weak boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,card_id)); CREATE TABLE IF NOT EXISTS concept_progress (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, concept_id text NOT NULL, status text NOT NULL, mastery_score numeric NOT NULL DEFAULT 0, last_studied_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,concept_id)); CREATE TABLE IF NOT EXISTS preferences (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, key text NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key)); CREATE TABLE IF NOT EXISTS lab_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS compass_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, degrees numeric NOT NULL, direction_id text NOT NULL, layer_id text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS compass_corrections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS content_errata (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS ai_generations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, task_kind text NOT NULL, input_scopes jsonb NOT NULL, source_ids jsonb NOT NULL, output_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes(user_id,updated_at); CREATE INDEX IF NOT EXISTS attempts_user_reviewed_idx ON review_attempts(user_id,reviewed_at);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false; ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false; CREATE INDEX IF NOT EXISTS users_admin_idx ON users(is_admin, is_disabled); UPDATE users SET is_admin = true WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1) AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = true);`,
    `CREATE TABLE IF NOT EXISTS content_sources (id text PRIMARY KEY, kind text NOT NULL, title text NOT NULL, author text, dynasty text, edition text, url text, license_label text NOT NULL, rights_note text NOT NULL, revision text, retrieved_at date, review_status text NOT NULL DEFAULT 'pending', updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS content_passages (id text PRIMARY KEY, hexagram_id text NOT NULL, line_position smallint CHECK (line_position BETWEEN 1 AND 6), section_kind text NOT NULL, original_text text NOT NULL, source_id text NOT NULL REFERENCES content_sources(id), locator text NOT NULL, source_sha256 text, review_status text NOT NULL DEFAULT 'pending', content_version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS content_passages_hexagram_idx ON content_passages(hexagram_id, section_kind, line_position); CREATE TABLE IF NOT EXISTS content_commentaries (id text PRIMARY KEY, hexagram_id text NOT NULL, line_position smallint CHECK (line_position BETWEEN 1 AND 6), source_id text NOT NULL REFERENCES content_sources(id), commentator text NOT NULL, dynasty text NOT NULL, tradition text NOT NULL, focus text NOT NULL, excerpt text NOT NULL, summary text NOT NULL, practical_hint text NOT NULL, locator text NOT NULL, display_order integer NOT NULL DEFAULT 0, review_status text NOT NULL DEFAULT 'draft', content_version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS content_commentaries_hexagram_idx ON content_commentaries(hexagram_id, line_position, display_order);`,
    `ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'; ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS provider text; ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS model text; ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS error_message text; ALTER TABLE ai_generations ALTER COLUMN output_text SET DEFAULT ''; CREATE INDEX IF NOT EXISTS ai_generations_user_created_idx ON ai_generations(user_id,created_at DESC); CREATE INDEX IF NOT EXISTS ai_generations_user_status_idx ON ai_generations(user_id,status,created_at DESC);`,
    `CREATE TABLE IF NOT EXISTS content_entries (id text PRIMARY KEY, category text NOT NULL, title text NOT NULL, summary text NOT NULL, keywords jsonb NOT NULL DEFAULT '[]', payload jsonb NOT NULL DEFAULT '{}', source_ids jsonb NOT NULL DEFAULT '[]', target_href text, review_status text NOT NULL DEFAULT 'reviewed', content_version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS content_entries_category_idx ON content_entries(category,title); CREATE INDEX IF NOT EXISTS content_entries_review_idx ON content_entries(review_status,updated_at DESC);`,
  ];
  const rows = await client.query("SELECT version FROM schema_migrations"); const done = new Set(rows.rows.map(row => row.version));
  for (let i = 0; i < migrations.length; i++) { const version = i + 1; if (done.has(version)) continue; await client.query("BEGIN"); try { await client.query(migrations[i]); await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]); await client.query("COMMIT"); console.log(`数据库迁移 v${version} 完成`); } catch (error) { await client.query("ROLLBACK"); throw error; } }

  const sourceRows = [
    {
      id: "source-zhouyi-kanripo",
      kind: "classic",
      title: "《周易》经文 · Kanripo KR1a0001",
      author: null,
      dynasty: null,
      edition: canonicalSeed.edition,
      url: `https://github.com/kanripo/KR1a0001/tree/${canonicalSeed.revision}`,
      licenseLabel: "公版古籍原文",
      rightsNote: "保留固定修订和逐文件 SHA-256，用作经文校对底本。",
      revision: canonicalSeed.revision,
      retrievedAt: canonicalSeed.retrievedAt,
      reviewStatus: "verified",
    },
    ...commentarySeed.sources,
  ];
  for (const source of sourceRows) {
    await client.query(
      `INSERT INTO content_sources(id,kind,title,author,dynasty,edition,url,license_label,rights_note,revision,retrieved_at,review_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,author=EXCLUDED.author,dynasty=EXCLUDED.dynasty,edition=EXCLUDED.edition,url=EXCLUDED.url,license_label=EXCLUDED.license_label,rights_note=EXCLUDED.rights_note,revision=EXCLUDED.revision,retrieved_at=EXCLUDED.retrieved_at,review_status=EXCLUDED.review_status,updated_at=now()`,
      [source.id, source.kind, source.title, source.author ?? null, source.dynasty ?? null, source.edition ?? null, source.url ?? null, source.licenseLabel, source.rightsNote, source.revision ?? null, source.retrievedAt ?? null, source.reviewStatus],
    );
  }

  for (const row of canonicalSeed.rows) {
    const hexagramId = `hexagram-${String(row.number).padStart(2, "0")}`;
    const passages = [
      { id: `${hexagramId}-judgment`, kind: "judgment", position: null, text: row.judgment, locator: `第 ${row.number} 卦·卦辞` },
      { id: `${hexagramId}-tuan`, kind: "tuan", position: null, text: row.tuan, locator: `第 ${row.number} 卦·彖传` },
      { id: `${hexagramId}-xiang`, kind: "xiang", position: null, text: row.xiang, locator: `第 ${row.number} 卦·象传` },
      ...row.lines.map((text, index) => ({ id: `${hexagramId}-line-${index + 1}`, kind: "line", position: index + 1, text, locator: `第 ${row.number} 卦·第 ${index + 1} 爻` })),
      ...row.extras.map((text, index) => ({ id: `${hexagramId}-extra-${index + 1}`, kind: "extra", position: null, text, locator: `第 ${row.number} 卦·附辞 ${index + 1}` })),
    ];
    for (const passage of passages) {
      await client.query(
        `INSERT INTO content_passages(id,hexagram_id,line_position,section_kind,original_text,source_id,locator,source_sha256,review_status,content_version)
         VALUES($1,$2,$3,$4,$5,'source-zhouyi-kanripo',$6,$7,'verified',2)
         ON CONFLICT(id) DO UPDATE SET original_text=EXCLUDED.original_text,locator=EXCLUDED.locator,source_sha256=EXCLUDED.source_sha256,review_status=EXCLUDED.review_status,content_version=EXCLUDED.content_version,updated_at=now()`,
        [passage.id, hexagramId, passage.position, passage.kind, passage.text, passage.locator, row.sourceSha256],
      );
    }
  }

  for (const item of commentarySeed.commentaries) {
    await client.query(
      `INSERT INTO content_commentaries(id,hexagram_id,line_position,source_id,commentator,dynasty,tradition,focus,excerpt,summary,practical_hint,locator,display_order,review_status,content_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET source_id=EXCLUDED.source_id,commentator=EXCLUDED.commentator,dynasty=EXCLUDED.dynasty,tradition=EXCLUDED.tradition,focus=EXCLUDED.focus,excerpt=EXCLUDED.excerpt,summary=EXCLUDED.summary,practical_hint=EXCLUDED.practical_hint,locator=EXCLUDED.locator,display_order=EXCLUDED.display_order,review_status=EXCLUDED.review_status,content_version=EXCLUDED.content_version,updated_at=now()`,
      [item.id, item.hexagramId, item.linePosition ?? null, item.sourceId, item.commentator, item.dynasty, item.tradition, item.focus, item.excerpt, item.summary, item.practicalHint, item.locator, item.displayOrder, item.reviewStatus, item.contentVersion],
    );
  }
  console.log(`内容库同步完成：${canonicalSeed.rows.length} 卦经文，${commentarySeed.commentaries.length} 条名家解读`);
} finally { client.release(); await pool.end(); }
