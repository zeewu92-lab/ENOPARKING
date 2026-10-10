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
