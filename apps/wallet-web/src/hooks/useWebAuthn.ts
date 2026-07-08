import { useCallback, useState } from "react";

export type WebAuthnState = {
  isSupported: boolean;
  isRegistered: boolean;
  isAuthenticating: boolean;
  error: string | null;
};

const storageKey = "trustcare_wallet_webauthn_credential_id";

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function useWebAuthn() {
  const [state, setState] = useState<WebAuthnState>({
    isSupported:
      typeof window !== "undefined" && Boolean(window.PublicKeyCredential),
    isRegistered:
      typeof localStorage !== "undefined" &&
      Boolean(localStorage.getItem(storageKey)),
    isAuthenticating: false,
    error: null,
  });

  const register = useCallback(async (userId: string, userName: string) => {
    if (!window.PublicKeyCredential) {
      setState((previous) => ({
        ...previous,
        error: "WebAuthn is not supported on this device",
      }));
      return false;
    }
    setState((previous) => ({
      ...previous,
      isAuthenticating: true,
      error: null,
    }));
    try {
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "TrustCare Wallet", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(userId),
            name: userName,
            displayName: userName,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error("Registration failed");
      localStorage.setItem(storageKey, bufferToBase64(credential.rawId));
      setState((previous) => ({
        ...previous,
        isRegistered: true,
        isAuthenticating: false,
      }));
      return true;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isAuthenticating: false,
        error:
          error instanceof Error ? error.message : "Registration cancelled",
      }));
      return false;
    }
  }, []);

  const authenticate = useCallback(async () => {
    if (!window.PublicKeyCredential) return true;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return true;
    setState((previous) => ({
      ...previous,
      isAuthenticating: true,
      error: null,
    }));
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [
            {
              id: base64ToBuffer(stored),
              type: "public-key",
              transports: ["internal"],
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!assertion) throw new Error("Authentication failed");
      setState((previous) => ({ ...previous, isAuthenticating: false }));
      return true;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isAuthenticating: false,
        error:
          error instanceof Error ? error.message : "Authentication cancelled",
      }));
      return false;
    }
  }, []);

  const unregister = useCallback(() => {
    localStorage.removeItem(storageKey);
    setState((previous) => ({ ...previous, isRegistered: false }));
  }, []);

  return { ...state, register, authenticate, unregister };
}
