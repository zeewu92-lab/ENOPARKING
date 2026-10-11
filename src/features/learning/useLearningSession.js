import { useCallback, useEffect, useMemo, useState } from 'react';
import { jiluDanciLearned, jiluStageCompleted } from '../../utils/learningStats.js';
import { recordLearningSeed } from '../../utils/seedLedger.js';
import { storage } from '../../utils/storage.js';
import { EventQueue, createEventId } from '../../api/eventQueue.js';
import { isLearningEventSyncEnabled, syncLearningEventAfterWrite } from '../../api/learningEventSync.js';
import {
  getNextVerification,
  getTodayDay,
  recordLearningEvent
} from './learningState.js';

const SESSION_PREFIX = 'v2:learning-session:';
const DEFAULT_GOAL = 10;

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function getGoal() {
  if (typeof window === 'undefined') return DEFAULT_GOAL;
  const grade = localStorage.getItem('engnocrazy:grade') || '';
  const raw = Number(localStorage.getItem('engnocrazy:dailyGoal'));
  const min = grade === 'senior3' ? 20 : 5;
  const max = grade === 'senior3' ? 100 : 30;
  if (Number.isFinite(raw) && raw >= min && raw <= max) return raw;
  return grade === 'senior3' ? 50 : DEFAULT_GOAL;
}

function sessionKey(sourceKey, accountId = null) {
  const session = encodeURIComponent(todayKey() + ':' + sourceKey);
  if (!accountId) return SESSION_PREFIX + session;
  return SESSION_PREFIX + 'account:' + encodeURIComponent(accountId) + ':' + session;
}

function readSession(sourceKey, accountId = null) {
  const saved = storage.getJSON(sessionKey(sourceKey, accountId), null);
  if (!saved) return { used: 0, wordIndex: 0, stage: 1 };
  return {
    used: Math.max(0, Number(saved.used) || 0),
    wordIndex: Math.max(0, Number(saved.wordIndex) || 0),
    stage: Math.max(1, Number(saved.stage) || 1)
  };
}

function getChoiceOptions(word, wordList) {
  const currentMeaning = String(word?.meaning || word?.m || '暫無釋義').trim();
  const candidates = wordList
    .filter(item => item && item.id !== word.id)
    .map(item => String(item.meaning || item.m || '').trim())
    .filter(Boolean);

  const unique = [...new Set([currentMeaning, ...candidates])];
  const hash = String(word?.id || word?.word || '').split('').reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  const others = unique
    .slice(1)
    .sort((a, b) => {
      const aa = (a.length + hash) % 17;
      const bb = (b.length + hash) % 17;
      return aa - bb || a.localeCompare(b);
    })
    .slice(0, 3);

  return [currentMeaning, ...others].sort((a, b) => {
    if (a === currentMeaning) return -1;
    if (b === currentMeaning) return 1;
    return a.localeCompare(b);
  });
}

export function useLearningSession(wordList, sourceKey, requestedGoal = null, accountId = null) {
  const goal = Math.max(1, Number(requestedGoal) || getGoal());
  const base = Math.min(goal, wordList.length);
  const scopedAccountId = isLearningEventSyncEnabled() && accountId ? String(accountId) : null;
  const [session, setSession] = useState(() => readSession(sourceKey, scopedAccountId));
  const [phase, setPhase] = useState('idle');
  const [verification, setVerification] = useState(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentWord = useMemo(
    () => wordList[session.wordIndex] || null,
    [wordList, session.wordIndex]
  );

  const options = useMemo(
    () => getChoiceOptions(currentWord, wordList),
    [currentWord, wordList]
  );

  useEffect(() => {
    const saved = readSession(sourceKey, scopedAccountId);
    setSession(saved);
    setPhase('idle');
    setVerification(null);
    setAnswer('');
    setFeedback(null);
    setCompleted(saved.used >= Math.min(goal, wordList.length));
  }, [goal, sourceKey, wordList.length, scopedAccountId]);

  useEffect(() => {
    storage.setJSON(sessionKey(sourceKey, scopedAccountId), session);
  }, [sourceKey, scopedAccountId, session]);

  useEffect(() => {
    if (!base) return;
    if (session.used >= base || !currentWord) {
      setCompleted(true);
      setPhase('complete');
      return;
    }
    setCompleted(false);
  }, [base, currentWord, session.used]);

  const refreshVerification = useCallback((word) => {
    if (!word) {
      setVerification(null);
      return;
    }
    const next = getNextVerification(
      word.id ?? word.word ?? word.w,
      getTodayDay(),
      scopedAccountId
    );
    setVerification(next);
  }, [scopedAccountId]);

  const start = useCallback(() => {
    if (!currentWord || completed || session.used >= base) return false;
    setFeedback(null);
    setAnswer('');
    refreshVerification(currentWord);
    setPhase('card');
    return true;
  }, [base, completed, currentWord, refreshVerification, session.used]);

  useEffect(() => {
    if (phase !== 'card') return;
    refreshVerification(currentWord);
  }, [currentWord, phase, refreshVerification]);

  const speak = useCallback(() => {
    if (!currentWord || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      String(currentWord.word || currentWord.w || '')
    );
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }, [currentWord]);

  const submit = useCallback((value) => {
    if (busy || phase !== 'card' || !currentWord || !verification) return false;

    const input = String(value || '').trim();
    if (!input) return false;

    const targetWord = String(currentWord.word || currentWord.w || '').trim().toLowerCase();
    const targetMeaning = String(currentWord.meaning || currentWord.m || '').trim();
    const correct = verification.verification === 'choice'
      ? input === targetMeaning
      : input.toLowerCase() === targetWord;

    setBusy(true);
    setFeedback(null);

    let syncQueue = null;
    let queuedEvent = null;
    let learningEventRecorded = false;
    try {
      const wordId = String(currentWord.id ?? currentWord.word ?? currentWord.w);
      const day = getTodayDay();
      const eventResult = correct ? 'correct' : 'wrong';
      const syncEnabled = Boolean(scopedAccountId);

      if (syncEnabled) {
        syncQueue = new EventQueue({ accountId: scopedAccountId });
        queuedEvent = syncQueue.enqueue({
          eventId: createEventId(),
          type: 'action',
          payload: {
            wordId,
            day,
            verification: verification.verification,
            result: eventResult,
            hintLevel: 'none'
          }
        });
      }

      recordLearningEvent({
        wordId,
        day,
        verification: verification.verification,
        result: eventResult,
        hintLevel: 'none',
        accountId: scopedAccountId,
        syncEventId: queuedEvent?.eventId || null
      });
      learningEventRecorded = true;

      if (queuedEvent) void syncLearningEventAfterWrite(scopedAccountId);

      if (!correct) {
        setFeedback({
          ok: false,
          message: '這次驗證沒有通過，演算法已記錄一次錯誤事件。'
        });
        setAnswer('');
        refreshVerification(currentWord);
        return false;
      }

      const nextUsed = session.used + 1;
      const nextIndex = session.wordIndex + 1;
      const stageDone = nextUsed >= base || !wordList[nextIndex];

      recordLearningSeed({
        wordId: currentWord.id ?? currentWord.word ?? currentWord.w,
        source: 'learning',
        lifecycle: 'stage-' + session.stage,
        day: todayKey()
      });
      jiluDanciLearned({ completedDailyGoal: stageDone });

      setSession({
        used: nextUsed,
        wordIndex: nextIndex < wordList.length ? nextIndex : 0,
        stage: session.stage
      });

      setAnswer('');

      if (stageDone) {
        jiluStageCompleted(session.stage);
        setCompleted(true);
        setPhase('complete');
        setFeedback({ ok: true, message: '這一階段已完成。' });
      } else {
        setFeedback({ ok: true, message: '已完成這次有效驗證。' });
        setVerification(null);
      }

      return true;
    } catch (error) {
      if (!learningEventRecorded && syncQueue && queuedEvent) {
        try { syncQueue.discardPending(queuedEvent.eventId); } catch {}
      }
      setFeedback({
        ok: false,
        message: learningEventRecorded
          ? (error?.message || '學習事件已記錄，但進度更新未完成。')
          : (error?.message || '學習事件寫入失敗，這次不計入進度。')
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    scopedAccountId,
    base,
    busy,
    currentWord,
    phase,
    refreshVerification,
    session.stage,
    session.used,
    session.wordIndex,
    verification,
    wordList
  ]);

  const nextStage = useCallback(() => {
    if (!completed) return false;
    const nextIndex = session.wordIndex < wordList.length ? session.wordIndex : 0;
    setSession({
      used: 0,
      wordIndex: nextIndex,
      stage: session.stage + 1
    });
    setCompleted(false);
    setFeedback(null);
    setVerification(null);
    setAnswer('');
    setPhase('idle');
    return true;
  }, [completed, session.stage, session.wordIndex, wordList.length]);

  const exit = useCallback(() => {
    setPhase('idle');
    setFeedback(null);
    setVerification(null);
    setAnswer('');
    return true;
  }, []);

  return {
    goal,
    base,
    used: session.used,
    stage: session.stage,
    currentWord,
    phase,
    verification,
    options,
    revealed: true,
    answer,
    feedback,
    completed,
    busy,
    setAnswer,
    start,
    speak,
    submit,
    nextStage,
    exit
  };
}
