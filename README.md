# ENOPARKING

語未央新一代重建基線。核心學習演算法、詞庫、學習事件、Seed Ledger、花園狀態與正常使用所需後端能力由既有穩定版本完整遷移。

## 平台開發原則

Android 與 iOS 為同等優先的正式客戶端，採並線開發與共同驗收。Web 僅作過渡用途。平台架構與交付要求詳見 [平台交付原則](docs/platform-delivery.md)。

## Native Android and iOS

The shared React Native target is in [apps/mobile](apps/mobile/README.md). Both platforms use the same SQLite event-store implementation and event contract. The Web app remains transitional. Native setup, current limits, and verification steps are documented in the mobile README and [native storage contract](docs/native-storage-contract.md).
