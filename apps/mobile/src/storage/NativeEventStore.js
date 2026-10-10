const SCHEMA_VERSION = 1;

export const NATIVE_EVENT_STORE_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS enop_event_store_meta (
  account_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(account_id)) > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  next_local_counter INTEGER NOT NULL DEFAULT 1 CHECK (next_local_counter >= 1),
  replay_cursor INTEGER NOT NULL DEFAULT 0 CHECK (replay_cursor >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

CREATE TABLE IF NOT EXISTS enop_device_identity (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  device_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
);

CREATE TABLE IF NOT EXISTS enop_learning_events (
  account_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  local_counter INTEGER NOT NULL CHECK (local_counter >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('action', 'unit_outcome')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'confirmed', 'failed')),
  server_sequence INTEGER CHECK (server_sequence IS NULL OR server_sequence >= 1),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at INTEGER NOT NULL CHECK (next_attempt_at >= 0),
  error_code TEXT,
  PRIMARY KEY (account_id, event_id),
  UNIQUE (account_id, local_counter),
  FOREIGN KEY (account_id) REFERENCES enop_event_store_meta(account_id) ON DELETE CASCADE,
  CHECK ((sync_status = 'confirmed' AND server_sequence IS NOT NULL) OR
         (sync_status <> 'confirmed' AND server_sequence IS NULL))
);

CREATE INDEX IF NOT EXISTS enop_learning_events_pending
  ON enop_learning_events(account_id, sync_status, next_attempt_at, local_counter);

CREATE UNIQUE INDEX IF NOT EXISTS enop_learning_events_server_sequence
  ON enop_learning_events(account_id, server_sequence)
  WHERE server_sequence IS NOT NULL;

CREATE TABLE IF NOT EXISTS enop_applied_events (
  account_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  server_sequence INTEGER CHECK (server_sequence IS NULL OR server_sequence >= 1),
  applied_at INTEGER NOT NULL CHECK (applied_at >= 0),
  PRIMARY KEY (account_id, event_id),
  FOREIGN KEY (account_id) REFERENCES enop_event_store_meta(account_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS enop_applied_events_sequence
  ON enop_applied_events(account_id, server_sequence)
  WHERE server_sequence IS NOT NULL;

CREATE TABLE IF NOT EXISTS enop_learning_state (
  account_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  PRIMARY KEY (account_id, state_key),
  FOREIGN KEY (account_id) REFERENCES enop_event_store_meta(account_id) ON DELETE CASCADE
);
`;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireAccountId(accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('NATIVE_EVENT_STORE_ACCOUNT_REQUIRED');
  }
}

function assertSafeInteger(value, code, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(code);
}

function assertEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('NATIVE_EVENT_INVALID');
  }
  if (typeof event.eventId !== 'string' || !event.eventId.trim()) {
    throw new Error('NATIVE_EVENT_ID_INVALID');
  }
  if (!['action', 'unit_outcome'].includes(event.type)) {
    throw new Error('NATIVE_EVENT_TYPE_INVALID');
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    throw new Error('NATIVE_EVENT_PAYLOAD_INVALID');
  }
  const payload = event.payload;
  if (event.type === 'action') {
    const allowed = new Set(['wordId', 'day', 'verification', 'result', 'hintLevel', 'unitId']);
    if (Object.keys(payload).some(key => !allowed.has(key)) ||
        typeof payload.wordId !== 'string' || !payload.wordId.trim() ||
        !Number.isSafeInteger(payload.day) || payload.day < 0 ||
        !['choice', 'spelling', 'dictation', 'usage'].includes(payload.verification) ||
        !['correct', 'wrong'].includes(payload.result) ||
        payload.hintLevel !== 'none' ||
        (payload.unitId !== undefined && payload.unitId !== null &&
          (typeof payload.unitId !== 'string' || !payload.unitId.trim()))) {
      throw new Error('NATIVE_EVENT_PAYLOAD_INVALID');
    }
  } else {
    const keys = Object.keys(payload);
    if (keys.some(key => !['unitId', 'correct'].includes(key)) ||
        typeof payload.unitId !== 'string' || !payload.unitId.trim() ||
        typeof payload.correct !== 'boolean') {
      throw new Error('NATIVE_EVENT_PAYLOAD_INVALID');
    }
  }
  assertSafeInteger(event.createdAt, 'NATIVE_EVENT_TIME_INVALID');
}

export async function initializeNativeEventStore(db) {
  await db.execAsync(NATIVE_EVENT_STORE_SCHEMA);
}

export class NativeEventStore {
  constructor(db, { clock = () => Date.now() } = {}) {
    if (!db || typeof db.withExclusiveTransactionAsync !== 'function') {
      throw new Error('NATIVE_EVENT_STORE_DATABASE_REQUIRED');
    }
    this.db = db;
    this.clock = clock;
  }

  async getOrCreateDeviceId(createId) {
    if (typeof createId !== 'function') throw new Error('NATIVE_DEVICE_ID_PROVIDER_REQUIRED');
    const candidate = await createId();
    if (typeof candidate !== 'string' || !UUID_V4.test(candidate)) {
      throw new Error('NATIVE_DEVICE_ID_INVALID');
    }
    const now = this.clock();
    assertSafeInteger(now, 'NATIVE_EVENT_CLOCK_INVALID');
    let deviceId;
    await this.db.withExclusiveTransactionAsync(async tx => {
      const existing = await tx.getFirstAsync(
        'SELECT device_id AS deviceId FROM enop_device_identity WHERE singleton_id = 1'
      );
      if (existing?.deviceId) {
        if (!UUID_V4.test(existing.deviceId)) throw new Error('NATIVE_DEVICE_ID_CORRUPT');
        deviceId = existing.deviceId;
        return;
      }
      await tx.runAsync(
        'INSERT INTO enop_device_identity (singleton_id, device_id, created_at) VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO NOTHING',
        candidate, now
      );
      const saved = await tx.getFirstAsync(
        'SELECT device_id AS deviceId FROM enop_device_identity WHERE singleton_id = 1'
      );
      if (!saved?.deviceId || !UUID_V4.test(saved.deviceId)) {
        throw new Error('NATIVE_DEVICE_ID_PERSIST_FAILED');
      }
      deviceId = saved.deviceId;
    });
    return deviceId;
  }

  async ensureAccount(tx, accountId, now) {
    await tx.runAsync(
      `INSERT INTO enop_event_store_meta
        (account_id, schema_version, next_local_counter, replay_cursor, updated_at)
       VALUES (?, ?, 1, 0, ?)
       ON CONFLICT(account_id) DO NOTHING`,
      accountId, SCHEMA_VERSION, now
    );
  }

  async enqueue(accountId, event, { applyOptimisticState } = {}) {
    requireAccountId(accountId);
    assertEvent(event);
    const now = this.clock();
    assertSafeInteger(now, 'NATIVE_EVENT_CLOCK_INVALID');
    let storedEvent;

    await this.db.withExclusiveTransactionAsync(async tx => {
      await this.ensureAccount(tx, accountId, now);
      const meta = await tx.getFirstAsync(
        'SELECT next_local_counter FROM enop_event_store_meta WHERE account_id = ?',
        accountId
      );
      if (!meta) throw new Error('NATIVE_EVENT_STORE_META_MISSING');

      storedEvent = {
        ...event,
        localCounter: meta.next_local_counter,
        accountId
      };
      await tx.runAsync(
        `INSERT INTO enop_learning_events
          (account_id, event_id, local_counter, event_type, payload_json, created_at,
           sync_status, server_sequence, attempt_count, next_attempt_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, 0, ?)`,
        accountId, event.eventId, meta.next_local_counter, event.type,
        JSON.stringify(event.payload), event.createdAt, event.createdAt
      );
      await tx.runAsync(
        `UPDATE enop_event_store_meta
         SET next_local_counter = ?, updated_at = ? WHERE account_id = ?`,
        meta.next_local_counter + 1, now, accountId
      );
      await tx.runAsync(
        `INSERT INTO enop_applied_events (account_id, event_id, server_sequence, applied_at)
         VALUES (?, ?, NULL, ?)`,
        accountId, event.eventId, now
      );
      if (applyOptimisticState !== undefined) {
        if (typeof applyOptimisticState !== 'function') {
          throw new Error('NATIVE_OPTIMISTIC_APPLIER_INVALID');
        }
        await applyOptimisticState(tx, storedEvent);
      }
    });

    return storedEvent;
  }

  async getReplayCursor(accountId) {
    requireAccountId(accountId);
    const row = await this.db.getFirstAsync(
      'SELECT replay_cursor AS replayCursor FROM enop_event_store_meta WHERE account_id = ?',
      accountId
    );
    if (!row) return 0;
    assertSafeInteger(row.replayCursor, 'NATIVE_REPLAY_CURSOR_INVALID');
    return row.replayCursor;
  }

  async pendingForSync(accountId, { limit = 100, now = this.clock() } = {}) {
    requireAccountId(accountId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('NATIVE_EVENT_BATCH_LIMIT_INVALID');
    }
    const rows = await this.db.getAllAsync(
      `SELECT event_id AS eventId, local_counter AS localCounter,
              event_type AS type, payload_json AS payloadJson, created_at AS createdAt,
              attempt_count AS attemptCount
       FROM enop_learning_events
       WHERE account_id = ? AND sync_status = 'pending' AND next_attempt_at <= ?
       ORDER BY local_counter ASC LIMIT ?`,
      accountId, now, limit
    );
    return rows.map(row => ({
      eventId: row.eventId,
      localCounter: row.localCounter,
      type: row.type,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt,
      attemptCount: row.attemptCount
    }));
  }

  async recordSyncFailure(accountId, eventIds, errorCode) {
    requireAccountId(accountId);
    if (!Array.isArray(eventIds) || eventIds.length === 0 ||
        eventIds.some(id => typeof id !== 'string' || !id.trim()) ||
        new Set(eventIds).size !== eventIds.length) {
      throw new Error('NATIVE_RETRY_EVENT_IDS_INVALID');
    }
    if (typeof errorCode !== 'string' || !errorCode.trim() || errorCode.length > 128) {
      throw new Error('NATIVE_RETRY_ERROR_CODE_INVALID');
    }

    const now = this.clock();
    assertSafeInteger(now, 'NATIVE_EVENT_CLOCK_INVALID');
    await this.db.withExclusiveTransactionAsync(async tx => {
      const pending = [];
      for (const eventId of eventIds) {
        const row = await tx.getFirstAsync(
          `SELECT sync_status AS syncStatus, attempt_count AS attemptCount
           FROM enop_learning_events WHERE account_id = ? AND event_id = ?`,
          accountId, eventId
        );
        if (!row) throw new Error('NATIVE_RETRY_UNKNOWN_EVENT');
        if (row.syncStatus !== 'confirmed') pending.push({ eventId, attemptCount: row.attemptCount });
      }

      for (const event of pending) {
        const nextAttemptCount = event.attemptCount + 1;
        const delay = Math.min(1000 * (2 ** Math.min(event.attemptCount, 20)), 300000);
        await tx.runAsync(
          `UPDATE enop_learning_events
           SET attempt_count = ?, next_attempt_at = ?, error_code = ?
           WHERE account_id = ? AND event_id = ? AND sync_status = 'pending'`,
          nextAttemptCount, now + delay, errorCode.trim(), accountId, event.eventId
        );
      }
      await tx.runAsync(
        'UPDATE enop_event_store_meta SET updated_at = ? WHERE account_id = ?',
        now, accountId
      );
    });
  }

  async reconcileAcks(accountId, acknowledgements) {
    requireAccountId(accountId);
    if (!Array.isArray(acknowledgements)) throw new Error('NATIVE_ACK_BATCH_INVALID');
    const seenIds = new Set();
    const seenSequences = new Set();
    for (const ack of acknowledgements) {
      if (!ack || typeof ack.eventId !== 'string' || !ack.eventId ||
          !Number.isSafeInteger(ack.serverSequence) || ack.serverSequence < 1) {
        throw new Error('NATIVE_ACK_INVALID');
      }
      if (seenIds.has(ack.eventId) || seenSequences.has(ack.serverSequence)) {
        throw new Error('NATIVE_ACK_DUPLICATE');
      }
      seenIds.add(ack.eventId);
      seenSequences.add(ack.serverSequence);
    }

    const now = this.clock();
    await this.db.withExclusiveTransactionAsync(async tx => {
      for (const ack of acknowledgements) {
        const row = await tx.getFirstAsync(
          `SELECT sync_status AS syncStatus, server_sequence AS serverSequence
           FROM enop_learning_events WHERE account_id = ? AND event_id = ?`,
          accountId, ack.eventId
        );
        if (!row) throw new Error('NATIVE_ACK_UNKNOWN_EVENT');
        if (row.syncStatus === 'confirmed') {
          if (row.serverSequence !== ack.serverSequence) throw new Error('NATIVE_ACK_CONFLICT');
          continue;
        }
        const sequenceOwner = await tx.getFirstAsync(
          `SELECT event_id AS eventId FROM enop_learning_events
           WHERE account_id = ? AND server_sequence = ?`,
          accountId, ack.serverSequence
        );
        if (sequenceOwner && sequenceOwner.eventId !== ack.eventId) {
          throw new Error('NATIVE_ACK_SEQUENCE_CONFLICT');
        }
      }

      for (const ack of acknowledgements) {
        const row = await tx.getFirstAsync(
          `SELECT sync_status AS syncStatus, server_sequence AS serverSequence
           FROM enop_learning_events WHERE account_id = ? AND event_id = ?`,
          accountId, ack.eventId
        );
        if (row.syncStatus === 'confirmed') continue;
        await tx.runAsync(
          `UPDATE enop_learning_events
           SET sync_status = 'confirmed', server_sequence = ?, error_code = NULL
           WHERE account_id = ? AND event_id = ?`,
          ack.serverSequence, accountId, ack.eventId
        );
        const marker = await tx.getFirstAsync(
          `SELECT server_sequence AS serverSequence FROM enop_applied_events
           WHERE account_id = ? AND event_id = ?`,
          accountId, ack.eventId
        );
        if (marker) {
          if (marker.serverSequence !== null && marker.serverSequence !== ack.serverSequence) {
            throw new Error('NATIVE_ACK_APPLIED_MARKER_CONFLICT');
          }
          await tx.runAsync(
            `UPDATE enop_applied_events SET server_sequence = ?
             WHERE account_id = ? AND event_id = ?`,
            ack.serverSequence, accountId, ack.eventId
          );
        }
      }
      await tx.runAsync(
        'UPDATE enop_event_store_meta SET updated_at = ? WHERE account_id = ?',
        now, accountId
      );
    });
  }

  async applyReplay(accountId, events, applyEvent) {
    requireAccountId(accountId);
    if (!Array.isArray(events) || typeof applyEvent !== 'function') {
      throw new Error('NATIVE_REPLAY_INPUT_INVALID');
    }
    const now = this.clock();
    let appliedCount = 0;

    await this.db.withExclusiveTransactionAsync(async tx => {
      await this.ensureAccount(tx, accountId, now);
      const meta = await tx.getFirstAsync(
        'SELECT replay_cursor AS replayCursor FROM enop_event_store_meta WHERE account_id = ?',
        accountId
      );
      let cursor = meta.replayCursor;

      for (const event of events) {
        assertEvent({ ...event, type: event.type, createdAt: event.createdAt });
        assertSafeInteger(event.serverSequence, 'NATIVE_REPLAY_SEQUENCE_INVALID', 1);
        if (event.serverSequence <= cursor) continue;
        if (event.serverSequence !== cursor + 1) {
          throw new Error('NATIVE_REPLAY_SEQUENCE_GAP');
        }
        const sequenceMarker = await tx.getFirstAsync(
          `SELECT event_id AS eventId FROM enop_applied_events
           WHERE account_id = ? AND server_sequence = ?`,
          accountId, event.serverSequence
        );
        if (sequenceMarker && sequenceMarker.eventId !== event.eventId) {
          throw new Error('NATIVE_REPLAY_SEQUENCE_CONFLICT');
        }
        const idMarker = await tx.getFirstAsync(
          `SELECT server_sequence AS serverSequence FROM enop_applied_events
           WHERE account_id = ? AND event_id = ?`,
          accountId, event.eventId
        );
        if (idMarker && idMarker.serverSequence !== null &&
            idMarker.serverSequence !== event.serverSequence) {
          throw new Error('NATIVE_REPLAY_EVENT_CONFLICT');
        }

        if (!idMarker) {
          await applyEvent(tx, event);
          await tx.runAsync(
            `INSERT INTO enop_applied_events
             (account_id, event_id, server_sequence, applied_at) VALUES (?, ?, ?, ?)`,
            accountId, event.eventId, event.serverSequence, now
          );
          appliedCount += 1;
        } else if (idMarker.serverSequence === null) {
          await tx.runAsync(
            `UPDATE enop_applied_events SET server_sequence = ?
             WHERE account_id = ? AND event_id = ?`,
            event.serverSequence, accountId, event.eventId
          );
          // The server may deliver our own event before its POST ACK arrives.
          // Confirm it here so it does not remain in the pending queue forever.
          await tx.runAsync(
            `UPDATE enop_learning_events
             SET sync_status = 'confirmed', server_sequence = ?, error_code = NULL
             WHERE account_id = ? AND event_id = ? AND sync_status = 'pending'`,
            event.serverSequence, accountId, event.eventId
          );
        }

        cursor = event.serverSequence;
        await tx.runAsync(
          'UPDATE enop_event_store_meta SET replay_cursor = ?, updated_at = ? WHERE account_id = ?',
          cursor, now, accountId
        );
      }
    });
    return { appliedCount };
  }
}
