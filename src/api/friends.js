let friendListDataPromise = null;
let friendListDataCache = null;

// 这里先把这一步处理好，后面的逻辑就顺了。
async function qingqiuHaoyouListData() {
  const response = await fetch('/api/friends/data', {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });

  let body = null;
  try { body = await response.json(); } catch {}

  if (!response.ok) {
    const error = new Error(body?.error || '好友服務暫時無法使用');
    error.status = response.status;
    throw error;
  }

  return body;
}

export function preloadHaoyouListData() {
  if (friendListDataCache) return Promise.resolve(friendListDataCache);
  if (friendListDataPromise) return friendListDataPromise;

  friendListDataPromise = qingqiuHaoyouListData()
    .then(data => {
      friendListDataCache = data;
      return data;
    })
    .catch(error => {
      friendListDataPromise = null;
      throw error;
    });

  return friendListDataPromise;
}

export function consumeHaoyouListData() {
  const data = friendListDataCache;
  friendListDataCache = null;
  friendListDataPromise = null;
  return data;
}

// 这里负责本地和云端状态同步，先处理数据差异，再保存最终结果。
export async function huoquHaoyouListData() {
  if (friendListDataCache) return friendListDataCache;
  return preloadHaoyouListData();
}

export async function qingqiuHaoyouListAction(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  let body = null;
  try { body = await response.json(); } catch {}

  if (!response.ok) {
    const error = new Error(body?.error || '好友服務暫時無法使用');
    error.status = response.status;
    throw error;
  }

  if (body?.data) {
    friendListDataCache = body.data;
  }

  return body;
}
