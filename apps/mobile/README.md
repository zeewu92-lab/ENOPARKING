# ENOPARKING Native App

This is the shared React Native application target for Android and iOS. Both platforms use the same UI/domain package and the same SQLite event-store implementation; platform-specific lifecycle and background scheduling will be added behind adapters. The Web application remains a transitional target and is not imported here.

## Local development

Use Node.js 22.13 or newer, then run:

```sh
cd apps/mobile
npm install
npm run start
```

For native builds, use `npm run android` on a configured Android development host or `npm run ios` on macOS with Xcode. iOS simulator/device builds cannot be produced on Linux or Android Termux alone.

## Current scope

- Shared Expo/React Native target for Android and iOS.
- Persistent SQLite database and transactional event queue, ACK reconciliation, and replay cursor.
- Account-scoped event metadata, event rows, applied-event ledger, and learning-state table.

Not yet implemented: sign-in UI, API transport, native lifecycle/background sync scheduling, domain-specific learning-state reducers, legacy-data migration, secure token storage, and device-level tests. Do not enable production event sync based on this scaffold alone.
