import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WalletProvisioningProblemError,
  createWalletProvisioningClient,
  type WalletProvisioningConfiguration,
  type WalletTestIdentity,
} from "@trustcare/api-client/walletProvisioning";

export type PortalWalletSessionState =
  | "loading"
  | "sandbox_login_available"
  | "oidc_login_available"
  | "portal_configuration_required"
  | "authenticated"
  | "error";

/**
 * Holds the short-lived Wallet OIDC token in React memory only. Refresh and
 * logout intentionally discard it; the holder key remains in platform secure
 * persistence under the Wallet Exchange partition.
 */
export function usePortalWalletSession(input: {
  portalBaseUrl: string;
  appId: string;
  /**
   * An already-selected sandbox identity that may obtain a fresh short-lived
   * test token after reload. The token itself remains memory-only.
   */
  sandboxUsername?: string;
}) {
  const client = useMemo(
    () =>
      createWalletProvisioningClient({
        portalBaseUrl: input.portalBaseUrl,
        appId: input.appId,
      }),
    [input.appId, input.portalBaseUrl],
  );
  const [configuration, setConfiguration] =
    useState<WalletProvisioningConfiguration | null>(null);
  const [testIdentities, setTestIdentities] = useState<WalletTestIdentity[]>([]);
  const [accessToken, setAccessToken] = useState<string>();
  const [state, setState] = useState<PortalWalletSessionState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setState("loading");
    setError("");
    void client
      .reloadConfiguration()
      .then(async (next) => {
        if (!active) return;
        if (next.appId !== input.appId) {
          throw new Error(
            `Portal ประกาศ Wallet appId ${next.appId} แต่ Wallet ตั้งค่าเป็น ${input.appId}`,
          );
        }
        setConfiguration(next);
        if (next.endpoints.sandboxTestIdentities) {
          const identities = await client.listSandboxTestIdentities();
          if (!active) return;
          setTestIdentities(identities);
          setState("sandbox_login_available");
          return;
        }
        if (next.oidc.issuer) {
          setState("oidc_login_available");
          return;
        }
        setState("portal_configuration_required");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState("error");
        setError(connectionErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [client, input.appId]);

  useEffect(() => {
    const username = input.sandboxUsername?.trim();
    const endpoint = configuration?.endpoints.sandboxTestLogin;
    if (!username || !endpoint || accessToken) {
      return;
    }
    const attemptKey = `${endpoint}:${username}`;
    let active = true;
    setState("loading");
    setError("");
    void sharedSandboxLogin(attemptKey, () =>
      client.sandboxTestLogin(username),
    )
      .then((token) => {
        if (!active) return;
        if (!token.testOnly || token.username !== username) {
          throw new Error("Portal test login ไม่ตรงกับผู้ใช้ที่เลือก");
        }
        setAccessToken(token.accessToken);
        setState("authenticated");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState("error");
        setError(connectionErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [accessToken, client, configuration, input.sandboxUsername]);

  const loginSandboxIdentity = useCallback(
    async (username: string) => {
      setError("");
      try {
        const token = await client.sandboxTestLogin(username);
        if (!token.testOnly || token.username !== username) {
          throw new Error("Portal test login ไม่ตรงกับผู้ใช้ที่เลือก");
        }
        setAccessToken(token.accessToken);
        setState("authenticated");
        return token;
      } catch (reason) {
        setError(connectionErrorMessage(reason));
        throw reason;
      }
    },
    [client],
  );

  const logout = useCallback(() => {
    setAccessToken(undefined);
    setState(
      configuration?.endpoints.sandboxTestLogin
        ? "sandbox_login_available"
        : configuration?.oidc.issuer
          ? "oidc_login_available"
          : "portal_configuration_required",
    );
  }, [configuration]);

  return {
    state,
    configuration,
    testIdentities,
    accessToken,
    error,
    loginSandboxIdentity,
    logout,
  };
}

const pendingSandboxLogins = new Map<
  string,
  ReturnType<ReturnType<typeof createWalletProvisioningClient>["sandboxTestLogin"]>
>();

function sharedSandboxLogin(
  key: string,
  login: () => ReturnType<
    ReturnType<typeof createWalletProvisioningClient>["sandboxTestLogin"]
  >,
) {
  const pending = pendingSandboxLogins.get(key);
  if (pending) return pending;
  let request: ReturnType<
    ReturnType<typeof createWalletProvisioningClient>["sandboxTestLogin"]
  >;
  request = login().finally(() => {
    if (pendingSandboxLogins.get(key) === request) {
      pendingSandboxLogins.delete(key);
    }
  });
  pendingSandboxLogins.set(key, request);
  return request;
}

function connectionErrorMessage(reason: unknown): string {
  if (reason instanceof WalletProvisioningProblemError) {
    const correlation = reason.correlationId
      ? ` (รหัสอ้างอิง ${reason.correlationId})`
      : "";
    return `${reason.message}${correlation}`;
  }
  return reason instanceof Error
    ? reason.message
    : "ไม่สามารถอ่านการตั้งค่า Wallet OIDC จาก Portal ได้";
}
