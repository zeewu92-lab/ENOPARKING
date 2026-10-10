import test from 'node:test';
import assert from 'node:assert/strict';
import { runSingleFlight } from '../src/api/singleFlight.js';

test('same key reuses an in-flight operation', async () => {
  let finish;
  let calls = 0;
  const operation = () => { calls += 1; return new Promise(resolve => { finish = resolve; }); };
  const first = runSingleFlight('account-a', operation);
  const second = runSingleFlight('account-a', operation);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish('ok');
  assert.equal(await first, 'ok');
  assert.equal(await second, 'ok');
});

test('different keys do not share operations', async () => {
  assert.equal(await runSingleFlight('account-a', async () => 'a'), 'a');
  assert.equal(await runSingleFlight('account-b', async () => 'b'), 'b');
});
