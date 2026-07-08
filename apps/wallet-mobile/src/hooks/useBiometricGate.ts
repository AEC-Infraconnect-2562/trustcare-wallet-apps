import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useState } from "react";
import { useMobileSecuritySettings } from "./useMobileSecuritySettings";

export function useBiometricGate() {
  const { biometricEnabled, setBiometricEnabled } = useMobileSecuritySettings();
  const [lastError, setLastError] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    if (!biometricEnabled) return true;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "ยืนยันตัวตนก่อนแสดง VP QR",
      cancelLabel: "ยกเลิก",
      disableDeviceFallback: false
    });
    if (!result.success) {
      setLastError("ยืนยันตัวตนไม่สำเร็จ");
      return false;
    }
    setLastError(null);
    return true;
  }, [biometricEnabled]);

  return { enabled: biometricEnabled, setEnabled: setBiometricEnabled, authenticate, lastError };
}
