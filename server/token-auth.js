import crypto from 'node:crypto';
import { huoquSql } from './db.js';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE = 'enoparking_refresh';

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

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const cookies = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[key] = '';
    }
  }
  return cookies;
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
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('REQUEST_INVALID'));
      }
    });
    req.on('error', reject);
  });
}

function secureCookie() {
  return process.env.NODE_ENV === 'development' ? '' : '; Secure';
}

function refreshCookie(_req, value, maxAge) {
  return REFRESH_COOKIE + '=' + encodeURIComponent(value) +
    '; Path=/api/token; Max-Age=' + Math.max(0, Math.floor(maxAge)) +
    '; HttpOnly; SameSite=Lax' + secureCookie();
}

function encryptionKey() {
  const raw = process.env.TOKEN_RECOVERY_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error('TOKEN_RECOVERY_ENCRYPTION_KEY must be 64 hex characters');
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

function issueHeaders(req, res, pair, familyExpiresAt) {
  const expiresAt = new Date(Math.min(Date.now() + ACCESS_TTL_MS, new Date(familyExpiresAt).getTime()));
  const maxAge = Math.max(0, Math.floor((new Date(familyExpiresAt).getTime() - Date.now()) / 1000));
  res.setHeader('Authorization', 'Bearer ' + pair.accessToken);
  res.setHeader('Access-Control-Expose-Headers', 'Authorization');
  res.setHeader('Set-Cookie', refreshCookie(req, pair.refreshToken, maxAge));
  res.setHeader('Cache-Control', 'no-store');
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
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

export async function chuliTokenAuth(req, res, action) {
  if (process.env.TOKEN_AUTH_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'TOKEN_AUTH_DISABLED', retryable: false } });
  }

  try {
    const sql = huoquSql();
    try { encryptionKey(); } catch {
      return sendJson(res, 503, { error: { code: 'TOKEN_AUTH_NOT_CONFIGURED', retryable: false } });
    }

    if (action === 'exchange' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const sessionToken = cookies.engnocrazy_session;
      if (!sessionToken) return sendJson(res, 401, { error: { code: 'SESSION_REQUIRED', retryable: false } });

      const sessionHash = hashToken(sessionToken);
      const sessions = await sql`
        SELECT s.user_id, s.expires_at, u.disabled
          FROM eng_sessions s
          JOIN eng_users u ON u.id = s.user_id
         WHERE s.token_hash = ${sessionHash}
           AND s.expires_at > NOW()
         LIMIT 1
      `;
      const session = sessions[0];
      if (!session) return sendJson(res, 401, { error: { code: 'SESSION_INVALID', retryable: false } });
      if (session.disabled) return sendJson(res, 403, { error: { code: 'ACCOUNT_LOCKED', retryable: false } });

      const requiresReauthentication = await sql`
        SELECT id FROM eng_token_families
         WHERE session_token_hash = ${sessionHash}
           AND revoked_at IS NOT NULL
           AND revoke_reason IN ('refresh_token_replay', 'refresh_recovery_expired')
         LIMIT 1
      `;
      if (requiresReauthentication[0]) {
        return sendJson(res, 401, { error: { code: 'SESSION_REAUTH_REQUIRED', retryable: false } });
      }

      await sql`UPDATE eng_token_families
        SET revoked_at = NOW(), revoke_reason = COALESCE(revoke_reason, 'family_expired')
        WHERE session_token_hash = ${sessionHash}
          AND revoked_at IS NULL AND expires_at <= NOW()`;

      const existing = await sql`
        SELECT id FROM eng_token_families
         WHERE session_token_hash = ${sessionHash}
           AND revoked_at IS NULL
           AND expires_at > NOW()
         LIMIT 1
      `;
      if (existing[0]) return sendJson(res, 409, { error: { code: 'TOKEN_FAMILY_EXISTS', retryable: false } });

      const familyExpiresAt = new Date(Math.min(Date.now() + FAMILY_TTL_MS, new Date(session.expires_at).getTime()));
      if (familyExpiresAt.getTime() <= Date.now()) return sendJson(res, 401, { error: { code: 'SESSION_EXPIRED', retryable: false } });
      const familyId = crypto.randomUUID();
      const pair = makePair(familyExpiresAt);
      await sql.transaction([
        sql`INSERT INTO eng_token_families(id, user_id, session_token_hash, expires_at)
            VALUES (${familyId}::uuid, ${session.user_id}, ${sessionHash}, ${familyExpiresAt.toISOString()})`,
        sql`INSERT INTO eng_access_tokens(token_hash, family_id, user_id, expires_at)
            VALUES (${pair.accessTokenHash}, ${familyId}::uuid, ${session.user_id}, ${pair.accessExpiresAt})`,
        sql`INSERT INTO eng_refresh_tokens(token_hash, family_id, user_id, expires_at)
            VALUES (${pair.refreshTokenHash}, ${familyId}::uuid, ${session.user_id}, ${familyExpiresAt.toISOString()})`
      ]);

      const expiresIn = issueHeaders(req, res, pair, familyExpiresAt);
      return sendJson(res, 200, { tokenType: 'Bearer', expiresIn });
    }

    if (action === 'refresh' && req.method === 'POST') {
      const refreshToken = parseCookies(req)[REFRESH_COOKIE];
      if (!refreshToken) return sendJson(res, 401, { error: { code: 'REFRESH_REQUIRED', retryable: false } });
      const body = await readBody(req);
      const requestId = String(body.refreshRequestId || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
      }

      const oldHash = hashToken(refreshToken);
      const lookup = await sql`
        SELECT user_id, family_id, expires_at
          FROM eng_refresh_tokens
         WHERE token_hash = ${oldHash}
         LIMIT 1
      `;
      if (!lookup[0]) {
        res.setHeader('Set-Cookie', refreshCookie(req, '', 0));
        return sendJson(res, 401, { error: { code: 'REFRESH_INVALID', retryable: false } });
      }

      const familyExpiresAtRows = await sql`
        SELECT expires_at FROM eng_token_families WHERE id = ${lookup[0].family_id} LIMIT 1
      `;
      const familyExpiresAt = familyExpiresAtRows[0]?.expires_at;
      if (!familyExpiresAt || new Date(familyExpiresAt).getTime() <= Date.now()) {
        res.setHeader('Set-Cookie', refreshCookie(req, '', 0));
        return sendJson(res, 401, { error: { code: 'REFRESH_EXPIRED', retryable: false } });
      }

      const pair = makePair(familyExpiresAt);
      const recoveryResponse = {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        familyExpiresAt: new Date(familyExpiresAt).toISOString()
      };
      const ciphertext = encryptRecovery(recoveryResponse);
      const rotations = await sql`
        SELECT eng_rotate_refresh_token(
          ${oldHash},
          ${requestId}::uuid,
          ${pair.accessTokenHash},
          ${pair.refreshTokenHash},
          ${pair.accessExpiresAt}::timestamptz,
          ${ciphertext}
        ) AS result
      `;
      const result = rotations[0]?.result || {};
      if (result.status === 'replay' || result.status === 'recovery_expired' || result.status === 'invalid' || result.status === 'revoked' || result.status === 'account_locked') {
        res.setHeader('Set-Cookie', refreshCookie(req, '', 0));
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
      if (!result.ciphertext) {
        return sendJson(res, 503, { error: { code: 'INTERNAL_ERROR', retryable: true } });
      }

      const recovered = decryptRecovery(result.ciphertext);
      const expiresIn = issueHeaders(req, res, recovered, recovered.familyExpiresAt);
      return sendJson(res, 200, { tokenType: 'Bearer', expiresIn });
    }

    return sendJson(res, 404, { error: { code: 'TOKEN_ENDPOINT_NOT_FOUND', retryable: false } });
  } catch (error) {
    if (error?.code === '23505') {
      return sendJson(res, 409, { error: { code: 'TOKEN_FAMILY_EXISTS', retryable: false } });
    }
    console.error('[token-auth] request failed:', error?.message || 'unknown error');
    return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', retryable: true } });
  }
}
