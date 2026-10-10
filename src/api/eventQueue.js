const QUEUE_KEY = 'enoparking:event-queue:v1';
const DEVICE_KEY = 'enoparking:event-device:v1';
const CURSOR_KEY = 'enoparking:event-replay-cursor:v1';
const APPLIED_KEY = 'enoparking:event-applied-ids:v1';

function getStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    throw new Error('EVENT_QUEUE_STORAGE_UNAVAILABLE');
  }
}

function readJson(storage, key, fallback) {
  try {
    const value = getStorage(storage).getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    if (error?.message === 'EVENT_QUEUE_STORAGE_UNAVAILABLE') throw error;
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    getStorage(storage).setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('EVENT_QUEUE_STORAGE_UNAVAILABLE');
  }
}

export function createEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error('EVENT_ID_GENERATOR_UNAVAILABLE');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newQueueState() {
  return { version: 1, localCounter: 0, events: [] };
}

export function getEventQueueStorageKeys(accountId) {
  const account = String(accountId || '').trim();
  if (!account) throw new Error('EVENT_QUEUE_ACCOUNT_REQUIRED');
  const scope = encodeURIComponent(account);
  return {
    queue: `${QUEUE_KEY}:${scope}`,
    device: DEVICE_KEY,
    cursor: `${CURSOR_KEY}:${scope}`,
    applied: `${APPLIED_KEY}:${scope}`
  };
}

export class EventQueue {
  constructor({ accountId, storage, now = () => Date.now(), createId = createEventId } = {}) {
    this.keys = getEventQueueStorageKeys(accountId);
    this.accountId = String(accountId).trim();
    this.storage = getStorage(storage);
    this.now = now;
    this.createId = createId;
  }

  getDeviceId() {
    let deviceId = this.storage.getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = this.createId();
      this.storage.setItem(DEVICE_KEY, deviceId);
    }
    return deviceId;
  }

  readState() {
    const state = readJson(this.storage, this.keys.queue, newQueueState());
    if (state?.version !== 1 || !Array.isArray(state.events)) return newQueueState();
    return {
      version: 1,
      localCounter: Number.isSafeInteger(state.localCounter) && state.localCounter >= 0 ? state.localCounter : 0,
      events: state.events.filter(event => event && typeof event.eventId === 'string')
    };
  }

  saveState(state) {
    writeJson(this.storage, this.keys.queue, state);
  }

  enqueue({ type, payload, createdAt = this.now() }) {
    if (!['action', 'unit_outcome'].includes(type)) throw new Error('EVENT_TYPE_UNKNOWN');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('EVENT_PAYLOAD_INVALID');
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('EVENT_CREATED_AT_INVALID');

    const state = this.readState();
    state.localCounter += 1;
    if (!Number.isSafeInteger(state.localCounter)) throw new Error('EVENT_LOCAL_COUNTER_EXHAUSTED');

    const event = {
      eventId: this.createId(),
      type,
      localCounter: state.localCounter,
      payload,
      createdAt,
      syncStatus: 'pending',
      serverSequence: null,
      attemptCount: 0,
      nextAttemptAt: createdAt,
      error: null
    };
    state.events.push(event);
    this.saveState(state);
    // 本地事件已即时生效，Replay 拉回同一事件时只推进游标，不重复应用。
    this.markApplied(event.eventId);
    return { ...event };
  }

  list() {
    return this.readState().events.map(event => ({ ...event }));
  }

  pendingForSync(limit = 100) {
    return this.readState().events
      .filter(event => event.syncStatus === 'pending' || (event.syncStatus === 'failed' && event.error?.retryable && Number(event.nextAttemptAt || 0) <= this.now()))
      .slice(0, Math.max(0, Math.min(100, limit)))
      .map(({ syncStatus, serverSequence, error, attemptCount, nextAttemptAt, ...event }) => event);
  }

  reconcile(results) {
    if (!Array.isArray(results)) throw new Error('EVENT_SYNC_RESPONSE_INVALID');
    const byId = new Map(results.map(result => [result?.eventId, result]));
    const state = this.readState();
    state.events = state.events.map(event => {
      const result = byId.get(event.eventId);
      if (!result) return event;
      if (result.syncStatus === 'confirmed' && Number.isSafeInteger(Number(result.serverSequence))) {
        return { ...event, syncStatus: 'confirmed', serverSequence: Number(result.serverSequence), error: null, nextAttemptAt: null };
      }
      if (result.syncStatus === 'dead' || result.syncStatus === 'failed') {
        const error = result.error && typeof result.error === 'object'
          ? { code: String(result.error.code || 'EVENT_SYNC_FAILED'), retryable: Boolean(result.error.retryable), ...(Number.isFinite(Number(result.error.retryAfterMs)) ? { retryAfterMs: Math.max(0, Number(result.error.retryAfterMs)) } : {}) }
          : { code: 'EVENT_SYNC_FAILED', retryable: false };
        const attemptCount = (Number.isSafeInteger(event.attemptCount) ? event.attemptCount : 0) + 1;
        const backoffMs = Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(attemptCount - 1, 8)));
        return {
          ...event,
          syncStatus: 'failed',
          serverSequence: null,
          attemptCount,
          nextAttemptAt: error.retryable ? this.now() + (error.retryAfterMs ?? backoffMs) : null,
          error
        };
      }
      return event;
    });
    this.saveState(state);
    return this.list();
  }

  getReplayCursor() {
    const value = Number(this.storage.getItem(this.keys.cursor) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  setReplayCursor(value) {
    if (!Number.isSafeInteger(value) || value < this.getReplayCursor()) throw new Error('EVENT_REPLAY_CURSOR_INVALID');
    this.storage.setItem(this.keys.cursor, String(value));
  }

  hasApplied(eventId) {
    const ids = readJson(this.storage, this.keys.applied, []);
    return Array.isArray(ids) && ids.includes(eventId);
  }

  markApplied(eventId) {
    const ids = readJson(this.storage, this.keys.applied, []);
    const next = Array.isArray(ids) ? ids : [];
    if (!next.includes(eventId)) next.push(eventId);
    writeJson(this.storage, this.keys.applied, next.slice(-5000));
  }
}

export const eventQueueStorageKeys = Object.freeze({
  queuePrefix: QUEUE_KEY,
  device: DEVICE_KEY,
  cursorPrefix: CURSOR_KEY,
  appliedPrefix: APPLIED_KEY
});
