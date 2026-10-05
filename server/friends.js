import crypto from 'node:crypto';
import { baozhengSchema, huoquSql } from './db.js';
import { requireUser } from './auth.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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

function publicFriend(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || '',
    avatar: row.avatar || ''
  };
}

function cleanItemList(type, value) {
  if (!Array.isArray(value)) return [];
  const limit = type === 'vocabulary' ? 5000 : 1000;
  const seen = new Set();
  const output = [];

  for (const raw of value.slice(0, limit * 2)) {
    if (type === 'vocabulary') {
      const word = String(raw?.word ?? raw ?? '').trim().toLowerCase();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      output.push(word.slice(0, 100));
    } else {
      if (!raw || typeof raw !== 'object') continue;
      const word = String(raw.word ?? raw.w ?? '').trim().toLowerCase();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      output.push({
        word: word.slice(0, 100),
        meaning: String(raw.meaning || '').slice(0, 500),
        phonetic: String(raw.phonetic || '').slice(0, 100),
        wrongCount: Math.max(1, Math.min(9999, Number(raw.wrongCount) || 1)),
        lastErrorType: String(raw.lastErrorType || '').slice(0, 80)
      });
    }
  }
  return output.slice(0, limit);
}

async function areFriends(sql, userId, otherUserId) {
  const rows = await sql`
    SELECT id FROM eng_friend_requests
    WHERE status = 'accepted'
      AND ((requester_id = ${userId} AND recipient_id = ${otherUserId})
        OR (requester_id = ${otherUserId} AND recipient_id = ${userId}))
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

async function loadFriendListData(userId) {
  const sql = huoquSql();

  const friendList = await sql`
    SELECT u.id, u.username, u.nickname, u.avatar
    FROM eng_friend_requests fr
    JOIN eng_users u
      ON u.id = CASE WHEN fr.requester_id = ${userId} THEN fr.recipient_id ELSE fr.requester_id END
    WHERE fr.status = 'accepted'
      AND (fr.requester_id = ${userId} OR fr.recipient_id = ${userId})
      AND u.disabled = FALSE
    ORDER BY COALESCE(NULLIF(u.nickname, ''), u.username), u.username
  `;

  const incoming = await sql`
    SELECT fr.id, fr.created_at, u.id AS user_id, u.username, u.nickname, u.avatar
    FROM eng_friend_requests fr
    JOIN eng_users u ON u.id = fr.requester_id
    WHERE fr.recipient_id = ${userId} AND fr.status = 'pending' AND u.disabled = FALSE
    ORDER BY fr.created_at DESC
  `;

  const outgoing = await sql`
    SELECT fr.id, fr.created_at, u.id AS user_id, u.username, u.nickname, u.avatar
    FROM eng_friend_requests fr
    JOIN eng_users u ON u.id = fr.recipient_id
    WHERE fr.requester_id = ${userId} AND fr.status = 'pending' AND u.disabled = FALSE
    ORDER BY fr.created_at DESC
  `;

  const ownShares = await sql`
    SELECT share_type, items, updated_at
    FROM eng_friend_shares
    WHERE owner_id = ${userId}
  `;

  const friendShares = await sql`
    SELECT s.owner_id, s.share_type, s.items, s.updated_at,
           u.username, u.nickname, u.avatar
    FROM eng_friend_shares s
    JOIN eng_users u ON u.id = s.owner_id
    WHERE s.owner_id <> ${userId}
      AND u.disabled = FALSE
      AND EXISTS (
        SELECT 1 FROM eng_friend_requests fr
        WHERE fr.status = 'accepted'
          AND ((fr.requester_id = ${userId} AND fr.recipient_id = s.owner_id)
            OR (fr.requester_id = s.owner_id AND fr.recipient_id = ${userId}))
      )
    ORDER BY s.updated_at DESC
  `;

  return {
    friends: friendList.map(publicFriend),
    incoming: incoming.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      user: publicFriend({ id: row.user_id, username: row.username, nickname: row.nickname, avatar: row.avatar })
    })),
    outgoing: outgoing.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      user: publicFriend({ id: row.user_id, username: row.username, nickname: row.nickname, avatar: row.avatar })
    })),
    ownShares: ownShares.map(row => ({
      type: row.share_type,
      items: row.items || [],
      updatedAt: row.updated_at
    })),
    friendShares: friendShares.map(row => ({
      ownerId: row.owner_id,
      type: row.share_type,
      items: row.items || [],
      updatedAt: row.updated_at,
      user: publicFriend(row)
    }))
  };
}

export async function chuliHaoyouList(req, res, caozuo) {
  try {
    await baozhengSchema();
    const user = await requireUser(req, res);
    if (!user) return;
    const sql = huoquSql();

    if (caozuo === 'data' && req.method === 'GET') {
      return json(res, 200, await loadFriendListData(user.id));
    }

    if (caozuo === 'request' && req.method === 'POST') {
      const body = await readBody(req);
      const identifier = String(body.username || '').trim();
      const username = normalizeUsername(identifier);
      const isUsername = /^[a-z0-9_]{3,24}$/.test(username);
      const isUid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      if (!isUsername && !isUid) return json(res, 400, { error: '請輸入正確的帳號或 UID' });

      const targetRows = isUid
        ? await sql`
            SELECT id, username, nickname, avatar, disabled
            FROM eng_users WHERE id = ${identifier} LIMIT 1
          `
        : await sql`
            SELECT id, username, nickname, avatar, disabled
            FROM eng_users WHERE username = ${username} LIMIT 1
          `;
      const target = targetRows[0];
      if (!target || target.disabled) return json(res, 404, { error: '找不到這個帳號' });
      if (target.id === user.id) return json(res, 400, { error: '不能將自己加為好友' });
      if (await areFriends(sql, user.id, target.id)) return json(res, 409, { error: '你們已經是好友' });

      const reverse = await sql`
        SELECT id, status FROM eng_friend_requests
        WHERE requester_id = ${target.id} AND recipient_id = ${user.id}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (reverse[0]?.status === 'pending') {
        await sql`UPDATE eng_friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = ${reverse[0].id}`;
        return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
      }

      const existing = await sql`
        SELECT id, status FROM eng_friend_requests
        WHERE requester_id = ${user.id} AND recipient_id = ${target.id} LIMIT 1
      `;
      if (existing[0]?.status === 'pending') return json(res, 409, { error: '好友申請已送出' });

      if (existing[0]) {
        await sql`
          UPDATE eng_friend_requests SET status = 'pending', updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
      } else {
        await sql`
          INSERT INTO eng_friend_requests(id, requester_id, recipient_id, status)
          VALUES (${crypto.randomUUID()}, ${user.id}, ${target.id}, 'pending')
        `;
      }
      return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
    }

    if (caozuo === 'respond' && req.method === 'POST') {
      const body = await readBody(req);
      const requestId = String(body.requestId || '');
      const decision = body.decision === 'accept' ? 'accepted' : body.decision === 'reject' ? 'rejected' : '';
      if (!requestId || !decision) return json(res, 400, { error: '好友申請資料不正確' });

      const rows = await sql`
        SELECT id FROM eng_friend_requests
        WHERE id = ${requestId} AND recipient_id = ${user.id} AND status = 'pending'
        LIMIT 1
      `;
      if (!rows[0]) return json(res, 404, { error: '好友申請不存在或已處理' });

      await sql`UPDATE eng_friend_requests SET status = ${decision}, updated_at = NOW() WHERE id = ${requestId}`;
      return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
    }

    if (caozuo === 'remove' && req.method === 'POST') {
      const body = await readBody(req);
      const friendId = String(body.friendId || '');
      if (!friendId || !(await areFriends(sql, user.id, friendId))) {
        return json(res, 404, { error: '好友關係不存在' });
      }
      await sql`
        DELETE FROM eng_friend_requests
        WHERE status = 'accepted'
          AND ((requester_id = ${user.id} AND recipient_id = ${friendId})
            OR (requester_id = ${friendId} AND recipient_id = ${user.id}))
      `;
      return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
    }

    if (caozuo === 'share' && req.method === 'POST') {
      const body = await readBody(req);
      const type = body.type === 'wrongbook' ? 'wrongbook' : body.type === 'vocabulary' ? 'vocabulary' : '';
      if (!type) return json(res, 400, { error: '分享類型不正確' });

      const haoyouRows = await sql`
        SELECT id FROM eng_friend_requests
        WHERE status = 'accepted'
          AND (requester_id = ${user.id} OR recipient_id = ${user.id})
        LIMIT 1
      `;
      if (!haoyouRows[0]) return json(res, 400, { error: '請先新增好友，再分享內容' });

      const itemList = cleanItemList(type, body.items);
      await sql`
        INSERT INTO eng_friend_shares(owner_id, share_type, items, updated_at)
        VALUES (${user.id}, ${type}, ${JSON.stringify(itemList)}::jsonb, NOW())
        ON CONFLICT(owner_id, share_type)
        DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()
      `;
      return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
    }

    if (caozuo === 'unshare' && req.method === 'POST') {
      const body = await readBody(req);
      const type = body.type === 'wrongbook' ? 'wrongbook' : body.type === 'vocabulary' ? 'vocabulary' : '';
      if (!type) return json(res, 400, { error: '分享類型不正確' });
      await sql`DELETE FROM eng_friend_shares WHERE owner_id = ${user.id} AND share_type = ${type}`;
      return json(res, 200, { ok: true, data: await loadFriendListData(user.id) });
    }

    return json(res, 404, { error: '好友 API 不存在' });
  } catch (error) {
    console.error('[engnocrazy friends]', error);
    return json(res, 500, { error: error.message || '伺服器錯誤' });
  }
}
