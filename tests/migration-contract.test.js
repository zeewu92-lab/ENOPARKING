import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration001 from '../server/migrations/001_event_store_auth.js';
import * as migration002 from '../server/migrations/002_atomic_event_sync.js';
import * as migration003 from '../server/migrations/003_refresh_rotation.js';
import * as migration004 from '../server/migrations/004_account_deletion_tombstones.js';
import * as migration005 from '../server/migrations/005_event_download.js';

const migrations = [migration001, migration002, migration003, migration004, migration005];

function fakeSql(strings, ...values) {
  return { text: strings.reduce((output, part, index) => output + part + (values[index] ?? ''), '') };
}

test('database migration versions are unique and ordered', () => {
  const versions = migrations.map(migration => migration.version);
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(versions, [
    '001_event_store_auth',
    '002_atomic_event_sync',
    '003_refresh_rotation',
    '004_account_deletion_tombstones',
    '005_event_download'
  ]);
});

test('each migration produces non-empty SQL statements', () => {
  for (const migration of migrations) {
    const statements = migration.up(fakeSql);
    assert.ok(statements.length > 0, migration.version);
    for (const statement of statements) {
      assert.equal(typeof statement.text, 'string');
      assert.ok(statement.text.trim().length > 0, migration.version);
    }
  }
});

test('PL/pgSQL function dollar-quote delimiters are balanced', () => {
  const allSql = migrations.flatMap(migration => migration.up(fakeSql)).map(statement => statement.text).join('\n');
  for (const delimiter of ['$eng_sync$', '$eng_disable$', '$eng_refresh$', '$eng_delete$', '$eng_pull$']) {
    const count = allSql.split(delimiter).length - 1;
    assert.equal(count % 2, 0, delimiter);
    assert.ok(count >= 2, delimiter);
  }
});

test('Event Sync SQL retains fail-closed gates and transactional constraints', () => {
  const statements = migration002.up(fakeSql).map(statement => statement.text).join('\n');
  assert.match(statements, /eng_event_sync_settings/);
  assert.match(statements, /FOR UPDATE/);
  assert.match(statements, /RATE_LIMITED/);
  assert.match(statements, /ON CONFLICT \(account_id\) DO NOTHING/);
  assert.match(statements, /server_sequence/);
});

test('idempotent retries are resolved before per-event rate limiting', () => {
  const statements = migration002.up(fakeSql).map(statement => statement.text).join('\n');
  const duplicateLookup = statements.indexOf('SELECT server_sequence, fingerprint INTO v_existing');
  const rateLimitBranch = statements.indexOf("IF v_event_index > v_allowed_events THEN");
  assert.ok(duplicateLookup >= 0);
  assert.ok(rateLimitBranch > duplicateLookup);
});

test('event pull rejects cursors beyond the account high-water mark', () => {
  const statements = migration005.up(fakeSql).map(statement => statement.text).join('\n');
  assert.match(statements, /IF p_after_sequence > v_high_water THEN[\s\S]*REQUEST_INVALID/);
});
