import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { NativeEventStore } from '../storage/NativeEventStore.js';
import { recordNativeLearningAction } from './NativeLearningState.js';

type Verification = 'choice' | 'spelling' | 'dictation' | 'usage';
type Result = 'correct' | 'wrong';

type Props = {
  accountId: string;
};

const VERIFICATIONS: { value: Verification; label: string }[] = [
  { value: 'choice', label: '選擇' },
  { value: 'spelling', label: '拼寫' },
  { value: 'dictation', label: '聽寫' },
  { value: 'usage', label: '運用' },
];

export function NativeLearningPanel({ accountId }: Props) {
  const db = useSQLiteContext();
  const store = useMemo(() => new NativeEventStore(db), [db]);
  const [wordId, setWordId] = useState('');
  const [verification, setVerification] = useState<Verification>('choice');
  const [result, setResult] = useState<Result>('correct');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('每次提交都會先寫入本機事件佇列，再更新學習狀態。');
  const [summary, setSummary] = useState({ reviewCount: 0, correctCount: 0, wrongCount: 0 });

  const refreshSummary = useCallback(async () => {
    const row = await db.getFirstAsync<{ stateJson: string }>(
      'SELECT state_json AS stateJson FROM enop_learning_state WHERE account_id = ? AND state_key = ?',
      accountId,
      'word:' + wordId.trim().toLowerCase()
    );
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
  }, [db, accountId, wordId]);

  useEffect(() => {
    let active = true;
    void db.getFirstAsync<{ stateJson: string }>(
      'SELECT state_json AS stateJson FROM enop_learning_state WHERE account_id = ? AND state_key = ?',
      accountId,
      'word:' + wordId.trim().toLowerCase()
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
  }, [db, accountId, wordId]);

  async function submitAction() {
    const normalizedWordId = wordId.trim();
    if (!normalizedWordId) {
      setMessage('請先輸入單詞識別碼。');
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage('正在保存學習事件…');
    try {
      await recordNativeLearningAction({
        store,
        accountId,
        payload: {
          wordId: normalizedWordId,
          day: Math.floor(Date.now() / 86400000),
          verification,
          result,
          hintLevel: 'none',
        },
        createEventId: () => Crypto.randomUUID(),
      });
      await refreshSummary();
      setMessage('已保存到本機佇列，學習狀態與事件在同一交易中提交。網路恢復後可同步。');
    } catch (error) {
      setMessage('保存失敗：' + (error instanceof Error ? error.message : 'NATIVE_LEARNING_SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>原生學習事件</Text>
      <Text style={styles.description}>此入口用於驗收 Android／iOS 共用的事件契約與本機交易。</Text>
      <TextInput
        accessibilityLabel="單詞識別碼"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        onChangeText={setWordId}
        placeholder="輸入單詞識別碼，例如 word-001"
        placeholderTextColor="#879188"
        style={styles.input}
        value={wordId}
      />
      <Text style={styles.label}>驗證方式</Text>
      <View style={styles.options}>
        {VERIFICATIONS.map(item => (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: verification === item.value }}
            disabled={busy}
            onPress={() => setVerification(item.value)}
            style={[styles.option, verification === item.value && styles.optionSelected]}
          >
            <Text style={[styles.optionText, verification === item.value && styles.optionTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>本次結果</Text>
      <View style={styles.options}>
        {([{ value: 'correct', label: '答對' }, { value: 'wrong', label: '答錯' }] as const).map(item => (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: result === item.value }}
            disabled={busy}
            onPress={() => setResult(item.value)}
            style={[styles.option, result === item.value && styles.optionSelected]}
          >
            <Text style={[styles.optionText, result === item.value && styles.optionTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={submitAction} style={[styles.submit, busy && styles.disabled]}>
        <Text style={styles.submitText}>{busy ? '保存中…' : '記錄本次學習'}</Text>
      </Pressable>
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
  input: { backgroundColor: '#F7F9F4', borderColor: '#DDE6D9', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#23352A', fontSize: 14 },
  label: { color: '#526257', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: { borderWidth: 1, borderColor: '#DDE6D9', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  optionSelected: { backgroundColor: '#E9F0E5', borderColor: '#53775B' },
  optionText: { color: '#526257', fontSize: 13 },
  optionTextSelected: { color: '#31583B', fontWeight: '700' },
  submit: { backgroundColor: '#53775B', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 15 },
  disabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  message: { color: '#526257', fontSize: 12, lineHeight: 18, marginTop: 9 },
  summary: { backgroundColor: '#F7F9F4', borderRadius: 10, padding: 11, marginTop: 12 },
  summaryTitle: { color: '#31583B', fontSize: 12, fontWeight: '700' },
  summaryText: { color: '#526257', fontSize: 12, marginTop: 5 },
});
