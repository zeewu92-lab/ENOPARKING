import { createLearningAlgorithm } from './algorithm.js';

const KEY = 'v2:learning-events';
const DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];
const DEFAULT_SCORES = Object.freeze({
  meaning: 0,
  spelling: 0,
  listening: 0,
  usage: 0
});

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

function readEvents() {
  if (typeof window === 'undefined') return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(events));
  } catch {}
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
    .sort((a, b) => (Number(a.day) - Number(b.day)) || (Number(a.sequence) - Number(b.sequence)));
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
      scores
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
      scores
    }).scores;
  }

  return {
    algorithm,
    scores,
    history
  };
}

export function getLearningEvents() {
  return readEvents();
}

export function getWordLearningState(wordId) {
  return replayWord(wordId);
}

export function getNextVerification(wordId, day = dayFromDate()) {
  const state = replayWord(wordId);
  const { algorithm } = replayForVerification(wordId);
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
  hintLevel = 'none'
} = {}) {
  const normalizedId = String(wordId ?? '').trim().toLowerCase();
  if (!normalizedId || !verification) {
    throw new Error('缺少有效的学习事件参数');
  }

  const events = readEvents();
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
    unitId: unitId || null,
    wordId: normalizedId,
    day: Number(day),
    date: dateFromDay(Number(day)),
    verification,
    result,
    hintLevel,
    recordedAt: new Date().toISOString()
  });

  writeEvents(events);

  return {
    ...processed,
    state: getWordLearningState(normalizedId)
  };
}

export function getTodayDay() {
  return dayFromDate();
}

export function clearLearningEventsForTest() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
