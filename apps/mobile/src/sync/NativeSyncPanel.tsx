import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { NativeEventStore } from '../storage/NativeEventStore.js';
import { NativeEventSyncService } from './NativeEventSyncService.js';
import { createNativeEventSyncTransport } from './NativeEventSyncTransport.js';
import type { NativeAuthSessionController } from '../auth/NativeAuthSession.js';

type Props = {
  accountId: string;
  auth: NativeAuthSessionController;
  baseUrl: string;
};

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return error instanceof Error ? error.message : 'NATIVE_SYNC_UNKNOWN_ERROR';
}

export function NativeSyncPanel({ accountId, auth, baseUrl }: Props) {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('尚未執行同步');

  const service = useMemo(() => {
    const store = new NativeEventStore(db);
    const transport = createNativeEventSyncTransport({ baseUrl });
    return new NativeEventSyncService({
      store,
      getCredentials: async requestedAccountId => {
        const active = auth.getActiveSession();
        if (!active || active.accountId !== requestedAccountId) {
          throw new Error('NATIVE_SYNC_NO_ACTIVE_SESSION');
        }
        let credentials = await auth.getAccessCredentials(requestedAccountId);
        if (!credentials) {
          const refreshed = await auth.refresh(requestedAccountId);
          credentials = { accountId: refreshed.accountId, accessToken: refreshed.accessToken };
        }
        if (credentials.accountId !== requestedAccountId) {
          throw new Error('NATIVE_SYNC_CREDENTIAL_ACCOUNT_MISMATCH');
        }
        return credentials;
      },
      getDeviceId: () => store.getOrCreateDeviceId(() => Crypto.randomUUID()),
      pushEvents: request => transport.pushEvents(request),
      pullEvents: request => transport.pullEvents(request),
      applyEvent: async (tx, event) => {
        // 將遠端事件寫入帳戶隔離的 SQLite 事件歷史；事件標記與游標由同一交易提交。
        await tx.runAsync(
          `INSERT INTO enop_learning_state (account_id, state_key, state_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(account_id, state_key) DO NOTHING`,
          accountId,
          'event:' + event.eventId,
          JSON.stringify(event),
          Date.now()
        );
      },
    });
  }, [db, auth, baseUrl, accountId]);

  async function runSync() {
    if (busy) return;
    setBusy(true);
    setMessage('正在同步學習事件…');
    try {
      const result = await service.syncAccount(accountId, {
        isCurrentAccount: async () => auth.getActiveSession()?.accountId === accountId,
      });
      if (result.status === 'account_changed') {
        setMessage('帳戶已切換，已停止本次同步。');
      } else if (result.status === 'more_available') {
        setMessage(`已同步 ${result.replayed} 筆遠端事件，仍有後續資料待同步。`);
      } else {
        setMessage(`同步完成：上傳 ${result.pushed} 筆，確認 ${result.confirmed} 筆，重播 ${result.replayed} 筆。`);
      }
    } catch (error) {
      setMessage('同步未完成：' + errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    // 登入後先執行一次同步；帳戶切換時舊請求會由服務層檢查並停止。
    void (async () => {
      if (!active || auth.getActiveSession()?.accountId !== accountId) return;
      await runSync();
    })();
    return () => { active = false; };
  }, [accountId, service]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>學習事件同步</Text>
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={runSync} style={[styles.button, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>立即同步</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E0E8DB' },
  title: { color: '#23352A', fontSize: 15, fontWeight: '700' },
  message: { color: '#526257', fontSize: 12, lineHeight: 18, marginTop: 8 },
  button: { backgroundColor: '#31583B', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
