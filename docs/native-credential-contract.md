# 原生端安全憑證契約 v1

## 平台範圍

Android 與 iOS 共用 `NativeCredentialVault` 與 Expo SecureStore adapter。Web 過渡端不得匯入此原生模組，也不得以 localStorage 或一般偏好設定儲存替代。

## 憑證規則

- Access Token 僅保存在記憶體中，並綁定目前的 accountId 與到期時間。
- Refresh Token 透過原生 SecureStore 保存，鍵名包含經格式驗證的 accountId。
- iOS Keychain 使用 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`，避免憑證隨裝置備份遷移。Android 使用 Expo SecureStore 對應的加密儲存。
- 不把 Token 寫入 SQLite、事件 payload、日誌、分析事件或一般應用程式設定。
- 登入時先保存 Refresh Token 與目前帳戶 metadata，再切換記憶體中的 session。
- Refresh Token 輪替按帳戶 single-flight 執行，並將 UUID v4 的 refreshRequestId 暫存於 SecureStore。網路中斷或回應遺失後重試會沿用同一 ID，成功保存新 Refresh Token 後才刪除 pending ID。伺服器回應的 accountId 必須符合目前帳戶；先保存新 Refresh Token，再發布新 Access Token。
- 登出會嘗試呼叫服務端撤銷，並在 finally 中清除本機 Refresh Token 與 session metadata。
- 冷啟動時只讀取帳戶 metadata，接著使用 Refresh Token 向服務端換取新憑證；本機 metadata 不代表服務端 session 仍有效。

## 服務端整合前提

服務端已新增 `/api/token/native-login`、`/api/token/native-refresh` 與 `/api/token/native-logout`，原生端 `NativeAuthApi` 透過 JSON 傳遞憑證，不使用 Web HttpOnly Cookie。`NativeAuthSession` 將 API 與 SecureStore Vault 串接，提供登入、冷啟動恢復、憑證輪替及單裝置登出流程。登入會驗證帳號密碼並建立獨立 Token Family；Refresh 使用 SecureStore 持久化的 UUID v4 `refreshRequestId`，共用資料庫輪替與重放偵測程序；登出撤銷目前裝置的 Token Family。這些端點仍受 `TOKEN_AUTH_ENABLED` 控制，預設不可啟用。目前這是已接線的服務層，尚未接入完整原生登入畫面與應用程式生命週期。完整真機、資料庫整合與故障注入驗證完成前，不得打開正式 Token Auth 或事件同步旗標。

Refresh Token 輪替的服務端操作必須具備單次使用與重放偵測語意。若服務端已成功輪替、但裝置在寫入新 token 前突然終止，客戶端可能無法恢復；服務端應提供明確的 session family 撤銷／重新登入路徑。SecureStore 不提供與服務端交易的原子性，因此此故障窗必須在整合測試與產品流程中處理。

## 已測試範圍與限制

`tests/native-credential-vault.test.js` 覆蓋帳戶隔離、記憶體 Access Token、refresh single-flight、帳戶不匹配、冷啟動恢復、過期 Access Token 更新與登出清理。`tests/native-auth-api.test.js` 與 `tests/native-token-auth-contract.test.js` 覆蓋 HTTP 契約、帳戶綁定、端點閘門、輪替與撤銷的安全性約束。仍需 Android／iOS 真機 SecureStore、PostgreSQL 端到端登入與輪替、併發重放、密碼變更及停權撤銷測試。
