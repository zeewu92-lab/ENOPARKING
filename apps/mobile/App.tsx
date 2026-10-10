import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeNativeEventStore } from './src/storage/NativeEventStore';

function NativeStatus() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.brand}>語未央</Text>
        <Text style={styles.title}>ENOPARKING 原生端</Text>
        <Text style={styles.body}>
          Android 與 iOS 共用學習核心、事件契約與本機 SQLite 儲存規則。
        </Text>
        <View style={styles.status}>
          <Text style={styles.statusText}>本機資料庫已就緒</Text>
        </View>
        <Text style={styles.note}>
          目前為原生基礎建置階段，尚未接入登入、正式學習流程與事件同步。
        </Text>
      </View>
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
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  brand: { color: '#53775B', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#23352A', fontSize: 28, fontWeight: '700', marginTop: 12 },
  body: { color: '#526257', fontSize: 16, lineHeight: 25, marginTop: 16 },
  status: { backgroundColor: '#E6EEE2', borderRadius: 14, padding: 16, marginTop: 28 },
  statusText: { color: '#31583B', fontSize: 15, fontWeight: '600' },
  note: { color: '#6C756D', fontSize: 13, lineHeight: 20, marginTop: 22 }
});
