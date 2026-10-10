export const version = '002_atomic_event_sync';

export function up(sql) {
  return [
    sql`CREATE OR REPLACE FUNCTION eng_sync_events(
      p_access_token_hash TEXT,
      p_device_id UUID,
      p_client_version TEXT,
      p_events JSONB
    ) RETURNS JSONB
    LANGUAGE plpgsql
    AS $eng_sync$
    DECLARE
      v_token RECORD;
      v_user RECORD;
      v_family RECORD;
      v_item JSONB;
      v_results JSONB := '[]'::JSONB;
      v_event_id UUID;
      v_event_type TEXT;
      v_local_counter BIGINT;
      v_created_at BIGINT;
      v_payload JSONB;
      v_fingerprint TEXT;
      v_existing RECORD;
      v_sequence BIGINT;
      v_result JSONB;
      v_error TEXT;
    BEGIN
      SELECT at.user_id, at.family_id, at.expires_at
        INTO v_token
        FROM eng_access_tokens at
       WHERE at.token_hash = p_access_token_hash;

      IF NOT FOUND THEN
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
       WHERE id = v_token.family_id
         AND user_id = v_token.user_id
       FOR UPDATE;

      IF NOT FOUND OR v_family.revoked_at IS NOT NULL OR v_family.expires_at <= NOW() THEN
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'TOKEN_REVOKED');
      END IF;
      IF v_token.expires_at <= NOW() THEN
        RETURN jsonb_build_object('httpStatus', 401, 'errorCode', 'TOKEN_EXPIRED');
      END IF;

      IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 100 THEN
        RETURN jsonb_build_object('httpStatus', 400, 'errorCode', 'REQUEST_INVALID');
      END IF;

      FOR v_item IN SELECT value FROM jsonb_array_elements(p_events)
      LOOP
        v_error := NULL;
        BEGIN
          IF COALESCE(v_item->>'eventId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
            v_error := 'SCHEMA_INVALID';
          ELSE
            v_event_id := (v_item->>'eventId')::UUID;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_error := 'SCHEMA_INVALID';
        END;

        v_event_type := v_item->>'type';
        IF v_error IS NULL AND (v_event_type IS NULL OR v_event_type NOT IN ('action', 'unit_outcome')) THEN
          v_error := 'EVENT_TYPE_UNKNOWN';
        END IF;

        IF v_error IS NULL THEN
          BEGIN
            IF jsonb_typeof(v_item->'localCounter') IS DISTINCT FROM 'number'
              OR jsonb_typeof(v_item->'createdAt') IS DISTINCT FROM 'number'
              OR jsonb_typeof(v_item->'payload') IS DISTINCT FROM 'object' THEN
              v_error := 'SCHEMA_INVALID';
            ELSE
              v_local_counter := (v_item->>'localCounter')::BIGINT;
              v_created_at := (v_item->>'createdAt')::BIGINT;
              v_payload := v_item->'payload';
            END IF;
            IF v_error IS NULL AND (v_local_counter IS NULL OR v_created_at IS NULL
              OR v_local_counter <= 0 OR v_local_counter > 9007199254740991
              OR octet_length(v_payload::TEXT) > 65536) THEN
              v_error := 'SCHEMA_INVALID';
            END IF;
          EXCEPTION WHEN OTHERS THEN
            v_error := 'SCHEMA_INVALID';
          END;
        END IF;

        IF v_error IS NOT NULL THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'eventId', COALESCE(v_item->>'eventId', ''),
            'syncStatus', 'dead',
            'serverSequence', NULL,
            'error', jsonb_build_object('code', v_error, 'retryable', FALSE)
          ));
          CONTINUE;
        END IF;

        v_fingerprint := COALESCE(v_item->>'_fingerprint', '');
        IF v_fingerprint !~ '^[0-9a-f]{64}

        SELECT server_sequence, fingerprint INTO v_existing
          FROM eng_events
         WHERE account_id = v_token.user_id
           AND event_id = v_event_id;

        IF FOUND THEN
          IF v_existing.fingerprint <> v_fingerprint THEN
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'eventId', v_event_id,
              'syncStatus', 'dead',
              'serverSequence', NULL,
              'error', jsonb_build_object('code', 'SCHEMA_INVALID', 'retryable', FALSE)
            ));
          ELSE
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'eventId', v_event_id,
              'syncStatus', 'confirmed',
              'serverSequence', v_existing.server_sequence,
              'error', NULL
            ));
          END IF;
          CONTINUE;
        END IF;

        INSERT INTO eng_event_sequences(account_id, last_sequence)
        VALUES (v_token.user_id, 0)
        ON CONFLICT (account_id) DO NOTHING;

        SELECT last_sequence INTO v_sequence
          FROM eng_event_sequences
         WHERE account_id = v_token.user_id
         FOR UPDATE;

        IF v_sequence >= 9007199254740991 THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'eventId', v_event_id,
            'syncStatus', 'failed',
            'serverSequence', NULL,
            'error', jsonb_build_object('code', 'SERVICE_UNAVAILABLE', 'retryable', TRUE)
          ));
          CONTINUE;
        END IF;

        v_sequence := v_sequence + 1;
        UPDATE eng_event_sequences
           SET last_sequence = v_sequence, updated_at = NOW()
         WHERE account_id = v_token.user_id;

        INSERT INTO eng_events(
          account_id, event_id, event_type, local_counter, payload, created_at_ms,
          fingerprint, server_sequence, device_id, client_version
        ) VALUES (
          v_token.user_id, v_event_id, v_event_type, v_local_counter, v_payload, v_created_at,
          v_fingerprint, v_sequence, p_device_id, p_client_version
        );

        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'eventId', v_event_id,
          'syncStatus', 'confirmed',
          'serverSequence', v_sequence,
          'error', NULL
        ));
      END LOOP;

      RETURN jsonb_build_object(
        'httpStatus', 200,
        'results', v_results,
        'serverTime', floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT
      );
    END;
    $eng_sync$`,
    sql`CREATE OR REPLACE FUNCTION eng_revoke_families_on_disable()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $eng_disable$
    BEGIN
      IF NEW.disabled = TRUE AND OLD.disabled IS DISTINCT FROM TRUE THEN
        UPDATE eng_token_families
           SET revoked_at = COALESCE(revoked_at, NOW()),
               revoke_reason = COALESCE(revoke_reason, 'account_disabled')
         WHERE user_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $eng_disable$`,
    sql`DROP TRIGGER IF EXISTS eng_users_revoke_families_on_disable ON eng_users`,
    sql`CREATE TRIGGER eng_users_revoke_families_on_disable
      AFTER UPDATE OF disabled ON eng_users
      FOR EACH ROW
      EXECUTE FUNCTION eng_revoke_families_on_disable()`
  ];
}
 THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'eventId', v_event_id,
            'syncStatus', 'dead',
            'serverSequence', NULL,
            'error', jsonb_build_object('code', 'SCHEMA_INVALID', 'retryable', FALSE)
          ));
          CONTINUE;
        END IF;

        SELECT server_sequence, fingerprint INTO v_existing
          FROM eng_events
         WHERE account_id = v_token.user_id
           AND event_id = v_event_id;

        IF FOUND THEN
          IF v_existing.fingerprint <> v_fingerprint THEN
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'eventId', v_event_id,
              'syncStatus', 'dead',
              'serverSequence', NULL,
              'error', jsonb_build_object('code', 'SCHEMA_INVALID', 'retryable', FALSE)
            ));
          ELSE
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'eventId', v_event_id,
              'syncStatus', 'confirmed',
              'serverSequence', v_existing.server_sequence,
              'error', NULL
            ));
          END IF;
          CONTINUE;
        END IF;

        INSERT INTO eng_event_sequences(account_id, last_sequence)
        VALUES (v_token.user_id, 0)
        ON CONFLICT (account_id) DO NOTHING;

        SELECT last_sequence INTO v_sequence
          FROM eng_event_sequences
         WHERE account_id = v_token.user_id
         FOR UPDATE;

        IF v_sequence >= 9007199254740991 THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'eventId', v_event_id,
            'syncStatus', 'failed',
            'serverSequence', NULL,
            'error', jsonb_build_object('code', 'SERVICE_UNAVAILABLE', 'retryable', TRUE)
          ));
          CONTINUE;
        END IF;

        v_sequence := v_sequence + 1;
        UPDATE eng_event_sequences
           SET last_sequence = v_sequence, updated_at = NOW()
         WHERE account_id = v_token.user_id;

        INSERT INTO eng_events(
          account_id, event_id, event_type, local_counter, payload, created_at_ms,
          fingerprint, server_sequence, device_id, client_version
        ) VALUES (
          v_token.user_id, v_event_id, v_event_type, v_local_counter, v_payload, v_created_at,
          v_fingerprint, v_sequence, p_device_id, p_client_version
        );

        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'eventId', v_event_id,
          'syncStatus', 'confirmed',
          'serverSequence', v_sequence,
          'error', NULL
        ));
      END LOOP;

      RETURN jsonb_build_object(
        'httpStatus', 200,
        'results', v_results,
        'serverTime', floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT
      );
    END;
    $eng_sync$`,
    sql`CREATE OR REPLACE FUNCTION eng_revoke_families_on_disable()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $eng_disable$
    BEGIN
      IF NEW.disabled = TRUE AND OLD.disabled IS DISTINCT FROM TRUE THEN
        UPDATE eng_token_families
           SET revoked_at = COALESCE(revoked_at, NOW()),
               revoke_reason = COALESCE(revoke_reason, 'account_disabled')
         WHERE user_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $eng_disable$`,
    sql`DROP TRIGGER IF EXISTS eng_users_revoke_families_on_disable ON eng_users`,
    sql`CREATE TRIGGER eng_users_revoke_families_on_disable
      AFTER UPDATE OF disabled ON eng_users
      FOR EACH ROW
      EXECUTE FUNCTION eng_revoke_families_on_disable()`
  ];
}
