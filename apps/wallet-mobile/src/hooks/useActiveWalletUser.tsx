import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { getDemoUser, walletDemoUsers, type WalletDemoUser } from "@trustcare/wallet-core";

const activeUserStorageKey = "trustcare_wallet_mobile_active_user";
const defaultUserId = "demo-patient-complete-001";

type MobileWalletSession = {
  user: WalletDemoUser;
  userId: string;
  users: WalletDemoUser[];
  setActiveUserId: (nextUserId: string) => Promise<void>;
  resetActiveUser: () => Promise<void>;
};

const MobileWalletSessionContext = createContext<MobileWalletSession | null>(null);

export function MobileWalletSessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(defaultUserId);

  useEffect(() => {
    void SecureStore.getItemAsync(activeUserStorageKey)
      .then(storedUserId => {
        if (storedUserId && walletDemoUsers.some(user => user.id === storedUserId)) {
          setUserId(storedUserId);
        }
      })
      .catch(() => undefined);
  }, []);

  const user = useMemo(() => getDemoUser(userId), [userId]);

  const setActiveUserId = useCallback(async (nextUserId: string) => {
    if (!walletDemoUsers.some(item => item.id === nextUserId)) return;
    setUserId(nextUserId);
    await SecureStore.setItemAsync(activeUserStorageKey, nextUserId, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }, []);

  const resetActiveUser = useCallback(async () => {
    setUserId(defaultUserId);
    await SecureStore.deleteItemAsync(activeUserStorageKey);
  }, []);

  const value = useMemo<MobileWalletSession>(() => ({
    user,
    userId: user.id,
    users: walletDemoUsers,
    setActiveUserId,
    resetActiveUser
  }), [resetActiveUser, setActiveUserId, user]);

  return (
    <MobileWalletSessionContext.Provider value={value}>
      {children}
    </MobileWalletSessionContext.Provider>
  );
}

export function useActiveWalletUser() {
  const session = useContext(MobileWalletSessionContext);
  if (!session) {
    throw new Error("useActiveWalletUser must be used within MobileWalletSessionProvider");
  }
  return session;
}
