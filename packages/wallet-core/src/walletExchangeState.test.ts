import { describe, expect, it } from "vitest";
import type {
  WalletSyncAck,
  WalletSyncStatusChange,
  WalletSyncedCredential,
} from "@trustcare/contracts";
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";
import {
  applyWalletExchangeAckReceipt,
  beginWalletExchangeRetryAttempt,
  completeWalletExchangeRetry,
  createWalletExchangePartition,
  createWalletExchangeState,
  dueWalletExchangeRetries,
  enqueueWalletExchangeRetry,
  prepareWalletExchangeSyncCommit,
  scheduleWalletExchangeRetry,
  type WalletExchangeIssuerEvidence,
  type WalletExchangePreparedSyncPage,
  type WalletExchangePreparedUpsertChange,
  type WalletExchangeState,
} from "./walletExchangeState";

const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";
const holderDid = "did:key:z6MkhWalletExchangeHolder";
const liveIssuerDid =
  "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";
const hashA = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
const hashB = `sha256:${"b".repeat(64)}` as `sha256:${string}`;

describe("Wallet Exchange V2 state", () => {
  it("partitions durable state by normalized Portal origin and holder did:key", () => {
    const partition = createWalletExchangePartition({
      portalOrigin: `${portalOrigin}/api/wallet/v2/`,
      holderDid,
    });
    expect(partition.portalOrigin).toBe(portalOrigin);
    expect(partition.key).toContain(encodeURIComponent(holderDid));
    expect(
      createWalletExchangePartition({
        portalOrigin,
        holderDid: "did:key:z6MkhAnotherHolder",
      }).key,
    ).not.toBe(partition.key);
    expect(() =>
      createWalletExchangePartition({
        portalOrigin: "http://portal.example.test",
        holderDid,
      }),
    ).toThrow("HTTPS");
    expect(() =>
      createWalletExchangePartition({
        portalOrigin,
        holderDid: "did:web:wallet.example.test",
      }),
    ).toThrow("did:key");
  });

  it("creates one atomic commit plan before ACKing a signed live-issuer credential", () => {
    const state = createWalletExchangeState({ portalOrigin, holderDid });
    const change = signedUpsert({
      eventId: "wce_upsert_1",
      credentialId: "credential-1",
      documentId: "document-1",
      version: "1",
      contentHash: hashA,
    });
    const reduced = prepareWalletExchangeSyncCommit(
      state,
      page({ syncId: "sync_initial_1", changes: [change] }),
    );

    expect(reduced.plan).toMatchObject({
      partitionKey: state.partition.key,
      expectedCursor: undefined,
      nextCursor: cursor("1"),
      replayed: false,
      documents: { deleteIds: [] },
      pendingAck: {
        syncId: "sync_initial_1",
        cursor: cursor("1"),
        idempotencyKey: "ack-sync-initial-1",
        results: [{ eventId: "wce_upsert_1", outcome: "applied" }],
      },
    });
    expect(reduced.plan.documents.put).toEqual([change.document]);
    expect(reduced.plan.events.put[0]).toMatchObject({
      eventId: "wce_upsert_1",
      ordinal: 1,
      outcome: "applied",
    });
    expect(reduced.state.nextCursor).toBe(cursor("1"));
    expect(reduced.state.pendingAck).toEqual(reduced.plan.pendingAck);
    expect(reduced.state.documents).toEqual([change.document]);

    expect(() =>
      applyWalletExchangeAckReceipt(reduced.state, {
        ...ack("sync_initial_1", "receipt-wrong-summary"),
        cursor: cursor("1"),
        summary: {
          applied: 0,
          alreadyCurrent: 1,
          archived: 0,
          rejected: 0,
        },
      }),
    ).toThrow("summary");

    const acknowledged = applyWalletExchangeAckReceipt(reduced.state, {
      ...ack("sync_initial_1", "receipt-1"),
      cursor: cursor("1"),
    });
    expect(acknowledged.pendingAck).toBeUndefined();
    expect(acknowledged.lastAckReceipt).toMatchObject({
      receiptId: "receipt-1",
      syncId: "sync_initial_1",
      cursor: cursor("1"),
    });
  });

  it("preserves response order while deduplicating an already applied event", () => {
    const initial = commitAndAck(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({
        syncId: "sync_order_initial",
        changes: [
          signedUpsert({
            eventId: "wce_order_1",
            credentialId: "credential-order-1",
            documentId: "document-order-1",
            version: "1",
            contentHash: hashA,
          }),
        ],
      }),
    );
    const replay = signedUpsert({
      eventId: "wce_order_1",
      credentialId: "credential-order-1",
      documentId: "document-order-1",
      version: "1",
      contentHash: hashA,
    });
    const unsigned = unsignedUpsert({
      eventId: "wce_order_2",
      credentialId: "credential-order-2",
      contentHash: hashB,
    });
    const delta = prepareWalletExchangeSyncCommit(
      initial,
      page({
        syncId: "sync_order_delta",
        mode: "delta",
        requestCursor: cursor("1"),
        nextCursor: cursor("2"),
        ackIdempotencyKey: "ack-sync-order-delta",
        changes: [replay, unsigned],
      }),
    );

    expect(delta.plan.pendingAck.results).toEqual([
      { eventId: "wce_order_1", outcome: "already_current" },
      {
        eventId: "wce_order_2",
        outcome: "rejected",
        reasonCode: "unsigned_metadata",
      },
    ]);
    expect(delta.plan.events.put).toHaveLength(1);
    expect(delta.plan.events.put[0]).toMatchObject({
      eventId: "wce_order_2",
      ordinal: 2,
      outcome: "rejected",
    });
    expect(delta.state.documents).toHaveLength(1);
  });

  it("quarantines unsigned metadata instead of persisting it as a credential", () => {
    const change = unsignedUpsert({
      eventId: "wce_unsigned_1",
      credentialId: "credential-unsigned",
      contentHash: hashA,
    });
    const reduced = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({ syncId: "sync_unsigned", changes: [change] }),
    );
    expect(reduced.state.documents).toEqual([]);
    expect(reduced.state.quarantine).toEqual([
      expect.objectContaining({
        eventId: "wce_unsigned_1",
        reason: "unsigned_metadata",
        holderDid,
      }),
    ]);
    expect(reduced.plan.pendingAck.results).toEqual([
      {
        eventId: "wce_unsigned_1",
        outcome: "rejected",
        reasonCode: "unsigned_metadata",
      },
    ]);
  });

  it("rejects old or conflicting issuer DIDs until the live Portal reissues", () => {
    const oldIssuerDid = "did:web:trustcare.network:hospital:tcc";
    const change = signedUpsert({
      eventId: "wce_old_issuer",
      credentialId: "credential-old-issuer",
      documentId: "document-old-issuer",
      version: "1",
      contentHash: hashA,
      issuerDid: oldIssuerDid,
      issuerEvidence: {
        ...issuerEvidence(liveIssuerDid),
        credentialIssuerDid: oldIssuerDid,
      },
    });
    const reduced = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({ syncId: "sync_old_issuer", changes: [change] }),
    );
    expect(reduced.state.documents).toEqual([]);
    expect(reduced.state.quarantine[0]).toMatchObject({
      reason: "issuer_conflict",
      issuerDid: oldIssuerDid,
    });
    expect(reduced.plan.pendingAck.results[0]).toMatchObject({
      outcome: "rejected",
      reasonCode: "issuer_conflict",
    });
  });

  it("rejects Portal patientId and holder-boundary violations", () => {
    const patientIdChange = signedUpsert({
      eventId: "wce_patient_id",
      credentialId: "credential-patient-id",
      documentId: "document-patient-id",
      version: "1",
      contentHash: hashA,
    });
    patientIdChange.document = {
      ...patientIdChange.document!,
      owner: {
        ...patientIdChange.document!.owner,
        patientId: "portal-internal-42",
      },
    };
    const patientId = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({ syncId: "sync_patient_id", changes: [patientIdChange] }),
    );
    expect(patientId.state.quarantine[0]?.reason).toBe(
      "portal_patient_id_forbidden",
    );

    const wrongHolder = signedUpsert({
      eventId: "wce_wrong_holder",
      credentialId: "credential-wrong-holder",
      documentId: "document-wrong-holder",
      version: "1",
      contentHash: hashA,
    });
    wrongHolder.credential = {
      ...wrongHolder.credential,
      holderDid: "did:key:z6MkhWrongHolder",
    };
    const holder = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({ syncId: "sync_wrong_holder", changes: [wrongHolder] }),
    );
    expect(holder.state.quarantine[0]?.reason).toBe("holder_mismatch");
  });

  it("archives every prior version while keeping one active lineage", () => {
    const versionOne = signedUpsert({
      eventId: "wce_version_1",
      credentialId: "credential-v1",
      documentId: "document-v1",
      lineageKey: "lineage-versioned",
      version: "1",
      contentHash: hashA,
    });
    const first = commitAndAck(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({ syncId: "sync_version_1", changes: [versionOne] }),
    );
    const versionTwo = signedUpsert({
      eventId: "wce_version_2",
      credentialId: "credential-v2",
      documentId: "document-v2",
      lineageKey: "lineage-versioned",
      version: "2",
      contentHash: hashB,
    });
    const second = prepareWalletExchangeSyncCommit(
      first,
      page({
        syncId: "sync_version_2",
        mode: "delta",
        requestCursor: cursor("1"),
        nextCursor: cursor("2"),
        ackIdempotencyKey: "ack-sync-version-2",
        changes: [versionTwo],
      }),
    );

    expect(second.state.documents.map((item) => item.id)).toEqual([
      "document-v2",
    ]);
    expect(second.plan.documents.deleteIds).toEqual(["document-v1"]);
    expect(second.state.history).toEqual([
      expect.objectContaining({
        credentialId: "credential-v1",
        reason: "replaced_by_version",
        replacedByDocumentId: "document-v2",
        document: versionOne.document,
      }),
    ]);
    expect(second.state.lineages).toEqual([
      expect.objectContaining({
        lineageKey: "lineage-versioned",
        activeDocumentId: "document-v2",
        credentialId: "credential-v2",
        version: "2",
      }),
    ]);
  });

  it("applies suspended/revoked/expired status without deleting history", () => {
    const first = commitAndAck(
      createWalletExchangeState({ portalOrigin, holderDid }),
      page({
        syncId: "sync_status_initial",
        changes: [
          signedUpsert({
            eventId: "wce_status_upsert",
            credentialId: "credential-status",
            documentId: "document-status",
            version: "1",
            contentHash: hashA,
          }),
        ],
      }),
    );
    const status: WalletSyncStatusChange = {
      eventId: "wce_status_revoked",
      type: "credential.status",
      credentialId: "credential-status",
      status: "revoked",
      occurredAt: "2026-07-11T10:02:00.000Z",
      lifecycle: {
        effectiveAt: "2026-07-11T10:01:30.000Z",
        reasonCode: "issuer_revoked",
      },
    };
    const reduced = prepareWalletExchangeSyncCommit(
      first,
      page({
        syncId: "sync_status_delta",
        mode: "delta",
        requestCursor: cursor("1"),
        nextCursor: cursor("2"),
        ackIdempotencyKey: "ack-sync-status-delta",
        changes: [status],
      }),
    );

    expect(reduced.state.documents[0]).toMatchObject({
      lifecycle: { status: "revoked" },
      trust: { state: "revoked", verifiedAt: undefined },
    });
    expect(reduced.state.history[0]).toMatchObject({
      reason: "lifecycle_status_changed",
      lifecycleStatus: "revoked",
      document: { lifecycle: { status: "final", versionId: "1" } },
    });
    expect(reduced.plan.pendingAck.results).toEqual([
      {
        eventId: "wce_status_revoked",
        outcome: "archived",
        reasonCode: "issuer_revoked",
      },
    ]);
  });

  it("requires the previous atomic page to be ACKed and replays its plan safely", () => {
    const syncPage = page({
      syncId: "sync_pending_ack",
      changes: [
        signedUpsert({
          eventId: "wce_pending_ack",
          credentialId: "credential-pending-ack",
          documentId: "document-pending-ack",
          version: "1",
          contentHash: hashA,
        }),
      ],
    });
    const first = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid }),
      syncPage,
    );
    const replay = prepareWalletExchangeSyncCommit(first.state, syncPage);
    expect(replay.state).toBe(first.state);
    expect(replay.plan.replayed).toBe(true);
    expect(replay.plan.documents.put).toEqual([]);
    expect(replay.plan.pendingAck).toEqual(first.plan.pendingAck);

    expect(() =>
      prepareWalletExchangeSyncCommit(
        first.state,
        page({
          syncId: "sync_different",
          mode: "delta",
          requestCursor: cursor("1"),
          nextCursor: cursor("2"),
          ackIdempotencyKey: "ack-sync-different",
          changes: [],
        }),
      ),
    ).toThrow("must ACK");
  });

  it("keeps one idempotency identity while requiring a fresh transport attempt", () => {
    const initial = createWalletExchangeState({ portalOrigin, holderDid });
    const queued = enqueueWalletExchangeRetry(initial, {
      operationId: "submission-client-1",
      operation: "submission",
      idempotencyKey: "submission-client-1",
      requestDigest: hashA,
      createdAt: "2026-07-11T11:00:00.000Z",
    });
    expect(
      enqueueWalletExchangeRetry(queued, {
        operationId: "submission-client-1",
        operation: "submission",
        idempotencyKey: "submission-client-1",
        requestDigest: hashA,
        createdAt: "2026-07-11T11:00:00.000Z",
      }),
    ).toBe(queued);
    expect(() =>
      enqueueWalletExchangeRetry(queued, {
        operationId: "submission-client-2",
        operation: "submission",
        idempotencyKey: "submission-client-1",
        requestDigest: hashB,
        createdAt: "2026-07-11T11:00:00.000Z",
      }),
    ).toThrow("reused");

    const inFlight = beginWalletExchangeRetryAttempt(queued, {
      operationId: "submission-client-1",
      transportAttemptId: "dpop-jti-attempt-1",
      attemptedAt: "2026-07-11T11:00:01.000Z",
    });
    const scheduled = scheduleWalletExchangeRetry(inFlight, {
      operationId: "submission-client-1",
      retryAt: "2026-07-11T11:00:10.000Z",
      updatedAt: "2026-07-11T11:00:02.000Z",
      errorCode: "session_expired",
      httpStatus: 401,
    });
    expect(scheduled.retryJournal[0]).toMatchObject({
      idempotencyKey: "submission-client-1",
      requestDigest: hashA,
      state: "retry_scheduled",
      attemptCount: 1,
    });
    expect(
      dueWalletExchangeRetries(scheduled, new Date("2026-07-11T11:00:10.000Z")),
    ).toHaveLength(1);
    expect(() =>
      beginWalletExchangeRetryAttempt(scheduled, {
        operationId: "submission-client-1",
        transportAttemptId: "dpop-jti-attempt-1",
        attemptedAt: "2026-07-11T11:00:11.000Z",
      }),
    ).toThrow("new DPoP proof");

    const retried = beginWalletExchangeRetryAttempt(scheduled, {
      operationId: "submission-client-1",
      transportAttemptId: "dpop-jti-attempt-2",
      attemptedAt: "2026-07-11T11:00:11.000Z",
    });
    const done = completeWalletExchangeRetry(retried, {
      operationId: "submission-client-1",
      completedAt: "2026-07-11T11:00:12.000Z",
    });
    expect(done.retryJournal[0]).toMatchObject({
      idempotencyKey: "submission-client-1",
      state: "succeeded",
      attemptCount: 2,
      transportAttemptIds: ["dpop-jti-attempt-1", "dpop-jti-attempt-2"],
    });
  });
});

function signedUpsert(input: {
  eventId: string;
  credentialId: string;
  documentId: string;
  version: string;
  contentHash: string;
  lineageKey?: string;
  issuerDid?: string;
  issuerEvidence?: WalletExchangeIssuerEvidence;
}): WalletExchangePreparedUpsertChange {
  const issuerDid = input.issuerDid ?? liveIssuerDid;
  const jwt = "eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6MX0.signature";
  const credential: WalletSyncedCredential = {
    credentialId: input.credentialId,
    cardType: "patient_identity",
    credentialType: "PatientIdentityCredential",
    displayName: "Patient identity",
    displayNameEn: "Patient identity",
    documentCategory: "identity_and_access",
    credentialStatus: "active",
    credentialData: credentialPayload(input.credentialId, issuerDid),
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
    lineageKey: input.lineageKey ?? `lineage:${input.credentialId}`,
    version: input.version,
    contentHash: input.contentHash,
    issuedAt: "2026-07-11T09:00:00.000Z",
    expiresAt: "2027-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T09:01:00.000Z",
    deliveryState: "signed",
    renderer: {
      authority: "trustcare_wallet",
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      referenceCommit: "41175474e8c0214587a7c8dca1209b49bd2f43c8",
      renderVersion: "2.0",
    },
  };
  return {
    eventId: input.eventId,
    type: "credential.upsert",
    credentialId: input.credentialId,
    status: "active",
    occurredAt: "2026-07-11T09:02:00.000Z",
    contentHash: input.contentHash,
    credential,
    issuerEvidence: input.issuerEvidence ?? issuerEvidence(issuerDid),
    document: document({
      id: input.documentId,
      credentialId: input.credentialId,
      version: input.version,
      jwt,
      issuerDid,
    }),
  };
}

function unsignedUpsert(input: {
  eventId: string;
  credentialId: string;
  contentHash: string;
}): WalletExchangePreparedUpsertChange {
  return {
    eventId: input.eventId,
    type: "credential.upsert",
    credentialId: input.credentialId,
    status: "active",
    occurredAt: "2026-07-11T09:03:00.000Z",
    contentHash: input.contentHash,
    credential: {
      credentialId: input.credentialId,
      cardType: "patient_summary",
      credentialType: "PatientSummaryCredential",
      displayName: "Unsigned patient summary metadata",
      displayNameEn: null,
      documentCategory: "clinical_summary",
      credentialStatus: "active",
      credentialData: null,
      proof: null,
      selectiveDisclosure: null,
      issuerDid: null,
      issuerHospitalName: null,
      holderDid,
      sourceSystem: "trustcare_portal",
      lineageKey: `lineage:${input.credentialId}`,
      version: "1",
      contentHash: input.contentHash,
      issuedAt: "2026-07-11T09:00:00.000Z",
      expiresAt: null,
      updatedAt: "2026-07-11T09:01:00.000Z",
      deliveryState: "unsigned_metadata",
      renderer: {
        authority: "trustcare_wallet",
        repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
        referenceCommit: "41175474e8c0214587a7c8dca1209b49bd2f43c8",
        renderVersion: "2.0",
      },
    },
  };
}

function issuerEvidence(issuerDid: string): WalletExchangeIssuerEvidence {
  return {
    hospitalCode: "TCC",
    expectedIssuerDid: issuerDid,
    didDocumentId: issuerDid,
    credentialIssuerDid: issuerDid,
    proofVerified: true,
    issuerActive: true,
    checkedAt: "2026-07-11T09:01:30.000Z",
  };
}

function credentialPayload(credentialId: string, issuerDid: string) {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: `urn:credential:${credentialId}`,
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: { id: issuerDid },
    credentialSubject: { id: holderDid },
  };
}

function document(input: {
  id: string;
  credentialId: string;
  version: string;
  jwt: string;
  issuerDid: string;
}): WalletDocumentRecordV2 {
  return {
    schemaVersion: "2.0",
    id: input.id,
    owner: { id: holderDid, holderDid },
    documentType: "patient_identity",
    category: "identity_and_access",
    title: { th: "บัตรประจำตัวผู้ป่วย", en: "Patient identity" },
    clinicalContext: { recordTime: "2026-07-11T09:00:00.000Z" },
    lifecycle: {
      status: "final",
      versionId: input.version,
      issuedAt: "2026-07-11T09:00:00.000Z",
      updatedAt: "2026-07-11T09:01:00.000Z",
      expiresAt: "2027-07-11T09:00:00.000Z",
    },
    provenance: {
      sourceKind: "trustcare_portal",
      issuerDid: input.issuerDid,
      issuerName: "TrustCare Central Hospital",
      sourceEndpoint: `${portalOrigin}/api/wallet/v2/credentials/sync`,
      receivedAt: "2026-07-11T09:02:00.000Z",
    },
    content: {
      credentialPayload: credentialPayload(input.credentialId, input.issuerDid),
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
      credentialId: input.credentialId,
      jwt: input.jwt,
    },
    trust: {
      state: "issuer_signed_untrusted",
      checks: [
        {
          key: "proof",
          status: "passed",
          checkedAt: "2026-07-11T09:01:30.000Z",
        },
        {
          key: "issuer",
          status: "passed",
          checkedAt: "2026-07-11T09:01:30.000Z",
        },
        {
          key: "status",
          status: "passed",
          checkedAt: "2026-07-11T09:01:30.000Z",
        },
      ],
    },
    privacy: {
      defaultDisclosure: "ask",
      selectivelyDisclosableFields: [],
    },
    local: { pinned: false, availableOffline: true },
  };
}

function page(
  input: Partial<WalletExchangePreparedSyncPage> &
    Pick<WalletExchangePreparedSyncPage, "syncId" | "changes">,
): WalletExchangePreparedSyncPage {
  return {
    schema: "trustcare.wallet.sync.v2",
    contractVersion: "2026.07.wallet-exchange.v2",
    mode: "initial",
    nextCursor: cursor("1"),
    hasMore: false,
    serverTime: "2026-07-11T10:00:00.000Z",
    ackIdempotencyKey: "ack-sync-initial-1",
    ...input,
  };
}

function ack(syncId: string, receiptId: string): WalletSyncAck {
  return {
    schema: "trustcare.wallet.sync-ack.v1",
    receiptId,
    syncId,
    acceptedAt: "2026-07-11T10:00:01.000Z",
    summary: {
      applied: 1,
      alreadyCurrent: 0,
      archived: 0,
      rejected: 0,
    },
    idempotent: false,
    note: "accepted",
  };
}

function commitAndAck(
  state: WalletExchangeState,
  syncPage: WalletExchangePreparedSyncPage,
): WalletExchangeState {
  const reduced = prepareWalletExchangeSyncCommit(state, syncPage);
  return applyWalletExchangeAckReceipt(reduced.state, {
    ...ack(syncPage.syncId, `receipt-${syncPage.syncId}`),
    cursor: syncPage.nextCursor,
  });
}

function cursor(suffix: string): string {
  return `opaque-wallet-cursor-${suffix.padStart(8, "0")}`;
}
