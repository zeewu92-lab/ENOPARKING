import crypto from 'node:crypto';
import { baozhengSchema, huoquSql } from './db.js';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.end(JSON.stringify(body));
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 16384) reject(new Error('REQUEST_TOO_LARGE'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('REQUEST_INVALID')); }
    });
    req.on('error', reject);
  });
}

function encryptionKey() {
  const raw = process.env.TOKEN_RECOVERY_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error('TOKEN_RECOVERY_ENCRYPTION_KEY_INVALID');
  return Buffer.from(raw, 'hex');
}

function encryptRecovery(value) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptRecovery(value) {
  const [version, noncePart, tagPart, ciphertextPart] = String(value || '').split('.');
  if (version !== 'v1' || !noncePart || !tagPart || !ciphertextPart) throw new Error('RECOVERY_DATA_INVALID');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(noncePart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(clear);
}

function makePair(familyExpiresAt) {
  const accessToken = crypto.randomBytes(32).toString('base64url');
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    accessExpiresAt: new Date(Math.min(now + ACCESS_TTL_MS, new Date(familyExpiresAt).getTime())).toISOString()
  };
}

function responsePair(accountId, pair, familyExpiresAt) {
  return {
    accountId: String(accountId),
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    expiresAt: new Date(pair.accessExpiresAt).getTime(),
    familyExpiresAt: new Date(familyExpiresAt).getTime()
  };
}

function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split(':');
  if (typeof password !== 'string' || !salt || !hex) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) => {
      if (error) return reject(error);
      const expected = Buffer.from(hex, 'hex');
      resolve(expected.length === derived.length && crypto.timingSafeEqual(derived, expected));
    });
  });
}

export async function chuliNativeTokenAuth(req, res, action) {
  if (process.env.TOKEN_AUTH_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'TOKEN_AUTH_DISABLED', retryable: false } });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', retryable: false } });

  try {
    encryptionKey();
    await baozhengSchema();
    const sql = huoquSql();
    const body = await readBody(req);

    if (action === 'native-login') {
      const username = String(body.username || '').trim().toLowerCase();
      const password = body.password;
      if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || password.length > 128) {
        return sendJson(res, 400, { error: { code: 'CREDENTIALS_INVALID', retryable: false } });
      }
      const users = await sql`SELECT id, username, password_hash, disabled FROM eng_users WHERE username = ${username} LIMIT 1`;
      const user = users[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return sendJson(res, 401, { error: { code: 'CREDENTIALS_INVALID', retryable: false } });
      }
      if (user.disabled) return sendJson(res, 403, { error: { code: 'ACCOUNT_LOCKED', retryable: false } });

      const now = Date.now();
      const familyExpiresAt = new Date(now + FAMILY_TTL_MS);
      const internalSessionToken = crypto.randomBytes(32).toString('base64url');
      const sessionHash = hashToken(internalSessionToken);
      const familyId = crypto.randomUUID();
      const pair = makePair(familyExpiresAt);
      await sql.transaction([
        sql`INSERT INTO eng_sessions(token_hash, user_id, expires_at)
            VALUES (${sessionHash}, ${user.id}, ${familyExpiresAt.toISOString()})`,
        sql`INSERT INTO eng_token_families(id, user_id, session_token_hash, expires_at)
            VALUES (${familyId}::uuid, ${user.id}, ${sessionHash}, ${familyExpiresAt.toISOString()})`,
        sql`INSERT INTO eng_access_tokens(token_hash, family_id, user_id, expires_at)
            VALUES (${pair.accessTokenHash}, ${familyId}::uuid, ${user.id}, ${pair.accessExpiresAt})`,
        sql`INSERT INTO eng_refresh_tokens(token_hash, family_id, user_id, expires_at)
            VALUES (${pair.refreshTokenHash}, ${familyId}::uuid, ${user.id}, ${familyExpiresAt.toISOString()})`,
        sql`UPDATE eng_users SET last_login_at = ${new Date(now).toISOString()} WHERE id = ${user.id}`
      ]);
      return sendJson(res, 200, responsePair(user.id, pair, familyExpiresAt));
    }

    if (action === 'native-refresh') {
      const refreshToken = String(body.refreshToken || '');
      const requestId = String(body.refreshRequestId || '');
      if (refreshToken.length < 40 || refreshToken.length > 8192 || !UUID_V4.test(requestId)) {
        return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
      }
      const oldHash = hashToken(refreshToken);
      const rows = await sql`
        SELECT t.user_id, t.family_id, f.expires_at
          FROM eng_refresh_tokens t
          JOIN eng_token_families f ON f.id = t.family_id
         WHERE t.token_hash = ${oldHash}
         LIMIT 1
      `;
      const tokenRow = rows[0];
      if (!tokenRow) {
        const deleted = await sql`SELECT token_hash FROM eng_deleted_refresh_tokens WHERE token_hash = ${oldHash} LIMIT 1`;
        return sendJson(res, 401, { error: { code: deleted[0] ? 'ACCOUNT_DELETED' : 'REFRESH_INVALID', retryable: false } });
      }
      const familyExpiresAt = tokenRow.expires_at;
      if (new Date(familyExpiresAt).getTime() <= Date.now()) {
        return sendJson(res, 401, { error: { code: 'REFRESH_EXPIRED', retryable: false } });
      }
      const pair = makePair(familyExpiresAt);
      const recoveryResponse = {
        accountId: String(tokenRow.user_id),
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        accessExpiresAt: pair.accessExpiresAt,
        familyExpiresAt: new Date(familyExpiresAt).toISOString()
      };
      const ciphertext = encryptRecovery(recoveryResponse);
      const rotations = await sql`
        SELECT eng_rotate_refresh_token(
          ${oldHash}, ${requestId}::uuid, ${pair.accessTokenHash}, ${pair.refreshTokenHash},
          ${pair.accessExpiresAt}::timestamptz, ${ciphertext}
        ) AS result
      `;
      const result = rotations[0]?.result || {};
      if (['replay', 'recovery_expired', 'invalid', 'revoked', 'account_locked'].includes(result.status)) {
        const status = result.status === 'account_locked' ? 403 : 401;
        const code = {
          replay: 'REFRESH_REPLAY',
          recovery_expired: 'REFRESH_RECOVERY_EXPIRED',
          invalid: 'REFRESH_INVALID',
          revoked: 'TOKEN_REVOKED',
          account_locked: 'ACCOUNT_LOCKED'
        }[result.status];
        return sendJson(res, status, { error: { code, retryable: false } });
      }
      if (!result.ciphertext) return sendJson(res, 503, { error: { code: 'INTERNAL_ERROR', retryable: true } });
      const recovered = decryptRecovery(result.ciphertext);
      const pairResult = {
        accessToken: recovered.accessToken,
        refreshToken: recovered.refreshToken,
        accessExpiresAt: recovered.accessExpiresAt
      };
      return sendJson(res, 200, responsePair(recovered.accountId, pairResult, recovered.familyExpiresAt));
    }

    if (action === 'native-logout') {
      const refreshToken = String(body.refreshToken || '');
      if (refreshToken.length < 40 || refreshToken.length > 8192) {
        return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
      }
      const rows = await sql`
        SELECT f.id, f.session_token_hash
          FROM eng_refresh_tokens t
          JOIN eng_token_families f ON f.id = t.family_id
         WHERE t.token_hash = ${hashToken(refreshToken)}
         LIMIT 1
      `;
      if (rows[0]) {
        await sql.transaction([
          sql`UPDATE eng_token_families
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revoke_reason = COALESCE(revoke_reason, 'native_logout')
               WHERE id = ${rows[0].id}::uuid`,
          sql`DELETE FROM eng_access_tokens WHERE family_id = ${rows[0].id}::uuid`,
          sql`DELETE FROM eng_sessions WHERE token_hash = ${rows[0].session_token_hash}`
        ]);
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: { code: 'NATIVE_TOKEN_ENDPOINT_NOT_FOUND', retryable: false } });
  } catch (error) {
    console.error('[native-token-auth] request failed:', error?.message || 'unknown error');
    return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', retryable: true } });
  }
}
