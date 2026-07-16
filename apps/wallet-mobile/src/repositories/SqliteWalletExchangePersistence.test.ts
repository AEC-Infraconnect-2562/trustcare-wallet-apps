import { describe, expect, it } from "vitest";
import type { WalletExchangeShlAssociationRecord } from "@trustcare/api-client/walletExchangeWorkflow";
import {
  applyWalletExchangeAckReceipt,
  prepareWalletExchangeCredentialReverification,
  prepareWalletExchangeSyncCommit,
  type WalletDocumentRecordV2,
  type WalletExchangeIssuerEvidence,
  type WalletExchangePreparedSyncPage,
  type WalletExchangePreparedUpsertChange,
  type WalletClinicalDocumentGraphState,
  type WalletClinicalDocumentGraphSyncReduction,
  type WalletAvatarAssetRecord,
} from "@trustcare/wallet-core";
import {
  MOBILE_HOLDER_KEY_PERSISTENCE_AVAILABLE,
  MOBILE_WALLET_EXCHANGE_SCHEMA,
  SqliteWalletExchangePersistence,
  type MobileWalletExchangeStorage,
  type MobileWalletExchangeStoreName,
  type MobileWalletExchangeTransaction,
  type MobileWalletExchangeTransactionMode,
} from "./SqliteWalletExchangePersistence";

const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";
const holderDid = "did:key:z6MkhWalletExchangeMobileHolder";
const issuerDid =
  "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";
const contentHash = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

describe("SqliteWalletExchangePersistence", () => {
  it("atomically persists verifier-profile migration in the holder partition", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const current = await persistence.loadOrCreateState();
    const { credentialVerificationProfile: _profile, ...legacyFields } = current;
    const legacy = {
      ...legacyFields,
      nextCursor: "opaque-legacy-cursor",
    } as typeof current;
    storage.seed("exchange_state", current.partition.key, {
      partitionKey: current.partition.key,
      schema: MOBILE_WALLET_EXCHANGE_SCHEMA,
      value: legacy,
    });
    const migrated = prepareWalletExchangeCredentialReverification(legacy);

    await persistence.persistCredentialReverificationState(legacy, migrated);

    await expect(repository(storage).loadState()).resolves.toEqual(migrated);
    await expect(repository(storage).listDocuments()).resolves.toEqual([]);
  });

  it("commits graph objects and opaque cursor in one SQLCipher transaction", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const initial = await persistence.loadOrCreateClinicalDocumentGraphState();
    const reduction = graphReduction(initial);

    storage.failNextPut("clinical_graph_cursors");
    await expect(
      persistence.commitClinicalDocumentGraphReduction(reduction),
    ).rejects.toThrow("injected clinical_graph_cursors put failure");
    await expect(
      persistence.loadOrCreateClinicalDocumentGraphState(),
    ).resolves.toEqual(initial);

    await persistence.commitClinicalDocumentGraphReduction(reduction);
    await expect(
      repository(storage).loadOrCreateClinicalDocumentGraphState(),
    ).resolves.toEqual(reduction.state);
  });

  it("persists avatar replacement and history atomically without replay duplicates", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const persistence = repository(storage);
    const first = avatarAsset(
      "2026-07-14T10:00:00.000Z",
      `sha256:${"1".repeat(64)}`,
    );
    await persistence.saveAvatarAsset(first);
    await persistence.saveAvatarAsset({
      ...first,
      fetchedAt: "2026-07-14T10:05:00.000Z",
    });
    expect(await persistence.listAvatarHistory(first.binding)).toEqual([]);

    const second = avatarAsset(
      "2026-07-14T11:00:00.000Z",
      `sha256:${"2".repeat(64)}`,
    );
    storage.failNextPut("avatar_current");
    await expect(persistence.saveAvatarAsset(second)).rejects.toThrow(
      "injected avatar_current put failure",
    );
    expect(await persistence.loadAvatarAsset(first.binding)).toEqual(first);
    expect(await persistence.listAvatarHistory(first.binding)).toEqual([]);

    await persistence.saveAvatarAsset(second);
    expect(await persistence.loadAvatarAsset(first.binding)).toEqual(second);
    expect(await persistence.listAvatarHistory(first.binding)).toEqual([first]);
  });

  it("atomically rolls back documents, cursor, and pending ACK", async () => {
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

  it("recovers a committed pending ACK and persists only its receipt", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const firstProcess = repository(storage);
    const initial = await firstProcess.loadOrCreateState();
    const reduction = prepareWalletExchangeSyncCommit(initial, syncPage());
    await firstProcess.commitSyncReduction(reduction);

    const restarted = repository(storage);
    const recovered = await restarted.loadState();
    expect(recovered?.pendingAck).toEqual(reduction.plan.pendingAck);
    await expect(restarted.listDocuments()).resolves.toEqual([
      reduction.plan.documents.put[0],
    ]);

    const acknowledged = applyWalletExchangeAckReceipt(recovered!, {
      schema: "trustcare.wallet.sync-ack.v1",
      receiptId: "receipt-sync-mobile-1",
      syncId: "sync-mobile-1",
      cursor: "opaque-mobile-cursor-0001",
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

    const afterAck = await repository(storage).loadState();
    expect(afterAck?.pendingAck).toBeUndefined();
    expect(afterAck?.lastAckReceipt?.receiptId).toBe("receipt-sync-mobile-1");
    expect(afterAck?.nextCursor).toBe("opaque-mobile-cursor-0001");
  });

  it("isolates state, documents, requests, and submissions by Portal plus holder", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const holderOne = repository(storage);
    const holderTwo = new SqliteWalletExchangePersistence({
      portalOrigin,
      holderDid: "did:key:z6MkhWalletExchangeOtherMobileHolder",
      storage,
    });
    const initial = await holderOne.loadOrCreateState();
    await holderTwo.loadOrCreateState();
    await holderOne.commitSyncReduction(
      prepareWalletExchangeSyncCommit(initial, syncPage()),
    );
    await holderOne.saveCredentialRequestLink(requestLink());
    await holderOne.saveSubmissionLink(submissionLink());

    await expect(holderTwo.listDocuments()).resolves.toEqual([]);
    await expect(holderTwo.listCredentialRequestLinks()).resolves.toEqual([]);
    await expect(holderTwo.listSubmissionLinks()).resolves.toEqual([]);
    expect((await holderTwo.loadState())?.nextCursor).toBeUndefined();
  });

  it("keeps request/submission idempotency identities immutable and on the exact Portal status URL", async () => {
    const persistence = repository(new MemoryWalletExchangeStorage());
    const request = requestLink();
    await persistence.saveCredentialRequestLink(request);
    await persistence.saveCredentialRequestLink({
      ...request,
      lastKnownStatus: "approved",
      updatedAt: "2026-07-11T10:05:00.000Z",
    });
    await expect(
      persistence.saveCredentialRequestLink({
        ...request,
        requestId: "portal-request-conflict",
        statusUrl: "/api/wallet/v2/credential-requests/portal-request-conflict",
      }),
    ).rejects.toThrow("durable idempotency identity");
    await expect(
      persistence.saveSubmissionLink({
        ...submissionLink(),
        statusUrl:
          "https://attacker.invalid/api/wallet/v2/submissions/portal-submission-1",
      }),
    ).rejects.toThrow("exact Portal status endpoint");
    await expect(
      persistence.saveSubmissionLink({
        ...submissionLink(),
        statusUrl:
          "/api/wallet/v2/submissions/portal-submission-1?access=secret",
      }),
    ).rejects.toThrow("exact Portal status endpoint");
  });

  it("recovers and atomically completes exact direct-submission bytes after restart", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const first = repository(storage);
    const draft = await pendingSubmissionDraft();
    await first.savePendingSubmissionDraft(draft);

    const restarted = repository(storage);
    await expect(restarted.listPendingSubmissionDrafts()).resolves.toEqual([
      draft,
    ]);
    const link = {
      ...submissionLink(),
      clientSubmissionId: draft.clientSubmissionId,
      idempotencyKey: draft.idempotencyKey,
      intentDigest: draft.intentDigest,
      requestDigest: draft.requestDigest,
    };
    await restarted.completePendingSubmission(draft, link);
    await expect(
      restarted.getPendingSubmissionDraft(draft.clientSubmissionId),
    ).resolves.toBeNull();
    await expect(
      restarted.getSubmissionLink(draft.clientSubmissionId),
    ).resolves.toEqual(link);
  });

  it("retains exact holder VP bytes and completes an SHL association atomically", async () => {
    const storage = new MemoryWalletExchangeStorage();
    const first = repository(storage);
    const pending = shlAssociationRecord();
    await first.savePendingShlAssociation(pending);

    const restarted = repository(storage);
    await expect(
      restarted.getShlAssociation(pending.manifestCredentialId),
    ).resolves.toEqual(pending);
    const response = shlAssociationResponse(pending);
    storage.failNextPut("shl_associations");
    await expect(
      restarted.completeShlAssociation(pending, response),
    ).rejects.toThrow("injected shl_associations put failure");
    await expect(
      restarted.getShlAssociation(pending.manifestCredentialId),
    ).resolves.toEqual(pending);

    await restarted.completeShlAssociation(pending, response);
    await expect(
      restarted.getShlAssociation(pending.manifestCredentialId),
    ).resolves.toEqual({
      ...pending,
      status: "complete",
      response,
      updatedAt: response.associatedAt,
    });
  });

  it("rejects legacy issuers, patientId, tokens, and private JWK material", async () => {
    const persistence = repository(new MemoryWalletExchangeStorage());
    const initial = await persistence.loadOrCreateState();

    const legacy = prepareWalletExchangeSyncCommit(initial, syncPage());
    legacy.state.documents[0].provenance.issuerDid =
      "did:web:untrusted-issuer.example:hospital:tcc";
    legacy.plan.documents.put[0].provenance.issuerDid =
      "did:web:untrusted-issuer.example:hospital:tcc";
    await expect(persistence.commitSyncReduction(legacy)).rejects.toThrow(
      "legacy issuer fallback is forbidden",
    );

    const patient = prepareWalletExchangeSyncCommit(initial, syncPage());
    (patient.state.documents[0].owner as Record<string, unknown>).patientId =
      "P001";
    (patient.plan.documents.put[0].owner as Record<string, unknown>).patientId =
      "P001";
    await expect(persistence.commitSyncReduction(patient)).rejects.toThrow(
      "must not contain patientId",
    );

    const token = prepareWalletExchangeSyncCommit(initial, syncPage());
    (token.state as unknown as Record<string, unknown>).accessToken = "secret";
    await expect(persistence.commitSyncReduction(token)).rejects.toThrow(
      "must never store session, token, or private-key material",
    );

    const privateJwk = prepareWalletExchangeSyncCommit(initial, syncPage());
    (privateJwk.state as unknown as Record<string, unknown>).key = {
      kty: "EC",
      crv: "P-256",
      d: "private",
    };
    await expect(persistence.commitSyncReduction(privateJwk)).rejects.toThrow(
      "must never serialize a private JWK",
    );
  });

  it("fails closed instead of serializing or silently rotating the holder key", async () => {
    const persistence = repository(new MemoryWalletExchangeStorage());
    expect(MOBILE_HOLDER_KEY_PERSISTENCE_AVAILABLE).toBe(false);
    await expect(persistence.loadHolderIdentity()).rejects.toThrow(
      "non-exportable signing handle",
    );
    await expect(persistence.saveHolderIdentity({} as never)).rejects.toThrow(
      "private JWK serialization is forbidden",
    );
  });
});

function repository(storage: MobileWalletExchangeStorage) {
  const persistence = new SqliteWalletExchangePersistence({
    portalOrigin,
    holderDid,
    storage,
  });
  persistence.configureTrustedIssuers([issuerDid]);
  return persistence;
}

function requestLink() {
  return {
    clientRequestId: "client-request-1",
    requestId: "portal-request-1",
    idempotencyKey: "idempotency-request-1",
    statusUrl: "/api/wallet/v2/credential-requests/portal-request-1",
    lastKnownStatus: "pending_review",
    targetHospitalCode: "TCC" as const,
    context: "opd_visit" as const,
    purpose: "Prepare an OPD visit",
    credentialTypes: ["PatientIdentityCredential"],
    documentTypes: ["patient_identity"],
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
  };
}

function submissionLink() {
  return {
    clientSubmissionId: "client-submission-1",
    submissionId: "portal-submission-1",
    idempotencyKey: "idempotency-submission-1",
    intentDigest: `sha256:${"c".repeat(64)}` as const,
    requestDigest: `sha256:${"d".repeat(64)}` as const,
    statusUrl: "/api/wallet/v2/submissions/portal-submission-1",
    lastKnownStatus: "received",
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
  };
}

async function pendingSubmissionDraft() {
  const request = {
    clientSubmissionId: "client-submission-mobile-outbox-1",
    context: "opd_visit" as const,
    purpose: "Continue care",
    consentRef: "urn:consent:mobile-outbox:1",
    transport: {
      mode: "direct_vp" as const,
      vpJwt: "eyJhbGciOiJFUzI1NiJ9.eyJ2cCI6MX0.signature",
    },
  };
  const requestBody = JSON.stringify(request);
  return {
    schema: "trustcare.wallet.submission-outbox.v1" as const,
    clientSubmissionId: request.clientSubmissionId,
    idempotencyKey: "submission-mobile-outbox-idempotency-1",
    intentDigest: `sha256:${"e".repeat(64)}` as const,
    requestDigest: await testSha256(requestBody),
    requestBody,
    request,
    createdAt: "2026-07-11T10:00:00.000Z",
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

function syncPage(): WalletExchangePreparedSyncPage {
  return {
    schema: "trustcare.wallet.sync.v2",
    contractVersion: "2026.07.wallet-exchange.v2.1.strict-w3c",
    syncId: "sync-mobile-1",
    mode: "initial",
    nextCursor: "opaque-mobile-cursor-0001",
    hasMore: false,
    serverTime: "2026-07-11T10:00:00.000Z",
    ackIdempotencyKey: "ack-sync-mobile-1",
    changes: [signedUpsert()],
  };
}

function signedUpsert(): WalletExchangePreparedUpsertChange {
  const jwt = "eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6MX0.signature";
  const credential: WalletExchangePreparedUpsertChange["credential"] = {
    credentialId: "credential-mobile-1",
    cardType: "patient_identity",
    credentialType: "PatientIdentityCredential",
    displayName: "Patient identity",
    displayNameEn: "Patient identity",
    documentCategory: "identity_and_access",
    credentialStatus: "active",
    credentialData: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:credential:credential-mobile-1",
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
    issuerDid,
    issuerHospitalName: "TrustCare Central Hospital",
    holderDid,
    sourceSystem: "trustcare_portal",
    lineageKey: "lineage:credential-mobile-1",
    version: "1",
    contentHash,
    issuedAt: "2026-07-11T09:00:00.000Z",
    expiresAt: "2027-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T09:01:00.000Z",
    deliveryState: "signed",
    renderer: {
      authority: "trustcare_wallet",
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      referenceCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      referenceCommitRole: "provenance_only",
      compatibilityGate: "contract_profile_and_schema",
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
    eventId: "event-mobile-upsert-1",
    type: "credential.upsert",
    credentialId: "credential-mobile-1",
    status: "active",
    occurredAt: "2026-07-11T09:02:00.000Z",
    contentHash,
    credential,
    issuerEvidence: evidence,
    document: document(jwt),
  };
}

function document(jwt: string): WalletDocumentRecordV2 {
  return {
    schemaVersion: "2.0",
    id: "document-mobile-1",
    owner: { id: holderDid, holderDid },
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
      issuerDid,
      issuerName: "TrustCare Central Hospital",
      sourceEndpoint: `${portalOrigin}/api/wallet/v2/credentials/sync`,
      receivedAt: "2026-07-11T09:02:00.000Z",
    },
    content: {
      credentialPayload: {
        id: "urn:credential:credential-mobile-1",
        issuer: { id: issuerDid },
        credentialSubject: { id: holderDid },
      },
      documentReference: {
        resourceType: "DocumentReference",
        id: "reference-document-mobile-1",
        status: "current",
        content: [],
      },
      originalAttachments: [],
    },
    credential: {
      credentialType: "PatientIdentityCredential",
      format: "vc+jwt",
      credentialId: "credential-mobile-1",
      jwt,
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

function graphReduction(
  initial: WalletClinicalDocumentGraphState,
): WalletClinicalDocumentGraphSyncReduction {
  const occurredAt = "2026-07-13T03:00:00.000Z";
  const contentHash = `sha256:${"9".repeat(64)}` as `sha256:${string}`;
  const state: WalletClinicalDocumentGraphState = {
    ...initial,
    nextCursor: "opaque-graph-cursor-1",
    nodes: [
      {
        artifactId: "urn:trustcare:artifact:document-1",
        artifactType: "clinical-document",
        semanticClass: "clinical_document",
        lifecycleStatus: "active",
        versionId: "version-1",
        contentHash,
        profileUris: ["urn:trustcare:schema:clinical-document"],
        retrievable: true,
        object: {
          objectId: "urn:trustcare:object:document-1",
          mediaType: "application/fhir+json",
          schemaId: "urn:trustcare:schema:clinical-document",
          schemaVersion: "2.0.0",
          profileUris: ["urn:trustcare:schema:clinical-document"],
          contentHash,
          canonicalization: "JCS",
          location: "https://portal.example/objects/document-1",
          requiredFields: ["issuer"],
          extensions: { tenantReference: "hospital:1" },
        },
        occurredAt,
        trustState: "organization_attested",
      },
    ],
    changes: [
      {
        changeId: "graph-change-1",
        changeSetId: "graph-change-set-1",
        changeSetIdempotencyKey: "graph-idempotency-1",
        sequence: 1,
        occurredAt,
        outcome: "applied",
      },
    ],
    lastChangeSetId: "graph-change-set-1",
    lastCorrelationId: "correlation-graph-1",
    lastSyncedAt: occurredAt,
  };
  return {
    state,
    plan: {
      expectedCursor: initial.nextCursor,
      nextCursor: "opaque-graph-cursor-1",
      changeSetId: "graph-change-set-1",
      replayed: false,
      appliedChangeIds: ["graph-change-1"],
      quarantinedChangeIds: [],
    },
  };
}

function shlAssociationRecord(): WalletExchangeShlAssociationRecord {
  return {
    schema: "trustcare.wallet.shl-association-outbox.v1",
    manifestCredentialId: "urn:credential:manifest:42",
    shlId: 42,
    clientAssociationId: "wallet-shl-association-42",
    consentRef: "urn:consent:shl:42",
    idempotencyKey: "shl-association-idempotency-42",
    holderPresentationId: "urn:uuid:holder-presentation-42",
    holderVpJwt: "eyJhbGciOiJFUzI1NiJ9.eyJ2cCI6MX0.signature",
    requestDigest: `sha256:${"f".repeat(64)}`,
    status: "pending",
    createdAt: "2026-07-11T11:00:00.000Z",
    updatedAt: "2026-07-11T11:00:00.000Z",
  };
}

function shlAssociationResponse(
  pending: WalletExchangeShlAssociationRecord,
): NonNullable<WalletExchangeShlAssociationRecord["response"]> {
  return {
    schema: "trustcare.wallet.shl-association.v2",
    shlId: pending.shlId,
    packageId: String(pending.shlId),
    status: "active",
    trustLevel: "hospital_certified",
    appId: "trustcare-wallet-test",
    manifestCredentialId: pending.manifestCredentialId,
    manifestHash: `sha256:${"a".repeat(64)}`,
    sourceBundleHash: `sha256:${"b".repeat(64)}`,
    holderPresentationId: pending.holderPresentationId,
    holderPresentationJwt: pending.holderVpJwt,
    holderPresentationDigest: `sha256:${"c".repeat(64)}`,
    holderDid,
    consentRef: pending.consentRef,
    context: "opd_visit",
    purpose: "patient_summary",
    recipient: "did:web:portal.example.test:issuers:TCC",
    audience: "https://portal.example.test/api/wallet/v2/shl-associations/42",
    associatedAt: "2026-07-11T11:00:01.000Z",
    issuedAt: "2026-07-11T11:00:00.000Z",
    expiresAt: "2026-07-11T12:00:00.000Z",
    lifecycle: {
      status: "active",
      effectiveAt: "2026-07-11T11:00:01.000Z",
      reasonCode: null,
    },
    idempotent: false,
  };
}

function avatarAsset(
  fetchedAt: string,
  hash: `sha256:${string}`,
): WalletAvatarAssetRecord {
  return {
    schema: "trustcare.wallet.avatar.v1",
    binding: {
      walletUserId: "demo-patient-001",
      holderDid,
      credentialSubjectId: holderDid,
    },
    status: "ready",
    sourceUrl: `https://portal.example/avatar-${hash.slice(7, 8)}.jpg`,
    sourceCredentialId: "credential-1",
    sourceDocumentId: "document-1",
    mediaType: "image/jpeg",
    httpStatus: 200,
    fetchedAt,
    localSha256: hash,
    proofScope: "cache_integrity_only",
    contentBase64: "AQID",
  };
}

class MemoryWalletExchangeStorage implements MobileWalletExchangeStorage {
  private stores = createStores();
  private failStore: MobileWalletExchangeStoreName | undefined;

  failNextPut(store: MobileWalletExchangeStoreName): void {
    this.failStore = store;
  }

  seed(store: MobileWalletExchangeStoreName, key: string, value: unknown): void {
    this.stores.get(store)!.set(key, clone(value));
  }

  async transaction<T>(
    mode: MobileWalletExchangeTransactionMode,
    operation: (transaction: MobileWalletExchangeTransaction) => Promise<T>,
  ): Promise<T> {
    const draft = cloneStores(this.stores);
    const transaction: MobileWalletExchangeTransaction = {
      get: async <Value>(store: MobileWalletExchangeStoreName, key: string) =>
        clone(draft.get(store)!.get(key) as Value | undefined),
      getAll: async <Value>(
        store: MobileWalletExchangeStoreName,
        partitionKey: string,
      ) =>
        clone(
          Array.from(draft.get(store)!.values()).filter(
            (value) =>
              (value as { partitionKey?: string }).partitionKey ===
              partitionKey,
          ) as Value[],
        ),
      put: async (store, key, value) => {
        if (this.failStore === store) {
          this.failStore = undefined;
          throw new Error(`injected ${store} put failure`);
        }
        draft.get(store)!.set(key, clone(value));
      },
      delete: async (store, key) => {
        draft.get(store)!.delete(key);
      },
    };
    const result = await operation(transaction);
    if (mode === "readwrite") this.stores = draft;
    return result;
  }
}

function createStores(): Map<
  MobileWalletExchangeStoreName,
  Map<string, unknown>
> {
  return new Map(
    [
      "exchange_state",
      "documents",
      "request_links",
      "submission_links",
      "submission_outbox",
      "shl_associations",
      "clinical_graph_objects",
      "clinical_graph_edges",
      "clinical_bundle_members",
      "clinical_graph_changes",
      "clinical_graph_cursors",
      "clinical_graph_quarantine",
      "avatar_current",
      "avatar_history",
    ].map((name) => [name, new Map<string, unknown>()]),
  ) as Map<MobileWalletExchangeStoreName, Map<string, unknown>>;
}

function cloneStores(
  source: Map<MobileWalletExchangeStoreName, Map<string, unknown>>,
): Map<MobileWalletExchangeStoreName, Map<string, unknown>> {
  const cloned = createStores();
  for (const [store, values] of source) {
    for (const [key, value] of values) {
      cloned.get(store)!.set(key, clone(value));
    }
  }
  return cloned;
}

function clone<T>(value: T): T {
  return value === undefined ? value : globalThis.structuredClone(value);
}
