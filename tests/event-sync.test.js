import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, SEMVER, UUID_V4, stableStringify } from '../server/event-sync.js';

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
