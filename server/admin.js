import { huoquSql, baozhengSchema } from './db.js';
import { requireUser } from './auth.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// 这里统一处理管理员相关请求，先检查管理员权限，再按具体操作执行数据库变更。
export async function chuliAdmin(req, res, caozuo) {
  try {
    if (caozuo === 'bootstrap-admin' && req.method === 'POST') {
      const setupKey = process.env.ENOPARKING_ADMIN_SETUP_KEY;
      const providedKey = req.headers?.['x-admin-setup-key'];
      if (!setupKey || !providedKey || providedKey !== setupKey) {
        return json(res, 403, { error: '管理員初始化金鑰無效' });
      }
      await baozhengSchema();
      const body = await readBody(req);
      const username = String(body.username || '').trim().toLowerCase();
      if (!username) return json(res, 400, { error: '缺少帳號' });
      const sql = huoquSql();
      const target = await sql`SELECT id, username, role FROM eng_users WHERE username = ${username} LIMIT 1`;
      if (!target[0]) return json(res, 404, { error: '找不到這個帳戶' });

      const claimed = await sql`
        UPDATE eng_admin_setup SET used_at = NOW()
        WHERE id = 1 AND used_at IS NULL
        RETURNING id
      `;
      if (!claimed[0]) return json(res, 409, { error: '管理員初始化已經完成，初始化端點已停用' });
      const rows = await sql`UPDATE eng_users SET role = 'admin' WHERE id = ${target[0].id} RETURNING id, username, role`;
      return json(res, 200, { ok: true, user: rows[0] });
    }

    await baozhengSchema();
    const user = await requireUser(req, res);
    if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: '沒有管理員權限' });

    const sql = huoquSql();

        async function audit(caozuoName, targetUserId = null, metadata = {}) {
      await sql`
        INSERT INTO eng_admin_audit(actor_user_id, target_user_id, action, metadata)
        VALUES (${user.id}, ${targetUserId}, ${caozuoName}, ${JSON.stringify(metadata)}::jsonb)
      `;
    }

    if (caozuo === 'overview' && req.method === 'GET') {
      const [userStats, stateStats, wrongStats, topWrongWordList, studyTimeline, auditLogs, recentUsers] = await Promise.all([
        sql`SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE disabled = FALSE)::int AS active_users,
          COUNT(*) FILTER (WHERE disabled = TRUE)::int AS disabled_users,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users,
          COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active_7d
          FROM eng_users`,
        sql`SELECT
          COALESCE(SUM((state->'learningStats'->>'totalWords')::bigint), 0)::bigint AS total_words,
          COALESCE(SUM((state->'learningStats'->>'studyDays')::bigint), 0)::bigint AS total_study_days,
          COALESCE(SUM(jsonb_array_length(CASE WHEN jsonb_typeof(state->'wrongBook') = 'array' THEN state->'wrongBook' ELSE '[]'::jsonb END)), 0)::bigint AS total_wrong_words
          FROM eng_user_state`,
        sql`SELECT COUNT(*)::int AS total_events,
          COUNT(DISTINCT user_id)::int AS users_with_errors,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS events_7d
          FROM eng_wrong_events`,
        sql`SELECT word, COUNT(*)::int AS count FROM eng_wrong_events
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY word ORDER BY count DESC, word ASC LIMIT 10`,
        sql`SELECT DATE(d)::text AS study_date, COUNT(*)::int AS users
          FROM eng_user_state s
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(s.state->'learningStats'->'studyDates') = 'array'
            THEN s.state->'learningStats'->'studyDates' ELSE '[]'::jsonb END
          ) d
          WHERE DATE(d) >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY DATE(d) ORDER BY DATE(d)`,
        sql`SELECT a.id, a.action, a.target_user_id, a.metadata, a.created_at, u.username AS actor_username
          FROM eng_admin_audit a LEFT JOIN eng_users u ON u.id = a.actor_user_id
          ORDER BY a.created_at DESC LIMIT 30`,
        sql`SELECT id, username, nickname, created_at, last_login_at, disabled
          FROM eng_users ORDER BY created_at DESC LIMIT 5`
      ]);
      return json(res, 200, {
        users: userStats[0] || {},
        learning: stateStats[0] || {},
        wrongEvents: wrongStats[0] || {},
        topWrongWords: topWrongWordList || [],
        studyTimeline: studyTimeline || [],
        auditLogs: auditLogs || [],
        recentUsers
      });
    }

    if (caozuo === 'users' && req.method === 'GET') {
      const rows = await sql`
        SELECT u.id, u.username, u.nickname, u.recovery_email, u.recovery_phone_country_code, u.recovery_phone, u.avatar, u.role, u.disabled,
               u.created_at, u.last_login_at,
               s.state,
               (SELECT COUNT(*) FROM eng_wrong_events e WHERE e.user_id = u.id) AS wrong_events
        FROM eng_users u
        LEFT JOIN eng_user_state s ON s.user_id = u.id
        ORDER BY u.created_at DESC
      `;
      return json(res, 200, {
        users: rows.map(row => {
          const state = row.state || {};
          return {
            id: row.id,
            username: row.username,
            nickname: row.nickname || '',
            recoveryEmail: row.recovery_email || '',
            recoveryPhoneCountryCode: row.recovery_phone_country_code || '',
            recoveryPhone: row.recovery_phone || '',
            avatar: row.avatar || '',
            role: row.role,
            disabled: Boolean(row.disabled),
            createdAt: row.created_at,
            lastLoginAt: row.last_login_at,
            wrongEventCount: Number(row.wrong_events || 0),
            wrongWordCount: Array.isArray(state.wrongBook) ? state.wrongBook.length : 0,
            rememberedCount: Array.isArray(state.rememberedWords) ? state.rememberedWords.length : 0,
            studyDays: Number(state.learningStats?.studyDays || 0),
            streak: Number(state.learningStats?.streak || 0),
            totalWords: Number(state.learningStats?.totalWords || 0),
            updatedAt: row.state ? state.updatedAt || null : null,
            honeyCount: Math.max(0, Number(state.localStorage?.['engnocrazy:honey'] || 0))
          };
        })
      });
    }

    if (caozuo === 'user' && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const id = url.searchParams.get('id');
      if (!id) return json(res, 400, { error: '缺少使用者 ID' });
      const rows = await sql`
        SELECT u.id, u.username, u.nickname, u.recovery_email, u.recovery_phone_country_code, u.recovery_phone, u.avatar, u.role, u.disabled, u.created_at, u.last_login_at,
               s.state,
               (SELECT COUNT(*) FROM eng_wrong_events e WHERE e.user_id = u.id)::int AS wrong_event_count
        FROM eng_users u LEFT JOIN eng_user_state s ON s.user_id = u.id
        WHERE u.id = ${id} LIMIT 1
      `;
      if (rows[0]) rows[0].wrongWordCount = Array.isArray(rows[0].state?.wrongBook) ? rows[0].state.wrongBook.length : 0;
      if (!rows[0]) return json(res, 404, { error: '使用者不存在' });
      const [auditLogs] = await Promise.all([
        sql`SELECT a.action, a.metadata, a.created_at, u.username AS actor_username
          FROM eng_admin_audit a LEFT JOIN eng_users u ON u.id = a.actor_user_id
          WHERE a.target_user_id = ${id} ORDER BY a.created_at DESC LIMIT 30`
      ]);
      const state = rows[0].state || {};
      const safeState = {
        learningStats: state.learningStats || {},
        localStorage: {
          'engnocrazy:honey': String(Math.max(0, Number(state.localStorage?.['engnocrazy:honey'] || 0))),
          'engnocrazy:honeyAdminVersion': String(Number(state.localStorage?.['engnocrazy:honeyAdminVersion'] || 0))
        },
        rememberedWords: Array.isArray(state.rememberedWords) ? state.rememberedWords : [],
        updatedAt: state.updatedAt || null
      };
      return json(res, 200, { user: rows[0], state: safeState, auditLogs });
    }

    if (caozuo === 'update-recovery' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = String(body.id || '').trim();
      if (!targetId) return json(res, 400, { error: '缺少使用者 ID' });

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

      const targetRows = await sql`SELECT id, username FROM eng_users WHERE id = ${targetId} LIMIT 1`;
      if (!targetRows[0]) return json(res, 404, { error: '使用者不存在' });

      await sql`
        UPDATE eng_users
        SET recovery_email = ${recoveryEmail || null},
            recovery_phone_country_code = ${recoveryPhoneCountryCode || null},
            recovery_phone = ${recoveryPhone || null}
        WHERE id = ${targetId}
      `;

      await audit('update_recovery_contact', targetId, {
        username: targetRows[0].username,
        recoveryEmail: Boolean(recoveryEmail),
        recoveryPhone: Boolean(recoveryPhone)
      });

      return json(res, 200, {
        ok: true,
        recoveryEmail,
        recoveryPhoneCountryCode,
        recoveryPhone
      });
    }

    if (caozuo === 'reset-profile' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = String(body.id || '').trim();
      const resetAvatar = body.avatar === true;
      const resetNickname = body.nickname === true;
      if (!targetId) return json(res, 400, { error: '缺少使用者 ID' });
      if (!resetAvatar && !resetNickname) return json(res, 400, { error: '未指定要撤銷的個人資料' });
      if (targetId === user.id) return json(res, 400, { error: '不能撤銷自己的管理員個人資料' });

      const targetRows = await sql`SELECT id, username, nickname, avatar, role, disabled FROM eng_users WHERE id = ${targetId} LIMIT 1`;
      if (!targetRows[0]) return json(res, 404, { error: '使用者不存在' });
      const target = targetRows[0];

      const nextNickname = resetNickname ? '' : (target.nickname || '');
      const nextAvatar = resetAvatar ? '' : (target.avatar || '');
      await sql`
        UPDATE eng_users
        SET nickname = ${nextNickname}, avatar = ${nextAvatar}
        WHERE id = ${targetId}
      `;

      const stateRows = await sql`SELECT state FROM eng_user_state WHERE user_id = ${targetId} LIMIT 1`;
      const state = stateRows[0]?.state && typeof stateRows[0].state === 'object' ? stateRows[0].state : {};
      const localStorage = { ...(state.localStorage || {}) };
      if (resetNickname) localStorage['engnocrazy:identity'] = target.username;
      if (resetAvatar) localStorage['engnocrazy:avatar'] = '';
      const nextState = { ...state, localStorage, updatedAt: new Date().toISOString() };
      await sql`
        INSERT INTO eng_user_state(user_id, state, updated_at)
        VALUES (${targetId}, ${JSON.stringify(nextState)}::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET state = EXCLUDED.state, updated_at = NOW()
      `;

      await audit('reset_profile', targetId, {
        username: target.username,
        resetAvatar,
        resetNickname
      });

      return json(res, 200, {
        ok: true,
        user: {
          id: target.id,
          username: target.username,
          nickname: nextNickname,
          avatar: nextAvatar,
          role: target.role,
          disabled: target.disabled
        }
      });
    }

    if (caozuo === 'set-honey' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = String(body.id || '').trim();
      const amount = Number(body.amount);
      if (!targetId) return json(res, 400, { error: '缺少使用者 ID' });
      if (!Number.isInteger(amount) || amount < 0 || amount > 100000000) {
        return json(res, 400, { error: '花蜜數量必須是 0 至 100,000,000 的整數' });
      }

      const targetRows = await sql`SELECT id, username FROM eng_users WHERE id = ${targetId} LIMIT 1`;
      if (!targetRows[0]) return json(res, 404, { error: '使用者不存在' });

      const stateRows = await sql`SELECT state FROM eng_user_state WHERE user_id = ${targetId} LIMIT 1`;
      const state = stateRows[0]?.state && typeof stateRows[0].state === 'object' ? stateRows[0].state : {};
      const localStorage = {
        ...(state.localStorage || {}),
        'engnocrazy:honey': String(amount),
        'engnocrazy:honeyAdminVersion': String(Date.now())
      };
      const nextState = { ...state, localStorage, updatedAt: new Date().toISOString() };

      await sql`
        INSERT INTO eng_user_state(user_id, state, updated_at)
        VALUES (${targetId}, ${JSON.stringify(nextState)}::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET state = EXCLUDED.state, updated_at = NOW()
      `;

      await audit('set_honey', targetId, {
        username: targetRows[0].username,
        amount
      });

      return json(res, 200, { ok: true, amount });
    }

    if (caozuo === 'toggle-disabled' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: '缺少使用者 ID' });
      if (body.id === user.id) return json(res, 400, { error: '不能停用自己的帳戶' });
      const targetRows = await sql`SELECT id, username, disabled FROM eng_users WHERE id = ${body.id} LIMIT 1`;
      if (!targetRows[0]) return json(res, 404, { error: '使用者不存在' });
      const nextDisabled = !Boolean(targetRows[0].disabled);
      await sql`UPDATE eng_users SET disabled = ${nextDisabled} WHERE id = ${body.id}`;
      await audit(nextDisabled ? 'disable_user' : 'enable_user', body.id, { username: targetRows[0].username });
      return json(res, 200, { ok: true, disabled: nextDisabled });
    }

    if (caozuo === 'delete-user' && req.method === 'POST') {
      const body = await readBody(req);
      const targetId = String(body.id || '').trim();
      if (!targetId) return json(res, 400, { error: '缺少使用者 ID' });
      if (targetId === user.id) return json(res, 400, { error: '不能永久刪除自己的管理員帳戶' });

      const targetRows = await sql`SELECT id, username, nickname, role FROM eng_users WHERE id = ${targetId} LIMIT 1`;
      if (!targetRows[0]) return json(res, 404, { error: '使用者不存在' });

      const target = targetRows[0];
      await audit('delete_user', target.id, {
        username: target.username,
        nickname: target.nickname || '',
        role: target.role,
        permanent: true
      });

      await sql`DELETE FROM eng_users WHERE id = ${target.id}`;

      return json(res, 200, { ok: true, deletedUserId: target.id });
    }

    if (caozuo === 'audit' && req.method === 'GET') {
      const rows = await sql`
        SELECT a.id, a.action, a.metadata, a.created_at, a.target_user_id,
               u.username AS actor_username, t.username AS target_username
        FROM eng_admin_audit a
        LEFT JOIN eng_users u ON u.id = a.actor_user_id
        LEFT JOIN eng_users t ON t.id = a.target_user_id
        ORDER BY a.created_at DESC LIMIT 100
      `;
      return json(res, 200, { logs: rows });
    }

    return json(res, 404, { error: '管理 API 不存在' });
  } catch (error) {
    console.error('[engnocrazy admin]', error);
    return json(res, 500, { error: error.message || '管理伺服器錯誤' });
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('請求格式錯誤')); } });
    req.on('error', reject);
  });
}
