import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { NativeEventStore } from '../storage/NativeEventStore.js';
import { recordNativeLearningAction } from './NativeLearningState.js';
import { NATIVE_VOCABULARY } from './NativeVocabularyData';

type Props = {
  accountId: string;
};

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function NativeLearningPanel({ accountId }: Props) {
  const db = useSQLiteContext();
  const store = useMemo(() => new NativeEventStore(db), [db]);
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [message, setMessage] = useState('根據中文釋義拼寫英文單詞，答案會自動核對並保存為學習事件。');
  const [summary, setSummary] = useState({ reviewCount: 0, correctCount: 0, wrongCount: 0 });
  const word = NATIVE_VOCABULARY.length ? NATIVE_VOCABULARY[wordIndex % NATIVE_VOCABULARY.length] : null;

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

  async function submitAnswer() {
    if (!word) {
      setMessage('目前沒有可用的教材詞彙。');
      return;
    }
    if (busy || answered) return;
    if (!answer.trim()) {
      setMessage('請先輸入英文答案。');
      return;
    }
    const correct = normalizeAnswer(answer) === normalizeAnswer(word.word);
    setBusy(true);
    setMessage('正在保存學習事件…');
    try {
      await recordNativeLearningAction({
        store,
        accountId,
        payload: {
          wordId: word.id,
          day: Math.floor(Date.now() / 86400000),
          verification: 'spelling',
          result: correct ? 'correct' : 'wrong',
          hintLevel: 'none',
        },
        createEventId: () => Crypto.randomUUID(),
      });
      setAnswered(true);
      setMessage(correct ? '回答正確，學習事件已保存。' : '本次未答對，正確答案：' + word.word + '。事件已保存。');
    } catch (error) {
      setMessage('保存失敗：' + (error instanceof Error ? error.message : 'NATIVE_LEARNING_SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  function nextWord() {
    if (!NATIVE_VOCABULARY.length) return;
    setWordIndex(current => (current + 1) % NATIVE_VOCABULARY.length);
    setAnswer('');
    setAnswered(false);
    setMessage('根據中文釋義拼寫英文單詞，答案會自動核對並保存為學習事件。');
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>原生單詞練習</Text>
      <Text style={styles.description}>使用共用教材資料；答案核對、本機事件佇列與學習狀態更新都在裝置端完成。</Text>
      {word ? (
        <>
          <Text style={styles.source}>{word.textbook} · {word.unit}</Text>
          <View style={styles.wordCard}>
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
            {answered ? <Text style={styles.answer}>標準答案：{word.word}{word.phonetic ? '  ' + word.phonetic : ''}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" disabled={busy || answered} onPress={submitAnswer} style={[styles.submit, (busy || answered) && styles.disabled]}>
            <Text style={styles.submitText}>{busy ? '保存中…' : '提交答案'}</Text>
          </Pressable>
          {answered ? (
            <Pressable accessibilityRole="button" onPress={nextWord} style={styles.next}>
              <Text style={styles.nextText}>下一個單詞</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.message}>目前沒有可用的教材詞彙。</Text>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>目前單詞狀態</Text>
        <Text style={styles.summaryText}>複習 {summary.reviewCount} 次 · 答對 {summary.correctCount} 次 · 答錯 {summary.wrongCount} 次</Text>
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
  submit: { backgroundColor: '#53775B', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  disabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  next: { borderWidth: 1, borderColor: '#53775B', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  nextText: { color: '#31583B', fontSize: 14, fontWeight: '700' },
  message: { color: '#526257', fontSize: 12, lineHeight: 18, marginTop: 9 },
  summary: { backgroundColor: '#F7F9F4', borderRadius: 10, padding: 11, marginTop: 12 },
  summaryTitle: { color: '#31583B', fontSize: 12, fontWeight: '700' },
  summaryText: { color: '#526257', fontSize: 12, marginTop: 5 },
});
