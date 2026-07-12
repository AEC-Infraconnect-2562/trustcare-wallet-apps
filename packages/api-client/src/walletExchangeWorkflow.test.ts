import {
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  WALLET_RENDERER_REFERENCE_COMMIT,
  type WalletCredentialRequest,
  type WalletCredentialRequestInput,
  type WalletCredentialRequestStatus,
  type WalletSubmission,
  type WalletSubmissionRequest,
  type WalletSyncAckRequest,
  type WalletSyncPage,
  type WalletSyncUpsertChange,
} from "@trustcare/contracts";
import {
  createHolderSignedDirectVp,
  createWalletExchangeState,
  generateHolderIdentity,
  prepareWalletExchangeSyncCommit,
  type HolderSigningIdentity,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
} from "@trustcare/wallet-core";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  portalHospitalDid,
  type TrustCarePortalHospitalCode,
} from "./portalIssuerResolver";
import {
  TRUSTCARE_RENDER_VERSION,
} from "./walletContractLoader";
import {
  createWalletExchangeV2Client,
  type WalletExchangeV2Client,
} from "./walletExchangeV2";
import {
  credentialTypesForDocumentRequest,
  WalletExchangeWorkflow,
  type WalletExchangeCredentialRequestLink,
  type WalletExchangePendingSubmissionDraft,
  type WalletExchangePersistencePort,
  type WalletExchangeSubmissionLink,
} from "./walletExchangeWorkflow";

const portalOrigin = "https://portal.example";
const now = new Date("2026-07-11T12:00:00.000Z");

let holder: HolderSigningIdentity;
let network: Awaited<ReturnType<typeof createNetworkFixture>>;

beforeAll(async () => {
  holder = await generateHolderIdentity({ algorithm: "P-256" });
  network = await createNetworkFixture();
});

describe("credentialTypesForDocumentRequest", () => {
  const manifest = {
    contracts: [
      {
        context: "opd_visit",
        acceptedCredentialTypes: [
          "IdentityCredential",
          "PatientIdentityCredential",
          "AllergyAlertCredential",
          "MedicationSummaryCredential",
        ],
      },
    ],
  };

  it("derives technical credential types from the live service contract", () => {
    expect(
      credentialTypesForDocumentRequest(manifest, "opd_visit", [
        "patient_identity",
        "allergy_alert",
      ]),
    ).toEqual([
      "IdentityCredential",
      "PatientIdentityCredential",
      "AllergyAlertCredential",
    ]);
  });

  it("fails closed when the live contract cannot represent a requested document", () => {
    expect(() =>
      credentialTypesForDocumentRequest(manifest, "opd_visit", [
        "claim_package",
      ]),
    ).toThrow(/does not accept credential types/i);
  });
});

describe("WalletExchangeWorkflow", () => {
  it("recovers a pending ACK before the next sync and commits each page before ACK", async () => {
    const operations: string[] = [];
    const initial = prepareWalletExchangeSyncCommit(
      createWalletExchangeState({ portalOrigin, holderDid: holder.did }),
      {
        ...syncPage({ syncId: "sync-pending", nextCursor: "cursor-pending" }),
        ackIdempotencyKey: "sync-ack-pending",
      },
    ).state;
    const persistence = new MemoryPersistence(initial, operations);
    const fake = fakeClient();
    fake.syncCredentials.mockImplementation(async () => {
      operations.push("network:sync");
      return syncPage({
        syncId: "sync-next",
        mode: "delta",
        nextCursor: "cursor-next",
      });
    });
    fake.acknowledgeSync.mockImplementation(async (request) => {
      operations.push(`network:ack:${request.syncId}`);
      expect(persistence.state.pendingAck?.syncId).toBe(request.syncId);
      return ackFor(request);
    });
    const workflow = createWorkflow({ persistence, fake });

    const result = await workflow.synchronize();

    expect(result.pendingAckRecovered).toBe(true);
    expect(result.state.pendingAck).toBeUndefined();
    expect(operations).toEqual([
      "network:ack:sync-pending",
      "persist:ack:sync-pending",
      "network:sync",
      "persist:commit:sync-next",
      "network:ack:sync-next",
      "persist:ack:sync-next",
    ]);
  });

  it("pages with durable cursors, sends known hashes, and counts normalized and quarantined credentials", async () => {
    const valid = await signedCredentialChange({
      issuer: network.issuers.TCC,
      holderDid: holder.did,
      credentialId: "credential-valid",
      lineageKey: "lineage-valid",
      eventId: "event-valid",
    });
    const unsigned = await unsignedCredentialChange({
      issuer: network.issuers.TCP,
      holderDid: holder.did,
      credentialId: "credential-unsigned",
      lineageKey: "lineage-unsigned",
      eventId: "event-unsigned",
    });
    const persistence = new MemoryPersistence(
      createWalletExchangeState({ portalOrigin, holderDid: holder.did }),
    );
    const fake = fakeClient();
    fake.syncCredentials
      .mockResolvedValueOnce(
        syncPage({
          syncId: "sync-page-1",
          nextCursor: "cursor-page-1",
          hasMore: true,
          changes: [valid],
        }),
      )
      .mockResolvedValueOnce(
        syncPage({
          syncId: "sync-page-2",
          mode: "delta",
          nextCursor: "cursor-page-2",
          changes: [unsigned],
        }),
      );
    const workflow = createWorkflow({ persistence, fake });

    const result = await workflow.synchronize(25);

    expect(result).toMatchObject({
      pages: 2,
      applied: 1,
      archived: 0,
      rejected: 1,
    });
    expect(result.state.documents).toHaveLength(1);
    expect(result.state.documents[0]).toMatchObject({
      owner: { id: holder.did, holderDid: holder.did },
      provenance: {
        sourceKind: "trustcare_portal",
        issuerDid: network.issuers.TCC.issuerDid,
      },
      credential: { jwt: valid.credential.proof?.jwt },
    });
    expect(result.state.quarantine).toEqual([
      expect.objectContaining({
        credentialId: "credential-unsigned",
        reason: "unsigned_metadata",
      }),
    ]);
    expect(fake.syncCredentials).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      limit: 25,
      knownCredentials: [],
    });
    expect(fake.syncCredentials).toHaveBeenNthCalledWith(2, {
      cursor: "cursor-page-1",
      limit: 25,
      knownCredentials: [
        {
          credentialId: "credential-valid",
          contentHash: valid.contentHash,
          status: "final",
        },
      ],
    });
  });

  it("persists a credential-request link, reuses idempotency, and refreshes Maker/Checker status", async () => {
    const persistence = freshPersistence();
    const fake = fakeClient();
    const response = credentialRequestResponse();
    fake.requestCredential.mockResolvedValue(response);
    fake.getCredentialRequestStatus.mockResolvedValue(
      credentialRequestStatus(response),
    );
    const workflow = createWorkflow({ persistence, fake });
    const input = {
      clientRequestId: "client-request-001",
      targetHospitalCode: "TCC" as const,
      context: "opd_visit" as const,
      purpose: "Request a signed discharge summary",
      consentRef: "urn:consent:request:001",
      credentialTypes: ["DischargeSummaryCredential"],
    };

    await workflow.requestCredential(input);
    await workflow.requestCredential(input);
    const status = await workflow.refreshCredentialRequest(
      input.clientRequestId,
    );

    const firstKey = fake.requestCredential.mock.calls[0]?.[1];
    expect(firstKey).toMatch(/^credential-request-[a-f0-9]{48}$/);
    expect(fake.requestCredential.mock.calls[1]?.[1]).toBe(firstKey);
    expect(status).toMatchObject({
      requestId: response.requestId,
      status: "in_progress",
      nextAction: "wait_for_maker_checker",
    });
    expect(
      await persistence.getCredentialRequestLink(input.clientRequestId),
    ).toMatchObject({
      requestId: response.requestId,
      idempotencyKey: firstKey,
      lastKnownStatus: "in_progress",
      updatedAt: status.updatedAt,
    });
  });

  it("rejects a cross-origin credential-request status URL before persisting it", async () => {
    const persistence = freshPersistence();
    const fake = fakeClient();
    fake.requestCredential.mockResolvedValue({
      ...credentialRequestResponse(),
      statusUrl:
        "https://attacker.example/api/wallet/v2/credential-requests/request-001",
    });
    const workflow = createWorkflow({ persistence, fake });

    await expect(
      workflow.requestCredential({
        clientRequestId: "client-request-001",
        targetHospitalCode: "TCC",
        context: "opd_visit",
        purpose: "Request discharge summary",
        consentRef: "urn:consent:request:001",
        credentialTypes: ["DischargeSummaryCredential"],
      }),
    ).rejects.toMatchObject({ code: "wallet_status_url_invalid" });
    expect(
      await persistence.getCredentialRequestLink("client-request-001"),
    ).toBeNull();
  });

  it("creates a holder-signed direct VP without changing nested issuer JWT bytes", async () => {
    const change = await signedCredentialChange({
      issuer: network.issuers.TCC,
      holderDid: holder.did,
      credentialId: "credential-direct-vp",
      lineageKey: "lineage-direct-vp",
      eventId: "event-direct-vp",
    });
    const persistence = freshPersistence();
    const fake = fakeClient();
    fake.syncCredentials.mockResolvedValue(
      syncPage({
        syncId: "sync-direct-vp",
        nextCursor: "cursor-direct-vp",
        changes: [change],
      }),
    );
    fake.submitDocumentsSerialized.mockImplementation(async (requestBody) => {
      const request = JSON.parse(requestBody) as WalletSubmissionRequest;
      return submissionResponse(request.clientSubmissionId);
    });
    const workflow = createWorkflow({ persistence, fake });
    await workflow.synchronize();

    const response = await workflow.submitDirectPresentation({
      clientSubmissionId: "client-submission-001",
      context: "opd_visit",
      purpose: "Continue care at TCC",
      consentRef: "urn:consent:share:001",
      recipient: network.issuers.TCC.issuerDid,
      documentIds: [persistence.state.documents[0]!.id],
    });

    const serializedRequest = fake.submitDocumentsSerialized.mock.calls[0]?.[0];
    const request = JSON.parse(
      serializedRequest ?? "null",
    ) as WalletSubmissionRequest | null;
    expect(request?.transport.mode).toBe("direct_vp");
    const vpJwt =
      request?.transport.mode === "direct_vp" ? request.transport.vpJwt : "";
    const payload = decodeJwt(vpJwt);
    expect(payload).toMatchObject({
      iss: holder.did,
      sub: holder.did,
      aud: `${portalOrigin}/verifier`,
      vp: { holder: holder.did },
    });
    expect(
      (payload.vp as { verifiableCredential: string[] }).verifiableCredential,
    ).toEqual([change.credential.proof!.jwt]);
    expect(
      (payload.vp as { verifiableCredential: string[] })
        .verifiableCredential[0],
    ).toBe(change.credential.proof!.jwt);
    expect(response.submissionId).toBe("submission-001");
    expect(
      await persistence.getSubmissionLink("client-submission-001"),
    ).toMatchObject({
      submissionId: "submission-001",
      lastKnownStatus: "received",
    });
  });

  it("rejects a direct VP recipient outside the configured Portal hospitals", async () => {
    const persistence = freshPersistence();
    const fake = fakeClient();
    const workflow = createWorkflow({ persistence, fake });

    await expect(
      workflow.submitDirectPresentation({
        clientSubmissionId: "client-submission-wrong-recipient",
        context: "opd_visit",
        purpose: "Continue care",
        consentRef: "urn:consent:wrong-recipient",
        recipient: "did:web:attacker.example:hospital:tcc",
        documentIds: [],
      }),
    ).rejects.toMatchObject({ code: "wallet_recipient_invalid" });
    expect(fake.submitDocumentsSerialized).not.toHaveBeenCalled();
  });

  it("recovers a lost direct-submission response after restart with byte-identical VP and idempotency identity", async () => {
    const change = await signedCredentialChange({
      issuer: network.issuers.TCC,
      holderDid: holder.did,
      credentialId: "credential-outbox-restart",
      lineageKey: "lineage-outbox-restart",
      eventId: "event-outbox-restart",
    });
    const persistence = freshPersistence();
    const first = fakeClient();
    first.syncCredentials.mockResolvedValue(
      syncPage({
        syncId: "sync-outbox-restart",
        nextCursor: "cursor-outbox-restart",
        changes: [change],
      }),
    );
    first.submitDocumentsSerialized.mockRejectedValueOnce(
      new TypeError("connection closed after upload"),
    );
    const workflow = createWorkflow({ persistence, fake: first });
    await workflow.synchronize();
    const input = {
      clientSubmissionId: "client-submission-outbox-restart",
      context: "opd_visit" as const,
      purpose: "Continue care at TCC",
      consentRef: "urn:consent:share:outbox-restart",
      recipient: network.issuers.TCC.issuerDid,
      documentIds: [persistence.state.documents[0]!.id],
    };

    await expect(workflow.submitDirectPresentation(input)).rejects.toThrow(
      "connection closed",
    );
    const queued = await persistence.getPendingSubmissionDraft(
      input.clientSubmissionId,
    );
    expect(queued?.request.transport.mode).toBe("direct_vp");
    expect(
      await persistence.getSubmissionLink(input.clientSubmissionId),
    ).toBeNull();
    const firstBody = first.submitDocumentsSerialized.mock.calls[0]?.[0];
    const firstIdempotencyKey =
      first.submitDocumentsSerialized.mock.calls[0]?.[1];

    const afterRestart = fakeClient();
    const restartedWorkflow = createWorkflow({
      persistence,
      fake: afterRestart,
    });
    const [response] =
      await restartedWorkflow.recoverPendingDirectSubmissions();

    expect(response?.submissionId).toBe("submission-001");
    expect(afterRestart.submitDocumentsSerialized).toHaveBeenCalledTimes(1);
    expect(afterRestart.submitDocumentsSerialized.mock.calls[0]?.[0]).toBe(
      firstBody,
    );
    expect(afterRestart.submitDocumentsSerialized.mock.calls[0]?.[1]).toBe(
      firstIdempotencyKey,
    );
    expect(
      await persistence.getPendingSubmissionDraft(input.clientSubmissionId),
    ).toBeNull();
    expect(
      await persistence.getSubmissionLink(input.clientSubmissionId),
    ).toMatchObject({
      clientSubmissionId: input.clientSubmissionId,
      idempotencyKey: firstIdempotencyKey,
      requestDigest: queued?.requestDigest,
      intentDigest: queued?.intentDigest,
    });

    await expect(
      restartedWorkflow.submitDirectPresentation({
        ...input,
        purpose: "A different purpose",
      }),
    ).rejects.toMatchObject({ code: "wallet_submission_idempotency_conflict" });
    expect(afterRestart.submitDocumentsSerialized).toHaveBeenCalledTimes(1);
  });

  it("refuses a wrapped or modified Share Gateway VP and never submits it", async () => {
    const issuerJwt = (
      await signedCredentialChange({
        issuer: network.issuers.TCC,
        holderDid: holder.did,
        credentialId: "credential-gateway",
        lineageKey: "lineage-gateway",
        eventId: "event-gateway",
      })
    ).credential.proof!.jwt;
    const holderVp = await createHolderSignedDirectVp({
      identity: holder,
      audience: `${portalOrigin}/verifier`,
      recipient: network.issuers.TCC.issuerDid,
      context: "opd_visit",
      purpose: "Continue care",
      consentRef: "urn:consent:gateway:001",
      credentialJwts: [issuerJwt],
      now,
    });
    const artifactId = "artifact-001";
    const artifactUrl = `${portalOrigin}/api/share-gateway/presentations/${artifactId}.jwt`;
    const fetchImpl = network.fetchWith(
      new Map([
        [
          artifactUrl,
          new Response(JSON.stringify({ vpJwt: holderVp.vpJwt }), {
            status: 200,
            headers: { "content-type": "application/jwt" },
          }),
        ],
      ]),
    );
    const persistence = freshPersistence();
    const fake = fakeClient();
    const workflow = createWorkflow({ persistence, fake, fetchImpl });

    await expect(
      workflow.submitCertifiedShareGateway({
        clientSubmissionId: "client-submission-gateway",
        context: "opd_visit",
        purpose: "Continue care",
        consentRef: "urn:consent:gateway:001",
        artifactId,
        binding: gatewayBinding(),
        holderSignedVpJwt: holderVp.vpJwt,
      }),
    ).rejects.toMatchObject({
      code: "share_gateway_holder_vp_not_preserved",
    });
    expect(fake.submitDocumentsSerialized).not.toHaveBeenCalled();
  });

  it("requires the preserved Share Gateway VP claims to match every submission binding", async () => {
    const issuerJwt = (
      await signedCredentialChange({
        issuer: network.issuers.TCC,
        holderDid: holder.did,
        credentialId: "credential-gateway-binding",
        lineageKey: "lineage-gateway-binding",
        eventId: "event-gateway-binding",
      })
    ).credential.proof!.jwt;
    const holderVp = await createHolderSignedDirectVp({
      identity: holder,
      audience: `${portalOrigin}/verifier`,
      recipient: network.issuers.TCC.issuerDid,
      context: "opd_visit",
      purpose: "Continue care",
      consentRef: "urn:consent:gateway:binding",
      credentialJwts: [issuerJwt],
      now,
    });
    const artifactId = "artifact-binding-001";
    const artifactUrl = `${portalOrigin}/api/share-gateway/presentations/${artifactId}.jwt`;
    const fetchImpl = network.fetchWith(
      new Map([
        [
          artifactUrl,
          new Response(holderVp.vpJwt, {
            status: 200,
            headers: { "content-type": "application/vp+jwt" },
          }),
        ],
      ]),
    );
    const fake = fakeClient();
    const workflow = createWorkflow({
      persistence: freshPersistence(),
      fake,
      fetchImpl,
    });

    await expect(
      workflow.submitCertifiedShareGateway({
        clientSubmissionId: "client-submission-gateway-binding",
        context: "opd_visit",
        purpose: "Continue care",
        consentRef: "urn:consent:gateway:different",
        artifactId,
        binding: gatewayBinding(),
        holderSignedVpJwt: holderVp.vpJwt,
      }),
    ).rejects.toMatchObject({ code: "share_gateway_holder_vp_invalid" });
    expect(fake.submitDocumentsSerialized).not.toHaveBeenCalled();
  });

  it("rejects Portal patientId before creating a session or presentation", async () => {
    const persistence = freshPersistence();
    const fake = fakeClient();
    const clientFactory = vi.fn(() => fake.client);
    const workflow = createWorkflow({
      persistence,
      fake,
      clientFactory: clientFactory as typeof createWalletExchangeV2Client,
    });

    await expect(
      workflow.submitDirectPresentation({
        clientSubmissionId: "client-submission-patient-id",
        context: "opd_visit",
        purpose: "Continue care",
        consentRef: "urn:consent:patient-id",
        recipient: network.issuers.TCC.issuerDid,
        documentIds: [],
        patientId: "portal-patient-123",
      } as Parameters<WalletExchangeWorkflow["submitDirectPresentation"]>[0]),
    ).rejects.toMatchObject({ code: "portal_patient_id_forbidden" });
    expect(clientFactory).not.toHaveBeenCalled();
    expect(fake.submitDocumentsSerialized).not.toHaveBeenCalled();
  });

  it("stops when the Portal repeats a cursor instead of entering a paging loop", async () => {
    const persistence = freshPersistence();
    const fake = fakeClient();
    fake.syncCredentials
      .mockResolvedValueOnce(
        syncPage({
          syncId: "sync-loop-1",
          nextCursor: "cursor-loop",
          hasMore: true,
        }),
      )
      .mockResolvedValueOnce(
        syncPage({
          syncId: "sync-loop-2",
          mode: "delta",
          nextCursor: "cursor-loop",
          hasMore: true,
        }),
      );
    const workflow = createWorkflow({ persistence, fake });

    await expect(workflow.synchronize()).rejects.toMatchObject({
      code: "wallet_sync_cursor_loop",
    });
    expect(fake.syncCredentials).toHaveBeenCalledTimes(2);
    expect(
      persistence.operations.filter((entry) =>
        entry.startsWith("persist:commit:"),
      ),
    ).toEqual(["persist:commit:sync-loop-1"]);
    expect(fake.acknowledgeSync).toHaveBeenCalledTimes(1);
  });
});

class MemoryPersistence implements WalletExchangePersistencePort {
  readonly partition;
  state: WalletExchangeState;
  readonly operations: string[];
  private readonly credentialRequests = new Map<
    string,
    WalletExchangeCredentialRequestLink
  >();
  private readonly submissions = new Map<
    string,
    WalletExchangeSubmissionLink
  >();
  private readonly pendingSubmissions = new Map<
    string,
    WalletExchangePendingSubmissionDraft
  >();

  constructor(state: WalletExchangeState, operations: string[] = []) {
    this.state = structuredClone(state);
    this.partition = this.state.partition;
    this.operations = operations;
  }

  async loadOrCreateState(): Promise<WalletExchangeState> {
    return structuredClone(this.state);
  }

  async commitSyncReduction(
    reduction: WalletExchangeSyncReduction,
  ): Promise<void> {
    expect(reduction.plan.partitionKey).toBe(this.partition.key);
    expect(reduction.plan.expectedCursor).toBe(this.state.nextCursor);
    this.operations.push(
      `persist:commit:${reduction.state.pendingAck?.syncId ?? "missing"}`,
    );
    this.state = structuredClone(reduction.state);
  }

  async persistAcknowledgedState(state: WalletExchangeState): Promise<void> {
    expect(state.pendingAck).toBeUndefined();
    this.operations.push(
      `persist:ack:${state.lastAckReceipt?.syncId ?? "missing"}`,
    );
    this.state = structuredClone(state);
  }

  async saveCredentialRequestLink(
    link: WalletExchangeCredentialRequestLink,
  ): Promise<void> {
    this.credentialRequests.set(link.clientRequestId, structuredClone(link));
  }

  async getCredentialRequestLink(
    clientRequestId: string,
  ): Promise<WalletExchangeCredentialRequestLink | null> {
    return structuredClone(
      this.credentialRequests.get(clientRequestId) ?? null,
    );
  }

  async saveSubmissionLink(link: WalletExchangeSubmissionLink): Promise<void> {
    this.submissions.set(link.clientSubmissionId, structuredClone(link));
  }

  async getSubmissionLink(
    clientSubmissionId: string,
  ): Promise<WalletExchangeSubmissionLink | null> {
    return structuredClone(this.submissions.get(clientSubmissionId) ?? null);
  }

  async savePendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    const existing = this.pendingSubmissions.get(draft.clientSubmissionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(draft)) {
      throw new Error("pending submission conflict");
    }
    this.pendingSubmissions.set(
      draft.clientSubmissionId,
      structuredClone(draft),
    );
  }

  async getPendingSubmissionDraft(
    clientSubmissionId: string,
  ): Promise<WalletExchangePendingSubmissionDraft | null> {
    return structuredClone(
      this.pendingSubmissions.get(clientSubmissionId) ?? null,
    );
  }

  async listPendingSubmissionDrafts(): Promise<
    WalletExchangePendingSubmissionDraft[]
  > {
    return [...this.pendingSubmissions.values()].map((draft) =>
      structuredClone(draft),
    );
  }

  async completePendingSubmission(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): Promise<void> {
    const pending = this.pendingSubmissions.get(draft.clientSubmissionId);
    if (!pending || JSON.stringify(pending) !== JSON.stringify(draft)) {
      throw new Error("pending submission changed");
    }
    this.submissions.set(link.clientSubmissionId, structuredClone(link));
    this.pendingSubmissions.delete(draft.clientSubmissionId);
  }
}

function freshPersistence(): MemoryPersistence {
  return new MemoryPersistence(
    createWalletExchangeState({ portalOrigin, holderDid: holder.did }),
  );
}

function createWorkflow(input: {
  persistence: MemoryPersistence;
  fake: ReturnType<typeof fakeClient>;
  fetchImpl?: typeof fetch;
  clientFactory?: typeof createWalletExchangeV2Client;
}): WalletExchangeWorkflow {
  return new WalletExchangeWorkflow({
    portalBaseUrl: portalOrigin,
    runtimeEnvironment: "sandbox",
    walletVersion: "0.1.0",
    appId: "trustcare-wallet-test",
    identity: holder,
    persistence: input.persistence,
    fetchImpl: input.fetchImpl ?? network.fetchImpl,
    now: () => now,
    clientFactory:
      input.clientFactory ??
      ((() => input.fake.client) as typeof createWalletExchangeV2Client),
  });
}

function fakeClient() {
  const syncCredentials = vi.fn(async () =>
    syncPage({ syncId: "sync-empty", nextCursor: "cursor-empty" }),
  );
  const acknowledgeSync = vi.fn(async (request: WalletSyncAckRequest) =>
    ackFor(request),
  );
  const requestCredential = vi.fn(
    async (
      _input: WalletCredentialRequestInput,
      _idempotencyKey: string,
    ): Promise<WalletCredentialRequest> => credentialRequestResponse(),
  );
  const getCredentialRequestStatus = vi.fn(
    async (): Promise<WalletCredentialRequestStatus> =>
      credentialRequestStatus(credentialRequestResponse()),
  );
  const submitDocuments = vi.fn(
    async (
      request: WalletSubmissionRequest,
      _idempotencyKey: string,
    ): Promise<WalletSubmission> =>
      submissionResponse(request.clientSubmissionId),
  );
  const submitDocumentsSerialized = vi.fn(
    async (
      requestBody: string,
      _idempotencyKey: string,
    ): Promise<WalletSubmission> => {
      const request = JSON.parse(requestBody) as WalletSubmissionRequest;
      return submissionResponse(request.clientSubmissionId);
    },
  );
  const getSubmissionStatus = vi.fn(async (): Promise<WalletSubmission> =>
    submissionResponse("client-submission-001"),
  );
  return {
    client: {
      syncCredentials,
      acknowledgeSync,
      requestCredential,
      getCredentialRequestStatus,
      submitDocuments,
      submitDocumentsSerialized,
      getSubmissionStatus,
    } as unknown as WalletExchangeV2Client,
    syncCredentials,
    acknowledgeSync,
    requestCredential,
    getCredentialRequestStatus,
    submitDocuments,
    submitDocumentsSerialized,
    getSubmissionStatus,
  };
}

function syncPage(
  input: Partial<WalletSyncPage> &
    Pick<WalletSyncPage, "syncId" | "nextCursor">,
): WalletSyncPage {
  return {
    schema: "trustcare.wallet.sync.v2",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    mode: "initial",
    changes: [],
    hasMore: false,
    serverTime: "2026-07-11T12:00:01.000Z",
    ...input,
  };
}

function ackFor(request: WalletSyncAckRequest) {
  const count = (outcome: string) =>
    request.results.filter((result) => result.outcome === outcome).length;
  return {
    schema: "trustcare.wallet.sync-ack.v1" as const,
    receiptId: `receipt-${request.syncId}`,
    syncId: request.syncId,
    acceptedAt: "2026-07-11T12:00:02.000Z",
    summary: {
      applied: count("applied"),
      alreadyCurrent: count("already_current"),
      archived: count("archived"),
      rejected: count("rejected"),
    },
    idempotent: false,
    note: "Accepted by test Portal",
  };
}

function credentialRequestResponse(): WalletCredentialRequest {
  return {
    schema: "trustcare.wallet.credential-request.v1",
    requestId: "request-001",
    clientRequestId: "client-request-001",
    status: "pending_review",
    credentialTypes: ["DischargeSummaryCredential"],
    statusUrl: `${portalOrigin}/api/wallet/v2/credential-requests/request-001`,
    nextAction: "wait_for_maker_checker",
    createdAt: "2026-07-11T12:00:00.000Z",
    idempotent: false,
  };
}

function credentialRequestStatus(
  request: WalletCredentialRequest,
): WalletCredentialRequestStatus {
  return {
    schema: "trustcare.wallet.credential-request-status.v1",
    requestId: request.requestId,
    clientRequestId: request.clientRequestId,
    status: "in_progress",
    items: [
      {
        requestId: "request-item-001",
        documentType: "DischargeSummaryCredential",
        status: "requested",
        updatedAt: "2026-07-11T12:05:00.000Z",
      },
    ],
    nextAction: "wait_for_maker_checker",
    updatedAt: "2026-07-11T12:05:00.000Z",
  };
}

function submissionResponse(clientSubmissionId: string): WalletSubmission {
  return {
    schema: "trustcare.wallet.document-submission.v1",
    submissionId: "submission-001",
    clientSubmissionId,
    status: "received",
    presentationId: "presentation-001",
    results: [],
    statusUrl: `${portalOrigin}/api/wallet/v2/submissions/submission-001`,
    createdAt: "2026-07-11T12:10:00.000Z",
    updatedAt: "2026-07-11T12:10:00.000Z",
    idempotent: false,
  };
}

function gatewayBinding() {
  return {
    purpose: "Continue care",
    recipient: network.issuers.TCC.issuerDid,
    audience: `${portalOrigin}/verifier`,
    subjectDigest: `sha256:${"1".repeat(64)}`,
    packageDigest: `sha256:${"2".repeat(64)}`,
    contextDigest: `sha256:${"3".repeat(64)}`,
  };
}

type IssuerFixture = {
  hospitalCode: TrustCarePortalHospitalCode;
  issuerDid: string;
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
  didDocument: Record<string, unknown>;
  jwks: Record<string, unknown>;
};

async function createIssuerFixture(
  hospitalCode: TrustCarePortalHospitalCode,
): Promise<IssuerFixture> {
  const issuerDid = portalHospitalDid(portalOrigin, hospitalCode);
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const kid = `${issuerDid}#vc-signing-active`;
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    alg: "ES256",
    use: "sig",
    kid,
  };
  const verificationMethod = {
    id: kid,
    type: "JsonWebKey2020",
    controller: issuerDid,
    publicKeyJwk: publicJwk,
  };
  return {
    hospitalCode,
    issuerDid,
    kid,
    privateKey,
    publicJwk,
    didDocument: {
      id: issuerDid,
      verificationMethod: [verificationMethod],
      assertionMethod: [kid],
      authentication: [kid],
      trustcare: { hospitalCode, syntheticTestData: false },
    },
    jwks: { keys: [publicJwk], issuer: issuerDid, hospitalCode },
  };
}

async function signedCredentialChange(input: {
  issuer: IssuerFixture;
  holderDid: string;
  credentialId: string;
  lineageKey: string;
  eventId: string;
}): Promise<WalletSyncUpsertChange> {
  const credentialData: Record<string, unknown> = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: `urn:trustcare:credential:${input.credentialId}`,
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: { id: input.issuer.issuerDid },
    validFrom: "2026-07-11T11:55:00.000Z",
    validUntil: "2027-07-11T12:00:00.000Z",
    credentialStatus: {
      id: `${portalOrigin}/api/wallet/v2/credential-status/${input.credentialId}`,
      type: "TrustCareCredentialStatus2026",
      status: "active",
    },
    credentialSubject: {
      id: input.holderDid,
      documentType: "patient_identity",
      humanDocument: {
        renderData: {
          document: {
            titleTh: "บัตรประจำตัวผู้ป่วย",
            titleEn: "PATIENT ID CARD",
            layout: "photo_identity_card",
          },
          patient: { nameEn: "Test Patient", hn: "HN-TEST-001" },
          issuer: { nameEn: "TrustCare Test Hospital" },
        },
      },
    },
  };
  const jwt = await new SignJWT({
    vc: credentialData,
    trustcare_claim_digest: await sha256Canonical(credentialData),
  })
    .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", kid: input.issuer.kid })
    .setIssuer(input.issuer.issuerDid)
    .setSubject(input.holderDid)
    .setIssuedAt(Math.floor(now.getTime() / 1000) - 60)
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 3_600)
    .sign(input.issuer.privateKey);
  const contentHash = await walletContentHash({
    credentialData,
    proofJwt: jwt,
    status: "active",
  });
  return {
    eventId: input.eventId,
    type: "credential.upsert",
    credentialId: input.credentialId,
    status: "active",
    occurredAt: now.toISOString(),
    contentHash,
    credential: {
      credentialId: input.credentialId,
      cardType: "patient_identity",
      credentialType: "PatientIdentityCredential",
      displayName: "บัตรประจำตัวผู้ป่วย",
      displayNameEn: "Patient ID Card",
      documentCategory: "identity_and_access",
      credentialStatus: "active",
      credentialData,
      proof: {
        type: "jwt",
        jwt,
        alg: "ES256",
        kid: input.issuer.kid,
        issuer: input.issuer.issuerDid,
      },
      selectiveDisclosure: null,
      issuerDid: input.issuer.issuerDid,
      issuerHospitalName: "TrustCare Test Hospital",
      holderDid: input.holderDid,
      sourceSystem: "trustcare_portal",
      lineageKey: input.lineageKey,
      version: "1",
      contentHash,
      issuedAt: "2026-07-11T11:55:00.000Z",
      expiresAt: "2027-07-11T12:00:00.000Z",
      updatedAt: now.toISOString(),
      deliveryState: "signed",
      renderer: rendererMetadata(),
    },
  };
}

async function unsignedCredentialChange(input: {
  issuer: IssuerFixture;
  holderDid: string;
  credentialId: string;
  lineageKey: string;
  eventId: string;
}): Promise<WalletSyncUpsertChange> {
  const contentHash = await walletContentHash({
    credentialData: null,
    proofJwt: null,
    status: "active",
  });
  return {
    eventId: input.eventId,
    type: "credential.upsert",
    credentialId: input.credentialId,
    status: "active",
    occurredAt: now.toISOString(),
    contentHash,
    credential: {
      credentialId: input.credentialId,
      cardType: "patient_identity",
      credentialType: "PatientIdentityCredential",
      displayName: "Unsigned metadata",
      displayNameEn: "Unsigned metadata",
      documentCategory: "identity_and_access",
      credentialStatus: "active",
      credentialData: null,
      proof: null,
      selectiveDisclosure: null,
      issuerDid: input.issuer.issuerDid,
      issuerHospitalName: "TrustCare Test Hospital",
      holderDid: input.holderDid,
      sourceSystem: "trustcare_portal",
      lineageKey: input.lineageKey,
      version: "1",
      contentHash,
      issuedAt: now.toISOString(),
      expiresAt: null,
      updatedAt: now.toISOString(),
      deliveryState: "unsigned_metadata",
      renderer: rendererMetadata(),
    },
  };
}

function rendererMetadata() {
  return {
    authority: "trustcare_wallet" as const,
    repository: "AEC-Infraconnect-2562/trustcare-wallet-apps" as const,
    referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
    renderVersion: TRUSTCARE_RENDER_VERSION,
  };
}

async function createNetworkFixture() {
  const issuers = {
    TCC: await createIssuerFixture("TCC"),
    TCP: await createIssuerFixture("TCP"),
    TCM: await createIssuerFixture("TCM"),
  };
  const contracts = await contractResponses();
  const responses = new Map<string, Response>(contracts);
  for (const issuer of Object.values(issuers)) {
    const code = issuer.hospitalCode.toLowerCase();
    responses.set(
      `${portalOrigin}/hospital/${code}/did.json`,
      jsonResponse(issuer.didDocument),
    );
    responses.set(
      `${portalOrigin}/hospital/${code}/did/jwks.json`,
      jsonResponse(issuer.jwks),
    );
  }
  const fetchWith = (extra = new Map<string, Response>()): typeof fetch =>
    (async (resource) => {
      const url =
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url;
      const response = extra.get(url) ?? responses.get(url);
      return response?.clone() ?? jsonResponse({ title: "Not found" }, {}, 404);
    }) as typeof fetch;
  return { issuers, fetchImpl: fetchWith(), fetchWith };
}

async function contractResponses(): Promise<Map<string, Response>> {
  const discovery = {
    name: "TrustCare Portal Wallet Exchange API",
    version: "2.0.0",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    authorization: {
      challengeEndpoint: `${portalOrigin}/api/wallet/v2/session-challenges`,
      sessionEndpoint: `${portalOrigin}/api/wallet/v2/sessions`,
      holderProofType: "trustcare-wallet-session+jwt",
      accessTokenType: "DPoP",
      dpopSpecification: "RFC 9449",
      scopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
    },
    endpoints: {
      credentialSync: `${portalOrigin}/api/wallet/v2/credentials/sync`,
      credentialSyncAck: `${portalOrigin}/api/wallet/v2/credentials/sync/ack`,
      credentialRequests: `${portalOrigin}/api/wallet/v2/credential-requests`,
      documentSubmissions: `${portalOrigin}/api/wallet/v2/submissions`,
      publicContracts: `${portalOrigin}/api/public/wallet-contracts/manifest`,
      shareGateway: `${portalOrigin}/api/share-gateway`,
      issuerJwks: `${portalOrigin}/.well-known/jwks.json`,
    },
    protocols: {
      credentialLifecycle: "Wallet Exchange lifecycle v2",
      presentation: "W3C Verifiable Presentation",
      documentMetadata: "FHIR DocumentReference",
      errors: "RFC 9457 problem details",
    },
    ownership: {
      holderKeys: "wallet",
      vpCreation: "wallet",
      renderer: "wallet",
      hospitalIssuerKeys: "portal",
      makerChecker: "portal",
      incomingVerification: "portal",
    },
    renderer: {
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
      modelPackage: "@trustcare/wallet-core",
      webPackage: "@trustcare/ui-web",
      rule: "Render human documents from credentialSubject.humanDocument.renderData.",
    },
  };
  const health = {
    status: "ok",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    persistent: true,
    holderProof: "did:key",
    tokenBinding: "DPoP",
    credentialSync: "durable_cursor",
    documentIntake: ["direct_vp", "share_gateway"],
    rendererAuthority: {},
  };
  const manifestWithoutIntegrity = {
    contractHubId: "urn:trustcare:contract-hub:network",
    version: PORTAL_WALLET_V2_CONTRACT_VERSION,
    status: "active",
    generatedAt: now.toISOString(),
    effectiveFrom: now.toISOString(),
    minimumWalletVersion: "0.1.0",
    contracts: [],
    compatibilityRules: [
      "wallet_owns_holder_vp_creation_and_selective_disclosure",
      "wallet_renderer_is_authoritative_for_human_documents",
      "portal_never_accepts_patient_id_from_wallet_requests",
      "unknown_required_fields_fail_closed",
      "shl_is_transport_not_a_verifiable_credential",
    ],
  };
  const manifest = {
    ...manifestWithoutIntegrity,
    integrity: {
      algorithm: "sha-256",
      canonicalization: "json-sorted-keys-v1",
      scope: "manifest_without_integrity_and_signature",
      digest: `sha256:${await sha256Canonical(manifestWithoutIntegrity)}`,
    },
  };
  const renderContract = {
    version: PORTAL_WALLET_V2_CONTRACT_VERSION,
    renderVersion: TRUSTCARE_RENDER_VERSION,
    authority: "wallet",
    implementationRepository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
    referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
    modelPackage: "@trustcare/wallet-core",
    webPackage: "@trustcare/ui-web",
    portalUsage: "shared_wallet_renderer_only",
    primaryPath: "credentialSubject.humanDocument.renderData",
    requiredBlocks: ["document"],
    optionalBlocks: [],
    legacyReadCompatibility: [],
    legacyWriteAllowed: false,
  };
  const schema = {
    $id: `urn:trustcare:schema:${PORTAL_WALLET_V2_CONTRACT_VERSION}`,
    contractVersion: PORTAL_WALLET_V2_CONTRACT_VERSION,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: Object.fromEntries(
        [
          "manifest",
          "documentTypes",
          "serviceProfiles",
          "sharePackages",
          "renderContract",
          "problemDetails",
        ].map((key) => [key, { type: "object" }]),
      ),
    },
  };
  return new Map([
    [
      `${portalOrigin}/api/wallet/v2`,
      jsonResponse(discovery, {
        "x-trustcare-contract-version": WALLET_EXCHANGE_V2_CONTRACT_VERSION,
      }),
    ],
    [`${portalOrigin}/api/wallet/v2/health`, jsonResponse(health)],
    [
      `${portalOrigin}/api/public/wallet-contracts/manifest`,
      await integrityResponse(manifest),
    ],
    [
      `${portalOrigin}/api/public/wallet-contracts/render-contract`,
      await integrityResponse(renderContract),
    ],
    [
      `${portalOrigin}/api/public/wallet-contracts/schema`,
      await integrityResponse(schema),
    ],
  ]);
}

function jsonResponse(
  value: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function integrityResponse(value: unknown): Promise<Response> {
  const body = JSON.stringify(value);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
  );
  const sha = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      etag: `"sha256-${sha}"`,
      "content-digest": `sha-256=:${btoa(binary)}:`,
    },
  });
}

async function walletContentHash(value: unknown): Promise<`sha256:${string}`> {
  return `sha256:${await sha256Canonical(value)}`;
}

async function sha256Canonical(value: unknown): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJson(value)),
    ),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
