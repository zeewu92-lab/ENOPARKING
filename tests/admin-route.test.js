import test from 'node:test';
import assert from 'node:assert/strict';
import { chuliAdmin } from '../server/admin.js';
import adminHandler from '../api/admin/[action].js';

test('admin handlers resolve in both local-server and serverless entry points', () => {
  assert.equal(typeof chuliAdmin, 'function');
  assert.equal(typeof adminHandler, 'function');
});


test('admin bootstrap rejects the legacy product secret before database access', async () => {
  const previousCurrent = process.env.ENOPARKING_ADMIN_SETUP_KEY;
  const previousLegacy = process.env.ENGNOCRAZY_ADMIN_SETUP_KEY;
  delete process.env.ENOPARKING_ADMIN_SETUP_KEY;
  process.env.ENGNOCRAZY_ADMIN_SETUP_KEY = 'legacy-secret';

  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; }
  };

  try {
    await chuliAdmin({
      method: 'POST',
      headers: { 'x-admin-setup-key': 'legacy-secret' },
      body: { username: 'admin' }
    }, response, 'bootstrap-admin');

    assert.equal(response.statusCode, 403);
    assert.deepEqual(JSON.parse(response.body), { error: '管理員初始化金鑰無效' });
  } finally {
    if (previousCurrent === undefined) delete process.env.ENOPARKING_ADMIN_SETUP_KEY;
    else process.env.ENOPARKING_ADMIN_SETUP_KEY = previousCurrent;
    if (previousLegacy === undefined) delete process.env.ENGNOCRAZY_ADMIN_SETUP_KEY;
    else process.env.ENGNOCRAZY_ADMIN_SETUP_KEY = previousLegacy;
  }
});
