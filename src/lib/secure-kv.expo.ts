import * as SecureStore from 'expo-secure-store';

import type { SecureKV } from './secure-kv';

const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const expoSecureKV: SecureKV = {
  get: (key) => SecureStore.getItemAsync(key, OPTS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTS),
  remove: (key) => SecureStore.deleteItemAsync(key, OPTS),
};
