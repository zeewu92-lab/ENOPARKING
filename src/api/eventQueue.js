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

export class EventQueue {
  constructor({ storage, now = () => Date.now(), createId = createEventId } = {}) {
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
    const state = readJson(this.storage, QUEUE_KEY, newQueueState());
    if (state?.version !== 1 || !Array.isArray(state.events)) return newQueueState();
    return {
      version: 1,
      localCounter: Number.isSafeInteger(state.localCounter) && state.localCounter >= 0 ? state.localCounter : 0,
      events: state.events.filter(event => event && typeof event.eventId === 'string')
    };
  }

  saveState(state) {
    writeJson(this.storage, QUEUE_KEY, state);
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
      error: null
    };
    state.events.push(event);
    this.saveState(state);
    return { ...event };
  }

  list() {
    return this.readState().events.map(event => ({ ...event }));
  }

  pendingForSync(limit = 100) {
    return this.readState().events
      .filter(event => event.syncStatus === 'pending' || (event.syncStatus === 'failed' && event.error?.retryable))
      .slice(0, Math.max(0, Math.min(100, limit)))
      .map(({ syncStatus, serverSequence, error, ...event }) => event);
  }

  reconcile(results) {
    if (!Array.isArray(results)) throw new Error('EVENT_SYNC_RESPONSE_INVALID');
    const byId = new Map(results.map(result => [result?.eventId, result]));
    const state = this.readState();
    state.events = state.events.map(event => {
      const result = byId.get(event.eventId);
      if (!result) return event;
      if (result.syncStatus === 'confirmed' && Number.isSafeInteger(Number(result.serverSequence))) {
        return { ...event, syncStatus: 'confirmed', serverSequence: Number(result.serverSequence), error: null };
      }
      if (result.syncStatus === 'dead' || result.syncStatus === 'failed') {
        return {
          ...event,
          syncStatus: 'failed',
          serverSequence: null,
          error: result.error && typeof result.error === 'object'
            ? { code: String(result.error.code || 'EVENT_SYNC_FAILED'), retryable: Boolean(result.error.retryable), ...(Number.isFinite(Number(result.error.retryAfterMs)) ? { retryAfterMs: Number(result.error.retryAfterMs) } : {}) }
            : { code: 'EVENT_SYNC_FAILED', retryable: false }
        };
      }
      return event;
    });
    this.saveState(state);
    return this.list();
  }

  getReplayCursor() {
    const value = Number(this.storage.getItem(CURSOR_KEY) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  setReplayCursor(value) {
    if (!Number.isSafeInteger(value) || value < this.getReplayCursor()) throw new Error('EVENT_REPLAY_CURSOR_INVALID');
    this.storage.setItem(CURSOR_KEY, String(value));
  }

  hasApplied(eventId) {
    const ids = readJson(this.storage, APPLIED_KEY, []);
    return Array.isArray(ids) && ids.includes(eventId);
  }

  markApplied(eventId) {
    const ids = readJson(this.storage, APPLIED_KEY, []);
    const next = Array.isArray(ids) ? ids : [];
    if (!next.includes(eventId)) next.push(eventId);
    writeJson(this.storage, APPLIED_KEY, next.slice(-5000));
  }
}

export const eventQueueStorageKeys = Object.freeze({
  queue: QUEUE_KEY,
  device: DEVICE_KEY,
  cursor: CURSOR_KEY,
  applied: APPLIED_KEY
});
