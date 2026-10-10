export const version = '005_event_download';

export function up(sql) {
  return [
    sql`CREATE OR REPLACE FUNCTION eng_pull_events(
      p_access_token_hash TEXT,
      p_after_sequence BIGINT,
      p_limit INTEGER
    ) RETURNS JSONB
    LANGUAGE plpgsql
    AS $eng_pull$
    DECLARE
      v_token RECORD;
      v_user RECORD;
      v_family RECORD;
      v_events JSONB;
      v_count INTEGER;
      v_next BIGINT;
      v_high_water BIGINT;
      v_has_more BOOLEAN;
    BEGIN
      SELECT user_id, family_id, expires_at INTO v_token
        FROM eng_access_tokens
       WHERE token_hash = p_access_token_hash;
      IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM eng_deleted_access_tokens WHERE token_hash = p_access_token_hash) THEN
          RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'ACCOUNT_DELETED');
        END IF;
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'TOKEN_INVALID');
      END IF;

      SELECT id, disabled INTO v_user
        FROM eng_users
       WHERE id = v_token.user_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'ACCOUNT_DELETED');
      END IF;
      IF v_user.disabled THEN
        RETURN jsonb_build_object('httpStatus', 403, 'errorCode', 'ACCOUNT_LOCKED');
      END IF;

      SELECT * INTO v_family
        FROM eng_token_families
       WHERE id = v_token.family_id AND user_id = v_token.user_id
       FOR UPDATE;
      IF NOT FOUND OR v_family.revoked_at IS NOT NULL OR v_family.expires_at <= NOW() THEN
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'TOKEN_REVOKED');
      END IF;
      IF v_token.expires_at <= NOW() THEN
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'TOKEN_EXPIRED');
      END IF;

      IF p_after_sequence < 0 OR p_limit < 1 OR p_limit > 100 THEN
        RETURN jsonb_build_object('httpStatus', 400, 'errorCode', 'REQUEST_INVALID');
      END IF;

      SELECT COALESCE(last_sequence, 0) INTO v_high_water
        FROM eng_event_sequences WHERE account_id = v_token.user_id;
      v_high_water := COALESCE(v_high_water, 0);

      SELECT COUNT(*) INTO v_count
        FROM (
          SELECT 1 FROM eng_events
           WHERE account_id = v_token.user_id AND server_sequence > p_after_sequence
           ORDER BY server_sequence
           LIMIT p_limit + 1
        ) q;
      v_has_more := v_count > p_limit;

      SELECT COALESCE(jsonb_agg(to_jsonb(page) - 'account_id' - 'fingerprint' - 'device_id' - 'client_version' - 'received_at'), '[]'::JSONB)
        INTO v_events
        FROM (
          SELECT event_id AS "eventId",
                 event_type AS type,
                 local_counter AS "localCounter",
                 payload,
                 created_at_ms AS "createdAt",
                 server_sequence AS "serverSequence",
                 account_id,
                 fingerprint,
                 device_id,
                 client_version,
                 received_at
            FROM eng_events
           WHERE account_id = v_token.user_id AND server_sequence > p_after_sequence
           ORDER BY server_sequence
           LIMIT p_limit
        ) page;

      IF jsonb_array_length(v_events) > 0 THEN
        SELECT (v_events->(jsonb_array_length(v_events) - 1)->>'serverSequence')::BIGINT INTO v_next;
      ELSE
        v_next := p_after_sequence;
      END IF;
      IF NOT v_has_more THEN
        v_next := GREATEST(v_next, p_after_sequence, v_high_water);
      END IF;

      RETURN jsonb_build_object(
        'httpStatus', 200,
        'events', v_events,
        'nextSequence', v_next,
        'hasMore', v_has_more,
        'serverTime', floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT
      );
    END;
    $eng_pull$`
  ];
}
