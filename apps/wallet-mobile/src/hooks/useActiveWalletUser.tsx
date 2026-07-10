import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  getDemoUser,
  walletDemoUsers,
  type WalletDemoUser,
} from "@trustcare/wallet-core";
import { env } from "../env";

const activeUserStorageKey = "trustcare_wallet_mobile_active_user";
const defaultUserId = "demo-patient-complete-001";

type MobileWalletSession = {
  user: WalletDemoUser;
  userId: string;
  users: WalletDemoUser[];
  setActiveUserId: (nextUserId: string) => Promise<void>;
  resetActiveUser: () => Promise<void>;
};

const MobileWalletSessionContext = createContext<MobileWalletSession | null>(
  null,
);

export function MobileWalletSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (env.runtimeEnvironment !== "demo") {
    return <DemoSessionDisabledBoundary />;
  }
  return <HydratedDemoWalletSession>{children}</HydratedDemoWalletSession>;
}

function HydratedDemoWalletSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(activeUserStorageKey)
      .then((storedUserId) => {
        if (cancelled) return;
        const knownStoredUser =
          storedUserId &&
          walletDemoUsers.some((user) => user.id === storedUserId);
        setUserId(knownStoredUser ? storedUserId : defaultUserId);
      })
      .catch(() => {
        if (!cancelled) setUserId(defaultUserId);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = useMemo(() => (userId ? getDemoUser(userId) : null), [userId]);

  const setActiveUserId = useCallback(async (nextUserId: string) => {
    if (!walletDemoUsers.some((item) => item.id === nextUserId)) return;
    setUserId(nextUserId);
    await SecureStore.setItemAsync(activeUserStorageKey, nextUserId, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }, []);

  const resetActiveUser = useCallback(async () => {
    setUserId(defaultUserId);
    await SecureStore.deleteItemAsync(activeUserStorageKey);
  }, []);

  const value = useMemo<MobileWalletSession | null>(
    () =>
      user
        ? {
            user,
            userId: user.id,
            users: walletDemoUsers,
            setActiveUserId,
            resetActiveUser,
          }
        : null,
    [resetActiveUser, setActiveUserId, user],
  );

  if (!value) return <SessionHydrationBoundary />;

  return (
    <MobileWalletSessionContext.Provider value={value}>
      {children}
    </MobileWalletSessionContext.Provider>
  );
}

function SessionHydrationBoundary() {
  return (
    <View style={styles.boundary} accessibilityRole="progressbar">
      <ActivityIndicator color="#365f91" size="large" />
      <Text style={styles.boundaryTitle}>กำลังเปิด Wallet ของคุณ</Text>
      <Text style={styles.boundaryBody}>
        ระบบกำลังตรวจสอบเจ้าของ Wallet ก่อนแสดงเอกสาร
      </Text>
    </View>
  );
}

function DemoSessionDisabledBoundary() {
  return (
    <View style={styles.boundary} accessibilityRole="alert">
      <Text style={styles.boundaryTitle}>ไม่เปิดข้อมูลสาธิตในโหมดนี้</Text>
      <Text style={styles.boundaryBody}>
        ต้องเชื่อมต่อระบบเข้าสู่ระบบจริงก่อนจึงจะแสดงเอกสารได้
      </Text>
    </View>
  );
}

export function useActiveWalletUser() {
  const session = useContext(MobileWalletSessionContext);
  if (!session) {
    throw new Error(
      "useActiveWalletUser must be used within MobileWalletSessionProvider",
    );
  }
  return session;
}

const styles = StyleSheet.create({
  boundary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f7f9",
    padding: 28,
    gap: 10,
  },
  boundaryTitle: {
    color: "#182230",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  boundaryBody: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
