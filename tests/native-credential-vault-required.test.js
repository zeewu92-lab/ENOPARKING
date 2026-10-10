import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCredentialVault } from '../apps/mobile/src/auth/NativeCredentialVault.js';

test('credential vault refuses missing secure storage instead of falling back to web storage', () => {
  assert.throws(() => new NativeCredentialVault(), /NATIVE_SECURE_STORE_ADAPTER_REQUIRED/);
  assert.throws(() => new NativeCredentialVault({ secureStore: { getItemAsync: async () => null } }), /NATIVE_SECURE_STORE_ADAPTER_REQUIRED/);
});
