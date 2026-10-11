import { createLearningAlgorithm } from '../../../../src/features/learning/algorithm.js';

const DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];
const DEFAULT_SCORES = Object.freeze({
  meaning: 0,
  spelling: 0,
  listening: 0,
  usage: 0,
});

function compareEvents(a, b) {
  const dayDifference = Number(a.payload.day) - Number(b.payload.day);
  if (dayDifference) return dayDifference;

  const aServer = Number.isSafeInteger(a.serverSequence) ? a.serverSequence : null;
  const bServer = Number.isSafeInteger(b.serverSequence) ? b.serverSequence : null;
  if (aServer !== null && bServer !== null) return aServer - bServer;
  if (aServer !== null) return -1;
  if (bServer !== null) return 1;
  return (Number(a.localCounter) || 0) - (Number(b.localCounter) || 0);
}

export function replayNativeWordLearning(events, wordId, day) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  if (!normalizedId) throw new Error('NATIVE_LEARNING_WORD_REQUIRED');
  if (!Number.isSafeInteger(day) || day < 0) throw new Error('NATIVE_LEARNING_DAY_INVALID');
  if (!Array.isArray(events)) throw new Error('NATIVE_LEARNING_HISTORY_INVALID');

  const history = events
    .filter(event => event?.type === 'action' &&
      String(event.payload?.wordId ?? '').trim().toLowerCase() === normalizedId)
    .sort(compareEvents);
  const algorithm = createLearningAlgorithm();
  let scores = { ...DEFAULT_SCORES };
  let lastResult = null;

  for (const event of history) {
    const payload = event.payload;
    if (!Number.isSafeInteger(payload.day) || payload.day < 0 ||
        !['choice', 'spelling', 'dictation', 'usage'].includes(payload.verification) ||
        !['correct', 'wrong'].includes(payload.result)) {
      throw new Error('NATIVE_LEARNING_HISTORY_CORRUPT');
    }
    lastResult = algorithm.processor.process({
      wordId: normalizedId,
      day: payload.day,
      verification: payload.verification,
      result: payload.result,
      hintLevel: payload.hintLevel || 'none',
      scores,
      // Historical events can arrive from another device in server order.
      // Replay must reconstruct their effects without rejecting past selector choices.
      enforceVerification: false,
    });
    scores = lastResult.scores;
  }

  const mastery = algorithm.masteryCalculator.calculate(scores);
  const stability = algorithm.stabilityEngine.snapshot();
  const selector = algorithm.processor.selectorFor(normalizedId);
  const nextVerification = selector.select(day);
  const lastDay = history.length ? Number(history[history.length - 1].payload.day) : null;
  const nextReviewDay = !lastResult
    ? day
    : lastResult.kind === 'correct'
      ? algorithm.scheduler.schedule({
          state: mastery.state,
          stability: stability.stability,
          reviewedAtDay: lastDay,
        }).nextReviewDay
      : lastDay + 1;

  return {
    wordId: normalizedId,
    reviewCount: selector.reviewCount,
    scores: DIMENSIONS.reduce((result, dimension) => {
      result[dimension] = Math.max(0, Math.min(100, Number(scores[dimension]) || 0));
      return result;
    }, {}),
    mastery,
    stability,
    lastEvent: lastResult?.event || null,
    nextReviewDay,
    nextVerification: nextVerification.verification,
    selectedDimension: nextVerification.selectedDimension,
  };
}

export async function getNativeWordLearningState(db, accountId, wordId, day) {
  if (!db || typeof db.getAllAsync !== 'function') {
    throw new Error('NATIVE_LEARNING_DATABASE_REQUIRED');
  }
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('NATIVE_LEARNING_ACCOUNT_REQUIRED');
  }
  const rows = await db.getAllAsync(
    `SELECT event_id AS eventId, local_counter AS localCounter,
            event_type AS type, payload_json AS payloadJson,
            server_sequence AS serverSequence
     FROM enop_learning_events
     WHERE account_id = ? AND event_type = 'action'
     ORDER BY local_counter ASC`,
    accountId
  );
  const events = rows.map(row => {
    let payload;
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      throw new Error('NATIVE_LEARNING_HISTORY_CORRUPT');
    }
    return {
      eventId: row.eventId,
      localCounter: row.localCounter,
      serverSequence: row.serverSequence,
      type: row.type,
      payload,
    };
  });
  return replayNativeWordLearning(events, wordId, day);
}

export async function getNativeDailyBatch(db, accountId, vocabulary, day) {
  if (!db || typeof db.getAllAsync !== 'function') {
    throw new Error('NATIVE_LEARNING_DATABASE_REQUIRED');
  }
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('NATIVE_LEARNING_ACCOUNT_REQUIRED');
  }
  if (!Array.isArray(vocabulary)) {
    throw new Error('NATIVE_LEARNING_VOCABULARY_INVALID');
  }
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new Error('NATIVE_LEARNING_DAY_INVALID');
  }

  const rows = await db.getAllAsync(
    `SELECT event_id AS eventId, local_counter AS localCounter,
            event_type AS type, payload_json AS payloadJson,
            server_sequence AS serverSequence
     FROM enop_learning_events
     WHERE account_id = ? AND event_type = 'action'
     ORDER BY local_counter ASC`,
    accountId
  );
  const events = rows.map(row => {
    let payload;
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      throw new Error('NATIVE_LEARNING_HISTORY_CORRUPT');
    }
    return {
      eventId: row.eventId,
      localCounter: row.localCounter,
      serverSequence: row.serverSequence,
      type: row.type,
      payload,
    };
  });

  const eventsByWord = new Map();
  for (const event of events) {
    const id = String(event.payload?.wordId ?? '').trim().toLowerCase();
    if (!id) throw new Error('NATIVE_LEARNING_HISTORY_CORRUPT');
    const group = eventsByWord.get(id) || [];
    group.push(event);
    eventsByWord.set(id, group);
  }

  const candidates = vocabulary.map(word => {
    const wordId = String(word.id ?? '').trim().toLowerCase();
    if (!wordId) throw new Error('NATIVE_LEARNING_VOCABULARY_INVALID');
    const history = eventsByWord.get(wordId) || [];
    const state = replayNativeWordLearning(history, wordId, day);
    const orderedHistory = history.slice().sort(compareEvents);
    let errorStreakWindow = 0;
    for (let i = orderedHistory.length - 1; i >= 0; i -= 1) {
      if (orderedHistory[i].payload.result !== 'wrong') break;
      errorStreakWindow += 1;
    }
    const scoreValues = Object.values(state.scores);
    const lowestDimension = scoreValues.length ? Math.min(...scoreValues) : 0;
    const lastSeenAt = orderedHistory.length
      ? Number(orderedHistory[orderedHistory.length - 1].payload.day)
      : -1;
    return {
      wordId,
      word,
      nextReviewAt: history.length ? state.nextReviewDay : null,
      overdueDays: history.length ? Math.max(0, day - state.nextReviewDay) : 0,
      errorStreakWindow,
      lowestDimension,
      lastSeenAt,
      isNew: history.length === 0,
    };
  });

  const batch = createLearningAlgorithm({
    reviewCap: 20,
    newTarget: 5,
    dailyMax: 30,
  }).dailyBatch.generate({ words: candidates, today: day });
  return batch.map(item => item.word);
}

