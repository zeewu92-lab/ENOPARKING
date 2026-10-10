import test from 'node:test';
import assert from 'node:assert/strict';
import { withAccountSyncLock } from '../src/api/accountSyncLock.js';

function makeLockManager() {
  const tails = new Map();
  const names = [];
  return {
    names,
    request(name, options, callback) {
      names.push({ name, options });
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(callback).finally(() => {
        release();
        if (tails.get(name) === tail) tails.delete(name);
      });
    }
  };
}

test('same-account sync operations from separate tabs serialize on a shared exclusive lock', async () => {
  const locks = makeLockManager();
  let active = 0;
  let peak = 0;
  const order = [];

  const operation = label => withAccountSyncLock('user/a', async () => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(`${label}:start`);
    await new Promise(resolve => setTimeout(resolve, 10));
    order.push(`${label}:end`);
    active -= 1;
    return label;
  }, locks);

  const results = await Promise.all([operation('first'), operation('second')]);
  assert.deepEqual(results, ['first', 'second']);
  assert.equal(peak, 1);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
  assert.ok(locks.names.every(item => item.name === 'enoparking:event-sync:user%2Fa'));
  assert.ok(locks.names.every(item => item.options.mode === 'exclusive'));
});

test('different accounts use independent lock names', async () => {
  const locks = makeLockManager();
  await Promise.all([
    withAccountSyncLock('user-a', async () => 'a', locks),
    withAccountSyncLock('user-b', async () => 'b', locks)
  ]);
  assert.deepEqual(locks.names.map(item => item.name).sort(), [
    'enoparking:event-sync:user-a',
    'enoparking:event-sync:user-b'
  ]);
});

test('missing account and invalid operation fail closed', async () => {
  await assert.rejects(() => withAccountSyncLock('', async () => {}), /EVENT_QUEUE_ACCOUNT_REQUIRED/);
  await assert.rejects(() => withAccountSyncLock('user-a', null), /EVENT_SYNC_OPERATION_REQUIRED/);
});

test('falls back to direct operation when Web Locks are unavailable', async () => {
  let called = 0;
  const result = await withAccountSyncLock('user-a', async () => {
    called += 1;
    return 'done';
  }, null);
  assert.equal(result, 'done');
  assert.equal(called, 1);
});
