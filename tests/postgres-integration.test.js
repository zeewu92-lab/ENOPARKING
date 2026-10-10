import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import * as migration001 from '../server/migrations/001_event_store_auth.js';
import * as migration002 from '../server/migrations/002_atomic_event_sync.js';
import * as migration003 from '../server/migrations/003_refresh_rotation.js';
import * as migration004 from '../server/migrations/004_account_deletion_tombstones.js';
import * as migration005 from '../server/migrations/005_event_download.js';
import * as migration006 from '../server/migrations/006_preserve_revoked_token_families.js';
import { fingerprint } from '../server/event-sync.js';

const migrationList = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006
];

function createSqlTag(pool) {
  function sql(strings, ...values) {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1]}`;
    }
    const query = {
      text,
      values,
      then(resolve, reject) {
        return pool.query(text, values).then(result => resolve(result.rows), reject);
      }
    };
    return query;
  }

  sql.transaction = async queries => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const query of queries) {
        const result = await client.query(query.text, query.values);
        results.push(result.rows);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return sql;
}

function makeEvent(localCounter, eventId = crypto.randomUUID()) {
  const event = {
    eventId,
    type: 'action',
    localCounter,
    payload: { action: 'remember', wordId: `integration-word-${localCounter}` },
    createdAt: Date.now()
  };
  return { ...event, _fingerprint: fingerprint(event) };
}

async function callSync(pool, tokenHash, deviceId, events) {
  const result = await pool.query(
    'SELECT eng_sync_events($1, $2::uuid, $3, $4::jsonb) AS result',
    [tokenHash, deviceId, '1.0.0', JSON.stringify(events)]
  );
  return result.rows[0].result;
}

test('PostgreSQL migrations, event sync concurrency, idempotency, pull pagination, and revocation', {
  skip: !process.env.PG_TEST_DATABASE_URL
}, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.PG_TEST_DATABASE_URL, max: 20 });

  try {
    await pool.query(`
      CREATE TABLE eng_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE eng_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const sql = createSqlTag(pool);
    for (const migration of migrationList) {
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(947201, 1)`,
        ...migration.up(sql)
      ]);
    }

    const settings = await pool.query(
      'SELECT enabled FROM eng_event_sync_settings WHERE id = 1'
    );
    assert.equal(settings.rows[0].enabled, false, 'Event Sync must default to disabled');

    const userId = 'integration-user';
    const sessionHash = crypto.createHash('sha256').update('integration-session').digest('hex');
    const accessToken = 'integration-access-token-with-more-than-forty-characters-0123456789';
    const accessHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const familyId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();

    await pool.query(
      'INSERT INTO eng_users(id, username, password_hash) VALUES ($1, $2, $3)',
      [userId, 'integration-user', 'test-only-hash']
    );
    await pool.query(
      'INSERT INTO eng_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 day\')',
      [sessionHash, userId]
    );
    await pool.query(
      `INSERT INTO eng_token_families(id, user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [familyId, userId, sessionHash]
    );
    await pool.query(
      `INSERT INTO eng_access_tokens(token_hash, family_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [accessHash, familyId, userId]
    );
    await pool.query('UPDATE eng_event_sync_settings SET enabled = TRUE WHERE id = 1');

    const concurrentEvents = Array.from({ length: 20 }, (_, index) => makeEvent(index + 1));
    const concurrentResults = await Promise.all(
      concurrentEvents.map(event => callSync(pool, accessHash, deviceId, [event]))
    );
    assert.ok(concurrentResults.every(result => result.httpStatus === 200));
    const acknowledgedSequences = concurrentResults.flatMap(result =>
      result.results.map(item => item.serverSequence)
    );
    assert.equal(acknowledgedSequences.length, 20);
    assert.ok(acknowledgedSequences.every(Number.isSafeInteger));
    assert.deepEqual(
      [...acknowledgedSequences].sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i + 1)
    );

    const rows = await pool.query(
      'SELECT event_id, server_sequence FROM eng_events WHERE account_id = $1 ORDER BY server_sequence',
      [userId]
    );
    assert.equal(rows.rowCount, 20);
    assert.deepEqual(rows.rows.map(row => Number(row.server_sequence)), Array.from({ length: 20 }, (_, i) => i + 1));

    const original = concurrentEvents[0];
    const duplicate = await callSync(pool, accessHash, deviceId, [original]);
    assert.equal(duplicate.httpStatus, 200);
    assert.equal(duplicate.results[0].syncStatus, 'confirmed');
    assert.equal(Number(duplicate.results[0].serverSequence), 1);

    const tampered = {
      ...original,
      payload: { action: 'tampered', wordId: 'different-content' }
    };
    tampered._fingerprint = fingerprint(tampered);
    const conflict = await callSync(pool, accessHash, deviceId, [tampered]);
    assert.equal(conflict.results[0].syncStatus, 'dead');
    assert.equal(conflict.results[0].error.code, 'SCHEMA_INVALID');

    const firstPage = await pool.query(
      'SELECT eng_pull_events($1, 0, 10) AS result',
      [accessHash]
    );
    assert.equal(firstPage.rows[0].result.httpStatus, 200);
    assert.equal(firstPage.rows[0].result.events.length, 10);
    assert.equal(firstPage.rows[0].result.hasMore, true);
    assert.equal(Number(firstPage.rows[0].result.nextSequence), 10);

    const secondPage = await pool.query(
      'SELECT eng_pull_events($1, 10, 100) AS result',
      [accessHash]
    );
    assert.equal(secondPage.rows[0].result.events.length, 10);
    assert.equal(secondPage.rows[0].result.hasMore, false);
    assert.equal(Number(secondPage.rows[0].result.nextSequence), 20);

    const refreshHash = crypto.createHash('sha256').update('integration-refresh-old').digest('hex');
    await pool.query(
      `INSERT INTO eng_refresh_tokens(token_hash, family_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [refreshHash, familyId, userId]
    );

    const rotations = await Promise.all([
      pool.query(
        'SELECT eng_rotate_refresh_token($1, $2::uuid, $3, $4, NOW() + INTERVAL \'30 minutes\', $5) AS result',
        [refreshHash, crypto.randomUUID(), 'integration-access-new-a', 'integration-refresh-new-a', 'ciphertext-a']
      ),
      pool.query(
        'SELECT eng_rotate_refresh_token($1, $2::uuid, $3, $4, NOW() + INTERVAL \'30 minutes\', $5) AS result',
        [refreshHash, crypto.randomUUID(), 'integration-access-new-b', 'integration-refresh-new-b', 'ciphertext-b']
      )
    ]);
    const rotationStatuses = rotations.map(result => result.rows[0].result.status).sort();
    assert.deepEqual(rotationStatuses, ['replay', 'rotated']);

    const family = await pool.query(
      'SELECT revoked_at, revoke_reason FROM eng_token_families WHERE id = $1',
      [familyId]
    );
    assert.ok(family.rows[0].revoked_at);
    assert.equal(family.rows[0].revoke_reason, 'refresh_token_replay');
    const remainingAccess = await pool.query(
      'SELECT COUNT(*)::int AS count FROM eng_access_tokens WHERE family_id = $1',
      [familyId]
    );
    assert.equal(remainingAccess.rows[0].count, 0);

    const deletionUserId = 'integration-delete-user';
    const deletionSessionHash = crypto.createHash('sha256').update('integration-delete-session').digest('hex');
    const deletionFamilyId = crypto.randomUUID();
    const deletionAccessHash = crypto.createHash('sha256').update('integration-delete-access').digest('hex');
    const deletionRefreshHash = crypto.createHash('sha256').update('integration-delete-refresh').digest('hex');

    await pool.query(
      'INSERT INTO eng_users(id, username, password_hash) VALUES ($1, $2, $3)',
      [deletionUserId, deletionUserId, 'test-only-hash']
    );
    await pool.query(
      'INSERT INTO eng_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 day\')',
      [deletionSessionHash, deletionUserId]
    );
    await pool.query(
      `INSERT INTO eng_token_families(id, user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [deletionFamilyId, deletionUserId, deletionSessionHash]
    );
    await pool.query(
      `INSERT INTO eng_access_tokens(token_hash, family_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [deletionAccessHash, deletionFamilyId, deletionUserId]
    );
    await pool.query(
      `INSERT INTO eng_refresh_tokens(token_hash, family_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [deletionRefreshHash, deletionFamilyId, deletionUserId]
    );
    await pool.query('DELETE FROM eng_users WHERE id = $1', [deletionUserId]);

    const tombstones = await pool.query(
      `SELECT
        EXISTS (SELECT 1 FROM eng_deleted_access_tokens WHERE token_hash = $1) AS access_saved,
        EXISTS (SELECT 1 FROM eng_deleted_refresh_tokens WHERE token_hash = $2) AS refresh_saved`,
      [deletionAccessHash, deletionRefreshHash]
    );
    assert.equal(tombstones.rows[0].access_saved, true);
    assert.equal(tombstones.rows[0].refresh_saved, true);

    const sessionDeleteUserId = 'integration-session-delete-user';
    const sessionDeleteHash = crypto.createHash('sha256').update('integration-session-delete').digest('hex');
    const sessionDeleteFamilyId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO eng_users(id, username, password_hash) VALUES ($1, $2, $3)',
      [sessionDeleteUserId, sessionDeleteUserId, 'test-only-hash']
    );
    await pool.query(
      'INSERT INTO eng_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 day\')',
      [sessionDeleteHash, sessionDeleteUserId]
    );
    await pool.query(
      `INSERT INTO eng_token_families(id, user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [sessionDeleteFamilyId, sessionDeleteUserId, sessionDeleteHash]
    );
    await pool.query('DELETE FROM eng_sessions WHERE token_hash = $1', [sessionDeleteHash]);

    const sessionFamily = await pool.query(
      'SELECT revoked_at, revoke_reason FROM eng_token_families WHERE id = $1',
      [sessionDeleteFamilyId]
    );
    assert.equal(sessionFamily.rowCount, 1, 'session deletion must preserve the Token Family audit row');
    assert.ok(sessionFamily.rows[0].revoked_at);
    assert.equal(sessionFamily.rows[0].revoke_reason, 'session_revoked');
  } finally {
    await pool.end();
  }
});
