import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/native-token-auth.js', import.meta.url), 'utf8');
const router = await readFile(new URL('../server/token-auth.js', import.meta.url), 'utf8');

test('native server auth is gated and exposes explicit native-only actions', () => {
  assert.match(source, /TOKEN_AUTH_ENABLED !== 'true'/);
  assert.match(source, /action === 'native-login'/);
  assert.match(source, /action === 'native-refresh'/);
  assert.match(source, /action === 'native-logout'/);
  assert.match(router, /action\.startsWith\('native-'\)/);
});

test('native login verifies password and creates account-bound token family atomically', () => {
  assert.match(source, /crypto\.scrypt/);
  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /SELECT id, username, password_hash, disabled FROM eng_users/);
  assert.match(source, /INSERT INTO eng_token_families/);
  assert.match(source, /INSERT INTO eng_access_tokens/);
  assert.match(source, /INSERT INTO eng_refresh_tokens/);
  assert.match(source, /await sql\.transaction\(\[/);
  assert.match(source, /if \(user\.disabled\)/);
});

test('native refresh requires durable UUID idempotency key and shared rotation procedure', () => {
  assert.match(source, /UUID_V4\.test\(requestId\)/);
  assert.match(source, /eng_rotate_refresh_token/);
  assert.match(source, /encryptRecovery\(recoveryResponse\)/);
  assert.match(source, /decryptRecovery\(result\.ciphertext\)/);
  assert.match(source, /accessExpiresAt: pair\.accessExpiresAt/);
  assert.match(source, /accessExpiresAt: recovered\.accessExpiresAt/);
  assert.match(source, /REFRESH_REPLAY/);
  assert.match(source, /REFRESH_RECOVERY_EXPIRED/);
  assert.match(source, /eng_deleted_refresh_tokens/);
  assert.match(source, /ACCOUNT_DELETED/);
});

test('native logout revokes only the matched family and clears its access tokens', () => {
  assert.match(source, /revoke_reason = COALESCE\(revoke_reason, 'native_logout'\)/);
  assert.match(source, /DELETE FROM eng_access_tokens WHERE family_id/);
  assert.match(source, /DELETE FROM eng_sessions WHERE token_hash/);
  assert.doesNotMatch(source, /Set-Cookie/);
});
