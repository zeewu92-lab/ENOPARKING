import { createLearningAlgorithm } from './algorithm.js';

const KEY = 'v2:learning-events';
const ACCOUNT_KEY_PREFIX = KEY + ':account:';
const DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];
const DEFAULT_SCORES = Object.freeze({
  meaning: 0,
  spelling: 0,
  listening: 0,
  usage: 0
});

function storageKey(accountId) {
  const account = String(accountId || '').trim();
  return account ? ACCOUNT_KEY_PREFIX + encodeURIComponent(account) : KEY;
}

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function dayFromDate(value = todayKey()) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dayFromDate(todayKey());
  return Math.floor(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ) / 86400000);
}

function dateFromDay(day) {
  const date = new Date(Number(day) * 86400000);
  return date.toISOString().slice(0, 10);
}

function readEvents(accountId) {
  if (typeof window === 'undefined') return [];
  let raw;
  try {
    raw = window.localStorage.getItem(storageKey(accountId));
  } catch {
    throw new Error('LEARNING_EVENT_STORAGE_UNAVAILABLE');
  }
  if (raw === null || raw === undefined) return [];

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new Error('LEARNING_EVENT_STORAGE_CORRUPT');
  }
  if (!Array.isArray(saved) || saved.some(event => !event || typeof event !== 'object' || Array.isArray(event))) {
    throw new Error('LEARNING_EVENT_STORAGE_CORRUPT');
  }
  return saved;
}

function writeEvents(events, accountId) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(accountId), JSON.stringify(events));
  } catch {
    throw new Error('LEARNING_EVENT_STORAGE_UNAVAILABLE');
  }
}

function compareEvents(a, b) {
  const dayDifference = Number(a.day) - Number(b.day);
  if (dayDifference) return dayDifference;

  const aServer = Number.isSafeInteger(a.serverSequence) ? a.serverSequence : null;
  const bServer = Number.isSafeInteger(b.serverSequence) ? b.serverSequence : null;
  if (aServer !== null && bServer !== null) return aServer - bServer;
  if (aServer !== null) return -1;
  if (bServer !== null) return 1;
  return (Number(a.sequence) || 0) - (Number(b.sequence) || 0);
}

function normalizeScores(scores) {
  return DIMENSIONS.reduce((result, dimension) => {
    result[dimension] = Math.max(
      0,
      Math.min(100, Number(scores?.[dimension]) || 0)
    );
    return result;
  }, {});
}

function getHistory(wordId, events = readEvents()) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  return events
    .filter(event => String(event.wordId ?? '').trim().toLowerCase() === normalizedId)
    .sort(compareEvents);
}

function replayWord(wordId, events = readEvents()) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  const history = getHistory(normalizedId, events);
  const algorithm = createLearningAlgorithm();
  let scores = { ...DEFAULT_SCORES };
  let lastResult = null;

  for (const event of history) {
    const result = algorithm.processor.process({
      wordId: normalizedId,
      day: Number(event.day),
      verification: event.verification,
      result: event.result,
      hintLevel: event.hintLevel || 'none',
      scores,
      enforceVerification: !event.syncEventId
    });
    scores = result.scores;
    lastResult = result;
  }

  const day = history.length ? Number(history[history.length - 1].day) : dayFromDate();
  const mastery = algorithm.masteryCalculator.calculate(scores);
  const stability = algorithm.stabilityEngine.snapshot();
  const selector = algorithm.processor.selectorFor(normalizedId);

  return {
    wordId: normalizedId,
    reviewCount: selector.reviewCount,
    scores: normalizeScores(scores),
    mastery,
    stability,
    lastEvent: lastResult?.event || null,
    nextReviewDay: lastResult?.kind === 'correct'
      ? algorithm.scheduler.schedule({
          state: mastery.state,
          stability: stability.stability,
          reviewedAtDay: day
        }).nextReviewDay
      : day + 1
  };
}

function replayForVerification(wordId, events = readEvents()) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  const history = getHistory(normalizedId, events);
  const algorithm = createLearningAlgorithm();
  let scores = { ...DEFAULT_SCORES };

  for (const event of history) {
    scores = algorithm.processor.process({
      wordId: normalizedId,
      day: Number(event.day),
      verification: event.verification,
      result: event.result,
      hintLevel: event.hintLevel || 'none',
      scores,
      enforceVerification: !event.syncEventId
    }).scores;
  }

  return { algorithm, scores, history };
}

export function getLearningEvents(accountId = null) {
  return readEvents(accountId);
}

export function getWordLearningState(wordId, accountId = null) {
  return replayWord(wordId, readEvents(accountId));
}

export function getNextVerification(wordId, day = dayFromDate(), accountId = null) {
  const events = readEvents(accountId);
  const state = replayWord(wordId, events);
  const { algorithm } = replayForVerification(wordId, events);
  const selected = algorithm.processor.selectorFor(state.wordId).select(day);

  return {
    ...selected,
    reviewCount: state.reviewCount,
    state
  };
}

export function recordLearningEvent({
  wordId,
  unitId = null,
  day = dayFromDate(),
  verification,
  result = 'correct',
  hintLevel = 'none',
  accountId = null,
  syncEventId = null
} = {}) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  if (!normalizedId || !verification) {
    throw new Error('缺少有效的学习事件参数');
  }

  const events = readEvents(accountId);
  const { algorithm, scores } = replayForVerification(normalizedId, events);
  const selected = algorithm.processor.selectorFor(normalizedId).select(Number(day));

  if (selected.verification !== verification) {
    throw new Error('当前验证方式与学习算法选择不一致');
  }

  const processed = algorithm.processor.process({
    wordId: normalizedId,
    day: Number(day),
    verification,
    result,
    hintLevel,
    scores
  });

  const sequence = events.reduce(
    (max, event) => Math.max(max, Number(event.sequence) || 0),
    0
  ) + 1;

  events.push({
    type: 'action',
    sequence,
    eventId: processed.event.eventId,
    syncEventId: syncEventId || null,
    serverSequence: null,
    unitId: unitId || null,
    wordId: normalizedId,
    day: Number(day),
    date: dateFromDay(Number(day)),
    verification,
    result,
    hintLevel,
    recordedAt: new Date().toISOString()
  });

  writeEvents(events, accountId);

  return {
    ...processed,
    state: replayWord(normalizedId, events)
  };
}

export function applyRemoteLearningEvent(event, accountId) {
  if (!String(accountId || '').trim()) throw new Error('LEARNING_EVENT_ACCOUNT_REQUIRED');
  const payload = event?.payload;
  const serverSequence = Number(event?.serverSequence);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !Number.isSafeInteger(serverSequence) || serverSequence < 1 ||
      typeof event.eventId !== 'string' || !event.eventId) {
    throw new Error('EVENT_PAYLOAD_INVALID');
  }

  const events = readEvents(accountId);
  if (events.some(item => item.syncEventId === event.eventId)) return false;
  const sequence = events.reduce(
    (max, item) => Math.max(max, Number(item.sequence) || 0),
    0
  ) + 1;

  if (event.type === 'unit_outcome') {
    if (typeof payload.unitId !== 'string' || !payload.unitId.trim() || typeof payload.correct !== 'boolean') {
      throw new Error('EVENT_PAYLOAD_INVALID');
    }
    events.push({
      type: 'unit_outcome',
      sequence,
      eventId: 'sync-' + event.eventId,
      syncEventId: event.eventId,
      serverSequence,
      unitId: payload.unitId,
      correct: payload.correct,
      recordedAt: new Date().toISOString()
    });
    writeEvents(events, accountId);
    return true;
  }

  if (event.type !== 'action') throw new Error('EVENT_APPLY_UNSUPPORTED_TYPE');
  const wordId = String(payload.wordId || '').trim().toLowerCase();
  const day = Number(payload.day);
  if (!wordId || !Number.isSafeInteger(day) || day < 0 ||
      !['choice', 'spelling', 'dictation', 'usage'].includes(payload.verification) ||
      !['correct', 'wrong'].includes(payload.result) ||
      payload.hintLevel !== 'none' ||
      (payload.unitId != null && (typeof payload.unitId !== 'string' || !payload.unitId.trim()))) {
    throw new Error('EVENT_PAYLOAD_INVALID');
  }

  events.push({
    type: 'action',
    sequence,
    eventId: 'sync-' + event.eventId,
    syncEventId: event.eventId,
    serverSequence,
    unitId: payload.unitId || null,
    wordId,
    day,
    date: dateFromDay(day),
    verification: payload.verification,
    result: payload.result,
    hintLevel: payload.hintLevel,
    recordedAt: new Date().toISOString()
  });
  writeEvents(events, accountId);
  return true;
}

export function setLearningEventServerSequence(accountId, syncEventId, serverSequence) {
  if (!String(accountId || '').trim() ||
      !String(syncEventId || '').trim() ||
      !Number.isSafeInteger(serverSequence) || serverSequence < 1) {
    throw new Error('LEARNING_EVENT_SEQUENCE_INVALID');
  }
  const events = readEvents(accountId);
  let changed = false;
  const next = events.map(event => {
    if (event.syncEventId !== syncEventId || event.serverSequence === serverSequence) return event;
    changed = true;
    return { ...event, serverSequence };
  });
  if (changed) writeEvents(next, accountId);
  return changed;
}

export function getTodayDay() {
  return dayFromDate();
}

export function clearLearningEventsForTest(accountId = null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(accountId));
  } catch {}
}
