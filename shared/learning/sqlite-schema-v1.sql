-- ENOPARKING shared local event-store schema v1.
-- Both Android SQLiteOpenHelper/Room and iOS SQLite-backed adapters must preserve
-- these constraints. Keep account data isolated even when multiple accounts use
-- one installation database.

PRAGMA foreign_keys = ON;

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

-- Atomicity requirements for adapters:
-- 1. Enqueue: reserve/increment counter + insert event + apply local event marker in one transaction.
-- 2. ACK reconciliation: validate the entire response before updating any event; commit all changes together.
-- 3. Replay: apply domain state + insert applied marker + advance cursor in one transaction per event/batch.
-- 4. Account logout must not delete durable pending events unless the user explicitly requests data removal.
-- 5. Never move a cursor past a missing server sequence.

CREATE TABLE IF NOT EXISTS enop_learning_state (
  account_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  PRIMARY KEY (account_id, state_key),
  FOREIGN KEY (account_id) REFERENCES enop_event_store_meta(account_id) ON DELETE CASCADE
);

