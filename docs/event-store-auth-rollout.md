# Event Store and Token Auth Rollout

This change adds a staged backend foundation. It is intentionally inert until operators explicitly enable it.

## Required environment

- `DATABASE_URL`: existing Neon connection string.
- `TOKEN_AUTH_ENABLED=true`: enables Cookie Session to Bearer-token exchange and refresh.
- `EVENT_SYNC_ENABLED=true`: enables the HTTP Event Sync routes. Keep this unset or set to `false` until payload schemas and client queue integration pass acceptance tests.
- Database flag `eng_event_sync_settings.enabled` must also be explicitly set to `TRUE` after acceptance. The environment flag and database flag are both required; the database flag defaults to `FALSE` and is locked for the duration of each sync/pull transaction.
- `TOKEN_RECOVERY_ENCRYPTION_KEY`: exactly 64 hexadecimal characters representing 32 random bytes. Generate it with a secure secret manager. Never commit it or log it.

Token exchange returns the short-lived Access Token in the response `Authorization` header. The Refresh Token is set only as an HttpOnly, Secure (outside development), SameSite=Lax cookie scoped to `/api/token`. Neither token is returned in JSON.

## Migration

1. Back up the database and verify the restore procedure.
2. Deploy code that contains the migrations while keeping both feature flags off.
3. Run `npm run db:migrate` once from a trusted environment with `DATABASE_URL` configured.
4. Verify all versions in `eng_schema_migrations`, inspect indexes and functions, and run the test suite.
5. Enable `TOKEN_AUTH_ENABLED=true` only in a non-production environment first.
6. Keep `EVENT_SYNC_ENABLED=false` and the database flag disabled until the per-type payload schemas and client Event Queue / Replay implementation are complete and validated.
7. After all hard gates pass, enable both switches in a test environment; then enable for a test account.

The migration runner is explicit; application startup does not run these migrations. The legacy schema initializer still runs as part of the existing application behavior.

## Endpoints

- `POST /api/token/exchange`: requires a valid existing Cookie Session; rejects a second active Family for the same Session.
- `POST /api/token/refresh`: requires the HttpOnly Refresh Token cookie and a body containing `refreshRequestId` (UUID v4). Persist and reuse the same request ID until a successful response is received and saved.
- `POST /api/events/sync`: requires `Authorization: Bearer <access-token>`, `deviceId` UUID v4, SemVer `clientVersion`, and up to 100 Events.

Event Sync currently validates envelope fields, size, Event ID, type, and idempotency fingerprint. The exact strict per-type payload schemas, Event download endpoint, client-side durable queue, localCounter/deviceId persistence, and full Replay integration remain release blockers. Do not enable `EVENT_SYNC_ENABLED` until those are implemented and tested.

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
- Password change and logout clear the Refresh Token cookie; deleting the associated Session cascades to its Family.
- New endpoints are disabled by default. Database migration success alone never enables them.

## Known limitations before production

- The client must implement persistent per-account Event Queues, stable device ID/localCounter, single-flight refresh, refreshRequestId persistence, partial ACK persistence, retry policy, and Replay.
- Type-specific payload schemas need to be fixed before the sync endpoint is enabled.
- Account-deletion tombstones are recorded by migration, but deletion/revocation concurrency tests must pass before release.
- Server-side rate limiting and strict type-specific payload schemas remain release blockers.
- The current local server imports `server/admin.js`, which was not present in the inspected `main` branch; local API startup requires that pre-existing repository issue to be resolved separately.
