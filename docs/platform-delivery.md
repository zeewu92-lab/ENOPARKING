# ENOPARKING 平台交付原則

## 決策

Android 與 iOS 是同等優先的正式客戶端，必須並線設計、並線開發、並線驗收。Web 目前只作為過渡端，用來維持現有功能、驗證服務端 API 與協助除錯；不得把 Web 的完成度當成整體產品完成度，也不得以 Web 專屬能力決定共用核心架構。

## 平台責任分層

1. **共用領域層**：學習事件 schema、事件 ID 與冪等規則、服務端序號、Replay 規則、學習演算法契約、帳戶權限語意。這一層不得依賴 DOM、localStorage、Web Locks 或瀏覽器生命週期。
2. **平台持久化層**：Android 與 iOS 使用原生可持久化儲存，優先採用具交易能力的 SQLite；事件佇列、已套用事件 ID、Replay cursor 與本機學習狀態需具明確交易邊界。Web 過渡端可用 IndexedDB，禁止將 localStorage 當作行動端儲存契約。
3. **平台同步協調層**：Android/iOS 需處理 App 進入背景、恢復前景、網路切換、程序中止、工作重試與多裝置競爭；Web 使用 Web Locks 僅是 Web adapter，不可成為共用核心依賴。
4. **UI 層**：Android 與 iOS 共享功能規格、資訊架構、設計 token、驗收案例與版本節奏，同時允許必要的平台互動差異。Web UI 僅維持過渡期間的必要功能。
5. **服務端**：帳戶、Token Family、事件冪等、每帳戶序號與跨裝置同步以服務端契約為準，所有客戶端共用同一組 API 與事件 schema。

## 並線交付規則

- 每項使用者可見功能在開發前就定義 Android、iOS、Web 過渡端的行為差異與共同驗收案例。
- 任何共用事件 schema、學習狀態或同步協定的變更，必須由 Android 與 iOS 共用測試案例驗證；不得只因 Web 測試通過就視為完成。
- Android 與 iOS 同一迭代開工、同一功能規格、同一服務端契約、同一驗收門檻。若其中一端尚未具備實際執行環境，標記為未驗收，不得標記完成。
- 網路離線、重試、ACK 遺失、App 被系統終止、重新登入、多裝置並行寫入與事件順序收斂，均列為跨平台必要測試。
- 不允許把 Web-only API 直接寫入共用領域層。平台能力須經 adapter 注入，並提供不依賴瀏覽器的單元測試。
- 正式開啟事件同步前，需完成 Android 與 iOS 的真機或等效整合驗收、資料遷移方案與回復程序。

## 現況與限制

目前分支已建立 React Web 過渡端，以及共用 Expo/React Native Android 與 iOS 執行目標。原生端已加入 SQLite event store、帳戶隔離資料表、交易式 enqueue、ACK reconciliation、bounded exponential retry、Replay cursor、共用 lifecycle sync coordinator，以及可注入認證與 HTTP transport 的 push/ACK/pull/replay service。Root CI 涵蓋協調器與同步服務的單元測試，原生 CI 檢查 TypeScript 並打包 Android 與 iOS JavaScript。

這些是共用同步核心，尚未等於可上線的原生同步。原生登入 UI、將 SecureStore vault／HTTP auth API／同步服務／lifecycle coordinator 接入登入後的 App、背景工作排程、正式學習 reducer、舊資料遷移、真實 SQLite 故障注入及真機整合驗收仍未完成。服務端原生登入、Refresh Token 輪替與單裝置登出端點已建立，但仍受功能旗標保護，且尚未完成 PostgreSQL 端到端與真機驗收。事件同步與 Token Auth 的正式功能旗標必須保持關閉。

下一階段要將原生認證服務層接入 App 登入 UI 與登入後同步流程，再完成密碼變更、帳戶停權／刪除的全裝置撤銷整合測試。Android 與 iOS 必須使用相同契約並行驗收。

## 原生安全憑證契約

- `docs/native-credential-contract.md` 定義 Android／iOS 共用 SecureStore、記憶體 Access Token、Refresh Token 輪替、冷啟動恢復與登出清理規則。
- `apps/mobile/src/auth/NativeCredentialVault.js` 是平台無關的憑證生命週期核心，`nativeSecureStore.ts` 是 Expo SecureStore adapter。
- `NativeEventStore.getOrCreateDeviceId()` 將 UUID v4 裝置識別碼持久化於 SQLite，避免每次啟動都變更裝置 ID；事件入列的交易測試涵蓋 optimistic state 失敗時整筆回滾，以及成功時事件、計數器與 applied marker 一起提交。\n- 原生登入畫面已接入 `NativeAuthSession`，可輸入帳號密碼、嘗試冷啟動恢復與登出目前裝置；建置時須設定 `EXPO_PUBLIC_API_BASE_URL` 為 HTTPS API 根網址。未設定時 UI 會明確提示，不會默認連到未知服務。登入後的正式學習流程與事件同步仍未接入。\n- `apps/mobile/src/auth/NativeAuthApi.js` 對接 `/api/token/native-login`、`native-refresh` 與 `native-logout`；`NativeAuthSession.js` 將 API 與 Vault 的登入、恢復、輪替、登出流程串接。
- 原生端只保存 Refresh Token；Access Token 不寫入 SQLite 或一般持久化儲存。服務層已接線，尚未接入完整登入 UI，也尚未完成真機驗收。

## 共用事件契約測試素材

- `shared/learning/event-contract-v1.json` 是 Android、iOS 與過渡 Web 端共同使用的有效／無效事件測試資料。
- `tests/shared-event-contract.test.js` 會用服務端目前的 v1 schema 驗證這份資料，避免跨端各自實作時逐漸偏離。
- 新增事件型別或改動 payload 時，必須同步更新 fixture 與服務端 schema，並在 Android、iOS 的測試套件中重用相同案例。不得只在 Web 測試中驗證新契約。

## 原生 SQLite 儲存契約

- 共用 SQL schema：`shared/learning/sqlite-schema-v1.sql`。
- 交易、重試、ACK 與 Replay 的必要邊界：`docs/native-storage-contract.md`。
- `apps/mobile/` 已建立共用 Expo/React Native 原生目標，並提供以 SQLite transaction API 實作的事件儲存基礎。此為 Android/iOS 共用實作，尚未代表兩端已完成原生編譯或真機驗收。
- 本機即時生效的事件可以先有 applied marker 而尚無 server sequence；收到服務端事件後，再將序號與 Replay cursor 在同一交易中持久化。這能避免把尚未同步的本機事件誤認為已取得服務端序號。
- 原生端正式開發時必須將共用 schema 納入各平台 migration，並用真實 SQLite 執行測試，而非只依賴靜態檢查。
