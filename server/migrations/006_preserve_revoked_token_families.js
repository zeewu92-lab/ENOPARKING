export const version = '006_preserve_revoked_token_families';

export function up(sql) {
  return [
    sql`ALTER TABLE eng_token_families
      DROP CONSTRAINT IF EXISTS eng_token_families_session_token_hash_fkey`,
    sql`CREATE OR REPLACE FUNCTION eng_revoke_family_on_session_delete()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $eng_session_revoke$
    BEGIN
      UPDATE eng_token_families
         SET revoked_at = COALESCE(revoked_at, NOW()),
             revoke_reason = COALESCE(revoke_reason, 'session_revoked')
       WHERE session_token_hash = OLD.token_hash;
      RETURN OLD;
    END;
    $eng_session_revoke$`,
    sql`DROP TRIGGER IF EXISTS eng_sessions_revoke_token_family ON eng_sessions`,
    sql`CREATE TRIGGER eng_sessions_revoke_token_family
      BEFORE DELETE ON eng_sessions
      FOR EACH ROW
      EXECUTE FUNCTION eng_revoke_family_on_session_delete()`
  ];
}
