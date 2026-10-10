import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schema = readFileSync(fileURLToPath(new URL('../shared/learning/sqlite-schema-v1.sql', import.meta.url)), 'utf8');
const contract = readFileSync(fileURLToPath(new URL('../docs/native-storage-contract.md', import.meta.url)), 'utf8');

test('native SQLite schema scopes all mutable event state by account', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS enop_event_store_meta[\s\S]*account_id TEXT PRIMARY KEY NOT NULL/);
  assert.match(schema, /PRIMARY KEY \(account_id, event_id\)/);
  assert.match(schema, /UNIQUE \(account_id, local_counter\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS enop_applied_events[\s\S]*PRIMARY KEY \(account_id, event_id\)/);
  assert.match(schema, /FOREIGN KEY \(account_id\) REFERENCES enop_event_store_meta\(account_id\) ON DELETE CASCADE/);
});

test('native SQLite schema enforces valid sync state and unique server sequence', () => {
  assert.match(schema, /sync_status IN \('pending', 'confirmed', 'failed'\)/);
  assert.match(schema, /sync_status = 'confirmed' AND server_sequence IS NOT NULL/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS enop_learning_events_server_sequence/);
  assert.match(schema, /UNIQUE \(account_id, server_sequence\)/);
  assert.match(schema, /json_valid\(payload_json\)/);
});

test('native storage contract requires atomic enqueue, ACK reconciliation and replay', () => {
  for (const phrase of [
    'Enqueue',
    'ACK reconciliation',
    'Pull and Replay',
    'Account isolation',
    'Schema upgrade'
  ]) assert.ok(contract.includes(phrase), phrase);
});
