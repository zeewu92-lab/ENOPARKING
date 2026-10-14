import crypto from 'node:crypto';
import { baozhengSchema, huoquSql } from './db.js';

const SESSION_DAYS = 30;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  return Object.fromEntries(raw.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'development' ? '' : '; Secure';
  return name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax' + secure;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('请求格式错误')); }
    });
    req.on('error', reject);
  });
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validUsername(userming) {
  return /^[a-z0-9_]{3,24}$/.test(userming);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) => {
      if (error) return reject(error);
      resolve(salt + ':' + derived.toString('hex'));
    });
  });
}

function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split(':');
  if (!salt || !hex) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, actual) => {
      if (error) return reject(error);
      const expected = Buffer.from(hex, 'hex');
      resolve(expected.length === actual.length && crypto.timingSafeEqual(actual, expected));
    });
  });
}

function recoveryCodeHash(code) {
  const secret = process.env.ENGNOCRAZY_RECOVERY_SECRET || process.env.DATABASE_URL;
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

async function sendRecoveryCode({ channel, destination, code }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY 未設定');

  if (channel === 'email') {
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || '語未央';
    if (!senderEmail) throw new Error('BREVO_SENDER_EMAIL 未設定');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: destination }],
        subject: '語未央帳戶驗證碼',
        textContent: '你的語未央帳戶驗證碼為 ' + code + '。驗證碼 10 分鐘內有效，若不是你本人操作，請忽略這封郵件。',
        htmlContent: '<p>你的語未央帳戶驗證碼為 <strong>' + code + '</strong>。</p><p>驗證碼 10 分鐘內有效，若不是你本人操作，請忽略這封郵件。</p>'
      })
    });
    if (!response.ok) throw new Error('Brevo 電子郵件寄送失敗');
    return;
  }

  const sender = process.env.BREVO_SMS_SENDER;
  if (!sender) throw new Error('BREVO_SMS_SENDER 未設定');
  const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender,
      recipient: destination,
      content: '語未央帳戶驗證碼：' + code + '。10 分鐘內有效。',
      type: 'transactional',
      unicodeEnabled: true,
      tag: 'accountRecovery'
    })
  });
  if (!response.ok) throw new Error('Brevo 簡訊寄送失敗');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    role: row.role || 'user',
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null
  };
}

export async function huoquHuihuaUser(req) {
  await baozhengSchema();
  const cookies = parseCookies(req);
  const rawToken = cookies.engnocrazy_session;
  if (!rawToken) return null;
  const sql = huoquSql();
  const tokenHash = hashToken(rawToken);
  const rows = await sql`
    SELECT u.*
    FROM eng_sessions s
    JOIN eng_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
      AND u.disabled = FALSE
    LIMIT 1
  `;
  return rows[0] ? publicUser(rows[0]) : null;
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  const sql = huoquSql();
  await sql`
    INSERT INTO eng_sessions(token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `;
  res.setHeader('Set-Cookie', cookie('engnocrazy_session', token, SESSION_DAYS * 86400));
}

export async function requireUser(req, res) {
  const user = await huoquHuihuaUser(req);
  if (!user) {
    json(res, 401, { error: '請先登入' });
    return null;
  }
  return user;
}

export async function chuliAuth(req, res, action) {
  try {
    await baozhengSchema();
    const sql = huoquSql();

    if (action === 'admin-setup' && req.method === 'POST') {
      const body = await readBody(req);
      const suppliedKey = String(body.key || '');
      const username = normalizeUsername(body.username);
      const configuredKey = process.env.ENGNOCRAZY_ADMIN_SETUP_KEY || '';
      if (!configuredKey || !suppliedKey || !crypto.timingSafeEqual(
        crypto.createHash('sha256').update(suppliedKey).digest(),
        crypto.createHash('sha256').update(configuredKey).digest()
      )) {
        return json(res, 403, { error: '管理员初始化密钥无效或尚未配置' });
      }
      if (!validUsername(username)) return json(res, 400, { error: '账号格式不正确' });
      const target = await sql`SELECT id FROM eng_users WHERE username = ${username} LIMIT 1`;
      if (!target[0]) return json(res, 404, { error: '账户不存在，请先正常注册' });
      const claimed = await sql`UPDATE eng_admin_setup SET used_at = NOW() WHERE id = 1 AND used_at IS NULL RETURNING id`;
      if (!claimed[0]) return json(res, 409, { error: '管理员初始化密钥已使用' });
      await sql`UPDATE eng_users SET role = 'admin', disabled = FALSE WHERE id = ${target[0].id}`;
      await auditAdminSetup(sql, target[0].id, username);
      return json(res, 200, { ok: true, message: '管理员权限已启用，请重新登录' });
    }

    if (action === 'recovery-request' && req.method === 'POST') {
      const body = await readBody(req);
      const userming = normalizeUsername(body.username);
      const channel = body.channel === 'phone' ? 'phone' : 'email';

      if (!process.env.BREVO_API_KEY) return json(res, 503, { error: '帳戶找回服務尚未完成郵件服務設定' });
      if (channel === 'email' && !process.env.BREVO_SENDER_EMAIL) return json(res, 503, { error: '帳戶找回服務尚未完成郵件服務設定' });
      if (channel === 'phone' && !process.env.BREVO_SMS_SENDER) return json(res, 503, { error: '帳戶找回服務尚未完成簡訊服務設定' });

      const rows = await sql`SELECT id, nickname, recovery_email, recovery_phone_country_code, recovery_phone FROM eng_users WHERE username = ${userming} LIMIT 1`;
      const target = rows[0];
      if (!target) return json(res, 200, { ok: true, message: '如果帳戶存在且已設定這種找回方式，驗證碼已寄出。' });

      const destination = channel === 'email'
        ? target.recovery_email
        : (target.recovery_phone_country_code || '') + target.recovery_phone;
      if (!destination) return json(res, 200, { ok: true, message: '如果帳戶存在且已設定這種找回方式，驗證碼已寄出。' });

      const recent = await sql`SELECT id FROM eng_recovery_codes WHERE user_id = ${target.id} AND created_at >= NOW() - INTERVAL '60 seconds' AND used_at IS NULL LIMIT 1`;
      if (recent[0]) return json(res, 429, { error: '驗證碼已寄出，請稍後再試' });

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const codeHash = recoveryCodeHash(code);
      await sql`UPDATE eng_recovery_codes SET used_at = NOW() WHERE user_id = ${target.id} AND used_at IS NULL`;
      await sql`
        INSERT INTO eng_recovery_codes(user_id, channel, destination, code_hash, expires_at)
        VALUES (${target.id}, ${channel}, ${destination}, ${codeHash}, NOW() + INTERVAL '10 minutes')
      `;
      try {
        await sendRecoveryCode({ channel, destination, code });
      } catch (error) {
        await sql`UPDATE eng_recovery_codes SET used_at = NOW() WHERE user_id = ${target.id} AND used_at IS NULL`;
        console.error('[engnocrazy recovery delivery]', error);
        return json(res, 502, { error: '驗證碼目前無法寄出，請稍後再試' });
      }
      return json(res, 200, { ok: true, message: '驗證碼已寄出，10 分鐘內有效。' });
    }

    if (action === 'recovery-reset' && req.method === 'POST') {
      const body = await readBody(req);
      const userming = normalizeUsername(body.username);
      const code = String(body.code || '').trim();
      const newPassword = String(body.newPassword || '');
      if (!validPassword(newPassword)) return json(res, 400, { error: '新密碼需為 8 至 128 位' });
      if (!/^\d{6}$/.test(code)) return json(res, 400, { error: '驗證碼格式不正確' });

      const rows = await sql`SELECT id FROM eng_users WHERE username = ${userming} LIMIT 1`;
      if (!rows[0]) return json(res, 400, { error: '帳號或驗證碼不正確' });
      const recovery = await sql`
        SELECT id, code_hash, attempts FROM eng_recovery_codes
        WHERE user_id = ${rows[0].id} AND used_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
      `;
      if (!recovery[0] || recovery[0].attempts >= 5 || recovery[0].code_hash !== recoveryCodeHash(code)) {
        if (recovery[0]) await sql`UPDATE eng_recovery_codes SET attempts = attempts + 1 WHERE id = ${recovery[0].id}`;
        return json(res, 400, { error: '帳號或驗證碼不正確' });
      }

      const passwordHash = await hashPassword(newPassword);
      await sql`UPDATE eng_users SET password_hash = ${passwordHash} WHERE id = ${rows[0].id}`;
      await sql`UPDATE eng_recovery_codes SET used_at = NOW() WHERE id = ${recovery[0].id}`;
      await sql`DELETE FROM eng_sessions WHERE user_id = ${rows[0].id}`;
      return json(res, 200, { ok: true });
    }

    if (action === 'register' && req.method === 'POST') {
      const body = await readBody(req);
      const userming = normalizeUsername(body.username);
      const password = body.password;
      const nickname = String(body.nickname || '').trim().slice(0, 40);
      const recoveryEmail = String(body.recoveryEmail || '').trim().toLowerCase();
      const recoveryPhoneCountryCode = String(body.recoveryPhoneCountryCode || '').trim();
      const recoveryPhone = String(body.recoveryPhone || '').replace(/[^0-9]/g, '');

      if (!validUsername(userming)) return json(res, 400, { error: '帳號需為 3 至 24 位英數字或底線' });
      if (!validPassword(password)) return json(res, 400, { error: '密碼需為 8 至 128 位' });
      if (!nickname) return json(res, 400, { error: '請輸入使用者名稱' });
      if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
        return json(res, 400, { error: '電子郵箱格式不正確' });
      }
      if (recoveryPhone && !/^\d{6,15}$/.test(recoveryPhone)) {
        return json(res, 400, { error: '手機號格式不正確' });
      }
      if (recoveryPhone && !/^\+\d{1,4}$/.test(recoveryPhoneCountryCode)) {
        return json(res, 400, { error: '手機國際區號不正確' });
      }
      if (recoveryEmail && recoveryPhone) {
        return json(res, 400, { error: '電子郵箱與手機號只能選填其中一項' });
      }

      const existing = await sql`SELECT id FROM eng_users WHERE username = ${userming} LIMIT 1`;
      if (existing.length) return json(res, 409, { error: '這個帳號已經存在' });

      const id = crypto.randomUUID();
      const adminUsername = process.env.ENGNOCRAZY_ADMIN_USERNAME;
      const role = adminUsername && normalizeUsername(adminUsername) === userming ? 'admin' : 'user';
      const passwordHash = await hashPassword(password);

      const rows = await sql`
        INSERT INTO eng_users(id, username, password_hash, nickname, recovery_email, recovery_phone_country_code, recovery_phone, role)
        VALUES (${id}, ${userming}, ${passwordHash}, ${nickname}, ${recoveryEmail || null}, ${recoveryPhoneCountryCode || null}, ${recoveryPhone || null}, ${role})
        RETURNING *
      `;
      await createSession(id, res);
      return json(res, 201, { user: publicUser(rows[0]), state: null, isNew: true });
    }

    if (action === 'recovery' && req.method === 'POST') {
      const user = await requireUser(req, res);
      if (!user) return;

      const body = await readBody(req);
      const recoveryEmail = String(body.recoveryEmail || '').trim().toLowerCase();
      const recoveryPhoneCountryCode = String(body.recoveryPhoneCountryCode || '').trim();
      const recoveryPhone = String(body.recoveryPhone || '').replace(/[^0-9]/g, '');

      if (recoveryEmail && !/^\S+@\S+\.\S+$/.test(recoveryEmail)) {
        return json(res, 400, { error: '電子郵箱格式不正確' });
      }
      if (recoveryPhone && !/^\d{6,15}$/.test(recoveryPhone)) {
        return json(res, 400, { error: '手機號格式不正確' });
      }
      if (recoveryPhone && !/^\+\d{1,4}$/.test(recoveryPhoneCountryCode)) {
        return json(res, 400, { error: '手機國際區號不正確' });
      }
      if (recoveryEmail && recoveryPhone) {
        return json(res, 400, { error: '電子郵箱與手機號只能設定其中一項' });
      }

      await sql`
        UPDATE eng_users
        SET recovery_email = ${recoveryEmail || null},
            recovery_phone_country_code = ${recoveryPhoneCountryCode || null},
            recovery_phone = ${recoveryPhone || null}
        WHERE id = ${user.id}
      `;

      return json(res, 200, { ok: true });
    }

    if (action === 'login' && req.method === 'POST') {
      const body = await readBody(req);
      const userming = normalizeUsername(body.username);
      const password = body.password;
      const rows = await sql`SELECT * FROM eng_users WHERE username = ${userming} LIMIT 1`;
      const user = rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return json(res, 401, { error: '帳號或密碼錯誤' });
      }
      if (user.disabled) {
        return json(res, 403, { error: '帳戶被停權' });
      }
      const loginAt = new Date().toISOString();
      await sql`UPDATE eng_users SET last_login_at = ${loginAt} WHERE id = ${user.id}`;
      await createSession(user.id, res);
      const states = await sql`SELECT state FROM eng_user_state WHERE user_id = ${user.id} LIMIT 1`;
      return json(res, 200, { user: publicUser({ ...user, last_login_at: loginAt }), state: states[0]?.state || null, isNew: false });
    }

    if (action === 'password' && req.method === 'POST') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const rows = await sql`SELECT password_hash FROM eng_users WHERE id = ${user.id} LIMIT 1`;
      if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) return json(res, 400, { error: '目前密碼不正確' });
      if (!validPassword(newPassword)) return json(res, 400, { error: '新密碼需為 8 至 128 位' });
      if (currentPassword === newPassword) return json(res, 400, { error: '新密碼不能與目前密碼相同' });
      const passwordHash = await hashPassword(newPassword);
      await sql`UPDATE eng_users SET password_hash = ${passwordHash} WHERE id = ${user.id}`;
      await sql`DELETE FROM eng_sessions WHERE user_id = ${user.id}`;
      await createSession(user.id, res);
      return json(res, 200, { ok: true });
    }

    if (action === 'profile' && req.method === 'POST') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const nickname = String(body.nickname || '').trim().slice(0, 40);
      const avatar = body.avatar === undefined
        ? null
        : String(body.avatar || '').trim();

      if (!nickname) return json(res, 400, { error: '請輸入使用者名稱' });
      if (avatar && avatar.length > 50000) {
        return json(res, 400, { error: '頭像檔案過大' });
      }

      if (body.avatar === undefined) {
        await sql`UPDATE eng_users SET nickname = ${nickname} WHERE id = ${user.id}`;
      } else {
        await sql`UPDATE eng_users SET nickname = ${nickname}, avatar = ${avatar} WHERE id = ${user.id}`;
      }
      const rows = await sql`SELECT * FROM eng_users WHERE id = ${user.id} LIMIT 1`;
      return json(res, 200, { user: publicUser(rows[0]) });
    }

    if (action === 'me' && req.method === 'GET') {
      const user = await huoquHuihuaUser(req);
      if (!user) return json(res, 401, { error: '未登入' });
      const states = await sql`SELECT state FROM eng_user_state WHERE user_id = ${user.id} LIMIT 1`;
      return json(res, 200, { user, state: states[0]?.state || null });
    }

    if (action === 'logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const rawToken = cookies.engnocrazy_session;
      if (rawToken) await sql`DELETE FROM eng_sessions WHERE token_hash = ${hashToken(rawToken)}`;
      res.setHeader('Set-Cookie', cookie('engnocrazy_session', '', 0));
      return json(res, 200, { ok: true });
    }

    if (action === 'sync' && req.method === 'POST') {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const incoming = body.state && typeof body.state === 'object' ? body.state : {};
      const existingRows = await sql`SELECT state FROM eng_user_state WHERE user_id = ${user.id} LIMIT 1`;
      const existing = existingRows[0]?.state || {};
      const merged = mergeState(existing, incoming);

      await sql`
        INSERT INTO eng_user_state(user_id, state, updated_at)
        VALUES (${user.id}, ${JSON.stringify(merged)}::jsonb, NOW())
        ON CONFLICT(user_id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
      `;

      const events = Array.isArray(incoming.wrongEvents) ? incoming.wrongEvents.slice(0, 100) : [];
      if (events.length) {
        const eventPayload = events.map(event => ({
          word: String(event?.word || '').trim().toLowerCase(),
          errorType: String(event?.errorType || 'spelling_error')
        })).filter(event => event.word);

        if (eventPayload.length) {
          await sql`
            INSERT INTO eng_wrong_events(user_id, word, error_type)
            SELECT ${user.id},
                   LOWER(TRIM(item->>'word')),
                   COALESCE(NULLIF(TRIM(item->>'errorType'), ''), 'spelling_error')
            FROM jsonb_array_elements(${JSON.stringify(eventPayload)}::jsonb) AS item
            WHERE TRIM(COALESCE(item->>'word', '')) <> ''
          `;
        }
      }

      return json(res, 200, { ok: true, state: merged, syncedAt: new Date().toISOString() });
    }

    return json(res, 404, { error: '帳戶 API 不存在' });
  } catch (error) {
    console.error('[engnocrazy auth]', error);
    return json(res, 500, { error: error.message || '伺服器錯誤' });
  }
}

function mergeState(base, incoming) {
  const merged = { ...base, ...incoming, localStorage: { ...(base.localStorage || {}), ...(incoming.localStorage || {}) } };
  merged.rememberedWords = uniqueStrings([...(base.rememberedWords || []), ...(incoming.rememberedWords || [])]);
  merged.ignoredWords = mergeObjects(base.ignoredWords, incoming.ignoredWords, 'word');
  merged.wrongBook = mergeObjects(base.wrongBook, incoming.wrongBook, 'word');
  merged.studyDates = uniqueStrings([...(base.studyDates || []), ...(incoming.studyDates || [])]).sort();
  merged.completedStages = mergeObjects(base.completedStages, incoming.completedStages, 'key');
  merged.learningStats = mergeTongji(base.learningStats || {}, incoming.learningStats || {});
  merged.memoryRecords = mergeJiyiRecords(base.memoryRecords || {}, incoming.memoryRecords || {});
  merged.localStorage = { ...(merged.localStorage || {}), ['engnocrazy:memory:v1']: JSON.stringify(merged.memoryRecords) };
  return merged;
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function mergeObjects(base, incoming, key) {
  const map = new Map();
  [...(Array.isArray(base) ? base : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(item => {
    if (!item || !item[key]) return;
    const id = String(item[key]).toLowerCase();
    const old = map.get(id);
    map.set(id, old ? { ...old, ...item, wrongCount: Math.max(Number(old.wrongCount || 0), Number(item.wrongCount || 0)) } : item);
  });
  return [...map.values()];
}

function mergeTongji(a, b) {
  const out = { ...a, ...b };
  for (const key of ['totalWords','earlyBird','nightStudy','bonusUses']) {
    out[key] = Math.max(Number(a[key] || 0), Number(b[key] || 0));
  }

  out.studyDates = uniqueStrings([...(a.studyDates || []), ...(b.studyDates || [])]).sort();
  out.studyDays = out.studyDates.length;

  const incomingTongji = b && typeof b === 'object' ? b : {};
  const baseTongji = a && typeof a === 'object' ? a : {};
  out.streak = Object.prototype.hasOwnProperty.call(incomingTongji, 'streak')
    ? Number(incomingTongji.streak || 0)
    : Number(baseTongji.streak || 0);
  out.longestStreak = Math.max(Number(baseTongji.longestStreak || 0), Number(incomingTongji.longestStreak || 0));
  out.goalStreak = Object.prototype.hasOwnProperty.call(incomingTongji, 'goalStreak')
    ? Number(incomingTongji.goalStreak || 0)
    : Number(baseTongji.goalStreak || 0);
  out.longestGoalStreak = Math.max(Number(baseTongji.longestGoalStreak || 0), Number(incomingTongji.longestGoalStreak || 0));

  out.completedStages = mergeObjects(a.completedStages, b.completedStages, 'key');
  out.lastStudyDate = out.studyDates[out.studyDates.length - 1] || incomingTongji.lastStudyDate || baseTongji.lastStudyDate || '';
  if (!out.lastGoalDate || String(incomingTongji.lastGoalDate || '') > String(baseTongji.lastGoalDate || '')) {
    out.lastGoalDate = incomingTongji.lastGoalDate || baseTongji.lastGoalDate || '';
  }
  return out;
}

function mergeJiyiRecords(base, incoming) {
  const out = { ...(base || {}) };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    const old = out[key] || {};
    const xiayi = { ...old, ...value };
    for (const field of ['level','intervalIndex','streak','attempts','correct','wrong','assisted']) {
      xiayi[field] = Math.max(Number(old[field] || 0), Number(value?.[field] || 0));
    }
    xiayi.lastAttemptAt = Math.max(Number(old.lastAttemptAt || 0), Number(value?.lastAttemptAt || 0));
    xiayi.dueAt = Math.max(Number(old.dueAt || 0), Number(value?.dueAt || 0));
    xiayi.errorTypes = { ...(old.errorTypes || {}), ...(value?.errorTypes || {}) };
    Object.keys(xiayi.errorTypes).forEach(type => {
      xiayi.errorTypes[type] = Math.max(Number(old.errorTypes?.[type] || 0), Number(value?.errorTypes?.[type] || 0));
    });
    out[key] = xiayi;
  });
  return out;
}

async function auditAdminSetup(sql, userId, username) {
  await sql`INSERT INTO eng_admin_audit(actor_user_id, target_user_id, action, metadata)
    VALUES (${userId}, ${userId}, 'admin-setup', ${JSON.stringify({ username })}::jsonb)`;
}
