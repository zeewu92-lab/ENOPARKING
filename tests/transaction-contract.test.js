import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration002 from '../server/migrations/002_atomic_event_sync.js';
import * as migration003 from '../server/migrations/003_refresh_rotation.js';
import * as migration004 from '../server/migrations/004_account_deletion_tombstones.js';
import * as migration006 from '../server/migrations/006_preserve_revoked_token_families.js';

function fakeSql(strings, ...values) {
  return { text: strings.reduce((output, part, index) => output + part + (values[index] ?? ''), '') };
}

function sqlFor(migration) {
  return migration.up(fakeSql).map(statement => statement.text).join('\n');
}

test('event sync serializes account writes and assigns sequence inside the database function', () => {
  const sql = sqlFor(migration002);
  assert.match(sql, /SELECT id, disabled INTO v_user[\s\S]*FOR UPDATE/);
  assert.match(sql, /SELECT last_sequence INTO v_sequence[\s\S]*FOR UPDATE/);
  assert.match(sql, /UPDATE eng_event_sequences[\s\S]*last_sequence = v_sequence/);
  assert.match(sql, /INSERT INTO eng_events[\s\S]*server_sequence/);
});

test('idempotency lookup happens before rate limit rejection and sequence allocation', () => {
  const sql = sqlFor(migration002);
  const duplicate = sql.indexOf('SELECT server_sequence, fingerprint INTO v_existing');
  const rateLimit = sql.indexOf('IF v_event_index > v_allowed_events THEN');
  const allocate = sql.indexOf('INSERT INTO eng_event_sequences');
  assert.ok(duplicate >= 0);
  assert.ok(rateLimit > duplicate);
  assert.ok(allocate > rateLimit);
});

test('refresh rotation locks a token family before changing active refresh credentials', () => {
  const sql = sqlFor(migration003);
  assert.match(sql, /FROM eng_token_families[\s\S]*FOR UPDATE/);
  assert.match(sql, /UPDATE eng_refresh_tokens[\s\S]*consumed_at/);
  assert.match(sql, /INSERT INTO eng_refresh_tokens/);
});

test('account deletion trigger records access and refresh token tombstones before deletion', () => {
  const sql = sqlFor(migration004);
  assert.match(sql, /BEFORE DELETE ON eng_users/);
  assert.match(sql, /INSERT INTO eng_deleted_access_tokens/);
  assert.match(sql, /INSERT INTO eng_deleted_refresh_tokens/);
  assert.match(sql, /RETURN OLD/);
});

test('session deletion preserves and revokes its Token Family', () => {
  const sql = sqlFor(migration006);
  assert.match(sql, /BEFORE DELETE ON eng_sessions/);
  assert.match(sql, /UPDATE eng_token_families[\s\S]*revoked_at = COALESCE/);
});
