export const version = '001_event_store_auth';

export function up(sql) {
  return [
    sql`CREATE TABLE IF NOT EXISTS eng_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE TABLE IF NOT EXISTS eng_token_families (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
      session_token_hash TEXT NOT NULL REFERENCES eng_sessions(token_hash) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      revoke_reason TEXT,
      CHECK (expires_at > created_at)
    )`,
    sql`CREATE INDEX IF NOT EXISTS eng_token_families_user_idx
      ON eng_token_families(user_id, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS eng_token_families_session_idx
      ON eng_token_families(session_token_hash)`,
    sql`CREATE TABLE IF NOT EXISTS eng_access_tokens (
      token_hash TEXT PRIMARY KEY,
      family_id UUID NOT NULL REFERENCES eng_token_families(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE INDEX IF NOT EXISTS eng_access_tokens_family_idx
      ON eng_access_tokens(family_id)`,
    sql`CREATE INDEX IF NOT EXISTS eng_access_tokens_expiry_idx
      ON eng_access_tokens(expires_at)`,
    sql`CREATE TABLE IF NOT EXISTS eng_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      family_id UUID NOT NULL REFERENCES eng_token_families(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      request_id UUID,
      recovery_ciphertext TEXT,
      recovery_until TIMESTAMPTZ,
      replaced_by_hash TEXT,
      CHECK ((recovery_ciphertext IS NULL) = (recovery_until IS NULL))
    )`,
    sql`CREATE INDEX IF NOT EXISTS eng_refresh_tokens_family_idx
      ON eng_refresh_tokens(family_id)`,
    sql`CREATE INDEX IF NOT EXISTS eng_refresh_tokens_expiry_idx
      ON eng_refresh_tokens(expires_at)`,
    sql`CREATE TABLE IF NOT EXISTS eng_event_sequences (
      account_id TEXT PRIMARY KEY REFERENCES eng_users(id) ON DELETE CASCADE,
      last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0 AND last_sequence <= 9007199254740991),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE TABLE IF NOT EXISTS eng_events (
      account_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('action', 'unit_outcome')),
      local_counter BIGINT NOT NULL CHECK (local_counter > 0 AND local_counter <= 9007199254740991),
      payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      created_at_ms BIGINT NOT NULL,
      fingerprint CHAR(64) NOT NULL,
      server_sequence BIGINT NOT NULL CHECK (server_sequence > 0 AND server_sequence <= 9007199254740991),
      device_id UUID NOT NULL,
      client_version TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, event_id),
      UNIQUE (account_id, server_sequence)
    )`,
    sql`CREATE INDEX IF NOT EXISTS eng_events_account_sequence_idx
      ON eng_events(account_id, server_sequence)`,
    sql`CREATE INDEX IF NOT EXISTS eng_events_account_received_idx
      ON eng_events(account_id, received_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS eng_events_account_type_idx
      ON eng_events(account_id, event_type, server_sequence)`,
    sql`CREATE TABLE IF NOT EXISTS eng_event_sync_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`INSERT INTO eng_event_sync_settings(id, enabled)
      VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING`
  ];
}
