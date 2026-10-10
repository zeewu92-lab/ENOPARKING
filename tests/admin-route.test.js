import test from 'node:test';
import assert from 'node:assert/strict';
import { chuliAdmin } from '../server/admin.js';
import adminHandler from '../api/admin/[action].js';

test('admin handlers resolve in both local-server and serverless entry points', () => {
  assert.equal(typeof chuliAdmin, 'function');
  assert.equal(typeof adminHandler, 'function');
});
