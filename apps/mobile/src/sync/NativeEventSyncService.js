const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertResponse(ok, body) {
  if (ok) return body;
  const code = body?.error?.code || 'NATIVE_SYNC_HTTP_ERROR';
  const error = new Error(String(code));
  error.code = String(code);
  error.retryable = Boolean(body?.error?.retryable);
  error.status = body?.status;
  throw error;
}

/**
 * Shared push/ACK/pull/replay orchestration. Platform code supplies secure
 * credentials and HTTP transport; this module never reads browser storage.
 */
export class NativeEventSyncService {
  constructor({
    store,
    getCredentials,
    getDeviceId,
    pushEvents,
    pullEvents,
    applyEvent,
    clientVersion = '1.0.0',
    maxPullBatches = 100,
  }) {
    if (!store || typeof store.pendingForSync !== 'function' ||
        typeof store.reconcileAcks !== 'function' ||
        typeof store.applyReplay !== 'function' ||
        typeof store.getReplayCursor !== 'function' ||
        typeof store.recordSyncFailure !== 'function') {
      throw new Error('NATIVE_SYNC_STORE_INVALID');
    }
    if (typeof getCredentials !== 'function') throw new Error('NATIVE_SYNC_CREDENTIAL_PROVIDER_REQUIRED');
    if (typeof getDeviceId !== 'function') throw new Error('NATIVE_SYNC_DEVICE_ID_PROVIDER_REQUIRED');
    if (typeof pushEvents !== 'function' || typeof pullEvents !== 'function') {
      throw new Error('NATIVE_SYNC_TRANSPORT_REQUIRED');
    }
    if (typeof applyEvent !== 'function') throw new Error('NATIVE_SYNC_EVENT_APPLIER_REQUIRED');
    if (typeof clientVersion !== 'string' || !clientVersion.trim()) throw new Error('NATIVE_SYNC_CLIENT_VERSION_INVALID');
    if (!Number.isSafeInteger(maxPullBatches) || maxPullBatches < 1 || maxPullBatches > 1000) {
      throw new Error('NATIVE_SYNC_PULL_LIMIT_INVALID');
    }
    Object.assign(this, {
      store, getCredentials, getDeviceId, pushEvents, pullEvents, applyEvent,
      clientVersion, maxPullBatches
    });
  }

  async syncAccount(accountId, { isCurrentAccount = async () => true } = {}) {
    if (typeof accountId !== 'string' || !accountId.trim()) throw new Error('NATIVE_SYNC_ACCOUNT_REQUIRED');
    const report = { pushed: 0, confirmed: 0, retried: 0, replayed: 0, skipped: 0, cursor: await this.store.getReplayCursor(accountId) };
    if (!(await isCurrentAccount())) return { ...report, status: 'account_changed' };

    const credentials = await this.getCredentials(accountId);
    if (!credentials || credentials.accountId !== accountId ||
        typeof credentials.accessToken !== 'string' || credentials.accessToken.length < 40) {
      throw new Error('NATIVE_SYNC_CREDENTIAL_ACCOUNT_MISMATCH');
    }
    const deviceId = await this.getDeviceId();
    if (typeof deviceId !== 'string' || !UUID_V4.test(deviceId)) {
      throw new Error('NATIVE_SYNC_DEVICE_ID_INVALID');
    }

    const pending = await this.store.pendingForSync(accountId, { limit: 100 });
    if (pending.length) {
      if (!(await isCurrentAccount())) return { ...report, status: 'account_changed' };
      let response;
      try {
        response = await this.pushEvents({
          accessToken: credentials.accessToken,
          deviceId,
          clientVersion: this.clientVersion,
          events: pending.map(({ attemptCount, ...event }) => event),
        });
      } catch (error) {
        await this.store.recordSyncFailure(accountId, pending.map(event => event.eventId), error?.code || 'NETWORK_UNAVAILABLE');
        throw error;
      }
      if (!response || !Array.isArray(response.results)) throw new Error('NATIVE_SYNC_PUSH_RESPONSE_INVALID');

      const pendingIds = new Set(pending.map(event => event.eventId));
      const resultIds = new Set();
      for (const item of response.results) {
        if (!item || typeof item.eventId !== 'string' || !pendingIds.has(item.eventId) || resultIds.has(item.eventId)) {
          throw new Error('NATIVE_SYNC_PUSH_RESPONSE_INVALID');
        }
        resultIds.add(item.eventId);
        if (!['confirmed', 'failed', 'dead'].includes(item.syncStatus)) {
          throw new Error('NATIVE_SYNC_PUSH_RESPONSE_INVALID');
        }
      }
      if (resultIds.size !== pendingIds.size) throw new Error('NATIVE_SYNC_PUSH_RESPONSE_INCOMPLETE');
      if (!(await isCurrentAccount())) return { ...report, status: 'account_changed' };

      const acknowledgements = [];
      const retryGroups = new Map();
      const rejected = [];
      for (const item of response.results) {
        if (item.syncStatus === 'confirmed') {
          if (!Number.isSafeInteger(item.serverSequence) || item.serverSequence < 1) {
            throw new Error('NATIVE_SYNC_ACK_INVALID');
          }
          acknowledgements.push({ eventId: item.eventId, serverSequence: item.serverSequence });
        } else if (item.syncStatus === 'failed' && item.error?.retryable) {
          const code = String(item.error.code || 'EVENT_SYNC_FAILED');
          if (!retryGroups.has(code)) retryGroups.set(code, []);
          retryGroups.get(code).push(item.eventId);
        } else {
          rejected.push(item);
        }
      }
      if (acknowledgements.length) await this.store.reconcileAcks(accountId, acknowledgements);
      for (const [code, eventIds] of retryGroups) {
        await this.store.recordSyncFailure(accountId, eventIds, code);
        report.retried += eventIds.length;
      }
      report.pushed = pending.length;
      report.confirmed = acknowledgements.length;
      if (rejected.length) {
        const codes = rejected.map(item => String(item.error?.code || 'EVENT_REJECTED'));
        const error = new Error('NATIVE_EVENT_REJECTED:' + [...new Set(codes)].join(','));
        error.code = 'NATIVE_EVENT_REJECTED';
        error.eventIds = rejected.map(item => item.eventId);
        throw error;
      }
    }

    for (let batch = 0; batch < this.maxPullBatches; batch += 1) {
      if (!(await isCurrentAccount())) return { ...report, status: 'account_changed' };
      const afterSequence = await this.store.getReplayCursor(accountId);
      const page = await this.pullEvents({
        accessToken: credentials.accessToken,
        afterSequence,
        limit: 100,
      });
      if (!page || !Array.isArray(page.events) ||
          !Number.isSafeInteger(page.nextSequence) || page.nextSequence < afterSequence ||
          typeof page.hasMore !== 'boolean') {
        throw new Error('NATIVE_SYNC_PULL_RESPONSE_INVALID');
      }
      let expected = afterSequence + 1;
      for (const event of page.events) {
        if (!event || typeof event.eventId !== 'string' ||
            !Number.isSafeInteger(event.serverSequence) || event.serverSequence !== expected) {
          throw new Error('NATIVE_SYNC_PULL_SEQUENCE_GAP');
        }
        expected += 1;
      }
      if (!page.events.length && page.nextSequence > afterSequence) {
        throw new Error('NATIVE_SYNC_PULL_SEQUENCE_GAP');
      }
      const replay = await this.store.applyReplay(accountId, page.events, this.applyEvent);
      report.replayed += replay.appliedCount;
      report.skipped += page.events.length - replay.appliedCount;
      report.cursor = await this.store.getReplayCursor(accountId);
      if (report.cursor !== (page.events.length ? page.events[page.events.length - 1].serverSequence : afterSequence)) {
        throw new Error('NATIVE_SYNC_CURSOR_MISMATCH');
      }
      if (!page.hasMore) {
        return { ...report, status: 'synced' };
      }
    }
    return { ...report, status: 'more_available' };
  }
}
