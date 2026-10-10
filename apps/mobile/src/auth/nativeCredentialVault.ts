import { NativeCredentialVault } from './NativeCredentialVault.js';
import { nativeSecureStore } from './nativeSecureStore';

export const nativeCredentialVault = new NativeCredentialVault({
  secureStore: nativeSecureStore,
});
