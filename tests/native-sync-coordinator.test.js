import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeSyncCoordinator } from '../apps/mobile/src/sync/NativeSyncCoordinator.js';

function lifecycleSource() {
  let listener;
  return {
    source: { addEventListener: (_event, callback) => { listener = callback; return { remove() { listener = undefined; } }; } },
    emit(state) { listener?.(state); }
  };
}

test('native sync coordinator syncs only the active account and exposes a session guard', async () => {
  let account = 'account-a';
  const calls = [];
  const coordinator = new NativeSyncCoordinator({
    getActiveAccountId: () => account,
    syncAccount: async (id, context) => calls.push({ id, current: await context.isCurrentAccount() }),
  });
  const result = await coordinator.requestSync('manual');
  assert.equal(result.status, 'synced');
  assert.deepEqual(calls, [{ id: 'account-a', current: true }]);
  account = 'account-b';
  assert.equal(await calls.length, 1);
  coordinator.stop();
});

test('native sync coordinator coalesces concurrent triggers into a single sync pass', async () => {
  let release;
  let calls = 0;
  const coordinator = new NativeSyncCoordinator({
    getActiveAccountId: () => 'account-a',
    syncAccount: async () => {
      calls += 1;
      await new Promise(resolve => { release = resolve; });
    },
  });
  const first = coordinator.requestSync('foreground');
  await new Promise(resolve => setImmediate(resolve));
  const second = coordinator.requestSync('network');
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.status, 'synced');
  assert.equal(b.status, 'synced');
  coordinator.stop();
});

test('native sync coordinator skips offline and unauthenticated sessions', async () => {
  let online = false;
  let account = null;
  let calls = 0;
  const coordinator = new NativeSyncCoordinator({
    getActiveAccountId: () => account,
    isOnline: () => online,
    syncAccount: async () => { calls += 1; },
  });
  assert.equal((await coordinator.requestSync('offline')).status, 'offline');
  online = true;
  assert.equal((await coordinator.requestSync('signed_out')).status, 'no_active_account');
  assert.equal(calls, 0);
  coordinator.stop();
});

test('native sync coordinator subscribes to foreground and network restoration, then unsubscribes', async () => {
  const lifecycle = lifecycleSource();
  let networkListener;
  let unsubscribeCount = 0;
  let calls = 0;
  const coordinator = new NativeSyncCoordinator({
    getActiveAccountId: () => 'account-a',
    syncAccount: async () => { calls += 1; },
  });
  coordinator.start({
    appState: lifecycle.source,
    subscribeNetwork: listener => {
      networkListener = listener;
      return () => { unsubscribeCount += 1; networkListener = undefined; };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  const initialCalls = calls;
  lifecycle.emit('background');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, initialCalls);
  lifecycle.emit('active');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, initialCalls + 1);
  networkListener(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, initialCalls + 2);
  coordinator.stop();
  assert.equal(unsubscribeCount, 1);
  lifecycle.emit('active');
  assert.equal(calls, initialCalls + 2);
});

test('native sync coordinator reports sync errors without breaking future requests', async () => {
  let shouldFail = true;
  const errors = [];
  let calls = 0;
  const coordinator = new NativeSyncCoordinator({
    getActiveAccountId: () => 'account-a',
    syncAccount: async () => {
      calls += 1;
      if (shouldFail) throw new Error('network');
    },
    onError: error => errors.push(error.message),
  });
  assert.equal((await coordinator.requestSync('first')).status, 'error');
  shouldFail = false;
  assert.equal((await coordinator.requestSync('second')).status, 'synced');
  assert.deepEqual(errors, ['network']);
  assert.equal(calls, 2);
  coordinator.stop();
});
