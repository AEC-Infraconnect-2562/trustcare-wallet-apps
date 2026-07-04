import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useState } from "react";

export function useBiometricGate() {
  const [enabled, setEnabled] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    if (!enabled) return true;
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
  }, [enabled]);

  return { enabled, setEnabled, authenticate, lastError };
}

