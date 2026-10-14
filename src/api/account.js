import { baogaoZhanghuServiceCuowu } from '../errorReporter.js';

// 这里先把这一步处理好，后面的逻辑就顺了。
async function qingqiu(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
      ...options
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '連接帳戶服務逾時，請檢查網路後再試'
      : '目前無法連接帳戶服務，請檢查網路後再試';
    const reportError = new Error(message);
    reportError.cause = error;
    void baogaoZhanghuServiceCuowu(reportError, {
      path,
      method: options.method || 'GET',
      network: true
    });
    throw reportError;
  } finally {
    window.clearTimeout(timeout);
  }
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const message = body?.error || '帳戶服務暫時無法使用';
    const error = new Error(message);
    error.status = response.status;

    const unexpectedServiceFailure =
      response.status >= 500 ||
      message === '帳戶服務暫時無法使用';

    if (unexpectedServiceFailure) {
      void baogaoZhanghuServiceCuowu(error, {
        path,
        method: options.method || 'GET',
        status: response.status,
        statusText: response.statusText,
        responseError: body?.error || null,
        responseBodyAvailable: body !== null
      });
    }

    throw error;
  }
  return body;
}

// 这里负责本地和云端状态同步，先处理数据差异，再保存最终结果。
export async function zhanghuMe() {
  return qingqiu('/api/auth/me', { method: 'GET' });
}

// 这里负责本地和云端状态同步，先处理数据差异，再保存最终结果。
export async function zhuceZhanghu({ username, password, nickname = '', recoveryEmail = '', recoveryPhoneCountryCode = '', recoveryPhone = '' }) {
  return qingqiu('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, nickname, recoveryEmail, recoveryPhoneCountryCode, recoveryPhone })
  });
}

export async function dengluZhanghu({ username, password }) {
  return qingqiu('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function tuichuZhanghu() {
  return qingqiu('/api/auth/logout', { method: 'POST' });
}

export async function gengxinZhanghuZiliao({ nickname = '', avatar = undefined }) {
  const body = { nickname };
  if (avatar !== undefined) body.avatar = avatar;
  return qingqiu('/api/auth/profile', { method: 'POST', body: JSON.stringify(body) });
}

export async function genggaiZhanghuMima({ currentPassword, newPassword }) {
  return qingqiu('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

export async function tongbuZhanghuState(state) {
  return qingqiu('/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify({ state })
  });
}

export async function huoquAdminOverview() {
  return qingqiu('/api/admin/overview', { method: 'GET' });
}

export async function huoquAdminAudit() {
  return qingqiu('/api/admin/audit', { method: 'GET' });
}

export async function liebiaoAdminUsers() {
  return qingqiu('/api/admin/users', { method: 'GET' });
}

export async function huoquAdminUser(id) {
  return qingqiu('/api/admin/user?id=' + encodeURIComponent(id), { method: 'GET' });
}

export async function resetAdminProfile({ id, avatar = false, nickname = false }) {
  return qingqiu('/api/admin/reset-profile', {
    method: 'POST',
    body: JSON.stringify({ id, avatar, nickname })
  });
}

export async function setAdminHoney({ id, amount }) {
  return qingqiu('/api/admin/set-honey', {
    method: 'POST',
    body: JSON.stringify({ id, amount })
  });
}

export async function toggleAdminUser(id) {
  return qingqiu('/api/admin/toggle-disabled', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
}

export async function gengxinAdminHuifuContact({ id, recoveryEmail = '', recoveryPhoneCountryCode = '', recoveryPhone = '' }) {
  return qingqiu('/api/admin/update-recovery', {
    method: 'POST',
    body: JSON.stringify({ id, recoveryEmail, recoveryPhoneCountryCode, recoveryPhone })
  });
}

export async function shanchuAdminUser(id) {
  return qingqiu('/api/admin/delete-user', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
}


export async function gengxinHuifuContact({ recoveryEmail = '', recoveryPhoneCountryCode = '', recoveryPhone = '' }) {
  return qingqiu('/api/auth/recovery', {
    method: 'POST',
    body: JSON.stringify({ recoveryEmail, recoveryPhoneCountryCode, recoveryPhone })
  });
}


export async function qingqiuHuifuCode({ username, channel }) {
  return qingqiu('/api/auth/recovery-request', {
    method: 'POST',
    body: JSON.stringify({ username, channel })
  });
}

export async function chongzhiZhanghuMima({ username, code, newPassword }) {
  return qingqiu('/api/auth/recovery-reset', {
    method: 'POST',
    body: JSON.stringify({ username, code, newPassword })
  });
}
