import { useCallback, useEffect, useState } from "react";
import {
  WalletExchangeProblemError,
  WalletExchangeWorkflow,
  normalizePortalOrigin,
  type WalletExchangeCredentialRequestLink,
  type WalletExchangePendingSubmissionDraft,
} from "@trustcare/api-client";
import {
  generateHolderIdentity,
  type RuntimeEnvironment,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import { IndexedDbWalletExchangePersistence } from "../repositories";

type WalletExchangeRuntime = {
  partitionKey: string;
  workflow: WalletExchangeWorkflow;
  persistence: IndexedDbWalletExchangePersistence;
  holderDid: string;
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

const pendingRuntimeInitializations = new Map<
  string,
  Promise<WalletExchangeRuntime>
>();

export type UseWalletExchangeOptions = {
  enabled?: boolean;
  portalBaseUrl: string;
  appId: string;
  runtimeEnvironment: RuntimeEnvironment;
  walletVersion: string;
  localUserKey: string;
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
  const [pendingSubmissionState, setPendingSubmissionState] =
    useState<WalletExchangePendingSubmissionState>({ records: [] });
  const currentPartitionKey = holderLocatorKey(options);
  const activeRuntime =
    options.enabled !== false && runtime?.partitionKey === currentPartitionKey
      ? runtime
      : null;
  const documents =
    options.enabled !== false &&
    documentState.partitionKey === currentPartitionKey
      ? documentState.records
      : [];
  const requestLinks =
    options.enabled !== false &&
    requestLinkState.partitionKey === currentPartitionKey
      ? requestLinkState.records
      : [];
  const pendingSubmissions =
    options.enabled !== false &&
    pendingSubmissionState.partitionKey === currentPartitionKey
      ? pendingSubmissionState.records
      : [];

  useEffect(() => {
    let active = true;
    if (options.enabled === false) {
      setRuntime(null);
      setDocumentState({ records: [] });
      setRequestLinkState({ records: [] });
      setPendingSubmissionState({ records: [] });
      setError("");
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
    void initializeRuntime(options)
      .then(async (next) => {
        const [state, links, pendingSubmissions] = await Promise.all([
          next.persistence.loadOrCreateState(),
          next.persistence.listCredentialRequestLinks(),
          next.persistence.listPendingSubmissionDrafts(),
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
    options.walletVersion,
  ]);

  const synchronize = useCallback(async () => {
    if (!activeRuntime) {
      throw new Error(error || "Wallet Exchange holder key is not ready.");
    }
    setSyncing(true);
    setError("");
    try {
      const result = await activeRuntime.workflow.synchronize();
      setDocumentState({
        partitionKey: activeRuntime.partitionKey,
        records: result.state.documents,
      });
      return result;
    } catch (reason) {
      const message = walletExchangeErrorMessage(reason);
      setError(message);
      throw reason;
    } finally {
      setSyncing(false);
    }
  }, [activeRuntime, error]);

  const reload = useCallback(async () => {
    if (!activeRuntime) return;
    const [state, links, pendingSubmissions] = await Promise.all([
      activeRuntime.persistence.loadOrCreateState(),
      activeRuntime.persistence.listCredentialRequestLinks(),
      activeRuntime.persistence.listPendingSubmissionDrafts(),
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
  }, [activeRuntime]);

  const recoverPendingSubmissions = useCallback(async () => {
    if (!activeRuntime) {
      throw new Error(error || "Wallet Exchange holder key is not ready.");
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
  }, [activeRuntime, error]);

  return {
    workflow: activeRuntime?.workflow ?? null,
    holderDid: activeRuntime?.holderDid,
    documents,
    requestLinks,
    pendingSubmissions,
    initializing,
    syncing,
    error,
    synchronize,
    recoverPendingSubmissions,
    reload,
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
  const locatedDid = readHolderLocator(locatorKey);
  if (locatedDid) {
    const persistence = new IndexedDbWalletExchangePersistence({
      portalOrigin: options.portalBaseUrl,
      holderDid: locatedDid,
    });
    const identity = await persistence.loadHolderIdentity();
    if (!identity) {
      throw new Error(
        "พบ holder DID แต่ไม่พบ private key ในอุปกรณ์ กรุณากู้คืนหรือผูกกุญแจใหม่โดยไม่ใช้ข้อมูลเดิมเป็น fallback",
      );
    }
    return {
      partitionKey: locatorKey,
      holderDid: identity.did,
      persistence,
      workflow: new WalletExchangeWorkflow({
        ...options,
        identity,
        persistence,
      }),
    };
  }

  const identity = await generateHolderIdentity({
    algorithm: "P-256",
    extractable: false,
  });
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
    persistence,
    workflow: new WalletExchangeWorkflow({
      ...options,
      identity,
      persistence,
    }),
  };
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
