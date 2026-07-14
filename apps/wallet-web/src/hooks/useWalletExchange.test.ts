import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  stateCursor: 0,
  stateValues: [] as unknown[],
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  persistenceOptions: [] as Array<Record<string, unknown>>,
  workflowOptions: [] as Array<Record<string, unknown>>,
  generateHolderIdentity: vi.fn(),
  loadHolderIdentity: vi.fn(),
  saveHolderIdentity: vi.fn(),
  loadOrCreateState: vi.fn(),
  listCredentialRequestLinks: vi.fn(),
  listPendingSubmissionDrafts: vi.fn(),
  loadOrCreateClinicalDocumentGraphState: vi.fn(),
  synchronize: vi.fn(),
  synchronizeClinicalDocumentGraph: vi.fn(),
  clinicalDocumentGraphPresentation: vi.fn(),
  recoverPendingDirectSubmissions: vi.fn(),
  loadProvisioningConfiguration: vi.fn(),
  getWalletIdentity: vi.fn(),
  getProvisioningStatus: vi.fn(),
  bindHolder: vi.fn(),
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
      const setter = vi.fn((next: Value | ((value: Value) => Value)) => {
        const current = harness.stateValues[index] as Value;
        harness.stateValues[index] =
          typeof next === "function"
            ? (next as (value: Value) => Value)(current)
            : next;
      });
      harness.stateSetters.push(setter);
      return [harness.stateValues[index] as Value, setter] as const;
    },
    useEffect: (effect: () => void | (() => void)) => {
      harness.effects.push(effect);
    },
    useCallback: <Callback>(callback: Callback) => callback,
  };
});

vi.mock("@trustcare/api-client/walletContractLoader", () => ({
  normalizePortalOrigin: (value: string) => new URL(value).origin,
}));

vi.mock("@trustcare/api-client/walletExchangeV2", () => ({
  WalletExchangeProblemError: class WalletExchangeProblemError extends Error {
    correlationId?: string;
  },
}));

vi.mock("@trustcare/api-client/walletProvisioning", () => ({
  WalletProvisioningProblemError: class WalletProvisioningProblemError extends Error {
    correlationId?: string;
  },
  createWalletProvisioningClient: () => ({
    loadConfiguration: harness.loadProvisioningConfiguration,
    reloadConfiguration: harness.loadProvisioningConfiguration,
    getWalletIdentity: harness.getWalletIdentity,
    getProvisioningStatus: harness.getProvisioningStatus,
    bindHolder: harness.bindHolder,
  }),
}));

vi.mock("@trustcare/api-client/walletExchangeWorkflow", () => ({
  WalletExchangeWorkflow: class WalletExchangeWorkflow {
    constructor(options: Record<string, unknown>) {
      harness.workflowOptions.push(options);
    }

    synchronize() {
      return harness.synchronize();
    }

    synchronizeClinicalDocumentGraph() {
      return harness.synchronizeClinicalDocumentGraph();
    }

    clinicalDocumentGraphPresentation(artifactId: string) {
      return harness.clinicalDocumentGraphPresentation(artifactId);
    }

    recoverPendingDirectSubmissions() {
      return harness.recoverPendingDirectSubmissions();
    }
  },
}));

vi.mock("@trustcare/wallet-core", () => ({
  generateHolderIdentity: harness.generateHolderIdentity,
  listClinicalDocumentGraphArtifacts: (state: { nodes?: unknown[] }) =>
    state.nodes ?? [],
}));

vi.mock("../repositories", () => ({
  IndexedDbWalletExchangePersistence: class IndexedDbWalletExchangePersistence {
    constructor(options: Record<string, unknown>) {
      harness.persistenceOptions.push(options);
    }

    loadHolderIdentity() {
      return harness.loadHolderIdentity();
    }

    saveHolderIdentity(identity: unknown) {
      return harness.saveHolderIdentity(identity);
    }

    loadOrCreateState() {
      return harness.loadOrCreateState();
    }

    listCredentialRequestLinks() {
      return harness.listCredentialRequestLinks();
    }

    listPendingSubmissionDrafts() {
      return harness.listPendingSubmissionDrafts();
    }

    loadOrCreateClinicalDocumentGraphState() {
      return harness.loadOrCreateClinicalDocumentGraphState();
    }
  },
}));

import {
  useWalletExchange,
  type UseWalletExchangeOptions,
} from "./useWalletExchange";

const holderDid = "did:key:zDnaeTrustCareWalletHolder";
const identity = {
  did: holderDid,
  kid: `${holderDid}#zDnaeTrustCareWalletHolder`,
  jwsAlgorithm: "ES256",
  publicJwkThumbprint: "holder-thumbprint",
  publicKey: { type: "public" },
  privateKey: { type: "private", extractable: false },
};

describe("useWalletExchange lifecycle", () => {
  beforeEach(() => {
    harness.effects = [];
    harness.stateCursor = 0;
    harness.stateValues = [];
    harness.stateSetters = [];
    harness.persistenceOptions = [];
    harness.workflowOptions = [];
    harness.generateHolderIdentity.mockReset();
    harness.loadHolderIdentity.mockReset();
    harness.saveHolderIdentity.mockReset();
    harness.loadOrCreateState.mockReset();
    harness.listPendingSubmissionDrafts.mockReset();
    harness.loadOrCreateClinicalDocumentGraphState.mockReset();
    harness.synchronize.mockReset();
    harness.synchronizeClinicalDocumentGraph.mockReset();
    harness.clinicalDocumentGraphPresentation.mockReset();
    harness.recoverPendingDirectSubmissions.mockReset();
    harness.loadProvisioningConfiguration.mockReset();
    harness.getProvisioningStatus.mockReset();
    harness.getWalletIdentity.mockReset();
    harness.bindHolder.mockReset();
    harness.generateHolderIdentity.mockResolvedValue(identity);
    harness.saveHolderIdentity.mockResolvedValue(undefined);
    harness.loadOrCreateState.mockResolvedValue({ documents: [] });
    harness.listCredentialRequestLinks.mockResolvedValue([]);
    harness.listPendingSubmissionDrafts.mockResolvedValue([]);
    harness.loadOrCreateClinicalDocumentGraphState.mockResolvedValue({
      nodes: [],
      quarantine: [],
    });
    harness.recoverPendingDirectSubmissions.mockResolvedValue([]);
    harness.loadProvisioningConfiguration.mockResolvedValue({
      appId: "trustcare-wallet-production",
      oidc: { issuer: null },
      endpoints: { sandboxTestLogin: null },
    });
    harness.getWalletIdentity.mockResolvedValue({ linked: true });
    installLocalStorage();
  });

  it("does not create or load holder key material while disabled", async () => {
    renderHook({ ...options("patient-a"), enabled: false });

    expect(harness.effects).toHaveLength(2);
    harness.effects[0]?.();
    harness.effects[1]?.();
    await settlePromises();

    expect(harness.generateHolderIdentity).not.toHaveBeenCalled();
    expect(harness.loadHolderIdentity).not.toHaveBeenCalled();
    expect(harness.saveHolderIdentity).not.toHaveBeenCalled();
    expect(harness.persistenceOptions).toEqual([]);
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("stores only a partitioned DID locator and never synchronizes automatically", async () => {
    renderHook(options("patient-a"));
    harness.effects[0]?.();
    await settlePromises();

    expect(harness.generateHolderIdentity).toHaveBeenCalledWith({
      algorithm: "P-256",
      extractable: false,
    });
    expect(harness.saveHolderIdentity).toHaveBeenCalledWith(identity);
    expect(harness.loadOrCreateState).toHaveBeenCalledTimes(1);
    expect(harness.synchronize).not.toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);

    const [locatorKey, serializedLocator] = vi.mocked(localStorage.setItem).mock
      .calls[0]!;
    expect(locatorKey).toContain(encodeURIComponent("patient-a"));
    expect(JSON.parse(serializedLocator)).toEqual({
      schema: "trustcare.wallet.holder-locator.v1",
      holderDid,
    });
    expect(serializedLocator).not.toMatch(/private|token|authorization|dpop/i);
    expect(
      vi.mocked(localStorage.setItem).mock.invocationCallOrder[0],
    ).toBeLessThan(harness.saveHolderIdentity.mock.invocationCallOrder[0]!);
  });

  it("generates a device holder key even for a sandbox Portal identity", async () => {
    renderHook(options("demo-patient-004"));
    harness.effects[0]?.();
    await settlePromises();

    expect(harness.generateHolderIdentity).toHaveBeenCalledWith({
      algorithm: "P-256",
      extractable: false,
    });
    expect(harness.saveHolderIdentity).toHaveBeenCalledWith(identity);
  });

  it("does not generate a DID when durable locator storage is unavailable", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    });

    renderHook(options("patient-a"));
    harness.effects[0]?.();
    await settlePromises();

    expect(harness.generateHolderIdentity).not.toHaveBeenCalled();
    expect(harness.saveHolderIdentity).not.toHaveBeenCalled();
    expect(harness.stateSetters[5]).toHaveBeenCalledWith(
      expect.stringContaining("ไม่สร้าง DID ใหม่"),
    );
  });

  it("fails closed instead of rotating DID when its locator has no key", async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        schema: "trustcare.wallet.holder-locator.v1",
        holderDid,
      }),
    );
    harness.loadHolderIdentity.mockResolvedValue(null);

    renderHook(options("patient-a"));
    harness.effects[0]?.();
    await settlePromises();

    expect(harness.persistenceOptions).toEqual([
      {
        portalOrigin: options("patient-a").portalBaseUrl,
        holderDid,
      },
    ]);
    expect(harness.generateHolderIdentity).not.toHaveBeenCalled();
    expect(harness.saveHolderIdentity).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(harness.stateSetters[5]).toHaveBeenCalledWith(
      expect.stringContaining("ไม่พบ private key"),
    );
  });

  it("deduplicates StrictMode initialization so first use cannot rotate DID", async () => {
    renderHook(options("patient-a"));
    const effect = harness.effects[0]!;
    const cleanup = effect();
    cleanup?.();
    effect();
    await settlePromises();

    expect(harness.generateHolderIdentity).toHaveBeenCalledTimes(1);
    expect(harness.saveHolderIdentity).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it("hides the prior holder runtime synchronously when selected user changes", async () => {
    renderHook(options("patient-a"));
    harness.effects[0]?.();
    await settlePromises();

    const patientA = renderHook(options("patient-a"));
    expect(patientA.workflow).toBeNull();
    expect(patientA.holderDid).toBe(holderDid);

    const patientB = renderHook(options("patient-b"));
    expect(patientB.workflow).toBeNull();
    expect(patientB.holderDid).toBeUndefined();
    expect(patientB.documents).toEqual([]);
  });

  it("exposes the live workflow only after Portal provisioning is ready", async () => {
    harness.getProvisioningStatus.mockResolvedValue({
      schema: "trustcare.wallet.provisioning.v1",
      identityLinked: true,
      portalSession: false,
      app: {
        appId: "trustcare-wallet-production",
        status: "active",
        trustLevel: "verified",
        scopes: ["credentials:read"],
        oidcClientAllowed: true,
      },
      holder: {
        holderDid,
        bound: true,
        proofVerifiedAt: "2026-07-13T10:00:00.000Z",
      },
      ready: true,
      nextAction: "create_exchange_session",
    });
    const readyOptions = {
      ...options("patient-a"),
      portalAccessToken: "wallet-oidc-access-token",
    };

    renderHook(readyOptions);
    harness.effects[0]?.();
    await settlePromises();

    renderHook(readyOptions);
    harness.effects[1]?.();
    await settlePromises();

    const ready = renderHook(readyOptions);
    expect(ready.workflow).not.toBeNull();
    expect(ready.connection.status).toBe("ready");
    expect(harness.getProvisioningStatus).toHaveBeenCalledWith(
      "wallet-oidc-access-token",
    );
  });
});

function options(localUserKey: string): UseWalletExchangeOptions {
  return {
    enabled: true,
    portalBaseUrl:
      "https://trustcare-hospital-network-production.up.railway.app",
    appId: "trustcare-wallet-production",
    runtimeEnvironment: "sandbox",
    walletVersion: "0.1.0",
    localUserKey,
  };
}

function renderHook(hookOptions: UseWalletExchangeOptions) {
  harness.stateCursor = 0;
  harness.effects = [];
  return useWalletExchange(hookOptions);
}

function installLocalStorage(): void {
  const storage: Storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

async function settlePromises(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
