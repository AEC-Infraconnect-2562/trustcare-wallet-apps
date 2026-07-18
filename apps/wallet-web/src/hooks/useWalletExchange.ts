import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletExchangeProblemError } from "@trustcare/api-client/walletExchangeV2";
import {
  WalletProvisioningProblemError,
  createWalletProvisioningClient,
  type WalletProvisioningStatus,
  type WalletTestIdentity,
} from "@trustcare/api-client/walletProvisioning";
import { normalizePortalOrigin } from "@trustcare/api-client/walletContractLoader";
import { synchronizeWalletAvatar } from "@trustcare/api-client/walletAvatarSync";
import {
  WalletExchangeWorkflow,
  type WalletExchangeCredentialRequestLink,
  type WalletExchangePendingSubmissionDraft,
} from "@trustcare/api-client/walletExchangeWorkflow";
import {
  generateHolderIdentity,
  listClinicalDocumentGraphArtifacts,
  sandboxHolderIdentityForUser,
  walletAvatarDataUrl,
  type HolderSigningIdentity,
  type RuntimeEnvironment,
  type WalletAvatarAssetRecord,
  type WalletClinicalDocumentGraphState,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import type { ClinicalDocumentGraphPresentation } from "@trustcare/contracts";
import { IndexedDbWalletExchangePersistence } from "../repositories";

type WalletExchangeRuntime = {
  partitionKey: string;
  workflow: WalletExchangeWorkflow;
  persistence: IndexedDbWalletExchangePersistence;
  holderDid: string;
  identity: HolderSigningIdentity;
};

type WalletExchangeDocumentState = {
  partitionKey?: string;
  records: WalletDocumentRecordV2[];
};

type WalletExchangeRequestLinkState = {
  partitionKey?: string;
  records: WalletExchangeCredentialRequestLink[];
};

type WalletExchangePendingSubmissionState = {
  partitionKey?: string;
  records: WalletExchangePendingSubmissionDraft[];
};

type WalletExchangeClinicalGraphState = {
  partitionKey?: string;
  state?: WalletClinicalDocumentGraphState;
};

export type WalletPortalConnectionStatus =
  | "loading"
  | "authentication_required"
  | "portal_configuration_required"
  | "holder_binding_required"
  | "application_blocked"
  | "binding"
  | "ready"
  | "error";

type WalletPortalConnectionState = {
  partitionKey?: string;
  status: WalletPortalConnectionStatus;
  provisioning?: WalletProvisioningStatus;
  message: string;
};

const pendingRuntimeInitializations = new Map<
  string,
  Promise<WalletExchangeRuntime>
>();

// Stable fallbacks: fresh [] / {} literals per render change the identity of
// downstream useMemo/useEffect dependencies and can drive render loops
// ("Maximum update depth exceeded") when the exchange partition is inactive.
const emptyDocuments: WalletDocumentRecordV2[] = [];
const emptyRequestLinks: WalletExchangeCredentialRequestLink[] = [];
const emptyPendingSubmissions: WalletExchangePendingSubmissionDraft[] = [];
const loadingConnection: WalletPortalConnectionState = {
  status: "loading",
  message: "กำลังเตรียม holder key และตรวจ Portal provisioning",
};

export type UseWalletExchangeOptions = {
  enabled?: boolean;
  portalBaseUrl: string;
  appId: string;
  runtimeEnvironment: RuntimeEnvironment;
  walletVersion: string;
  localUserKey: string;
  /** Short-lived Wallet OIDC bearer held by the web session in memory only. */
  portalAccessToken?: string;
  /** Live Portal catalog metadata; accepted only by the sandbox runtime. */
  sandboxIdentity?: WalletTestIdentity;
};

type WalletExchangeAvatarState = {
  partitionKey?: string;
  record?: WalletAvatarAssetRecord;
};

export function useWalletExchange(options: UseWalletExchangeOptions) {
  const [runtime, setRuntime] = useState<WalletExchangeRuntime | null>(null);
  const [documentState, setDocumentState] =
    useState<WalletExchangeDocumentState>({ records: [] });
  const [requestLinkState, setRequestLinkState] =
    useState<WalletExchangeRequestLinkState>({ records: [] });
  const [initializing, setInitializing] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] =
    useState<WalletPortalConnectionState>({
      status: "loading",
      message: "กำลังตรวจการเชื่อมต่อ TrustCare Portal",
    });
  const [pendingSubmissionState, setPendingSubmissionState] =
    useState<WalletExchangePendingSubmissionState>({ records: [] });
  const [clinicalGraphState, setClinicalGraphState] =
    useState<WalletExchangeClinicalGraphState>({});
  const [avatarState, setAvatarState] = useState<WalletExchangeAvatarState>({});
  const currentPartitionKey = holderLocatorKey(options);
  const activeRuntime =
    options.enabled !== false && runtime?.partitionKey === currentPartitionKey
      ? runtime
      : null;
  const documents =
    options.enabled !== false &&
    documentState.partitionKey === currentPartitionKey
      ? documentState.records
      : emptyDocuments;
  const requestLinks =
    options.enabled !== false &&
    requestLinkState.partitionKey === currentPartitionKey
      ? requestLinkState.records
      : emptyRequestLinks;
  const pendingSubmissions =
    options.enabled !== false &&
    pendingSubmissionState.partitionKey === currentPartitionKey
      ? pendingSubmissionState.records
      : emptyPendingSubmissions;
  const clinicalDocumentGraph =
    options.enabled !== false &&
    clinicalGraphState.partitionKey === currentPartitionKey
      ? clinicalGraphState.state
      : undefined;
  const graphArtifacts = useMemo(
    () =>
      clinicalDocumentGraph
        ? listClinicalDocumentGraphArtifacts(clinicalDocumentGraph)
        : [],
    [clinicalDocumentGraph],
  );
  const avatar =
    options.enabled !== false && avatarState.partitionKey === currentPartitionKey
      ? avatarState.record
      : undefined;
  const connection =
    options.enabled !== false &&
    connectionState.partitionKey === currentPartitionKey
      ? connectionState
      : loadingConnection;
  const provisioningReady =
    activeRuntime !== null && connection.status === "ready";

  useEffect(() => {
    let active = true;
    if (options.enabled === false) {
      setRuntime(null);
      setDocumentState({ records: [] });
      setRequestLinkState({ records: [] });
      setPendingSubmissionState({ records: [] });
      setClinicalGraphState({});
      setAvatarState({});
      setError("");
      setConnectionState({
        status: "loading",
        message: "Wallet Exchange ยังไม่ทำงาน",
      });
      setInitializing(false);
      setSyncing(false);
      return () => {
        active = false;
      };
    }
    setInitializing(true);
    setError("");
    setRuntime(null);
    setDocumentState({ records: [] });
    setRequestLinkState({ records: [] });
    setPendingSubmissionState({ records: [] });
    setClinicalGraphState({});
    setAvatarState({});
    void initializeRuntime(options)
      .then(async (next) => {
        await next.workflow.initializePersistenceTrust();
        const avatarBinding = {
          walletUserId:
            options.sandboxIdentity?.walletUserId ?? options.localUserKey,
          holderDid: next.holderDid,
          credentialSubjectId: next.holderDid,
        };
        const [state, links, pendingSubmissions, graphState, avatarRecord] =
          await Promise.all([
            next.persistence.loadOrCreateState(),
            next.persistence.listCredentialRequestLinks(),
            next.persistence.listPendingSubmissionDrafts(),
            next.persistence.loadOrCreateClinicalDocumentGraphState(),
            next.persistence.loadAvatarAsset(avatarBinding),
          ]);
        if (!active) return;
        setRuntime(next);
        setDocumentState({
          partitionKey: next.partitionKey,
          records: state.documents,
        });
        setRequestLinkState({
          partitionKey: next.partitionKey,
          records: links,
        });
        setPendingSubmissionState({
          partitionKey: next.partitionKey,
          records: pendingSubmissions,
        });
        setClinicalGraphState({
          partitionKey: next.partitionKey,
          state: graphState,
        });
        setAvatarState({
          partitionKey: next.partitionKey,
          record: avatarRecord ?? undefined,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(walletExchangeErrorMessage(reason));
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, [
    options.appId,
    options.enabled,
    options.localUserKey,
    options.portalBaseUrl,
    options.runtimeEnvironment,
    options.sandboxIdentity?.holder?.did,
    options.sandboxIdentity?.portraitUrl,
    options.sandboxIdentity?.walletUserId,
    options.walletVersion,
  ]);

  useEffect(() => {
    let active = true;
    if (options.enabled === false || !activeRuntime) {
      return () => {
        active = false;
      };
    }
    const partitionKey = activeRuntime.partitionKey;
    setConnectionState({
      partitionKey,
      status: "loading",
      message: "กำลังตรวจ Portal application และ holder binding",
    });
    const client = createWalletProvisioningClient({
      portalBaseUrl: options.portalBaseUrl,
      appId: options.appId,
      identity: activeRuntime.identity,
    });
    void client
      .reloadConfiguration()
      .then(async (configuration) => {
        if (!active) return;
        if (configuration.appId !== options.appId) {
          throw new Error(
            `Portal ประกาศ appId ${configuration.appId} ไม่ตรงกับ Wallet ${options.appId}`,
          );
        }
        if (!options.portalAccessToken) {
          setConnectionState({
            partitionKey,
            status:
              configuration.oidc.issuer ||
              configuration.endpoints.sandboxTestLogin
                ? "authentication_required"
                : "portal_configuration_required",
            message:
              configuration.oidc.issuer ||
              configuration.endpoints.sandboxTestLogin
                ? "กรุณาเข้าสู่ระบบ TrustCare Portal เพื่อผูก holder DID"
                : "Portal ยังไม่ได้เปิด Wallet OIDC หรือ sandbox test login",
          });
          return;
        }
        await client.getWalletIdentity(options.portalAccessToken);
        const provisioning = await client.getProvisioningStatus(
          options.portalAccessToken,
        );
        if (!active) return;
        setConnectionState(
          connectionStateForProvisioning(partitionKey, provisioning),
        );
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setConnectionState({
          partitionKey,
          status: "error",
          message: walletExchangeErrorMessage(reason),
        });
      });
    return () => {
      active = false;
    };
  }, [
    activeRuntime,
    options.appId,
    options.enabled,
    options.portalAccessToken,
    options.portalBaseUrl,
  ]);

  const synchronize = useCallback(async () => {
    if (!activeRuntime || !provisioningReady) {
      throw new Error(
        connection.message ||
          error ||
          "Wallet Exchange provisioning is not ready.",
      );
    }
    setSyncing(true);
    setError("");
    try {
      const result = await activeRuntime.workflow.synchronize();
      setDocumentState({
        partitionKey: activeRuntime.partitionKey,
        records: result.state.documents,
      });
      const graphResult =
        await activeRuntime.workflow.synchronizeClinicalDocumentGraph();
      const avatarRecord = await synchronizeWalletAvatar({
        walletUserId:
          options.sandboxIdentity?.walletUserId ?? options.localUserKey,
        holderDid: activeRuntime.holderDid,
        documents: result.state.documents,
        expectedSandboxPortraitUrl: options.sandboxIdentity?.portraitUrl,
      });
      await activeRuntime.persistence.saveAvatarAsset(avatarRecord);
      const links =
        await activeRuntime.persistence.listCredentialRequestLinks();
      setRequestLinkState({
        partitionKey: activeRuntime.partitionKey,
        records: links,
      });
      setClinicalGraphState({
        partitionKey: activeRuntime.partitionKey,
        state: graphResult.state,
      });
      setAvatarState({
        partitionKey: activeRuntime.partitionKey,
        record: avatarRecord,
      });
      return { ...result, clinicalDocumentGraph: graphResult };
    } catch (reason) {
      const message = walletExchangeErrorMessage(reason);
      setError(message);
      if (
        reason instanceof WalletExchangeProblemError &&
        reason.code === "wallet_binding_unavailable"
      ) {
        // Provisioning can outlive the active Portal holder-key row after a
        // sandbox reseed. Recover through the normal holder challenge flow;
        // never rotate the local key or substitute a different DID.
        setConnectionState({
          partitionKey: activeRuntime.partitionKey,
          status: "holder_binding_required",
          message: "Portal ต้องยืนยัน holder DID เดิมอีกครั้งก่อนซิงก์ข้อมูล",
        });
      }
      throw reason;
    } finally {
      setSyncing(false);
    }
  }, [
    activeRuntime,
    connection.message,
    error,
    options.localUserKey,
    options.sandboxIdentity?.portraitUrl,
    options.sandboxIdentity?.walletUserId,
    provisioningReady,
  ]);

  const reload = useCallback(async () => {
    if (!activeRuntime) return;
    await activeRuntime.workflow.initializePersistenceTrust();
    const [state, links, pendingSubmissions, graphState, avatarRecord] =
      await Promise.all([
      activeRuntime.persistence.loadOrCreateState(),
      activeRuntime.persistence.listCredentialRequestLinks(),
      activeRuntime.persistence.listPendingSubmissionDrafts(),
      activeRuntime.persistence.loadOrCreateClinicalDocumentGraphState(),
      activeRuntime.persistence.loadAvatarAsset({
        walletUserId:
          options.sandboxIdentity?.walletUserId ?? options.localUserKey,
        holderDid: activeRuntime.holderDid,
        credentialSubjectId: activeRuntime.holderDid,
      }),
    ]);
    setDocumentState({
      partitionKey: activeRuntime.partitionKey,
      records: state.documents,
    });
    setRequestLinkState({
      partitionKey: activeRuntime.partitionKey,
      records: links,
    });
    setPendingSubmissionState({
      partitionKey: activeRuntime.partitionKey,
      records: pendingSubmissions,
    });
    setClinicalGraphState({
      partitionKey: activeRuntime.partitionKey,
      state: graphState,
    });
    setAvatarState({
      partitionKey: activeRuntime.partitionKey,
      record: avatarRecord ?? undefined,
    });
  }, [activeRuntime, options.localUserKey, options.sandboxIdentity?.walletUserId]);

  const graphPresentation = useCallback(
    async (
      selectedArtifactId: string,
    ): Promise<ClinicalDocumentGraphPresentation> => {
      if (!activeRuntime || !provisioningReady) {
        throw new Error(
          connection.message ||
            error ||
            "Clinical Document Graph is not ready.",
        );
      }
      return activeRuntime.workflow.clinicalDocumentGraphPresentation(
        selectedArtifactId,
      );
    },
    [activeRuntime, connection.message, error, provisioningReady],
  );

  const associatePortalShl = useCallback(
    async (input: {
      manifestCredentialId: string;
      consentRef: string;
      clientAssociationId?: string;
    }) => {
      if (!activeRuntime || !provisioningReady) {
        throw new Error(
          connection.message || error || "Wallet Exchange is not ready.",
        );
      }
      setSyncing(true);
      setError("");
      try {
        const association =
          await activeRuntime.workflow.associatePortalShlManifest(input);
        const graphResult =
          await activeRuntime.workflow.synchronizeClinicalDocumentGraph();
        setClinicalGraphState({
          partitionKey: activeRuntime.partitionKey,
          state: graphResult.state,
        });
        return { association, clinicalDocumentGraph: graphResult };
      } catch (reason) {
        setError(walletExchangeErrorMessage(reason));
        throw reason;
      } finally {
        setSyncing(false);
      }
    },
    [activeRuntime, connection.message, error, provisioningReady],
  );

  const recoverPendingSubmissions = useCallback(async () => {
    if (!activeRuntime || !provisioningReady) {
      throw new Error(
        connection.message ||
          error ||
          "Wallet Exchange provisioning is not ready.",
      );
    }
    setSyncing(true);
    setError("");
    try {
      const result =
        await activeRuntime.workflow.recoverPendingDirectSubmissions();
      setPendingSubmissionState({
        partitionKey: activeRuntime.partitionKey,
        records: await activeRuntime.persistence.listPendingSubmissionDrafts(),
      });
      return result;
    } catch (reason) {
      setError(walletExchangeErrorMessage(reason));
      throw reason;
    } finally {
      setSyncing(false);
    }
  }, [activeRuntime, connection.message, error, provisioningReady]);

  const completeHolderBinding = useCallback(async () => {
    if (!activeRuntime || !options.portalAccessToken) {
      throw new Error("กรุณาเข้าสู่ระบบ TrustCare Portal ก่อนผูก holder DID");
    }
    setConnectionState({
      partitionKey: activeRuntime.partitionKey,
      status: "binding",
      message: "กำลังลงนามยืนยันการผูก holder DID กับ Portal",
    });
    try {
      const client = createWalletProvisioningClient({
        portalBaseUrl: options.portalBaseUrl,
        appId: options.appId,
        identity: activeRuntime.identity,
      });
      const provisioning = await client.bindHolder({
        oidcAccessToken: options.portalAccessToken,
        consentRef: `wallet-consent:${crypto.randomUUID()}`,
      });
      setConnectionState(
        connectionStateForProvisioning(
          activeRuntime.partitionKey,
          provisioning,
        ),
      );
      return provisioning;
    } catch (reason) {
      setConnectionState({
        partitionKey: activeRuntime.partitionKey,
        status: "error",
        message: walletExchangeErrorMessage(reason),
      });
      throw reason;
    }
  }, [
    activeRuntime,
    options.appId,
    options.portalAccessToken,
    options.portalBaseUrl,
  ]);

  return {
    workflow: provisioningReady ? activeRuntime.workflow : null,
    holderDid: activeRuntime?.holderDid,
    identity: activeRuntime?.identity,
    documents,
    requestLinks,
    pendingSubmissions,
    clinicalDocumentGraph,
    graphArtifacts,
    avatar,
    avatarUrl: walletAvatarDataUrl(avatar),
    initializing,
    syncing,
    error,
    connection,
    completeHolderBinding,
    synchronize,
    graphPresentation,
    associatePortalShl,
    recoverPendingSubmissions,
    reload,
  };
}

function connectionStateForProvisioning(
  partitionKey: string,
  provisioning: WalletProvisioningStatus,
): WalletPortalConnectionState {
  if (provisioning.ready) {
    return {
      partitionKey,
      status: "ready",
      provisioning,
      message: "เชื่อมต่อ Portal และผูก holder DID แล้ว",
    };
  }
  if (provisioning.nextAction === "complete_holder_binding") {
    return {
      partitionKey,
      status: "holder_binding_required",
      provisioning,
      message: "รอยืนยันความยินยอมเพื่อผูก holder DID กับ Portal",
    };
  }
  return {
    partitionKey,
    status: "application_blocked",
    provisioning,
    message:
      provisioning.nextAction === "await_application_approval"
        ? "Wallet application กำลังรอ Portal อนุมัติ"
        : "Portal ยังไม่พร้อมสำหรับ Wallet application นี้",
  };
}

async function initializeRuntime(
  options: UseWalletExchangeOptions,
): Promise<WalletExchangeRuntime> {
  const locatorKey = holderLocatorKey(options);
  const initializationKey = [
    locatorKey,
    options.runtimeEnvironment,
    options.walletVersion,
  ].join(":");
  const pending = pendingRuntimeInitializations.get(initializationKey);
  if (pending) return pending;
  let initialization: Promise<WalletExchangeRuntime>;
  initialization = initializeRuntimeOnce(options, locatorKey).finally(() => {
    if (
      pendingRuntimeInitializations.get(initializationKey) === initialization
    ) {
      pendingRuntimeInitializations.delete(initializationKey);
    }
  });
  pendingRuntimeInitializations.set(initializationKey, initialization);
  return initialization;
}

async function initializeRuntimeOnce(
  options: UseWalletExchangeOptions,
  locatorKey: string,
): Promise<WalletExchangeRuntime> {
  const expectedSandboxIdentity = options.sandboxIdentity;
  if (expectedSandboxIdentity && options.runtimeEnvironment !== "sandbox") {
    throw new Error("Portal sandbox identity metadata is not allowed outside sandbox mode.");
  }
  if (expectedSandboxIdentity && !expectedSandboxIdentity.patientReferenceProvisioned) {
    throw new Error(
      "บัญชีทดสอบนี้ยังไม่ผ่านการเชื่อมโยงผู้ป่วย จึงไม่สามารถสร้างหรือผูก holder key ได้",
    );
  }
  const expectedHolder = expectedSandboxIdentity?.holder;
  const locatedDid = readHolderLocator(locatorKey);
  if (locatedDid && expectedHolder && locatedDid !== expectedHolder.did) {
    // Sandbox catalog v3 is authoritative after reseed. Keep the retired
    // partition untouched as evidence, but hard-cut the active locator so it
    // can never be used as a compatibility fallback.
    writeHolderLocator(locatorKey, expectedHolder.did);
  }
  const activeLocatedDid = expectedHolder?.did ?? locatedDid;
  if (!locatedDid && expectedHolder) {
    writeHolderLocator(locatorKey, expectedHolder.did);
  }
  if (activeLocatedDid) {
    const persistence = new IndexedDbWalletExchangePersistence({
      portalOrigin: options.portalBaseUrl,
      holderDid: activeLocatedDid,
    });
    let identity: HolderSigningIdentity | undefined =
      (await persistence.loadHolderIdentity()) ?? undefined;
    if (!identity && expectedHolder) {
      identity = await sandboxHolderIdentityForUser({
        userId: expectedSandboxIdentity!.walletUserId,
        sandboxRuntime: true,
      });
      if (identity) await persistence.saveHolderIdentity(identity);
    }
    if (!identity) {
      throw new Error(
        "พบ holder DID แต่ไม่พบ private key ในอุปกรณ์ กรุณากู้คืนหรือผูกกุญแจใหม่โดยไม่ใช้ข้อมูลเดิมเป็น fallback",
      );
    }
    assertCatalogHolderIdentity(identity, expectedHolder);
    return {
      partitionKey: locatorKey,
      holderDid: identity.did,
      identity,
      persistence,
      workflow: new WalletExchangeWorkflow({
        ...options,
        identity,
        persistence,
      }),
    };
  }

  const identity = expectedHolder
    ? await sandboxHolderIdentityForUser({
        userId: expectedSandboxIdentity!.walletUserId,
        sandboxRuntime: true,
      })
    : await generateHolderIdentity({
        algorithm: "P-256",
        extractable: false,
      });
  if (!identity) {
    throw new Error("Wallet sandbox holder fixture is unavailable for this catalog identity.");
  }
  assertCatalogHolderIdentity(identity, expectedHolder);
  const persistence = new IndexedDbWalletExchangePersistence({
    portalOrigin: options.portalBaseUrl,
    holderDid: identity.did,
  });
  // Persist the locator first. If key persistence then fails, the next load
  // fails closed on the located DID instead of silently creating another DID.
  writeHolderLocator(locatorKey, identity.did);
  await persistence.saveHolderIdentity(identity);
  return {
    partitionKey: locatorKey,
    holderDid: identity.did,
    identity,
    persistence,
    workflow: new WalletExchangeWorkflow({
      ...options,
      identity,
      persistence,
    }),
  };
}

function assertCatalogHolderIdentity(
  identity: HolderSigningIdentity,
  expected: WalletTestIdentity["holder"] | undefined,
): void {
  if (!expected) return;
  if (
    identity.did !== expected.did ||
    identity.jwsAlgorithm !== expected.algorithm ||
    !samePublicJwk(identity.publicJwk, expected.publicJwk)
  ) {
    throw new Error(
      "holder key ในอุปกรณ์ไม่ตรงกับ Portal sandbox catalog ระบบจะไม่แก้ subject หรือใช้ DID อื่นแทน",
    );
  }
}

function samePublicJwk(
  actual: object,
  expected: object,
): boolean {
  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  return ["kty", "crv", "x", "y"].every(
    (key) => (actualRecord[key] ?? null) === (expectedRecord[key] ?? null),
  );
}

function holderLocatorKey(options: UseWalletExchangeOptions): string {
  return [
    "trustcare-wallet-exchange-holder-v1",
    encodeURIComponent(normalizePortalOrigin(options.portalBaseUrl)),
    encodeURIComponent(options.appId),
    encodeURIComponent(options.localUserKey),
  ].join(":");
}

function readHolderLocator(key: string): string | undefined {
  const value = requiredLocatorStorage().getItem(key);
  if (!value) return undefined;
  try {
    const record = JSON.parse(value) as Record<string, unknown>;
    if (
      record.schema === "trustcare.wallet.holder-locator.v1" &&
      typeof record.holderDid === "string" &&
      record.holderDid.startsWith("did:key:")
    ) {
      return record.holderDid;
    }
  } catch {
    // Corrupt locator is not replaced silently because that would rotate the
    // patient holder identity without consent.
  }
  throw new Error(
    "ข้อมูลอ้างอิง holder key ในอุปกรณ์เสียหาย ระบบจะไม่สร้าง DID ใหม่ทับโดยอัตโนมัติ",
  );
}

function writeHolderLocator(key: string, holderDid: string): void {
  requiredLocatorStorage().setItem(
    key,
    JSON.stringify({
      schema: "trustcare.wallet.holder-locator.v1",
      holderDid,
    }),
  );
}

function requiredLocatorStorage(): Storage {
  const storage = globalThis.localStorage;
  if (!storage) {
    throw new Error(
      "อุปกรณ์นี้ไม่รองรับพื้นที่เก็บ holder DID ระบบจะไม่สร้าง DID ใหม่โดยไม่มีที่อ้างอิงกุญแจถาวร",
    );
  }
  return storage;
}

function walletExchangeErrorMessage(reason: unknown): string {
  if (reason instanceof WalletProvisioningProblemError) {
    const correlation = reason.correlationId
      ? ` (รหัสอ้างอิง ${reason.correlationId})`
      : "";
    return `${reason.message}${correlation}`;
  }
  if (reason instanceof WalletExchangeProblemError) {
    const correlation = reason.correlationId
      ? ` (รหัสอ้างอิง ${reason.correlationId})`
      : "";
    return `${reason.message}${correlation}`;
  }
  return reason instanceof Error
    ? reason.message
    : "ไม่สามารถเชื่อมต่อ Wallet Exchange ได้";
}
