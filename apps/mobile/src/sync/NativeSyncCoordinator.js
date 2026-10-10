/**
 * Lifecycle-aware sync scheduler shared by Android and iOS.
 * Transport and account/session state are injected so this module cannot
 * accidentally bind queued events to a different signed-in account.
 */
export class NativeSyncCoordinator {
  constructor({
    getActiveAccountId,
    syncAccount,
    isOnline = () => true,
    onError = () => {},
  }) {
    if (typeof getActiveAccountId !== 'function') throw new Error('NATIVE_SYNC_ACCOUNT_RESOLVER_REQUIRED');
    if (typeof syncAccount !== 'function') throw new Error('NATIVE_SYNC_ADAPTER_REQUIRED');
    if (typeof isOnline !== 'function') throw new Error('NATIVE_SYNC_ONLINE_CHECK_INVALID');
    if (typeof onError !== 'function') throw new Error('NATIVE_SYNC_ERROR_HANDLER_INVALID');

    this.getActiveAccountId = getActiveAccountId;
    this.syncAccount = syncAccount;
    this.isOnline = isOnline;
    this.onError = onError;
    this.running = false;
    this.started = false;
    this.stopped = false;
    this.pendingReasons = new Set();
    this.waiters = [];
    this.subscriptions = [];
  }

  start({ appState, subscribeNetwork } = {}) {
    if (this.started) return () => this.stop();
    if (!appState || typeof appState.addEventListener !== 'function') {
      throw new Error('NATIVE_SYNC_APP_STATE_SOURCE_REQUIRED');
    }
    this.started = true;
    this.stopped = false;

    const appStateSubscription = appState.addEventListener('change', state => {
      if (state === 'active') void this.requestSync('app_foreground');
    });
    if (appStateSubscription && typeof appStateSubscription.remove === 'function') {
      this.subscriptions.push(() => appStateSubscription.remove());
    }

    if (typeof subscribeNetwork === 'function') {
      const unsubscribe = subscribeNetwork(online => {
        if (online) void this.requestSync('network_restored');
      });
      if (typeof unsubscribe === 'function') this.subscriptions.push(unsubscribe);
    }

    // The initial request also covers a session established before listeners mounted.
    void this.requestSync('coordinator_started');
    return () => this.stop();
  }

  stop() {
    this.stopped = true;
    for (const unsubscribe of this.subscriptions.splice(0)) {
      try { unsubscribe(); } catch (error) { this.onError(error, 'unsubscribe'); }
    }
    this.pendingReasons.clear();
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.resolve({ status: 'stopped' });
  }

  requestSync(reason = 'manual') {
    if (this.stopped) return Promise.resolve({ status: 'stopped' });
    if (typeof reason !== 'string' || !reason.trim()) {
      return Promise.reject(new Error('NATIVE_SYNC_REASON_INVALID'));
    }
    this.pendingReasons.add(reason);
    const promise = new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
    if (!this.running) void this.drain();
    return promise;
  }

  async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped && this.pendingReasons.size > 0) {
        const reasons = [...this.pendingReasons];
        this.pendingReasons.clear();
        let result = { status: 'skipped' };
        try {
          if (!this.isOnline()) {
            result = { status: 'offline', reasons };
          } else {
            const accountId = await this.getActiveAccountId();
            if (typeof accountId !== 'string' || !accountId.trim()) {
              result = { status: 'no_active_account', reasons };
            } else if (this.stopped) {
              result = { status: 'stopped' };
            } else if (this.getActiveAccountId && (await this.getActiveAccountId()) !== accountId) {
              // A session changed while resolving identity. Never start a sync for stale identity.
              result = { status: 'account_changed', reasons };
            } else {
              await this.syncAccount(accountId, {
                reasons,
                isCurrentAccount: async () => (await this.getActiveAccountId()) === accountId,
              });
              result = { status: 'synced', accountId, reasons };
            }
          }
        } catch (error) {
          result = { status: 'error', reasons, error };
          try { this.onError(error, reasons); } catch { /* error reporting must not wedge the queue */ }
        }
        const completed = this.waiters.splice(0);
        for (const waiter of completed) waiter.resolve(result);
      }
    } finally {
      this.running = false;
      if (!this.stopped && this.pendingReasons.size > 0) void this.drain();
    }
  }
}
