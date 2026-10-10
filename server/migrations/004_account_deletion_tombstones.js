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
    sql`DO $eng_patch$
    DECLARE
      v_definition TEXT;
      v_original TEXT := '      IF NOT FOUND THEN
        RETURN jsonb_build_object(''httpStatus'', 401, ''errorCode'', ''TOKEN_INVALID'');
      END IF;';
      v_replacement TEXT := '      IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM eng_deleted_access_tokens WHERE token_hash = p_access_token_hash) THEN
          RETURN jsonb_build_object(''httpStatus'', 401, ''errorCode'', ''ACCOUNT_DELETED'');
        END IF;
        RETURN jsonb_build_object(''httpStatus'', 401, ''errorCode'', ''TOKEN_INVALID'');
      END IF;';
    BEGIN
      v_definition := pg_get_functiondef('eng_sync_events(text,uuid,text,jsonb)'::regprocedure);
      IF position(v_original IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Could not patch eng_sync_events missing-token branch safely';
      END IF;
      v_definition := replace(v_definition, v_original, v_replacement);
      EXECUTE v_definition;
    END;
    $eng_patch$`
  ];
}
