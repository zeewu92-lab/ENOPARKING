const ACTION_VERIFICATIONS = new Set(['choice', 'spelling', 'dictation', 'usage']);
const ACTION_RESULTS = new Set(['correct', 'wrong']);

function requireAccountId(accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('NATIVE_LEARNING_ACCOUNT_REQUIRED');
  }
}

function validateActionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.wordId !== 'string' || !payload.wordId.trim() ||
      !Number.isSafeInteger(payload.day) || payload.day < 0 ||
      !ACTION_VERIFICATIONS.has(payload.verification) ||
      !ACTION_RESULTS.has(payload.result) || payload.hintLevel !== 'none' ||
      (payload.unitId != null && (typeof payload.unitId !== 'string' || !payload.unitId.trim()))) {
    throw new Error('NATIVE_LEARNING_ACTION_INVALID');
  }
}

async function readState(tx, accountId, stateKey) {
  const row = await tx.getFirstAsync(
    'SELECT state_json AS stateJson FROM enop_learning_state WHERE account_id = ? AND state_key = ?',
    accountId,
    stateKey
  );
  if (!row) return null;
  try {
    const state = JSON.parse(row.stateJson);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid');
    return state;
  } catch {
    throw new Error('NATIVE_LEARNING_STATE_CORRUPT');
  }
}

async function writeState(tx, accountId, stateKey, state, now) {
  await tx.runAsync(
    `INSERT INTO enop_learning_state (account_id, state_key, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, state_key) DO UPDATE SET
       state_json = excluded.state_json, updated_at = excluded.updated_at`,
    accountId,
    stateKey,
    JSON.stringify(state),
    now
  );
}

/**
 * Persist a learning event and its account-scoped projection using the same
 * SQLite transaction supplied by NativeEventStore.enqueue/applyReplay.
 */
export async function applyNativeLearningEvent(tx, accountId, event, { now = Date.now() } = {}) {
  requireAccountId(accountId);
  if (!tx || typeof tx.getFirstAsync !== 'function' || typeof tx.runAsync !== 'function') {
    throw new Error('NATIVE_LEARNING_TRANSACTION_REQUIRED');
  }
  if (!event || typeof event !== 'object' || typeof event.eventId !== 'string' || !event.eventId.trim()) {
    throw new Error('NATIVE_LEARNING_EVENT_INVALID');
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('NATIVE_LEARNING_TIME_INVALID');

  const eventKey = 'event:' + event.eventId;
  const previousEvent = await readState(tx, accountId, eventKey);
  if (previousEvent) return false;

  if (event.type === 'action') {
    validateActionPayload(event.payload);
    const wordId = event.payload.wordId.trim().toLowerCase();
    const stateKey = 'word:' + wordId;
    const previous = await readState(tx, accountId, stateKey) || {
      wordId,
      reviewCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastDay: null,
      lastEventId: null,
      lastServerSequence: null
    };
    const next = {
      ...previous,
      reviewCount: previous.reviewCount + 1,
      correctCount: previous.correctCount + (event.payload.result === 'correct' ? 1 : 0),
      wrongCount: previous.wrongCount + (event.payload.result === 'wrong' ? 1 : 0),
      lastDay: event.payload.day,
      lastEventId: event.eventId,
      lastServerSequence: Number.isSafeInteger(event.serverSequence) ? event.serverSequence : previous.lastServerSequence
    };
    await writeState(tx, accountId, stateKey, next, now);
  } else if (event.type === 'unit_outcome') {
    const payload = event.payload;
    if (!payload || typeof payload.unitId !== 'string' || !payload.unitId.trim() ||
        typeof payload.correct !== 'boolean' ||
        Object.keys(payload).some(key => !['unitId', 'correct'].includes(key))) {
      throw new Error('NATIVE_LEARNING_UNIT_OUTCOME_INVALID');
    }
    const stateKey = 'unit:' + payload.unitId;
    const previous = await readState(tx, accountId, stateKey) || {
      unitId: payload.unitId,
      outcomeCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastEventId: null,
      lastServerSequence: null
    };
    await writeState(tx, accountId, stateKey, {
      ...previous,
      outcomeCount: previous.outcomeCount + 1,
      correctCount: previous.correctCount + (payload.correct ? 1 : 0),
      wrongCount: previous.wrongCount + (payload.correct ? 0 : 1),
      lastEventId: event.eventId,
      lastServerSequence: Number.isSafeInteger(event.serverSequence) ? event.serverSequence : previous.lastServerSequence
    }, now);
  } else {
    throw new Error('NATIVE_LEARNING_EVENT_TYPE_INVALID');
  }

  await writeState(tx, accountId, eventKey, {
    eventId: event.eventId,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt,
    serverSequence: Number.isSafeInteger(event.serverSequence) ? event.serverSequence : null
  }, now);
  return true;
}

export async function recordNativeLearningAction({
  store,
  accountId,
  payload,
  createEventId,
  now = Date.now()
}) {
  requireAccountId(accountId);
  validateActionPayload(payload);
  if (!store || typeof store.enqueue !== 'function') throw new Error('NATIVE_LEARNING_EVENT_STORE_REQUIRED');
  if (typeof createEventId !== 'function') throw new Error('NATIVE_LEARNING_EVENT_ID_PROVIDER_REQUIRED');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('NATIVE_LEARNING_TIME_INVALID');

  const eventId = await createEventId();
  if (typeof eventId !== 'string' || !eventId.trim()) throw new Error('NATIVE_LEARNING_EVENT_ID_INVALID');
  return store.enqueue(accountId, {
    eventId,
    type: 'action',
    payload: { ...payload, wordId: payload.wordId.trim().toLowerCase() },
    createdAt: now
  }, {
    applyOptimisticState: (tx, event) => applyNativeLearningEvent(tx, accountId, event, { now })
  });
}
