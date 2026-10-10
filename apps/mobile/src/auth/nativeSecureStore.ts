import * as SecureStore from 'expo-secure-store';

/**
 * Native-only adapter. Never substitute AsyncStorage or localStorage.
 * The refresh token remains device-local and is not migrated through backups.
 */
export const nativeSecureStore = {
  getItemAsync(key) {
    return SecureStore.getItemAsync(key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  setItemAsync(key, value) {
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  deleteItemAsync(key) {
    return SecureStore.deleteItemAsync(key);
  },
};
