import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV === "production") {
  console.warn("DATABASE_URL 未配置，账户接口将不可用。页面仍可启动。" );
}

const globalForDb = globalThis as unknown as { yijingPool?: Pool };
export const pool = globalForDb.yijingPool ?? (connectionString ? new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, query_timeout: 10_000 }) : null);
if (process.env.NODE_ENV !== "production" && pool) globalForDb.yijingPool = pool;

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error("DATABASE_UNCONFIGURED");
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

export async function migrateDatabase(): Promise<void> {
  if (!pool) return;
  await withDb(async (client) => {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const migrations: Record<number, string> = {
      1: `CREATE EXTENSION IF NOT EXISTS pgcrypto;
          CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
          CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
          CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
          CREATE TABLE IF NOT EXISTS user_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, record_type text NOT NULL, record_key text NOT NULL, payload jsonb NOT NULL, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, record_type, record_key));
          CREATE INDEX IF NOT EXISTS user_records_user_type_idx ON user_records(user_id, record_type);`,
      2: `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
          CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at);`,
      3: `CREATE TABLE IF NOT EXISTS notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, title text NOT NULL DEFAULT '', markdown text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]', source_refs jsonb NOT NULL DEFAULT '[]', deleted_at timestamptz, version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,target_type,target_id));
          CREATE TABLE IF NOT EXISTS favorites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,target_type,target_id));
          CREATE TABLE IF NOT EXISTS review_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, card_id text NOT NULL, prompt_snapshot text NOT NULL, answer_snapshot text NOT NULL, recall_grade text NOT NULL, objective_correct boolean, response_time_ms integer, reviewed_at timestamptz NOT NULL, local_date date NOT NULL);
          CREATE TABLE IF NOT EXISTS review_card_states (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, card_id text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, algorithm_version integer NOT NULL DEFAULT 1, step_index integer NOT NULL DEFAULT 0, due_date date NOT NULL, lapse_count integer NOT NULL DEFAULT 0, consecutive_passes integer NOT NULL DEFAULT 0, is_weak boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,card_id));
          CREATE TABLE IF NOT EXISTS concept_progress (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, concept_id text NOT NULL, status text NOT NULL, mastery_score numeric NOT NULL DEFAULT 0, last_studied_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,concept_id));
          CREATE TABLE IF NOT EXISTS preferences (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, key text NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key));
          CREATE TABLE IF NOT EXISTS lab_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE IF NOT EXISTS compass_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, degrees numeric NOT NULL, direction_id text NOT NULL, layer_id text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE IF NOT EXISTS compass_corrections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE IF NOT EXISTS content_errata (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type text NOT NULL, target_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE IF NOT EXISTS ai_generations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, task_kind text NOT NULL, input_scopes jsonb NOT NULL, source_ids jsonb NOT NULL, output_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`,
      4: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
          CREATE INDEX IF NOT EXISTS users_admin_idx ON users(is_admin, is_disabled);
          UPDATE users SET is_admin = true WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1) AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = true);`,
    };
    const applied = await client.query<{ version: number }>("SELECT version FROM schema_migrations");
    const done = new Set(applied.rows.map(row => row.version));
    for (const version of Object.keys(migrations).map(Number).sort((a, b) => a - b)) {
      if (done.has(version)) continue;
      await client.query("BEGIN");
      try { await client.query(migrations[version]); await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  });
}
