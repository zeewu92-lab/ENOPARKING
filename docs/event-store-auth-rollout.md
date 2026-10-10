# Event Store and Token Auth Rollout

This change adds a staged backend foundation. It is intentionally inert until operators explicitly enable it.

## Required environment

- `DATABASE_URL`: existing Neon connection string.
- `TOKEN_AUTH_ENABLED=true`: enables Cookie Session to Bearer-token exchange and refresh.
- `VITE_EVENT_SYNC_ENABLED=true`: enables client-side token bootstrap and exposes the Event Sync client wrappers at build time. Leave unset or `false` until all release blockers pass.
- `EVENT_SYNC_ENABLED=true`: enables the HTTP Event Sync routes. Keep this unset or set to `false` until strict per-type payload schemas and application-level queue integration pass acceptance tests.
- Database flag `eng_event_sync_settings.enabled` must also be explicitly set to `TRUE` after acceptance. The environment flag and database flag are both required; the database flag defaults to `FALSE` and is locked for the duration of each sync/pull transaction.
- `TOKEN_RECOVERY_ENCRYPTION_KEY`: exactly 64 hexadecimal characters representing 32 random bytes. Generate it with a secure secret manager. Never commit it or log it.
- `ENOPARKING_ADMIN_SETUP_KEY`: a high-entropy, one-time administrator bootstrap secret. Supply it only through the deployment secret manager and the `x-admin-setup-key` request header; never commit it or log it. The bootstrap endpoint rejects requests before touching the database when this key is missing or incorrect, and the database's `eng_admin_setup.used_at` guard prevents a second successful claim.

Token exchange returns the short-lived Access Token in the response `Authorization` header. The Refresh Token is set only as an HttpOnly, Secure (outside development), SameSite=Lax cookie scoped to `/api/token`. Neither token is returned in JSON.

## Migration

1. Back up the database and verify the restore procedure.
2. Deploy code that contains the migrations while keeping both feature flags off.
3. Run `npm run db:migrate` once from a trusted environment with `DATABASE_URL` configured.
4. Verify all versions in `eng_schema_migrations`, inspect indexes and functions, and run the test suite.
5. Enable `TOKEN_AUTH_ENABLED=true` only in a non-production environment first.
6. Keep `EVENT_SYNC_ENABLED=false` and the database flag disabled until strict per-type payload schemas, application-level queue integration, legacy-history handling, and end-to-end multi-device tests are complete and validated. The learning-action pipeline is now wired to an account-scoped queue and Replay path, but the legacy-history migration policy remains unresolved.
7. After all hard gates pass, enable both switches in a test environment; then enable for a test account.

The migration runner is explicit; application startup does not run these migrations. The legacy schema initializer still runs as part of the existing application behavior.

## Endpoints

- `POST /api/token/exchange`: requires a valid existing Cookie Session; rejects a second active Family for the same Session.
- `POST /api/token/refresh`: requires the HttpOnly Refresh Token cookie and a body containing `refreshRequestId` (UUID v4). Persist and reuse the same request ID until a successful response is received and saved.
- `POST /api/events/sync`: requires `Authorization: Bearer <access-token>`, `deviceId` UUID v4, SemVer `clientVersion`, and up to 100 Events.
- `GET /api/events/pull`: requires `Authorization: Bearer <access-token>`, `afterSequence` (default 0), and `limit` (1–100).

## Event payload contract v1

The HTTP handler validates the entire submitted batch before calling PostgreSQL. A malformed Event rejects the batch with `400 EVENT_PAYLOAD_INVALID`; no event in that batch is written.

- `action`: exact fields are `wordId` (non-empty string, max 256 characters), `day` (non-negative safe integer), `verification` (`choice`, `spelling`, `dictation`, or `usage`), `result` (`correct` or `wrong`), `hintLevel` (currently `none`), and optional `unitId` (null or non-empty string, max 256 characters). Unknown fields are rejected.
- `unit_outcome`: exact fields are `unitId` (non-empty string, max 256 characters) and `correct` (boolean). Unknown fields are rejected.
- Every Event must have a UUID v4 `eventId`, positive safe-integer `localCounter`, and non-negative safe-integer `createdAt`.
- Payload contracts are deliberately narrow. Extend them only with a versioned contract change and corresponding tests.

Event Sync validates envelope fields, payload schemas, size, Event ID, and idempotency fingerprint. The client queue and Replay path is wired to learning submissions when `VITE_EVENT_SYNC_ENABLED=true`: it persists the queued action before updating account-scoped learning history, pushes pending events, reconciles acknowledgements, pulls server-ordered events, and applies remote actions idempotently. If local learning validation fails after queue insertion, the unsynced queue entry and its applied marker are rolled back. Replay failures are deferred so local learning remains available. Corrupt or unreadable persisted queue, applied-ID, or cursor state now fails closed with a storage error rather than silently resetting to an empty queue or cursor; operators must preserve and inspect the affected browser storage before recovery. The account-scoped store uses `v2:learning-events:account:<encoded-account-id>`; the legacy global `v2:learning-events` key is left untouched because it has no trustworthy account ownership metadata. This means legacy-history migration and user-visible history continuity must be resolved before production enablement. Do not enable `EVENT_SYNC_ENABLED` until migration policy and end-to-end multi-device acceptance tests pass.

The database rate-limit defaults are 60 sync requests per account per minute and 300 submitted Events per account per minute. Operators can adjust `eng_event_sync_settings.max_requests_per_minute` and `max_events_per_minute` after observing real traffic. Whole-request limits return HTTP 429 with `Retry-After`; per-event limits return HTTP 200 with an individual `RATE_LIMITED` result.

To enable the database side of Event Sync after all gates pass, an operator must explicitly run `UPDATE eng_event_sync_settings SET enabled = TRUE, updated_at = NOW() WHERE id = 1;` in the target environment. To stop new sync/pull requests, set it back to `FALSE` and set `EVENT_SYNC_ENABLED=false`. Do not run either command until acceptance is complete.

## Transaction and ordering

The database function serializes an account's Event Sync against account status changes and Token Family revocation by locking the account row before the Family row. The Event insert and account-level sequence allocation execute inside the same PostgreSQL function call. The database enforces unique account-plus-Event-ID and account-plus-sequence pairs.

A duplicate Event ID with identical canonical content returns its original sequence. Reuse of an Event ID with different content is rejected as a permanent schema error. Diagnostic `createdAt` is never used for ordering.

## Security and operations

- Never log Authorization headers, Cookie headers, raw tokens, request bodies containing secrets, or encrypted recovery payloads.
- Keep the recovery encryption key stable across deployments; key rotation needs a separate migration/overlap plan.
- A Refresh Token rotation response is encrypted with AES-256-GCM and recoverable for two minutes for the same old token and same request ID.
- A different request ID on a consumed Refresh Token revokes the entire Family.
- Password change and logout clear the Refresh Token cookie; deleting a Session marks its associated Token Family revoked and preserves the Family/Refresh Token audit records. Account deletion separately records token tombstones before account-owned rows are removed.
- New endpoints are disabled by default. Database migration success alone never enables them.

## Validation and remaining production gates

- GitHub Actions runs the migrations against an ephemeral PostgreSQL 16 service and verifies concurrent Event Sync writes, contiguous server sequences, duplicate-event idempotency, conflicting-payload rejection, Event Pull pagination, refresh-token replay revocation, account-deletion tombstones, and session-deletion Token Family preservation/revocation.
- Client queue and Replay unit tests cover persistent state, per-account isolation, ACK reconciliation, bounded retry backoff, duplicate suppression, cursor persistence, apply failure, and sequence gaps.
- The learning-action pipeline now enqueues events under the authenticated account and runs push/ack/pull/replay when the client feature flag is enabled. Remote action history is deduplicated and replayed in server-sequence order; the algorithm keeps strict verification enforcement for new local submissions and permits replay of already-recorded remote verification choices.
- Legacy global learning history has no account owner. It is intentionally not auto-migrated to the first account that logs in. Define and test an explicit history migration/claim policy before production enablement.
- The current acceptance tests cover queue rollback, account-scoped local history, remote-event idempotency, server-sequence reconciliation, and payload validation. Add a browser-level multi-device test before enabling Event Sync.
- Payload schema tests validate the currently defined v1 shapes. Confirm all production event producers against these contracts before enabling the sync endpoint.
- The PostgreSQL integration tests run only against the disposable CI service. No production database migration has been executed.
- The local API admin handler has been restored and its route module is tested; verify the intended ENOPARKING admin bootstrap secret/configuration before enabling admin operations.
