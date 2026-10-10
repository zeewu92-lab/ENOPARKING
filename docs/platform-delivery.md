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

目前分支已建立 React Web 過渡端，以及共用 Expo/React Native Android 與 iOS 執行目標的初始骨架。原生端已加入 SQLite event store、帳戶隔離資料表、交易式 enqueue、ACK reconciliation 與 Replay cursor 基礎，並建立原生端 bundle/typecheck CI。這是原生基礎階段，尚未完成登入、API transport、原生背景同步排程、正式學習 reducer、舊資料遷移與真機整合驗收，因此不得宣稱行動端功能已完成。

後續必須在同一迭代補上 Android 與 iOS 的 lifecycle adapter、可靠同步排程、領域狀態 reducer、資料遷移和實機驗收，避免只完成其中一端。

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
