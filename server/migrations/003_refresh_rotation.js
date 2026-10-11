export const version = '003_refresh_rotation';

export function up(sql) {
  return [
    sql`CREATE UNIQUE INDEX IF NOT EXISTS eng_token_families_active_session_uidx
      ON eng_token_families(session_token_hash)
      WHERE revoked_at IS NULL`,
    sql`CREATE OR REPLACE FUNCTION eng_rotate_refresh_token(
      p_old_hash TEXT,
      p_request_id UUID,
      p_new_access_hash TEXT,
      p_new_refresh_hash TEXT,
      p_access_expires_at TIMESTAMPTZ,
      p_recovery_ciphertext TEXT
    ) RETURNS JSONB
    LANGUAGE plpgsql
    AS $eng_refresh$
    DECLARE
      v_token RECORD;
      v_user RECORD;
      v_family RECORD;
      v_old RECORD;
    BEGIN
      SELECT user_id, family_id INTO v_token
        FROM eng_refresh_tokens
       WHERE token_hash = p_old_hash;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;

      SELECT id, disabled INTO v_user
        FROM eng_users
       WHERE id = v_token.user_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      IF v_user.disabled THEN
        RETURN jsonb_build_object('status', 'account_locked');
      END IF;

      SELECT * INTO v_family
        FROM eng_token_families
       WHERE id = v_token.family_id
         AND user_id = v_token.user_id
       FOR UPDATE;
      IF NOT FOUND OR v_family.revoked_at IS NOT NULL OR v_family.expires_at <= NOW() THEN
        RETURN jsonb_build_object('status', 'revoked');
      END IF;

      SELECT * INTO v_old
        FROM eng_refresh_tokens
       WHERE token_hash = p_old_hash
       FOR UPDATE;
      IF NOT FOUND OR v_old.expires_at <= NOW() THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;

      IF v_old.consumed_at IS NOT NULL THEN
        IF v_old.request_id = p_request_id
          AND v_old.recovery_until > NOW()
          AND v_old.recovery_ciphertext IS NOT NULL THEN
          RETURN jsonb_build_object(
            'status', 'recovered',
            'ciphertext', v_old.recovery_ciphertext
          );
        END IF;

        UPDATE eng_token_families
           SET revoked_at = COALESCE(revoked_at, NOW()),
               revoke_reason = COALESCE(revoke_reason, CASE
                 WHEN v_old.request_id = p_request_id THEN 'refresh_recovery_expired'
                 ELSE 'refresh_token_replay'
               END)
         WHERE id = v_family.id;
        DELETE FROM eng_access_tokens WHERE family_id = v_family.id;

        IF v_old.request_id = p_request_id THEN
          RETURN jsonb_build_object('status', 'recovery_expired');
        END IF;
        RETURN jsonb_build_object('status', 'replay');
      END IF;

      IF p_access_expires_at <= NOW() OR p_access_expires_at > v_family.expires_at
        OR p_recovery_ciphertext IS NULL OR length(p_recovery_ciphertext) > 8192 THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;

      UPDATE eng_refresh_tokens
         SET consumed_at = NOW(),
             request_id = p_request_id,
             recovery_ciphertext = p_recovery_ciphertext,
             recovery_until = NOW() + INTERVAL '2 minutes',
             replaced_by_hash = p_new_refresh_hash
       WHERE token_hash = p_old_hash;

      INSERT INTO eng_access_tokens(token_hash, family_id, user_id, expires_at)
      VALUES (p_new_access_hash, v_family.id, v_family.user_id, p_access_expires_at);

      INSERT INTO eng_refresh_tokens(token_hash, family_id, user_id, expires_at)
      VALUES (p_new_refresh_hash, v_family.id, v_family.user_id, v_family.expires_at);

      RETURN jsonb_build_object(
        'status', 'rotated',
        'ciphertext', p_recovery_ciphertext
      );
    END;
    $eng_refresh$`
  ];
}
