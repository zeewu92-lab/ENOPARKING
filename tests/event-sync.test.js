import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprint,
  SEMVER,
  UUID_V4,
  stableStringify,
  validateEventPayload
} from '../server/event-sync.js';

test('UUID v4 validation accepts version 4 and RFC variant bits', () => {
  assert.equal(UUID_V4.test('b6d2cfa9-67a7-4e4b-9b0e-2ec1d4a63b28'), true);
  assert.equal(UUID_V4.test('b6d2cfa9-67a7-1e4b-9b0e-2ec1d4a63b28'), false);
  assert.equal(UUID_V4.test('b6d2cfa9-67a7-4e4b-7b0e-2ec1d4a63b28'), false);
});

test('SemVer validation accepts stable and prerelease versions', () => {
  assert.equal(SEMVER.test('1.0.0'), true);
  assert.equal(SEMVER.test('2.4.1-beta.2+build.7'), true);
  assert.equal(SEMVER.test('01.0.0'), false);
  assert.equal(SEMVER.test('1.0'), false);
});

test('canonical JSON is independent of object key insertion order', () => {
  assert.equal(
    stableStringify({ payload: { b: 2, a: 1 }, type: 'action' }),
    stableStringify({ type: 'action', payload: { a: 1, b: 2 } })
  );
});

test('event fingerprint remains stable on retry and changes when event content changes', () => {
  const event = {
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-2ec1d4a63b28',
    type: 'action',
    localCounter: 8,
    payload: { action: 'remember', wordId: 'w-1' },
    createdAt: 1791500000000
  };
  assert.equal(fingerprint(event), fingerprint({ ...event, ignoredTransportField: 'new-device' }));
  assert.notEqual(fingerprint(event), fingerprint({ ...event, payload: { action: 'forget', wordId: 'w-1' } }));
});

test('action payload schema accepts the current learning event contract', () => {
  assert.equal(validateEventPayload('action', {
    wordId: 'word-1',
    day: 20637,
    verification: 'choice',
    result: 'correct',
    hintLevel: 'none',
    unitId: 'unit-1'
  }), true);
  assert.equal(validateEventPayload('action', {
    wordId: 'word-1',
    day: 20637,
    verification: 'spelling',
    result: 'wrong',
    hintLevel: 'none'
  }), true);
});

test('action payload schema rejects missing fields, unknown fields and invalid enum values', () => {
  const valid = {
    wordId: 'word-1',
    day: 20637,
    verification: 'choice',
    result: 'correct',
    hintLevel: 'none'
  };
  assert.equal(validateEventPayload('action', { ...valid, unexpected: true }), false);
  assert.equal(validateEventPayload('action', { ...valid, result: 'skip' }), false);
  assert.equal(validateEventPayload('action', { ...valid, verification: 'guess' }), false);
  assert.equal(validateEventPayload('action', { ...valid, day: 1.5 }), false);
  assert.equal(validateEventPayload('action', { ...valid, wordId: ' ' }), false);
  assert.equal(validateEventPayload('action', { ...valid, hintLevel: 'high' }), false);
  assert.equal(validateEventPayload('action', null), false);
  assert.equal(validateEventPayload('unknown', valid), false);
});

test('unit outcome payload schema requires a unit ID and boolean outcome with no extra fields', () => {
  assert.equal(validateEventPayload('unit_outcome', { unitId: 'unit-1', correct: true }), true);
  assert.equal(validateEventPayload('unit_outcome', { unitId: 'unit-1', correct: false }), true);
  assert.equal(validateEventPayload('unit_outcome', { unitId: 'unit-1', correct: 1 }), false);
  assert.equal(validateEventPayload('unit_outcome', { unitId: 'unit-1', correct: true, extra: 1 }), false);
  assert.equal(validateEventPayload('unit_outcome', { correct: true }), false);
});
