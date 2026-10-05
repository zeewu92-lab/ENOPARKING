import { neon } from '@neondatabase/serverless';

let sqlClient = null;
let schemaReady = null;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未設定');
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function baozhengSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = getSql();
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS eng_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        recovery_email TEXT,
        recovery_phone_country_code TEXT,
        recovery_phone TEXT,
        avatar TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )`,
      sql`ALTER TABLE eng_users ADD COLUMN IF NOT EXISTS recovery_email TEXT`,
      sql`ALTER TABLE eng_users ADD COLUMN IF NOT EXISTS recovery_phone_country_code TEXT`,
      sql`ALTER TABLE eng_users ADD COLUMN IF NOT EXISTS recovery_phone TEXT`,
      sql`CREATE TABLE IF NOT EXISTS eng_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE TABLE IF NOT EXISTS eng_user_state (
        user_id TEXT PRIMARY KEY REFERENCES eng_users(id) ON DELETE CASCADE,
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE TABLE IF NOT EXISTS eng_wrong_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        error_type TEXT NOT NULL DEFAULT 'spelling_error',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS eng_wrong_events_user_word_idx ON eng_wrong_events(user_id, word)`,
      sql`CREATE INDEX IF NOT EXISTS eng_sessions_expiry_idx ON eng_sessions(expires_at)`,
      sql`CREATE TABLE IF NOT EXISTS eng_admin_setup (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        used_at TIMESTAMPTZ
      )`,
      sql`INSERT INTO eng_admin_setup(id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
      sql`CREATE TABLE IF NOT EXISTS eng_admin_audit (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id TEXT REFERENCES eng_users(id) ON DELETE SET NULL,
        target_user_id TEXT REFERENCES eng_users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS eng_admin_audit_created_idx ON eng_admin_audit(created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS eng_admin_audit_target_idx ON eng_admin_audit(target_user_id, created_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS eng_recovery_codes (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        destination TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      sql`CREATE INDEX IF NOT EXISTS eng_recovery_codes_user_idx ON eng_recovery_codes(user_id, created_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS eng_friend_requests (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        recipient_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(requester_id, recipient_id)
      )`,
      sql`CREATE INDEX IF NOT EXISTS eng_friend_requests_recipient_idx ON eng_friend_requests(recipient_id, status, created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS eng_friend_requests_requester_idx ON eng_friend_requests(requester_id, status, created_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS eng_friend_shares (
        owner_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        share_type TEXT NOT NULL CHECK (share_type IN ('vocabulary', 'wrongbook')),
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(owner_id, share_type)
      )`,
      sql`CREATE INDEX IF NOT EXISTS eng_friend_shares_updated_idx ON eng_friend_shares(updated_at DESC)`
    ]);
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
}

export function huoquSql() {
  return getSql();
}
