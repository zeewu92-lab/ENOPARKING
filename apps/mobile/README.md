# ENOPARKING Native App

這是 Android 與 iOS 共用的 React Native 客戶端。兩端共用同一套學習流程、SQLite 事件佇列、事件重播與認證契約。Web 端僅作過渡用途，不作為原生端驗收的替代品。

## 開發環境

需要 Node.js 22.13 或更新版本。

```sh
cd apps/mobile
npm install
npm run start
```

在已設定原生開發環境的 Android 主機執行 `npm run android`。iOS 原生建置需要 macOS 與 Xcode；Linux 或 Android Termux 本身無法產生 iOS 模擬器／裝置建置。

## 已接入的原生功能

- SQLite 本機事件儲存，包含帳戶隔離、事件佇列、ACK 對帳、Replay 游標與已套用事件去重。
- 原生帳戶登入介面，透過 `EXPO_PUBLIC_API_BASE_URL` 指向 HTTPS API。
- Access Token 僅保留在記憶體；Refresh Token 與輪替恢復資料由 `expo-secure-store` 憑證庫管理。
- 登出目前裝置、啟動時恢復登入狀態，以及同步介面。
- 共用學習演算法重播與每日批次選詞：最多 20 個到期複習項目，再補入最多 5 個新詞，總量不超過 30。
- 選擇題、拼寫與聽寫流程；聽寫使用原生語音播放。尚無可核驗教材例句的情境用法題會明確標示未開放，不會偽造例句或記錄虛構答題事件。

## 本機檢查

```sh
npm run typecheck
npx expo export --platform android --platform ios
```

在儲存庫根目錄，事件同步與資料庫測試指令以根目錄 `package.json` 為準。GitHub Actions 目前曾在 runner 尚未啟動、沒有執行步驟或日誌的階段就結束；在 CI 實際跑完前，不應把原生型別檢查或 Android／iOS bundle 視為已通過。

## 尚未完成的驗收

- Android 實機與 iOS 模擬器／實機驗收。
- 真實 SQLite 故障注入、離線重試與跨裝置恢復測試。
- App 生命週期及背景同步排程。
- 舊版全域學習紀錄的明確認領／遷移流程。舊紀錄沒有可靠的帳戶歸屬資訊，不可自動綁定到登入帳戶。
- 生產環境管理員初始化密鑰與部署設定的人工核對。

在驗收完成前，`TOKEN_AUTH_ENABLED`、`VITE_EVENT_SYNC_ENABLED`、`EVENT_SYNC_ENABLED` 與資料庫 Event Sync 開關都必須維持關閉。此分支與 PR #6 保持 Draft，不能合併或提前啟用正式同步。
