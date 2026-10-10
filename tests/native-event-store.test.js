import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NativeEventStore, initializeNativeEventStore, NATIVE_EVENT_STORE_SCHEMA } from '../apps/mobile/src/storage/NativeEventStore.js';

const nativeSource = readFileSync(fileURLToPath(new URL('../apps/mobile/src/storage/NativeEventStore.js', import.meta.url)), 'utf8');
const canonicalSchema = readFileSync(fileURLToPath(new URL('../shared/learning/sqlite-schema-v1.sql', import.meta.url)), 'utf8');

test('native target uses persistent SQLite and has account-scoped learning state', async () => {
  assert.match(NATIVE_EVENT_STORE_SCHEMA, /CREATE TABLE IF NOT EXISTS enop_learning_events/);
  assert.match(NATIVE_EVENT_STORE_SCHEMA, /CREATE TABLE IF NOT EXISTS enop_applied_events/);
  assert.match(NATIVE_EVENT_STORE_SCHEMA, /CREATE TABLE IF NOT EXISTS enop_learning_state/);
  assert.match(canonicalSchema, /CREATE TABLE IF NOT EXISTS enop_learning_state/);
  assert.match(nativeSource, /withExclusiveTransactionAsync/);
  assert.match(nativeSource, /NATIVE_EVENT_PAYLOAD_INVALID/);
});

test('native database initialization enables foreign keys and WAL', async () => {
  let sql = '';
  await initializeNativeEventStore({ execAsync: async value => { sql = value; } });
  assert.match(sql, /PRAGMA foreign_keys = ON/);
  assert.match(sql, /PRAGMA journal_mode = WAL/);
});

test('native event store rejects missing account and invalid event before opening a transaction', async () => {
  let transactions = 0;
  const store = new NativeEventStore({
    withExclusiveTransactionAsync: async operation => {
      transactions += 1;
      return operation({ runAsync: async () => {}, getFirstAsync: async () => null });
    }
  });
  await assert.rejects(store.enqueue('', {
    eventId: 'event-1', type: 'action', payload: {}, createdAt: 1
  }), /NATIVE_EVENT_STORE_ACCOUNT_REQUIRED/);
  await assert.rejects(store.enqueue('account-a', {
    eventId: 'event-1', type: 'unknown', payload: {}, createdAt: 1
  }), /NATIVE_EVENT_TYPE_INVALID/);
  await assert.rejects(store.enqueue('account-a', {
    eventId: 'event-2', type: 'action', payload: { verification: 'guess' }, createdAt: 1
  }), /NATIVE_EVENT_PAYLOAD_INVALID/);
  assert.equal(transactions, 0);
});

test('native ACK batch rejects duplicate IDs and sequences before transaction', async () => {
  let transactions = 0;
  const store = new NativeEventStore({
    withExclusiveTransactionAsync: async operation => {
      transactions += 1;
      return operation({ runAsync: async () => {}, getFirstAsync: async () => null });
    }
  });
  await assert.rejects(store.reconcileAcks('account-a', [
    { eventId: 'event-1', serverSequence: 1 },
    { eventId: 'event-1', serverSequence: 2 }
  ]), /NATIVE_ACK_DUPLICATE/);
  await assert.rejects(store.reconcileAcks('account-a', [
    { eventId: 'event-1', serverSequence: 1 },
    { eventId: 'event-2', serverSequence: 1 }
  ]), /NATIVE_ACK_DUPLICATE/);
  assert.equal(transactions, 0);
});

test('native replay refuses a sequence gap inside a single database transaction', async () => {
  let transactions = 0;
  const db = {
    withExclusiveTransactionAsync: async operation => {
      transactions += 1;
      return operation({
        runAsync: async () => ({ changes: 1 }),
        getFirstAsync: async sql => sql.includes('replay_cursor AS replayCursor')
          ? { replayCursor: 0 }
          : null
      });
    }
  };
  const store = new NativeEventStore(db, { clock: () => 100 });
  await assert.rejects(store.applyReplay('account-a', [{
    eventId: 'event-1',
    type: 'action',
    payload: { wordId: 'word-1', day: 1, verification: 'choice', result: 'correct', hintLevel: 'none' },
    createdAt: 1,
    serverSequence: 2
  }], async () => {}), /NATIVE_REPLAY_SEQUENCE_GAP/);
  assert.equal(transactions, 1);
});

test('native retry backoff is bounded and account-scoped', async () => {
  const updates = [];
  const db = {
    withExclusiveTransactionAsync: async operation => operation({
      getFirstAsync: async sql => sql.includes('syncStatus')
        ? { syncStatus: 'pending', attemptCount: 0 }
        : null,
      runAsync: async (sql, ...params) => { updates.push({ sql, params }); return { changes: 1 }; }
    })
  };
  const store = new NativeEventStore(db, { clock: () => 100 });
  await store.recordSyncFailure('account-a', ['event-1'], 'NETWORK_UNAVAILABLE');
  assert.equal(updates[0].params[0], 1);
  assert.equal(updates[0].params[1], 1100);
  assert.equal(updates[0].params[2], 'NETWORK_UNAVAILABLE');
  assert.match(updates[0].sql, /WHERE account_id = \? AND event_id = \? AND sync_status = 'pending'/);
});

test('native retry validates the full event set before mutating any event', async () => {
  const writes = [];
  const db = {
    withExclusiveTransactionAsync: async operation => operation({
      getFirstAsync: async (_sql, accountId, eventId) => eventId === 'event-1'
        ? { syncStatus: 'pending', attemptCount: 0 }
        : null,
      runAsync: async (...args) => { writes.push(args); return { changes: 1 }; }
    })
  };
  const store = new NativeEventStore(db, { clock: () => 100 });
  await assert.rejects(
    store.recordSyncFailure('account-a', ['event-1', 'unknown-event'], 'NETWORK_UNAVAILABLE'),
    /NATIVE_RETRY_UNKNOWN_EVENT/
  );
  assert.equal(writes.length, 0);
});

test('native device identity is persisted once and reused across sync service restarts', async () => {
  let savedId = null;
  let transactions = 0;
  const db = {
    withExclusiveTransactionAsync: async operation => {
      transactions += 1;
      return operation({
        getFirstAsync: async () => savedId ? { deviceId: savedId } : null,
        runAsync: async (_sql, deviceId, _createdAt) => {
          if (!savedId) savedId = deviceId;
          return { changes: 1 };
        }
      });
    }
  };
  const store = new NativeEventStore(db, { clock: () => 100 });
  const first = await store.getOrCreateDeviceId(() => 'b6b9e8b4-7d11-4f2d-9a8b-112233445566');
  const second = await store.getOrCreateDeviceId(() => 'c7c9e8b4-7d11-4f2d-9a8b-112233445566');
  assert.equal(first, 'b6b9e8b4-7d11-4f2d-9a8b-112233445566');
  assert.equal(second, first);
  assert.equal(transactions, 2);
});

test('native device identity rejects malformed identifiers before database transaction', async () => {
  let transactions = 0;
  const store = new NativeEventStore({
    withExclusiveTransactionAsync: async operation => {
      transactions += 1;
      return operation({ getFirstAsync: async () => null, runAsync: async () => ({ changes: 1 }) });
    }
  });
  await assert.rejects(store.getOrCreateDeviceId(() => 'not-a-uuid'), /NATIVE_DEVICE_ID_INVALID/);
  assert.equal(transactions, 0);
});
