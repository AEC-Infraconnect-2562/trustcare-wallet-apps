import * as SecureStore from "expo-secure-store";

const refreshTokenKey = "trustcare_wallet_refresh_token";

export async function saveRefreshToken(token: string) {
  await SecureStore.setItemAsync(refreshTokenKey, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function loadRefreshToken() {
  return SecureStore.getItemAsync(refreshTokenKey);
}

export async function clearRefreshToken() {
  await SecureStore.deleteItemAsync(refreshTokenKey);
}

