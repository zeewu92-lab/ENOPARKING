export const version = '004_account_deletion_tombstones';

export function up(sql) {
  return [
    sql`CREATE TABLE IF NOT EXISTS eng_deleted_access_tokens (
      token_hash TEXT PRIMARY KEY,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE INDEX IF NOT EXISTS eng_deleted_access_tokens_age_idx
      ON eng_deleted_access_tokens(deleted_at)`,
    sql`CREATE OR REPLACE FUNCTION eng_capture_deleted_account_tokens()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $eng_delete$
    BEGIN
      INSERT INTO eng_deleted_access_tokens(token_hash, deleted_at)
      SELECT token_hash, NOW()
        FROM eng_access_tokens
       WHERE user_id = OLD.id
      ON CONFLICT (token_hash) DO NOTHING;
      RETURN OLD;
    END;
    $eng_delete$`,
    sql`DROP TRIGGER IF EXISTS eng_users_capture_deleted_tokens ON eng_users`,
    sql`CREATE TRIGGER eng_users_capture_deleted_tokens
      BEFORE DELETE ON eng_users
      FOR EACH ROW
      EXECUTE FUNCTION eng_capture_deleted_account_tokens()`,
  ];
}
