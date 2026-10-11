export async function withAccountSyncLock(accountId, operation, lockManager = globalThis.navigator?.locks) {
  const account = String(accountId || '').trim();
  if (!account) throw new Error('EVENT_QUEUE_ACCOUNT_REQUIRED');
  if (typeof operation !== 'function') throw new Error('EVENT_SYNC_OPERATION_REQUIRED');

  // Web Locks coordinates Replay across same-origin tabs and workers. Older
  // browsers retain the existing per-tab single-flight protection as fallback.
  if (!lockManager || typeof lockManager.request !== 'function') return operation();

  return lockManager.request(
    `enoparking:event-sync:${encodeURIComponent(account)}`,
    { mode: 'exclusive' },
    operation
  );
}
