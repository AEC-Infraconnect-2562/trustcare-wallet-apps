import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { env } from "../env";

export type MobileThemeMode = "light" | "dark";

type MobileSecuritySettings = {
  isLoaded: boolean;
  biometricEnabled: boolean;
  screenCaptureProtectionEnabled: boolean;
  theme: MobileThemeMode;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setScreenCaptureProtectionEnabled: (enabled: boolean) => Promise<void>;
  setTheme: (theme: MobileThemeMode) => Promise<void>;
};

const settingsKey = "trustcare_wallet_mobile_security_settings";

const defaults = {
  biometricEnabled: true,
  screenCaptureProtectionEnabled: env.screenCaptureProtection,
  theme: "light" as MobileThemeMode,
};

const MobileSecuritySettingsContext =
  createContext<MobileSecuritySettings | null>(null);

export function MobileSecuritySettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [settings, setSettings] = useState(defaults);

  useEffect(() => {
    void SecureStore.getItemAsync(settingsKey)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as Partial<typeof defaults>;
        setSettings({
          biometricEnabled:
            typeof parsed.biometricEnabled === "boolean"
              ? parsed.biometricEnabled
              : defaults.biometricEnabled,
          screenCaptureProtectionEnabled:
            typeof parsed.screenCaptureProtectionEnabled === "boolean"
              ? parsed.screenCaptureProtectionEnabled
              : defaults.screenCaptureProtectionEnabled,
          theme: parsed.theme === "dark" ? "dark" : "light",
        });
      })
      .catch(() => undefined)
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback(async (next: typeof defaults) => {
    setSettings(next);
    await SecureStore.setItemAsync(settingsKey, JSON.stringify(next), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }, []);

  const setBiometricEnabled = useCallback(
    async (enabled: boolean) =>
      persist({ ...settings, biometricEnabled: enabled }),
    [persist, settings],
  );

  const setScreenCaptureProtectionEnabled = useCallback(
    async (enabled: boolean) =>
      persist({ ...settings, screenCaptureProtectionEnabled: enabled }),
    [persist, settings],
  );

  const setTheme = useCallback(
    async (theme: MobileThemeMode) => persist({ ...settings, theme }),
    [persist, settings],
  );

  const value = useMemo<MobileSecuritySettings>(
    () => ({
      isLoaded,
      ...settings,
      setBiometricEnabled,
      setScreenCaptureProtectionEnabled,
      setTheme,
    }),
    [
      isLoaded,
      setBiometricEnabled,
      setScreenCaptureProtectionEnabled,
      setTheme,
      settings,
    ],
  );

  return (
    <MobileSecuritySettingsContext.Provider value={value}>
      {children}
    </MobileSecuritySettingsContext.Provider>
  );
}

export function useMobileSecuritySettings() {
  const settings = useContext(MobileSecuritySettingsContext);
  if (!settings) {
    throw new Error(
      "useMobileSecuritySettings must be used within MobileSecuritySettingsProvider",
    );
  }
  return settings;
}
