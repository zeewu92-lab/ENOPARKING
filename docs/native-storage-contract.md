# Native local storage contract v1

## Scope

This contract is shared by Android and iOS. Web is a transition adapter only and does not define this storage model. The normative schema is `shared/learning/sqlite-schema-v1.sql`.

## Required transaction boundaries

1. **Enqueue**: create the event, allocate its monotonically increasing account-local counter, update local optimistic learning state, and record the local event as already applied in one transaction. If any write fails, none of those writes may remain.
2. **ACK reconciliation**: validate every ACK and reject duplicate IDs, unknown IDs, malformed sequence numbers, or inconsistent status/sequence pairs before changing persistent state. Commit the full valid ACK set in one transaction.
3. **Pull and Replay**: enforce contiguous server sequences. Apply domain state, persist the applied-event ledger, and advance the cursor atomically. A crash must result in either all or none of each transaction's effects.
4. **Retry**: keep the original event ID and payload across retries. Retry scheduling metadata can change, but event identity and canonical content cannot.
5. **Account isolation**: all queue, cursor, and applied-event keys are account-scoped. Device identity is installation-scoped. A logout must not silently transfer queued events to the next account.
6. **Schema upgrade**: migrations are numbered and transactional where SQLite permits. A failed migration leaves the previous schema usable; do not clear event data to recover from migration errors.

## Platform implementation requirements

- **Android**: implement the contract using SQLite transactions through Room or SQLiteOpenHelper. Use WorkManager for deferrable background sync, plus foreground/resume sync. WorkManager is a retry mechanism, not the source of truth; SQLite remains authoritative.
- **iOS**: implement the same contract using SQLite transactions, with a small serial database access boundary. Use foreground/resume sync and permitted background execution (for example BGTaskScheduler where appropriate). Do not promise guaranteed background execution by iOS.
- **Shared rules**: both clients must use the same event JSON fields, validation rules, sequence semantics, and conformance fixtures. The shared SQL schema defines constraints; native adapters may add columns only through reviewed migrations.
- **Web transition**: existing Web storage stays isolated behind its adapter. Web Locks and browser storage APIs must not leak into the shared event or domain contracts.

## Required cross-platform acceptance cases

- enqueue is atomic under a forced write failure;
- two simultaneous writers never allocate the same local counter;
- duplicate ACKs and conflicting server sequences are rejected without partial mutation;
- a retry keeps the same event ID and payload;
- a crash between domain application and cursor update cannot lose or double-apply an event;
- account A pending events never appear in account B's queue;
- logout/login preserves ownership boundaries;
- migration failure preserves the previous schema and event rows;
- Android and iOS produce identical results for the shared valid/invalid event fixtures.

## Delivery status

This document and SQL contract are shared foundations, not completed native implementations. Android and iOS adapters, native project targets, device-level lifecycle tests, and SQLite integration tests remain required before calling this work complete.
