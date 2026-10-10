import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeNativeEventStore } from './src/storage/NativeEventStore';
import { createNativeAuthSession } from './src/auth/NativeAuthSession';
import { nativeCredentialVault } from './src/auth/nativeCredentialVault';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

function describeAuthError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    TOKEN_AUTH_DISABLED: '原生登入服務尚未開放，請稍後再試。',
    CREDENTIALS_INVALID: '帳號或密碼不正確。',
    ACCOUNT_LOCKED: '此帳戶目前已停權，請聯絡管理員。',
    REFRESH_REPLAY: '登入憑證已失效，請重新登入。',
    REFRESH_RECOVERY_EXPIRED: '憑證更新逾時，請重新登入。',
    ACCOUNT_DELETED: '此帳戶已刪除，無法繼續同步。',
    NATIVE_AUTH_HTTPS_REQUIRED: '服務網址必須使用 HTTPS。',
    NATIVE_AUTH_BASE_URL_REQUIRED: '尚未設定原生 API 網址。',
  };
  return messages[code] || '連線或驗證失敗，請檢查網路後重試。';
}

function NativeStatus() {
  const auth = useMemo(() => API_BASE_URL
    ? createNativeAuthSession({ baseUrl: API_BASE_URL, vault: nativeCredentialVault })
    : null, []);
  const [session, setSession] = useState<{ accountId: string; expiresAt: number } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    if (!auth) {
      setBusy(false);
      setNotice('原生 API 尚未設定。請在建置環境設定 EXPO_PUBLIC_API_BASE_URL。');
      return () => { alive = false; };
    }
    auth.restore().then(restored => {
      if (alive) setSession(restored ? { accountId: restored.accountId, expiresAt: restored.expiresAt } : null);
    }).catch(error => {
      if (alive) setNotice(describeAuthError(error));
    }).finally(() => {
      if (alive) setBusy(false);
    });
    return () => { alive = false; };
  }, [auth]);

  async function handleLogin() {
    if (!auth) {
      setNotice('原生 API 尚未設定。請在建置環境設定 EXPO_PUBLIC_API_BASE_URL。');
      return;
    }
    if (!username.trim() || !password) {
      setNotice('請輸入帳號與密碼。');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const result = await auth.login({ username: username.trim(), password });
      setSession({ accountId: result.accountId, expiresAt: result.expiresAt });
      setPassword('');
      setNotice('登入成功。學習事件同步尚待整合與驗收。');
    } catch (error) {
      setNotice(describeAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!auth) return;
    setBusy(true);
    setNotice('');
    try {
      await auth.logout();
      setSession(null);
      setNotice('已登出此裝置。');
    } catch (error) {
      // The vault clears local credentials in a finally block even when revoke fails.
      setSession(null);
      setNotice('本機憑證已清除，但伺服器撤銷未確認。請保持網路連線並重新登入以檢查狀態。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.brand}>語未央</Text>
          <Text style={styles.title}>ENOPARKING</Text>
          <Text style={styles.subtitle}>讓每一次學習，都能安心延續。</Text>

          {busy ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#53775B" />
              <Text style={styles.body}>正在確認裝置登入狀態…</Text>
            </View>
          ) : session ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>已登入</Text>
              <Text style={styles.body}>帳戶識別碼：{session.accountId}</Text>
              <Text style={styles.small}>Access Token 僅保留於記憶體；Refresh Token 使用系統安全儲存。</Text>
              <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.button}>
                <Text style={styles.buttonText}>登出此裝置</Text>
              </Pressable>
              <Text style={styles.small}>學習事件佇列與 Replay 尚未接入正式畫面流程。</Text>
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>登入帳戶</Text>
              <TextInput
                accessibilityLabel="帳號"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onChangeText={setUsername}
                placeholder="帳號"
                placeholderTextColor="#879188"
                returnKeyType="next"
                style={styles.input}
                textContentType="username"
                value={username}
              />
              <TextInput
                accessibilityLabel="密碼"
                autoCapitalize="none"
                editable={!busy}
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
                placeholder="密碼"
                placeholderTextColor="#879188"
                returnKeyType="go"
                secureTextEntry
                style={styles.input}
                textContentType="password"
                value={password}
              />
              <Pressable accessibilityRole="button" disabled={busy} onPress={handleLogin} style={[styles.button, busy && styles.buttonDisabled]}>
                <Text style={styles.buttonText}>登入</Text>
              </Pressable>
              <Text style={styles.small}>Android 與 iOS 共用同一套認證契約。</Text>
            </View>
          )}

          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          <View style={styles.footer}>
            <Text style={styles.footerTitle}>原生端安全基礎</Text>
            <Text style={styles.footerText}>本機 SQLite · 系統安全憑證儲存 · 帳戶隔離</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SQLiteProvider databaseName="enoparking.db" onInit={initializeNativeEventStore}>
      <NativeStatus />
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7F0' },
  keyboard: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 32, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brand: { color: '#53775B', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#23352A', fontSize: 30, fontWeight: '800', marginTop: 10, letterSpacing: 0.4 },
  subtitle: { color: '#526257', fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 28 },
  panel: { backgroundColor: '#FFFFFF', borderColor: '#E0E8DB', borderWidth: 1, borderRadius: 20, padding: 20 },
  panelTitle: { color: '#23352A', fontSize: 19, fontWeight: '700', marginBottom: 18 },
  input: { backgroundColor: '#F7F9F4', borderColor: '#DDE6D9', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#23352A', marginBottom: 12 },
  button: { backgroundColor: '#53775B', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  body: { color: '#526257', fontSize: 14, lineHeight: 22, marginTop: 8 },
  small: { color: '#6C756D', fontSize: 12, lineHeight: 18, marginTop: 14 },
  notice: { color: '#526257', backgroundColor: '#E9F0E5', borderRadius: 12, padding: 13, fontSize: 13, lineHeight: 20, marginTop: 16 },
  loading: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 28 },
  footer: { marginTop: 30, borderTopColor: '#DDE5D8', borderTopWidth: 1, paddingTop: 18 },
  footerTitle: { color: '#31583B', fontSize: 13, fontWeight: '700' },
  footerText: { color: '#6C756D', fontSize: 12, lineHeight: 18, marginTop: 5 },
});
