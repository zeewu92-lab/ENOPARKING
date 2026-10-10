import { EventQueue } from './eventQueue.js';
import { replayEvents } from './eventReplay.js';
import { applyRemoteLearningEvent, setLearningEventServerSequence } from '../features/learning/learningState.js';

const ENABLED = import.meta.env?.VITE_EVENT_SYNC_ENABLED === 'true';
const accountSyncs = new Map();

export function isLearningEventSyncEnabled() {
  return ENABLED;
}

async function runAccountSync(normalizedAccountId) {
  const queue = new EventQueue({ accountId: normalizedAccountId });
  const report = await replayEvents({
    queue,
    clientVersion: import.meta.env?.VITE_APP_VERSION || '1.0.0',
    applyEvent: event => applyRemoteLearningEvent(event, normalizedAccountId)
  });

  // Persist server ordering on locally-created history entries after ACK reconciliation.
  for (const event of queue.list()) {
    if (event.syncStatus === 'confirmed' && Number.isSafeInteger(event.serverSequence)) {
      setLearningEventServerSequence(normalizedAccountId, event.eventId, event.serverSequence);
    }
  }
  return report;
}

export function syncAccountLearningEvents(accountId) {
  if (!ENABLED) return Promise.resolve({ disabled: true });
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) return Promise.reject(new Error('EVENT_QUEUE_ACCOUNT_REQUIRED'));

  // Initial app sync and post-submit sync can overlap. Share one Replay operation
  // per account in this tab so they cannot race their local cursor and markers.
  const existing = accountSyncs.get(normalizedAccountId);
  if (existing) return existing;

  const pending = runAccountSync(normalizedAccountId).finally(() => {
    if (accountSyncs.get(normalizedAccountId) === pending) {
      accountSyncs.delete(normalizedAccountId);
    }
  });
  accountSyncs.set(normalizedAccountId, pending);
  return pending;
}

export async function syncLearningEventAfterWrite(accountId) {
  if (!ENABLED) return null;
  try {
    return await syncAccountLearningEvents(accountId);
  } catch (error) {
    // Local learning must remain usable while the sync service is unavailable.
    console.warn('[event-sync] learning queue sync deferred:', error?.code || error?.message || 'UNKNOWN');
    return null;
  }
}
