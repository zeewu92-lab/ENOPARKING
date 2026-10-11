import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as Speech from 'expo-speech';
import { NativeEventStore } from '../storage/NativeEventStore.js';
import { getNativeWordLearningState, recordNativeLearningAction } from './NativeLearningState.js';
import { getNativeDailyBatch } from './NativeLearningAlgorithm.js';
import { NATIVE_VOCABULARY } from './NativeVocabularyData';

type Props = {
  accountId: string;
};

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getLearningDay(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

export function NativeLearningPanel({ accountId }: Props) {
  const db = useSQLiteContext();
  const store = useMemo(() => new NativeEventStore(db), [db]);
  const [wordIndex, setWordIndex] = useState(0);
  const [dailyWords, setDailyWords] = useState<typeof NATIVE_VOCABULARY>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [skippedCount, setSkippedCount] = useState(0);
  const [answer, setAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [message, setMessage] = useState('根據中文釋義拼寫英文單詞，答案會自動核對並保存為學習事件。');
  const [summary, setSummary] = useState({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
  const [algorithmState, setAlgorithmState] = useState<Awaited<ReturnType<typeof getNativeWordLearningState>> | null>(null);
  const word = dailyWords[wordIndex] ?? null;
  const verification = algorithmState?.nextVerification ?? 'choice';
  const supportsCurrentVerification = verification === 'choice' || verification === 'spelling' || verification === 'dictation';
  const choiceOptions = useMemo(() => {
    if (!word) return [];
    const candidates = NATIVE_VOCABULARY.filter(item => item.id !== word.id && item.meaning !== word.meaning);
    const unique = new Map();
    for (let offset = 0; offset < candidates.length && unique.size < 3; offset += 1) {
      const item = candidates[(wordIndex + offset) % candidates.length];
      if (!unique.has(item.meaning)) unique.set(item.meaning, item);
    }
    const options = [...unique.values(), word];
    // Rotate a deterministic option order so the correct answer is not tied
    // to one fixed lexical position while keeping tests and replay reproducible.
    const rotation = options.length ? wordIndex % options.length : 0;
    return options.slice(rotation).concat(options.slice(0, rotation));
  }, [word?.id, wordIndex]);

  useEffect(() => () => {
    void Speech.stop();
  }, []);

  useEffect(() => {
    let active = true;
    setBatchLoading(true);
    setWordIndex(0);
    setDailyWords([]);
    setAlgorithmState(null);
    setSummary({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
    setSkippedCount(0);
    void getNativeDailyBatch(db, accountId, NATIVE_VOCABULARY, getLearningDay())
      .then(words => {
        if (!active) return;
        setDailyWords(words);
        setBatchLoading(false);
        setMessage(words.length ? '已載入今日學習批次。' : '今日沒有到期複習或可安排的新單詞。');
      })
      .catch(() => {
        if (!active) return;
        setDailyWords([]);
        setBatchLoading(false);
        setMessage('載入今日學習批次失敗，原始學習事件仍保留在本機。');
      });
    return () => { active = false; };
  }, [db, accountId]);

  useEffect(() => {
    let active = true;
    if (!word) return () => { active = false; };
    void db.getFirstAsync<{ stateJson: string }>(
      'SELECT state_json AS stateJson FROM enop_learning_state WHERE account_id = ? AND state_key = ?',
      accountId,
      'word:' + word.id.trim().toLowerCase()
    ).then(row => {
      if (!active) return;
      if (!row) {
        setSummary({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
        return;
      }
      const state = JSON.parse(row.stateJson) as { reviewCount?: number; correctCount?: number; wrongCount?: number };
      setSummary({
        reviewCount: Number(state.reviewCount || 0),
        correctCount: Number(state.correctCount || 0),
        wrongCount: Number(state.wrongCount || 0),
      });
    }).catch(() => {
      if (active) setMessage('讀取本機學習狀態失敗。');
    });
    return () => { active = false; };
  }, [db, accountId, word?.id]);

  useEffect(() => {
    let active = true;
    if (!word) {
      setAlgorithmState(null);
      return () => { active = false; };
    }
    void getNativeWordLearningState(db, accountId, word.id, getLearningDay())
      .then(state => {
        if (active) setAlgorithmState(state);
      })
      .catch(() => {
        if (active) setMessage('計算學習狀態失敗，原始學習事件仍保留在本機。');
      });
    return () => { active = false; };
  }, [db, accountId, word?.id, summary.reviewCount]);

  async function submitAnswer() {
    if (!word) {
      setMessage('目前沒有可用的教材詞彙。');
      return;
    }
    if (busy || answered) return;
    if (!supportsCurrentVerification) {
      setMessage('目前選中的驗證方式尚未接入練習介面，暫停提交以避免記錄錯誤題型。');
      return;
    }
    if (verification === 'choice' && !selectedChoice) {
      setMessage('請先選擇中文釋義。');
      return;
    }
    if ((verification === 'spelling' || verification === 'dictation') && !answer.trim()) {
      setMessage('請先輸入英文答案。');
      return;
    }
    const correct = verification === 'choice'
      ? selectedChoice === word.meaning
      : normalizeAnswer(answer) === normalizeAnswer(word.word);
    setBusy(true);
    setMessage('正在保存學習事件…');
    try {
      await recordNativeLearningAction({
        store,
        accountId,
        payload: {
          wordId: word.id,
          day: getLearningDay(),
          verification,
          result: correct ? 'correct' : 'wrong',
          hintLevel: 'none',
        },
        createEventId: () => Crypto.randomUUID(),
      });
      setAnswered(true);
      setSummary(current => ({
        reviewCount: current.reviewCount + 1,
        correctCount: current.correctCount + (correct ? 1 : 0),
        wrongCount: current.wrongCount + (correct ? 0 : 1),
      }));
      setMessage(correct ? '回答正確，學習事件已保存。' : '本次未答對，正確答案：' + word.word + '。事件已保存。');
    } catch (error) {
      setMessage('保存失敗：' + (error instanceof Error ? error.message : 'NATIVE_LEARNING_SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  function skipCurrentWord() {
    if (!word || busy || answered || !dailyWords.length) return;
    setSkippedCount(current => current + 1);
    setWordIndex(current => Math.min(current + 1, dailyWords.length));
    setAlgorithmState(null);
    setSummary({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
    setAnswer('');
    setSelectedChoice('');
    setAnswered(false);
    setMessage('此題已暫停，未記錄學習事件。');
  }

  function nextWord() {
    if (!dailyWords.length) return;
    setWordIndex(current => Math.min(current + 1, dailyWords.length));
    setAlgorithmState(null);
    setSummary({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
    setAnswer('');
    setSelectedChoice('');
    setAnswered(false);
    setMessage(wordIndex + 1 >= dailyWords.length ? '今日學習批次已完成。' : '準備下一個單詞。');
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>原生單詞練習</Text>
      <Text style={styles.description}>使用共用教材資料；答案核對、本機事件佇列與學習狀態更新都在裝置端完成。</Text>
      {word ? (
        <>
          <Text style={styles.source}>{word.textbook} · {word.unit}</Text>
          <View style={styles.wordCard}>
            {verification === 'choice' ? (
              <>
                <Text style={styles.label}>選擇與英文單詞相符的中文釋義</Text>
                <Text style={styles.meaning}>{word.word}{word.phonetic ? '  ' + word.phonetic : ''}</Text>
                <View style={styles.choices}>
                  {choiceOptions.map(option => (
                    <Pressable key={option.id} accessibilityRole="button" disabled={busy || answered} onPress={() => setSelectedChoice(option.meaning)} style={[styles.choice, selectedChoice === option.meaning && styles.choiceSelected]}>
                      <Text style={styles.choiceText}>{option.meaning}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : verification === 'spelling' ? (
              <>
                <Text style={styles.label}>請根據中文釋義拼寫英文</Text>
                <Text style={styles.meaning}>{word.meaning}</Text>
                <TextInput
                  accessibilityLabel="英文答案"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy && !answered}
                  onChangeText={setAnswer}
                  onSubmitEditing={submitAnswer}
                  placeholder="輸入英文單詞或短語"
                  placeholderTextColor="#879188"
                  returnKeyType="done"
                  style={styles.input}
                  value={answer}
                />
              </>
            ) : verification === 'dictation' ? (
              <>
                <Text style={styles.label}>請聽英文發音並輸入單詞</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || answered}
                  onPress={() => {
                    void Speech.stop();
                    Speech.speak(word.word, { language: 'en-US', rate: 0.82 });
                  }}
                  style={styles.speakButton}
                >
                  <Text style={styles.speakText}>播放英文發音</Text>
                </Pressable>
                <TextInput
                  accessibilityLabel="聽寫答案"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy && !answered}
                  onChangeText={setAnswer}
                  onSubmitEditing={submitAnswer}
                  placeholder="聽完後輸入英文單詞"
                  placeholderTextColor="#879188"
                  returnKeyType="done"
                  style={styles.input}
                  value={answer}
                />
              </>
            ) : (
              <Text style={styles.message}>用法題尚待補齊可驗證的教材語境例句。目前不會記錄此題，避免寫入不符合題型的事件。</Text>
            )}
            {answered ? <Text style={styles.answer}>標準答案：{word.word}{word.phonetic ? '  ' + word.phonetic : ''}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" disabled={busy || answered || !supportsCurrentVerification || !algorithmState} onPress={submitAnswer} style={[styles.submit, (busy || answered || !supportsCurrentVerification || !algorithmState) && styles.disabled]}>
            <Text style={styles.submitText}>{busy ? '保存中…' : '提交答案'}</Text>
          </Pressable>
          {!supportsCurrentVerification && !answered ? (
            <Pressable accessibilityRole="button" disabled={busy} onPress={skipCurrentWord} style={styles.skipButton}>
              <Text style={styles.skipText}>暫停此題，繼續下一個單詞</Text>
            </Pressable>
          ) : null}
          {answered ? (
            <Pressable accessibilityRole="button" onPress={nextWord} style={styles.next}>
              <Text style={styles.nextText}>{wordIndex + 1 >= dailyWords.length ? '完成今日批次' : '下一個單詞'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.message}>{batchLoading ? '正在安排今日學習批次…' : wordIndex >= dailyWords.length && dailyWords.length > 0 ? '今日學習批次已完成。已暫停 ' + skippedCount + ' 題。' : NATIVE_VOCABULARY.length === 0 ? '目前沒有可用的教材詞彙。' : '今日沒有到期複習或可安排的新單詞。'}</Text>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>目前單詞狀態</Text>
        <Text style={styles.summaryText}>複習 {summary.reviewCount} 次 · 答對 {summary.correctCount} 次 · 答錯 {summary.wrongCount} 次</Text>
        {algorithmState && summary.reviewCount > 0 ? (
          <>
            <Text style={styles.algorithmText}>掌握狀態：{algorithmState.mastery.state} · 綜合掌握度 {algorithmState.mastery.overall.toFixed(1)}%</Text>
            <Text style={styles.algorithmText}>含義 {algorithmState.scores.meaning.toFixed(0)} · 拼寫 {algorithmState.scores.spelling.toFixed(0)} · 聽辨 {algorithmState.scores.listening.toFixed(0)} · 用法 {algorithmState.scores.usage.toFixed(0)}</Text>
            <Text style={styles.algorithmText}>穩定度 {algorithmState.stability.stability.toFixed(1)} · 下次複習日 {new Date(algorithmState.nextReviewDay * 86400000).toISOString().slice(0, 10)}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E0E8DB' },
  title: { color: '#23352A', fontSize: 15, fontWeight: '700' },
  description: { color: '#6C756D', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  source: { color: '#6C756D', fontSize: 11, marginBottom: 8 },
  wordCard: { backgroundColor: '#F7F9F4', borderColor: '#DDE6D9', borderWidth: 1, borderRadius: 12, padding: 14 },
  label: { color: '#526257', fontSize: 12, fontWeight: '700' },
  meaning: { color: '#23352A', fontSize: 17, lineHeight: 25, marginTop: 10 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#DDE6D9', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#23352A', fontSize: 15, marginTop: 14 },
  answer: { color: '#31583B', fontSize: 13, fontWeight: '700', marginTop: 10 },
  choices: { marginTop: 10, gap: 8 },
  choice: { borderWidth: 1, borderColor: '#DDE6D9', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 11 },
  choiceSelected: { borderColor: '#53775B', backgroundColor: '#E9F0E5' },
  choiceText: { color: '#31583B', fontSize: 14, lineHeight: 20 },
  submit: { backgroundColor: '#53775B', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  disabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  next: { borderWidth: 1, borderColor: '#53775B', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  nextText: { color: '#31583B', fontSize: 14, fontWeight: '700' },
  speakButton: { backgroundColor: '#E9F0E5', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  speakText: { color: '#31583B', fontSize: 14, fontWeight: '700' },
  skipButton: { borderWidth: 1, borderColor: '#DDE6D9', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  skipText: { color: '#526257', fontSize: 13, fontWeight: '600' },
  message: { color: '#526257', fontSize: 12, lineHeight: 18, marginTop: 9 },
  summary: { backgroundColor: '#F7F9F4', borderRadius: 10, padding: 11, marginTop: 12 },
  summaryTitle: { color: '#31583B', fontSize: 12, fontWeight: '700' },
  summaryText: { color: '#526257', fontSize: 12, marginTop: 5 },
  algorithmText: { color: '#31583B', fontSize: 12, lineHeight: 18, marginTop: 6 },
});
