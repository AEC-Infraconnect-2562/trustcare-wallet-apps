import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  stateCursor: 0,
  stateValues: [] as unknown[],
  reloadConfiguration: vi.fn(),
  listSandboxTestIdentities: vi.fn(),
  sandboxTestLogin: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <Value>(initial: Value | (() => Value)) => {
      const index = harness.stateCursor++;
      if (!(index in harness.stateValues)) {
        harness.stateValues[index] =
          typeof initial === "function" ? (initial as () => Value)() : initial;
      }
      const setter = (next: Value | ((value: Value) => Value)) => {
        const current = harness.stateValues[index] as Value;
        harness.stateValues[index] =
          typeof next === "function"
            ? (next as (value: Value) => Value)(current)
            : next;
      };
      return [harness.stateValues[index] as Value, setter] as const;
    },
    useEffect: (effect: () => void | (() => void)) => {
      harness.effects.push(effect);
    },
    useMemo: <Value>(factory: () => Value) => factory(),
    useCallback: <Callback>(callback: Callback) => callback,
  };
});

vi.mock("@trustcare/api-client/walletProvisioning", () => ({
  WalletProvisioningProblemError: class WalletProvisioningProblemError extends Error {
    correlationId?: string;
  },
  createWalletProvisioningClient: () => ({
    reloadConfiguration: harness.reloadConfiguration,
    listSandboxTestIdentities: harness.listSandboxTestIdentities,
    sandboxTestLogin: harness.sandboxTestLogin,
  }),
}));

import { usePortalWalletSession } from "./usePortalWalletSession";

describe("usePortalWalletSession sandbox restore", () => {
  beforeEach(() => {
    harness.effects = [];
    harness.stateCursor = 0;
    harness.stateValues = [];
    harness.reloadConfiguration.mockReset();
    harness.listSandboxTestIdentities.mockReset();
    harness.sandboxTestLogin.mockReset();
    harness.reloadConfiguration.mockResolvedValue(configuration());
    harness.listSandboxTestIdentities.mockResolvedValue([]);
    harness.sandboxTestLogin.mockResolvedValue({
      accessToken: "fresh-short-lived-token",
      testOnly: true,
      username: "demo-patient-001",
    });
  });

  it("obtains a fresh sandbox token after reload without persisting it", async () => {
    renderHook("demo-patient-001");
    harness.effects[0]?.();
    await settlePromises();

    const restored = renderHook("demo-patient-001");
    harness.effects[1]?.();
    await settlePromises();

    expect(harness.sandboxTestLogin).toHaveBeenCalledOnce();
    expect(harness.sandboxTestLogin).toHaveBeenCalledWith("demo-patient-001");

    const authenticated = renderHook("demo-patient-001");
    expect(authenticated.state).toBe("authenticated");
    expect(authenticated.accessToken).toBe("fresh-short-lived-token");
    expect(restored.accessToken).toBeUndefined();
  });

  it("does not call the sandbox login endpoint without an authenticated local user", async () => {
    renderHook(undefined);
    harness.effects[0]?.();
    await settlePromises();

    renderHook(undefined);
    harness.effects[1]?.();
    await settlePromises();

    expect(harness.sandboxTestLogin).not.toHaveBeenCalled();
  });

  it("deduplicates the sandbox login request across StrictMode effect replay", async () => {
    renderHook("demo-patient-001");
    harness.effects[0]?.();
    await settlePromises();

    renderHook("demo-patient-001");
    const restoreEffect = harness.effects[1]!;
    const cleanup = restoreEffect();
    cleanup?.();
    restoreEffect();
    await settlePromises();

    expect(harness.sandboxTestLogin).toHaveBeenCalledOnce();
  });
});

function renderHook(sandboxUsername: string | undefined) {
  harness.effects = [];
  harness.stateCursor = 0;
  return usePortalWalletSession({
    portalBaseUrl:
      "https://trustcare-hospital-network-production.up.railway.app",
    appId: "trustcare-wallet-production",
    sandboxUsername,
  });
}

function configuration() {
  return {
    appId: "trustcare-wallet-production",
    oidc: { issuer: null },
    endpoints: {
      sandboxTestLogin:
        "https://trustcare-hospital-network-production.up.railway.app/api/wallet/test-login",
      sandboxTestIdentities:
        "https://trustcare-hospital-network-production.up.railway.app/api/wallet/test-identities",
    },
  };
}

async function settlePromises(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
