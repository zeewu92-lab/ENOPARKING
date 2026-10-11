import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateEventPayload, UUID_V4 } from '../server/event-sync.js';

const fixtureUrl = new URL('../shared/learning/event-contract-v1.json', import.meta.url);
const contract = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));

test('shared v1 event fixtures are valid for every first-class client platform', () => {
  assert.equal(contract.contractVersion, 1);
  assert.ok(contract.validEvents.length >= 3);
  for (const event of contract.validEvents) {
    assert.equal(UUID_V4.test(event.eventId), true, `invalid fixture eventId: ${event.eventId}`);
    assert.ok(Number.isSafeInteger(event.localCounter) && event.localCounter > 0);
    assert.ok(Number.isSafeInteger(event.createdAt) && event.createdAt >= 0);
    assert.equal(validateEventPayload(event.type, event.payload), true, event.type);
  }
});

test('shared v1 invalid payload fixtures remain rejected by the server contract', () => {
  assert.ok(contract.invalidPayloads.length > 0);
  for (const event of contract.invalidPayloads) {
    assert.equal(validateEventPayload(event.type, event.payload), false, event.type);
  }
});
