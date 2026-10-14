import crypto from 'node:crypto';
import { baozhengSchema, huoquSql } from './db.js';
import { requireUser } from './auth.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function audit(sql, actorId, targetId, action, metadata = {}) {
  await sql`INSERT INTO eng_admin_audit(actor_user_id, target_user_id, action, metadata)
    VALUES (${actorId || null}, ${targetId || null}, ${action}, ${JSON.stringify(metadata)}::jsonb)`;
}

function publicUser(row) {
  return {
    id: row.id, username: row.username, nickname: row.nickname || '',
    avatar: row.avatar || '', role: row.role || 'user',
    disabled: Boolean(row.disabled), createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    recoveryEmail: row.recovery_email || '',
    recoveryPhoneCountryCode: row.recovery_phone_country_code || '',
    recoveryPhone: row.recovery_phone || ''
  };
}

export async function chuliAdmin(req, res, action) {
  try {
    await baozhengSchema();
    const sql = huoquSql();
    const actor = await requireUser(req, res);
    if (!actor) return;
    if (actor.role !== 'admin') return json(res, 403, { error: '需要管理员权限' });

    if (action === 'overview' && req.method === 'GET') {
      const rows = await sql`SELECT
        (SELECT COUNT(*)::int FROM eng_users) AS users,
        (SELECT COUNT(*)::int FROM eng_users WHERE disabled = TRUE) AS disabled_users,
        (SELECT COUNT(*)::int FROM eng_sessions WHERE expires_at > NOW()) AS active_sessions,
        (SELECT COUNT(*)::int FROM eng_wrong_events) AS wrong_events`;
      return json(res, 200, { overview: rows[0] || {} });
    }

    if (action === 'audit' && req.method === 'GET') {
      const rows = await sql`SELECT a.id, a.action, a.metadata, a.created_at,
        actor.username AS actor_username, target.username AS target_username
        FROM eng_admin_audit a
        LEFT JOIN eng_users actor ON actor.id = a.actor_user_id
        LEFT JOIN eng_users target ON target.id = a.target_user_id
        ORDER BY a.created_at DESC LIMIT 100`;
      return json(res, 200, { items: rows });
    }

    if (action === 'users' && req.method === 'GET') {
      const rows = await sql`SELECT * FROM eng_users ORDER BY created_at DESC LIMIT 500`;
      return json(res, 200, { users: rows.map(publicUser) });
    }

    if (action === 'user' && req.method === 'GET') {
      const id = String(req.query?.id || '');
      const rows = await sql`SELECT * FROM eng_users WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return json(res, 404, { error: '账户不存在' });
      const state = await sql`SELECT state, updated_at FROM eng_user_state WHERE user_id = ${id} LIMIT 1`;
      return json(res, 200, { user: publicUser(rows[0]), state: state[0]?.state || {}, stateUpdatedAt: state[0]?.updated_at || null });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const id = String(body.id || '').trim();
      if (!id) return json(res, 400, { error: '缺少账户 ID' });
      const targets = await sql`SELECT * FROM eng_users WHERE id = ${id} LIMIT 1`;
      if (!targets[0]) return json(res, 404, { error: '账户不存在' });
      if (id === actor.id && ['toggle-disabled', 'delete-user'].includes(action)) {
        return json(res, 400, { error: '不能对当前管理员账户执行此操作' });
      }

      if (action === 'reset-profile') {
        const nickname = body.nickname ? '' : targets[0].nickname;
        const avatar = body.avatar ? '' : targets[0].avatar;
        await sql`UPDATE eng_users SET nickname = ${nickname}, avatar = ${avatar} WHERE id = ${id}`;
        await audit(sql, actor.id, id, action, { nickname: Boolean(body.nickname), avatar: Boolean(body.avatar) });
        const updated = await sql`SELECT * FROM eng_users WHERE id = ${id} LIMIT 1`;
        return json(res, 200, { user: publicUser(updated[0]) });
      }

      if (action === 'set-honey') {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return json(res, 400, { error: '花蜜数量无效' });
        const stateRows = await sql`SELECT state FROM eng_user_state WHERE user_id = ${id} LIMIT 1`;
        const state = stateRows[0]?.state || {};
        const localStorage = { ...(state.localStorage || {}) };
        localStorage['engnocrazy:honey'] = String(Math.floor(amount));
        const next = { ...state, honey: Math.floor(amount), localStorage };
        await sql`INSERT INTO eng_user_state(user_id, state, updated_at) VALUES (${id}, ${JSON.stringify(next)}::jsonb, NOW())
          ON CONFLICT(user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`;
        await audit(sql, actor.id, id, action, { amount: Math.floor(amount) });
        return json(res, 200, { ok: true, state: next });
      }

      if (action === 'toggle-disabled') {
        const disabled = !Boolean(targets[0].disabled);
        await sql`UPDATE eng_users SET disabled = ${disabled} WHERE id = ${id}`;
        if (disabled) await sql`DELETE FROM eng_sessions WHERE user_id = ${id}`;
        await audit(sql, actor.id, id, action, { disabled });
        return json(res, 200, { ok: true, disabled });
      }

      if (action === 'update-recovery') {
        const email = String(body.recoveryEmail || '').trim().toLowerCase();
        const country = String(body.recoveryPhoneCountryCode || '').trim();
        const phone = String(body.recoveryPhone || '').replace(/\D/g, '');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: '电子邮箱格式不正确' });
        if (phone && (!/^\d{6,15}$/.test(phone) || !/^\+\d{1,4}$/.test(country))) return json(res, 400, { error: '手机号码或国际区号不正确' });
        if (email && phone) return json(res, 400, { error: '邮箱和手机只能设置其中一种' });
        await sql`UPDATE eng_users SET recovery_email = ${email || null}, recovery_phone_country_code = ${country || null}, recovery_phone = ${phone || null} WHERE id = ${id}`;
        await audit(sql, actor.id, id, action, { emailConfigured: Boolean(email), phoneConfigured: Boolean(phone) });
        return json(res, 200, { ok: true });
      }

      if (action === 'delete-user') {
        await audit(sql, actor.id, id, action, { username: targets[0].username });
        await sql`DELETE FROM eng_users WHERE id = ${id}`;
        return json(res, 200, { ok: true });
      }
    }

    return json(res, 404, { error: '管理员 API 不存在' });
  } catch (error) {
    console.error('[enoparking admin]', error);
    return json(res, 500, { error: '管理员服务发生内部错误' });
  }
}
