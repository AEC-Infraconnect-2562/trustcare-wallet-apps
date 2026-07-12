import { describe, expect, it } from "vitest";
import {
  applyWalletExchangeAckReceipt,
  enqueueWalletExchangeRetry,
  generateHolderIdentity,
  prepareWalletExchangeSyncCommit,
  signHolderCompactJws,
  type WalletDocumentRecordV2,
  type WalletExchangeIssuerEvidence,
  type WalletExchangePreparedSyncPage,
  type WalletExchangePreparedUpsertChange,
} from "@trustcare/wallet-core";
import {
  INDEXED_DB_WALLET_EXCHANGE_SCHEMA,
  IndexedDbWalletExchangePersistence,
  createIndexedDbWalletExchangeDatabaseName,
  type IndexedDbWalletExchangeStorage,
  type IndexedDbWalletExchangeStoreName,
  type IndexedDbWalletExchangeTransaction,
  type IndexedDbWalletExchangeTransactionMode,
} from "./IndexedDbWalletExchangePersistence";

const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";
const holderDid = "did:key:z6MkhWalletExchangePersistenceHolder";
const issuerDid =
  "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";
const contentHash = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

describe("IndexedDbWalletExchangePersistence", () => {
  it("uses a versioned database namespace partitioned by normalized Portal origin and holder", () => {
    const name = createIndexedDbWalletExchangeDatabaseName({
      portalOrigin,
      holderDid,
    });
    expect(name).toContain(
      encodeURIComponent(INDEXED_DB_WALLET_EXCHANGE_SCHEMA),
    );
    expect(name).toContain(encodeURIComponent(holderDid));
    expect(
      createIndexedDbWalletExchangeDatabaseName({
        portalOrigin,
        holderDid: "did:key:z6MkhAnotherHolder",
      }),
    ).not.toBe(name);
    expect(() =>
      createIndexedDbWalletExchangeDatabaseName({
        portalOrigin: `${portalOrigin}/api/wallet/v2/`,
        holderDid,
      }),
    ).toThrow("origin cannot contain credentials, query, or fragment");
  });

  it("rolls back documents and cursor when an atomic sync transaction fails", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const initial = await persistence.loadOrCreateState();
    const reduction = prepareWalletExchangeSyncCommit(initial, syncPage());

    storage.failNextPut("exchange_state");
    await expect(persistence.commitSyncReduction(reduction)).rejects.toThrow(
      "injected exchange_state put failure",
    );

    await expect(persistence.loadState()).resolves.toEqual(initial);
    await expect(persistence.listDocuments()).resolves.toEqual([]);
  });

  it("recovers a committed pending ACK after restart, then persists its receipt", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const firstProcess = repository(storage);
    const initial = await firstProcess.loadOrCreateState();
    const reduction = prepareWalletExchangeSyncCommit(initial, syncPage());
    await firstProcess.commitSyncReduction(reduction);

    const restarted = repository(storage);
    const recovered = await restarted.loadState();
    expect(recovered).toEqual(reduction.state);
    expect(recovered?.pendingAck).toEqual(reduction.plan.pendingAck);
    await expect(restarted.listDocuments()).resolves.toEqual([
      reduction.plan.documents.put[0],
    ]);

    const acknowledged = applyWalletExchangeAckReceipt(recovered!, {
      schema: "trustcare.wallet.sync-ack.v1",
      receiptId: "receipt-sync-1",
      syncId: "sync-1",
      cursor: "opaque-cursor-0001",
      acceptedAt: "2026-07-11T10:00:01.000Z",
      summary: {
        applied: 1,
        alreadyCurrent: 0,
        archived: 0,
        rejected: 0,
      },
      idempotent: false,
      note: "accepted",
    });
    await restarted.persistAcknowledgedState(acknowledged);

    const afterAckRestart = await repository(storage).loadState();
    expect(afterAckRestart?.pendingAck).toBeUndefined();
    expect(afterAckRestart?.lastAckReceipt?.receiptId).toBe("receipt-sync-1");
    expect(afterAckRestart?.nextCursor).toBe("opaque-cursor-0001");
  });

  it("persists a non-extractable holder CryptoKey by structured clone", async () => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    const storage = new MemoryWalletExchangeStorage();
    const persistence = new IndexedDbWalletExchangePersistence({
      portalOrigin,
      holderDid: identity.did,
      storage,
    });
    await persistence.saveHolderIdentity(identity);

    const loaded = await new IndexedDbWalletExchangePersistence({
      portalOrigin,
      holderDid: identity.did,
      storage,
    }).loadHolderIdentity();
    expect(loaded).not.toBeNull();
    expect("extractable" in loaded!.privateKey).toBe(true);
    expect((loaded!.privateKey as CryptoKey).extractable).toBe(false);
    expect((loaded!.privateKey as CryptoKey).type).toBe("private");
    await expect(
      signHolderCompactJws({
        identity: loaded!,
        payload: "persisted-key-proof",
        protectedHeader: {
          alg: loaded!.jwsAlgorithm,
          kid: loaded!.kid,
          typ: "trustcare-wallet-session+jwt",
        },
      }),
    ).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/);

    const extractable = await generateHolderIdentity({
      algorithm: "P-256",
      extractable: true,
    });
    await expect(
      new IndexedDbWalletExchangePersistence({
        portalOrigin,
        holderDid: extractable.did,
        storage,
      }).saveHolderIdentity(extractable),
    ).rejects.toThrow("non-extractable");
  });

  it("isolates state, documents, and durable links between holder partitions", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const holderOne = repository(storage);
    const holderTwo = new IndexedDbWalletExchangePersistence({
      portalOrigin,
      holderDid: "did:key:z6MkhWalletExchangeOtherHolder",
      storage,
    });
    const initial = await holderOne.loadOrCreateState();
    await holderTwo.loadOrCreateState();
    await holderOne.commitSyncReduction(
      prepareWalletExchangeSyncCommit(initial, syncPage()),
    );
    await holderOne.saveCredentialRequestLink({
      clientRequestId: "client-request-1",
      requestId: "portal-request-1",
      idempotencyKey: "idempotency-request-1",
      statusUrl: "/api/wallet/v2/credential-requests/portal-request-1",
      lastKnownStatus: "pending_review",
      targetHospitalCode: "TCC",
      context: "opd_visit",
      purpose: "Prepare an OPD visit",
      credentialTypes: ["PatientIdentityCredential"],
      createdAt: "2026-07-11T10:00:00.000Z",
      updatedAt: "2026-07-11T10:00:00.000Z",
    });

    await expect(holderTwo.listDocuments()).resolves.toEqual([]);
    await expect(holderTwo.listCredentialRequestLinks()).resolves.toEqual([]);
    expect((await holderTwo.loadState())?.nextCursor).toBeUndefined();
  });

  it("never migrates unpartitioned legacy issuer documents into Exchange state", async () => {
    const storage = new MemoryWalletExchangeStorage();
    storage.seed(
      "documents",
      "legacy-wallet-document",
      document({
        id: "legacy-document",
        ownerDid: holderDid,
        issuer: "did:web:untrusted-issuer.example:hospital:tcc",
      }),
    );
    const persistence = repository(storage);
    const state = await persistence.loadOrCreateState();

    expect(state.documents).toEqual([]);
    await expect(persistence.listDocuments()).resolves.toEqual([]);

    const forged = {
      ...state,
      documents: [
        document({
          id: "legacy-partition-document",
          ownerDid: holderDid,
          issuer: "did:web:untrusted-issuer.example:hospital:tcc",
        }),
      ],
    };
    await expect(persistence.persistRetryOutboxState(forged)).rejects.toThrow(
      "live Portal trust registry",
    );
  });

  it("persists retry outbox and request/submission correlations without tokens", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const initial = await persistence.loadOrCreateState();
    const queued = enqueueWalletExchangeRetry(initial, {
      operationId: "submission-client-1",
      operation: "submission",
      idempotencyKey: "submission-idempotency-1",
      requestDigest: `sha256:${"b".repeat(64)}`,
      createdAt: "2026-07-11T11:00:00.000Z",
    });
    await persistence.persistRetryOutboxState(queued);
    expect((await persistence.loadState())?.retryJournal).toEqual(
      queued.retryJournal,
    );

    await persistence.saveCredentialRequestLink({
      clientRequestId: "client-request-1",
      requestId: "portal-request-1",
      idempotencyKey: "request-idempotency-1",
      statusUrl: "/api/wallet/v2/credential-requests/portal-request-1",
      lastKnownStatus: "pending_review",
      targetHospitalCode: "TCC",
      context: "opd_visit",
      purpose: "Prepare an OPD visit",
      credentialTypes: ["PatientIdentityCredential"],
      createdAt: "2026-07-11T11:00:00.000Z",
      updatedAt: "2026-07-11T11:00:00.000Z",
    });
    await persistence.saveSubmissionLink({
      clientSubmissionId: "client-submission-1",
      submissionId: "portal-submission-1",
      idempotencyKey: "submission-idempotency-1",
      intentDigest: `sha256:${"c".repeat(64)}`,
      requestDigest: `sha256:${"d".repeat(64)}`,
      statusUrl: "/api/wallet/v2/submissions/portal-submission-1",
      lastKnownStatus: "received",
      createdAt: "2026-07-11T11:00:00.000Z",
      updatedAt: "2026-07-11T11:00:00.000Z",
    });
    await expect(
      persistence.getCredentialRequestLink("client-request-1"),
    ).resolves.toMatchObject({ requestId: "portal-request-1" });
    await expect(
      persistence.getSubmissionLink("client-submission-1"),
    ).resolves.toMatchObject({ submissionId: "portal-submission-1" });

    await expect(
      persistence.saveSubmissionLink({
        clientSubmissionId: "client-submission-token",
        submissionId: "portal-submission-token",
        idempotencyKey: "submission-idempotency-token",
        intentDigest: `sha256:${"c".repeat(64)}`,
        requestDigest: `sha256:${"d".repeat(64)}`,
        statusUrl: "/api/wallet/v2/submissions/portal-submission-token",
        createdAt: "2026-07-11T11:00:00.000Z",
        updatedAt: "2026-07-11T11:00:00.000Z",
        accessToken: "must-not-persist",
      } as never),
    ).rejects.toThrow("Unknown Wallet Exchange persistence field");
  });

  it("durably recovers and atomically completes an exact direct-submission draft", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const draft = await pendingSubmissionDraft();
    await persistence.savePendingSubmissionDraft(draft);

    const restarted = repository(storage);
    await expect(restarted.listPendingSubmissionDrafts()).resolves.toEqual([
      draft,
    ]);
    await expect(
      restarted.savePendingSubmissionDraft({
        ...draft,
        requestBody: `${draft.requestBody} `,
      }),
    ).rejects.toThrow("request bytes do not match");
    expect(
      await restarted.getPendingSubmissionDraft(draft.clientSubmissionId),
    ).toEqual(draft);

    const link = {
      clientSubmissionId: draft.clientSubmissionId,
      submissionId: "portal-submission-outbox-1",
      idempotencyKey: draft.idempotencyKey,
      intentDigest: draft.intentDigest,
      requestDigest: draft.requestDigest,
      statusUrl: "/api/wallet/v2/submissions/portal-submission-outbox-1",
      lastKnownStatus: "received",
      createdAt: "2026-07-11T11:00:01.000Z",
      updatedAt: "2026-07-11T11:00:01.000Z",
    };
    await restarted.completePendingSubmission(draft, link);
    await expect(
      restarted.getPendingSubmissionDraft(draft.clientSubmissionId),
    ).resolves.toBeNull();
    await expect(
      restarted.getSubmissionLink(draft.clientSubmissionId),
    ).resolves.toEqual(link);
  });

  it("rejects patientId and token material in direct-submission outbox records", async () => {
    const persistence = repository(new MemoryWalletExchangeStorage());
    const draft = await pendingSubmissionDraft();
    await expect(
      persistence.savePendingSubmissionDraft({
        ...draft,
        patientId: "P001",
      } as never),
    ).rejects.toThrow("Unknown Wallet Exchange persistence field");
    await expect(
      persistence.savePendingSubmissionDraft({
        ...draft,
        accessToken: "secret",
      } as never),
    ).rejects.toThrow("Unknown Wallet Exchange persistence field");
  });
});

async function pendingSubmissionDraft() {
  const request = {
    clientSubmissionId: "client-submission-outbox-1",
    context: "opd_visit" as const,
    purpose: "Continue care",
    consentRef: "urn:consent:outbox:1",
    transport: {
      mode: "direct_vp" as const,
      vpJwt: "eyJhbGciOiJFUzI1NiJ9.eyJ2cCI6MX0.signature",
    },
  };
  const requestBody = JSON.stringify(request);
  return {
    schema: "trustcare.wallet.submission-outbox.v1" as const,
    clientSubmissionId: request.clientSubmissionId,
    idempotencyKey: "submission-outbox-idempotency-1",
    intentDigest: `sha256:${"e".repeat(64)}` as const,
    requestDigest: await testSha256(requestBody),
    requestBody,
    request,
    createdAt: "2026-07-11T11:00:00.000Z",
  };
}

async function testSha256(value: string): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function repository(storage: IndexedDbWalletExchangeStorage) {
  const persistence = new IndexedDbWalletExchangePersistence({
    portalOrigin,
    holderDid,
    storage,
  });
  persistence.configureTrustedIssuers([issuerDid]);
  return persistence;
}

function syncPage(): WalletExchangePreparedSyncPage {
  return {
    schema: "trustcare.wallet.sync.v2",
    contractVersion: "2026.07.wallet-exchange.v2",
    syncId: "sync-1",
    mode: "initial",
    nextCursor: "opaque-cursor-0001",
    hasMore: false,
    serverTime: "2026-07-11T10:00:00.000Z",
    ackIdempotencyKey: "ack-sync-1",
    changes: [signedUpsert()],
  };
}

function signedUpsert(): WalletExchangePreparedUpsertChange {
  const jwt = "eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6MX0.signature";
  const credential: WalletExchangePreparedUpsertChange["credential"] = {
    credentialId: "credential-1",
    cardType: "patient_identity",
    credentialType: "PatientIdentityCredential",
    displayName: "Patient identity",
    displayNameEn: "Patient identity",
    documentCategory: "identity_and_access",
    credentialStatus: "active",
    credentialData: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:credential:credential-1",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: { id: issuerDid },
      credentialSubject: { id: holderDid },
    },
    proof: {
      type: "jwt",
      jwt,
      alg: "ES256",
      kid: `${issuerDid}#active-key`,
      issuer: issuerDid,
    },
    selectiveDisclosure: null,
    issuerDid,
    issuerHospitalName: "TrustCare Central Hospital",
    holderDid,
    sourceSystem: "trustcare_portal",
    lineageKey: "lineage:credential-1",
    version: "1",
    contentHash,
    issuedAt: "2026-07-11T09:00:00.000Z",
    expiresAt: "2027-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T09:01:00.000Z",
    deliveryState: "signed",
    renderer: {
      authority: "trustcare_wallet",
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      inspectedBaselineCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      compatibilityGate: "contract_and_schema_version",
      renderVersion: "2.0",
    },
  };
  const evidence: WalletExchangeIssuerEvidence = {
    hospitalCode: "TCC",
    expectedIssuerDid: issuerDid,
    didDocumentId: issuerDid,
    credentialIssuerDid: issuerDid,
    proofVerified: true,
    issuerActive: true,
    checkedAt: "2026-07-11T09:01:30.000Z",
  };
  return {
    eventId: "event-upsert-1",
    type: "credential.upsert",
    credentialId: "credential-1",
    status: "active",
    occurredAt: "2026-07-11T09:02:00.000Z",
    contentHash,
    credential,
    issuerEvidence: evidence,
    document: document({
      id: "document-1",
      ownerDid: holderDid,
      issuer: issuerDid,
      jwt,
    }),
  };
}

function document(input: {
  id: string;
  ownerDid: string;
  issuer: string;
  jwt?: string;
}): WalletDocumentRecordV2 {
  return {
    schemaVersion: "2.0",
    id: input.id,
    owner: { id: input.ownerDid, holderDid: input.ownerDid },
    documentType: "patient_identity",
    category: "identity_and_access",
    title: { th: "บัตรประจำตัวผู้ป่วย", en: "Patient identity" },
    clinicalContext: { recordTime: "2026-07-11T09:00:00.000Z" },
    lifecycle: {
      status: "final",
      versionId: "1",
      issuedAt: "2026-07-11T09:00:00.000Z",
      updatedAt: "2026-07-11T09:01:00.000Z",
      expiresAt: "2027-07-11T09:00:00.000Z",
    },
    provenance: {
      sourceKind: "trustcare_portal",
      issuerDid: input.issuer,
      issuerName: "TrustCare Central Hospital",
      sourceEndpoint: `${portalOrigin}/api/wallet/v2/credentials/sync`,
      receivedAt: "2026-07-11T09:02:00.000Z",
    },
    content: {
      credentialPayload: {
        id: `urn:credential:${input.id}`,
        issuer: { id: input.issuer },
        credentialSubject: { id: input.ownerDid },
      },
      documentReference: {
        resourceType: "DocumentReference",
        id: `reference-${input.id}`,
        status: "current",
        content: [],
      },
      originalAttachments: [],
    },
    credential: {
      credentialType: "PatientIdentityCredential",
      format: "vc+jwt",
      credentialId: "credential-1",
      jwt: input.jwt ?? "legacy.jwt.signature",
    },
    trust: {
      state: "issuer_signed_untrusted",
      checks: [
        { key: "proof", status: "passed" },
        { key: "issuer", status: "passed" },
        { key: "status", status: "passed" },
      ],
    },
    privacy: { defaultDisclosure: "ask", selectivelyDisclosableFields: [] },
    local: { pinned: false, availableOffline: true },
  };
}

class MemoryWalletExchangeStorage implements IndexedDbWalletExchangeStorage {
  private stores = createStores();
  private failStore: IndexedDbWalletExchangeStoreName | undefined;

  failNextPut(store: IndexedDbWalletExchangeStoreName): void {
    this.failStore = store;
  }

  seed(
    store: IndexedDbWalletExchangeStoreName,
    key: string,
    value: unknown,
  ): void {
    this.stores.get(store)!.set(key, clone(value));
  }

  async transaction<T>(
    _stores: readonly IndexedDbWalletExchangeStoreName[],
    mode: IndexedDbWalletExchangeTransactionMode,
    operation: (transaction: IndexedDbWalletExchangeTransaction) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStores(this.stores);
    const transaction: IndexedDbWalletExchangeTransaction = {
      get: async <Value>(
        store: IndexedDbWalletExchangeStoreName,
        key: string,
      ) => clone(draft.get(store)!.get(key) as Value | undefined),
      getAll: async <Value>(store: IndexedDbWalletExchangeStoreName) =>
        clone(Array.from(draft.get(store)!.values()) as Value[]),
      put: (store, key, value) => {
        if (this.failStore === store) {
          this.failStore = undefined;
          throw new Error(`injected ${store} put failure`);
        }
        draft.get(store)!.set(key, clone(value));
      },
      delete: (store, key) => {
        draft.get(store)!.delete(key);
      },
    };
    const result = await operation(transaction);
    if (mode === "readwrite") this.stores = draft;
    return result;
  }
}

function createStores(): Map<
  IndexedDbWalletExchangeStoreName,
  Map<string, unknown>
> {
  return new Map(
    [
      "exchange_state",
      "documents",
      "holder_keys",
      "request_links",
      "submission_links",
      "submission_outbox",
    ].map((name) => [name, new Map<string, unknown>()]),
  ) as Map<IndexedDbWalletExchangeStoreName, Map<string, unknown>>;
}

function cloneStores(
  source: Map<IndexedDbWalletExchangeStoreName, Map<string, unknown>>,
): Map<IndexedDbWalletExchangeStoreName, Map<string, unknown>> {
  const cloned = createStores();
  for (const [store, values] of source) {
    for (const [key, value] of values)
      cloned.get(store)!.set(key, clone(value));
  }
  return cloned;
}

function clone<T>(value: T): T {
  return value === undefined ? value : globalThis.structuredClone(value);
}
