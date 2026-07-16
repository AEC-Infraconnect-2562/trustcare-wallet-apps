import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  buildClinicalDocumentGraphPresentation,
  createHolderSignedDirectVp,
  createHolderSignedShlAssociationVp,
  createShlPackageId,
  createWalletClinicalDocumentGraphState,
  credentialRenderModelFromCard,
  listClinicalDocumentGraphArtifacts,
  prepareWalletClinicalDocumentGraphSyncCommit,
  prepareHolderAttestedShl,
  sandboxHolderIdentityForUser,
  walletCardForDocumentRendering,
  type HolderSigningIdentity,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import { loadWalletExchangeContracts } from "./walletContractLoader";
import {
  prepareWalletExchangeCredential,
  verifyWalletExchangeContentHash,
} from "./walletExchangeCredential";
import { synchronizeWalletAvatar } from "./walletAvatarSync";
import {
  WalletExchangeProblemError,
  WalletExchangeV2Client,
} from "./walletExchangeV2";
import {
  resolveAllPortalHospitalIssuers,
  verifyPortalHospitalCredentialJwt,
} from "./portalIssuerResolver";
import {
  WalletProvisioningClient,
  WalletProvisioningProblemError,
} from "./walletProvisioning";

const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_BINDING_TEST === "1";
const negativeLiveEnabled =
  process.env.TRUSTCARE_PORTAL_LIVE_NEGATIVE_TEST === "1";
const p0LiveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_P0_TEST === "1";
const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";
const username =
  process.env.TRUSTCARE_WALLET_TEST_USERNAME ?? "demo-patient-003";
const linkedUsernames = (
  process.env.TRUSTCARE_WALLET_TEST_USERNAMES?.split(",") ?? [username]
)
  .map((value) => value.trim())
  .filter(Boolean);
const appId = "trustcare-wallet-production";

describe.skipIf(!liveEnabled)("live Portal Wallet binding and sync", () => {
  it.each(linkedUsernames)("%s completes test-login -> binding -> DPoP session -> sync", async (username) => {
    const identity = await sandboxHolderIdentityForUser({
      userId: username,
      sandboxRuntime: true,
    });
    expect(identity).toBeDefined();
    const holder = identity as HolderSigningIdentity;
    const provisioning = new WalletProvisioningClient({
      portalBaseUrl,
      appId,
      identity: holder,
    });

    const configuration = await provisioning.reloadConfiguration();
    expect(configuration.endpoints.sandboxTestLogin).toContain(
      "/api/wallet/test-login",
    );
    const catalog = await provisioning.loadSandboxTestIdentityCatalog();
    expect(catalog).toMatchObject({
      schema: "trustcare.wallet.test-identities.v1",
      catalogVersion: expect.any(String),
    });
    expect(catalog.identities).toHaveLength(12);
    const catalogIdentity = catalog.identities.find(
      (entry) => entry.username === username,
    );
    expect(catalogIdentity).toMatchObject({
      walletUserId: username,
      holder: {
        did: holder.did,
        publicJwk: holder.publicJwk,
        privateKeyOwner: "wallet",
      },
    });

    const oidc = await provisioning.sandboxTestLogin(username);
    expect(oidc.testOnly).toBe(true);
    const oidcClaims = decodeJwt(oidc.accessToken);
    const oidcAudience = Array.isArray(oidcClaims.aud)
      ? oidcClaims.aud
      : [oidcClaims.aud];
    const realmAccess = oidcClaims.realm_access as
      | { roles?: unknown[] }
      | undefined;
    expect(oidcClaims).toMatchObject({
      iss: configuration.oidc.issuer,
      azp: "trustcare-wallet-test-broker",
    });
    expect(oidcAudience).toContain(configuration.oidc.audience);
    expect(oidcClaims.sub).toEqual(expect.any(String));
    expect(Number(oidcClaims.exp)).toBeGreaterThan(
      Math.floor(Date.now() / 1_000),
    );
    expect(realmAccess?.roles).toContain(configuration.oidc.requiredRole);
    let walletIdentity;
    try {
      walletIdentity = await provisioning.getWalletIdentity(oidc.accessToken);
    } catch (reason) {
      const claims = decodeJwt(oidc.accessToken);
      const problem =
        reason instanceof WalletProvisioningProblemError ? reason : undefined;
      throw new Error(
        [
          "Portal rejected the sandbox OIDC access token before holder binding.",
          `status=${problem?.status ?? "unknown"}`,
          `code=${problem?.code ?? "unknown"}`,
          `correlationId=${problem?.correlationId ?? "missing"}`,
          `sub=${typeof claims.sub === "string" && claims.sub ? "present" : "missing"}`,
          `iss=${String(claims.iss ?? "missing")}`,
          `azp=${String(claims.azp ?? "missing")}`,
        ].join(" "),
      );
    }
    expect(walletIdentity).toMatchObject({
      linked: true,
      username,
      portalSession: false,
      walletExchangeAppId: appId,
    });
    let status = await provisioning.getProvisioningStatus(oidc.accessToken);
    expect(["complete_holder_binding", "create_exchange_session"]).toContain(
      status.nextAction,
    );
    // Sandbox acceptance intentionally proves the current Wallet-owned key on
    // every run. This also repairs a stale holder-key row if an earlier Portal
    // reseed retained the application binding but not its public-key record.
    status = await provisioning.bindHolder({
      oidcAccessToken: oidc.accessToken,
      consentRef: `wallet-consent:live-e2e:${username}`,
    });
    expect(status).toMatchObject({
      identityLinked: true,
      ready: true,
      holder: { holderDid: holder.did, bound: true },
      nextAction: "create_exchange_session",
    });

    const contracts = await loadWalletExchangeContracts({
      portalBaseUrl,
      runtimeEnvironment: "sandbox",
      walletVersion: "0.1.0",
    });
    let syncResponseMeta:
      | { status: number; correlationId?: string; requestId?: string }
      | undefined;
    const trackingFetch: typeof fetch = async (request, init) => {
      const response = await fetch(request, init);
      if (
        String(request) === contracts.discovery.endpoints.credentialSync
      ) {
        syncResponseMeta = {
          status: response.status,
          correlationId:
            response.headers.get("x-correlation-id") ?? undefined,
          requestId: response.headers.get("x-request-id") ?? undefined,
        };
      }
      return response;
    };
    const exchange = new WalletExchangeV2Client({
      contracts,
      identity: holder,
      appId,
      requestedScopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
      fetchImpl: trackingFetch,
    });
    let session;
    try {
      session = await exchange.createSession();
    } catch (reason) {
      const problem =
        reason instanceof WalletExchangeProblemError ? reason : undefined;
      throw new Error(
        [
          "Portal rejected the holder-bound Wallet Exchange session.",
          `status=${problem?.status ?? "unknown"}`,
          `code=${problem?.code ?? "unknown"}`,
          `requestId=${problem?.requestId ?? "missing"}`,
          `correlationId=${problem?.correlationId ?? "missing"}`,
          `appId=${appId}`,
          `holderDid=${holder.did}`,
          `provisioningReady=${status.ready}`,
          `bindingStatus=${status.holder?.bound ? "bound" : "unbound"}`,
        ].join(" "),
      );
    }
    expect(session).toMatchObject({
      tokenType: "DPoP",
      holderDid: holder.did,
      publicJwkThumbprint: holder.publicJwkThumbprint,
    });

    let page: Awaited<ReturnType<WalletExchangeV2Client["syncCredentials"]>>;
    try {
      page = await exchange.syncCredentials({ limit: 100 });
    } catch (reason) {
      const problem =
        reason instanceof WalletExchangeProblemError ? reason : undefined;
      throw new Error(
        [
          "Portal rejected the holder-bound credential delta.",
          `endpoint=${contracts.discovery.endpoints.credentialSync}`,
          `status=${problem?.status ?? syncResponseMeta?.status ?? "unknown"}`,
          `code=${problem?.code ?? "unknown"}`,
          `requestId=${problem?.requestId ?? exchange.lastResponseTrace?.requestId ?? "missing"}`,
          `correlationId=${problem?.correlationId ?? exchange.lastResponseTrace?.correlationId ?? "missing"}`,
          `username=${username}`,
          `holderDid=${holder.did}`,
        ].join(" "),
      );
    }
    expect(page.schema).toBe("trustcare.wallet.sync.v2");
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.changes.length).toBeGreaterThan(0);
    console.info(
      `Live Portal sync returned ${page.changes.length} credential changes for ${username}.`,
      syncResponseMeta,
    );
    const issuers = await resolveAllPortalHospitalIssuers({ portalBaseUrl });
    let rendered = 0;
    const rejectedTypes: string[] = [];
    const documents: WalletDocumentRecordV2[] = [];
    const ackResults: Array<{
      eventId: string;
      outcome: "applied" | "archived" | "rejected";
      reasonCode?: string;
    }> = [];
    for (const change of page.changes) {
      if (change.type === "credential.upsert") {
        expect(change.credential).toMatchObject({
          holderDid: holder.did,
          sourceSystem: "trustcare_portal",
          deliveryState: "signed",
          proof: { type: "jwt" },
        });
        const prepared = await prepareWalletExchangeCredential({
          change,
          portalBaseUrl,
          holderDid: holder.did,
          requiredRenderBlocks:
            contracts.renderContract.payload.requiredBlocks,
          resolvedIssuer: issuers.find(
            (issuer) => issuer.issuerDid === change.credential.issuerDid,
          ),
        });
        if (!prepared.document) {
          const subject = record(change.credential.credentialData?.credentialSubject);
          const data = record(subject.data);
          const humanDocument = record(data.humanDocument);
          const renderData = record(humanDocument.renderData);
          const issuer = issuers.find(
            (candidate) => candidate.issuerDid === change.credential.issuerDid,
          );
          const verification =
            issuer &&
            change.credential.proof?.jwt &&
            change.credential.credentialData
              ? await verifyPortalHospitalCredentialJwt({
                  jwt: change.credential.proof.jwt,
                  issuer,
                  expectedHolderDid: holder.did,
                  expectedCredentialData: change.credential.credentialData,
                })
              : undefined;
          console.info("Live credential rejected before rendering", {
            cardType: change.credential.cardType,
            credentialType: change.credential.credentialType,
            signedTypes: Array.isArray(change.credential.credentialData?.type)
              ? change.credential.credentialData.type
              : [],
            signedDocumentType: subject.documentType,
            signedSubjectId:
              typeof subject.id === "string" ? subject.id : "missing",
            expectedHolderDid: holder.did,
            verificationErrors: verification?.errors ?? ["issuer_or_proof_missing"],
            contentHashValid: await verifyWalletExchangeContentHash(change),
            proofVerified: prepared.issuerEvidence?.proofVerified ?? false,
            issuerActive: prepared.issuerEvidence?.issuerActive ?? false,
            hasCanonicalHumanDocument: Object.keys(humanDocument).length > 0,
            humanDocumentBlocks: Object.keys(humanDocument).sort(),
            flattenedDocumentTypes: {
              titleTh: typeof renderData.titleTh,
              titleEn: typeof renderData.titleEn,
              layout: typeof renderData.layout,
              rendererVersion: typeof renderData.rendererVersion,
            },
            renderBlocks: Object.keys(
              Object.keys(renderData).length > 0 ? renderData : humanDocument,
            ).sort(),
          });
          rejectedTypes.push(change.credential.cardType);
          ackResults.push({
            eventId: change.eventId,
            outcome: "rejected",
            reasonCode: "wallet_verification_failed",
          });
          continue;
        }
        documents.push(prepared.document);
        const card = walletCardForDocumentRendering(prepared.document);
        const model = credentialRenderModelFromCard(card);
        expect(model.documentType).toBe(change.credential.cardType);
        expect(model.paper.title.th || model.paper.title.en).toBeTruthy();
        rendered += 1;
        ackResults.push({ eventId: change.eventId, outcome: "applied" });
      } else {
        ackResults.push({ eventId: change.eventId, outcome: "archived" });
      }
    }
    expect(rendered).toBeGreaterThan(0);
    expect(rejectedTypes).toHaveLength(0);
    console.info(
      `Verified, normalized, and rendered ${rendered} live Portal credentials for ${username}; quarantined ${rejectedTypes.length} unsupported trust artifacts.`,
    );

    const ack = await exchange.acknowledgeSync(
      { syncId: page.syncId, cursor: page.nextCursor, results: ackResults },
      `live-ack-${username}-${page.syncId}`,
    );
    expect(ack.syncId).toBe(page.syncId);
    expect(ack.summary.applied + ack.summary.archived + ack.summary.rejected).toBe(
      page.changes.length,
    );

    let graphState = createWalletClinicalDocumentGraphState({
      portalOrigin: portalBaseUrl,
      holderDid: holder.did,
    });
    let graphPages = 0;
    while (true) {
      const graphPage = await exchange.syncClinicalDocumentGraph({
        cursor: graphState.nextCursor,
        limit: 1_000,
      });
      const reduction = prepareWalletClinicalDocumentGraphSyncCommit({
        state: graphState,
        page: graphPage,
        graphContract: contracts.clinicalDocumentGraph.payload,
      });
      graphState = reduction.state;
      graphPages += 1;
      if (!graphPage.hasMore) break;
    }
    const graphArtifacts = listClinicalDocumentGraphArtifacts(graphState);
    expect(graphArtifacts.length).toBeGreaterThan(0);
    for (const artifact of graphArtifacts) {
      const presentation = buildClinicalDocumentGraphPresentation({
        state: graphState,
        graphContract: contracts.clinicalDocumentGraph.payload,
        selectedArtifactId: artifact.artifactId,
      });
      expect(presentation.requestedArtifactId).toBe(artifact.artifactId);
      expect(presentation.stages.map((stage) => stage.key)).toEqual([
        "source",
        "fhir",
        "document",
        "retrieval",
        "attestation",
        "vc",
        "shl",
        "vp",
      ]);
    }

    expect(catalogIdentity?.portraitUrl).toEqual(expect.any(String));
    const avatar = await synchronizeWalletAvatar({
      walletUserId: catalogIdentity?.walletUserId ?? username,
      holderDid: holder.did,
      documents,
      expectedSandboxPortraitUrl: catalogIdentity?.portraitUrl,
    });
    if (avatar.status !== "ready") {
      console.info("Live avatar validation failed", {
        username,
        status: avatar.status,
        catalogPortraitUrl: catalogIdentity?.portraitUrl,
        signedPortraitUrls: documents.flatMap((document) => {
          const subject = record(
            record(document.content.credentialPayload).credentialSubject,
          );
          const human = record(record(subject.data).humanDocument);
          const nested = record(human.renderData);
          const patient = record(
            (Object.keys(nested).length > 0 ? nested : human).patient,
          );
          return typeof patient.photoUrl === "string"
            ? [patient.photoUrl]
            : typeof patient.portraitUrl === "string"
              ? [patient.portraitUrl]
              : [];
        }),
        sourceUrl: avatar.sourceUrl,
        httpStatus: avatar.httpStatus,
        mediaType: avatar.mediaType,
        errorCode: avatar.errorCode,
        requestId: avatar.requestId,
        correlationId: avatar.correlationId,
      });
    }
    expect(avatar).toMatchObject({
      status: "ready",
      httpStatus: 200,
      mediaType: expect.stringMatching(/^image\//),
      proofScope: expect.stringMatching(
        /^(issuer_signed_digest|cache_integrity_only)$/,
      ),
    });

    const replay = await exchange.syncCredentials({
      cursor: page.nextCursor,
      limit: 100,
      knownCredentials: page.changes.flatMap((change) =>
        change.type === "credential.upsert"
          ? [
              {
                credentialId: change.credentialId,
                contentHash: change.contentHash,
                status: change.status,
              },
            ]
          : [],
      ),
    });
    const knownCredentialHashes = new Map(
      page.changes.flatMap((change) =>
        change.type === "credential.upsert"
          ? [[change.credentialId, change.contentHash] as const]
          : [],
      ),
    );
    const duplicateKnownUpserts = replay.changes.filter(
      (change) =>
        change.type === "credential.upsert" &&
        knownCredentialHashes.get(change.credentialId) === change.contentHash,
    );
    // A delta feed may legitimately contain a later status or reissue event.
    // Replay safety means it must not resend an already-known signed object.
    expect(duplicateKnownUpserts).toHaveLength(0);
    console.info("Live Wallet sandbox acceptance", {
      username,
      accepted: rendered,
      quarantined: rejectedTypes.length,
      avatarHttpStatus: avatar.httpStatus,
      graphPages,
      graphArtifacts: graphArtifacts.length,
      graphStages: 8,
      replayChanges: replay.changes.length,
      requestId: exchange.lastResponseTrace?.requestId,
      correlationId: exchange.lastResponseTrace?.correlationId,
    });
    if (p0LiveEnabled) {
      await runPortalP0Completion({
        username,
        holder,
        exchange,
        contracts,
        issuers,
        documents,
        initialPage: page,
        graphState,
      });
    }
  }, p0LiveEnabled ? 300_000 : 120_000);
});

describe.skipIf(!negativeLiveEnabled)(
  "live Portal negative Wallet onboarding",
  () => {
    it.each([
      "portal-empty-patient-001",
      "partner-patient-001",
      "partner-patient-002",
    ])(
      "keeps %s unlinked without creating a holder fixture",
      async (negativeUsername) => {
        const provisioning = new WalletProvisioningClient({
          portalBaseUrl,
          appId,
        });
        await provisioning.reloadConfiguration();
        const catalog = await provisioning.listSandboxTestIdentities();
        expect(
          catalog.find((entry) => entry.username === negativeUsername),
        ).toMatchObject({
          walletUserId: negativeUsername,
          holder: null,
          portraitUrl: null,
          expectedProvisioningState: "patient_reference_required",
          patientReferenceProvisioned: false,
        });
        expect(
          await sandboxHolderIdentityForUser({
            userId: negativeUsername,
            sandboxRuntime: true,
          }),
        ).toBeUndefined();

        const oidc = await provisioning.sandboxTestLogin(negativeUsername);
        let failure: WalletProvisioningProblemError | undefined;
        try {
          await provisioning.getWalletIdentity(oidc.accessToken);
        } catch (reason) {
          failure =
            reason instanceof WalletProvisioningProblemError
              ? reason
              : undefined;
        }
        expect(failure).toBeDefined();
        console.info("Live negative Wallet onboarding", {
          username: negativeUsername,
          status: failure?.status,
          code: failure?.code,
          requestId: failure?.requestId,
          correlationId: failure?.correlationId,
        });
        expect(failure?.status).toBe(422);
        expect(failure?.code).toMatch(
          /^(wallet_onboarding_required|wallet_patient_binding_unavailable)$/,
        );
        expect(failure?.requestId).toEqual(expect.any(String));
        expect(failure?.correlationId).toEqual(expect.any(String));
      },
      30_000,
    );
  },
);

type LiveContracts = Awaited<ReturnType<typeof loadWalletExchangeContracts>>;
type LiveIssuers = Awaited<
  ReturnType<typeof resolveAllPortalHospitalIssuers>
>;
type LiveSyncPage = Awaited<
  ReturnType<WalletExchangeV2Client["syncCredentials"]>
>;
type LiveGraphState = ReturnType<
  typeof createWalletClinicalDocumentGraphState
>;

type PortalStaffSession = {
  cookie: string;
  user: {
    id: number;
    openId: string;
    hospitalId: number;
  };
};

const staffSessionCache = new Map<string, Promise<PortalStaffSession>>();

async function runPortalP0Completion(input: {
  username: string;
  holder: HolderSigningIdentity;
  exchange: WalletExchangeV2Client;
  contracts: LiveContracts;
  issuers: LiveIssuers;
  documents: WalletDocumentRecordV2[];
  initialPage: LiveSyncPage;
  graphState: LiveGraphState;
}): Promise<void> {
  const tcc = input.issuers.find((issuer) => issuer.hospitalCode === "TCC");
  if (!tcc) throw new Error("Portal TCC issuer discovery is unavailable.");
  const sourceDocument =
    input.documents.find(
      (document) =>
        document.documentType === "medical_certificate" &&
        !isTerminalDocumentStatus(document.lifecycle.status) &&
        ["verified", "issuer_signed_untrusted"].includes(
          document.trust.state,
        ) &&
        document.credential.jwt,
    ) ??
    input.documents.find(
      (document) =>
        !isTerminalDocumentStatus(document.lifecycle.status) &&
        ["verified", "issuer_signed_untrusted"].includes(
          document.trust.state,
        ) &&
        document.credential.jwt,
    );
  if (!sourceDocument) {
    throw new Error(
      `No active issuer-signed source document is available for ${input.username}.`,
    );
  }

  const runId = `${Date.now()}-${globalThis.crypto.randomUUID()}`;
  const consentRef = `wallet-consent:p0:${input.username}:${runId}`;
  const purpose = "continuity_of_care";
  const knownCredentials = new Map(
    input.initialPage.changes.flatMap((change) =>
      change.type === "credential.upsert"
        ? [[change.credentialId, change.contentHash] as const]
        : [],
    ),
  );

  const credentialRequest = await input.exchange.requestCredential(
    {
      clientRequestId: `p0-credential-${input.username}-${runId}`,
      targetHospitalCode: "TCC",
      context: "opd_visit",
      purpose,
      consentRef,
      credentialTypes: ["medical_certificate"],
      notes: "Sandbox P0 Wallet Exchange acceptance run",
    },
    `p0-credential-request-${input.username}-${runId}`,
  );
  expect(credentialRequest.sandboxRunId).toMatch(/^sandbox:v1:[a-f0-9]{64}$/);
  let credentialRequestStatus = await input.exchange.getCredentialRequestStatus(
    credentialRequest.requestId,
  );
  if (credentialRequestStatus.nextAction !== "sync_credentials") {
    const maker = await portalStaffLogin(
      "demo-nurse-001",
      "issuer_maker",
    );
    const checker = await portalStaffLogin(
      "demo-doctor-001",
      "issuer_checker",
    );
    expect(maker.user.id).not.toBe(checker.user.id);
    expect(maker.user.hospitalId).toBe(checker.user.hospitalId);
    const pending = await portalTrpc<unknown[]>(
      maker,
      "credential.pendingWalletCredentialRequests",
      "query",
      { hospitalId: maker.user.hospitalId },
    );
    const queueItem = findWalletQueueItem({
      pending,
      exchangeRequestId: credentialRequest.requestId,
      itemRequestIds: credentialRequestStatus.items.map((item) => item.requestId),
    });
    const claimed = await portalTrpc<Record<string, unknown>>(
      maker,
      "credential.claimWalletCredentialRequest",
      "mutation",
      {
        walletDocumentRequestId: queueItem.id,
        documentData: makerDocumentData(sourceDocument, runId),
        canonicalReview: {
          status: "maker_reviewed_wallet_request",
          requiredBeforeIssue: true,
          consentRef,
        },
      },
    );
    const issuanceRequestId = positiveInteger(
      claimed.id,
      "Portal issuance request ID",
    );
    const approval = await portalTrpc<Record<string, unknown>>(
      checker,
      "makerChecker.approve",
      "mutation",
      {
        id: issuanceRequestId,
        comment: "Independent Checker approval for Wallet P0 acceptance",
      },
    );
    if (approval.success !== true) {
      throw new Error("Portal Checker did not complete KMS issuance.");
    }
    credentialRequestStatus = await pollCredentialRequestReady(
      input.exchange,
      credentialRequest.requestId,
    );
  }
  expect(credentialRequestStatus.nextAction).toBe("sync_credentials");
  expect(
    credentialRequestStatus.items.every(
      (item) =>
        item.status === "converted_to_vc" &&
        item.reasonCode === "credential_issued" &&
        item.nextAction === "sync_credentials",
    ),
  ).toBe(true);

  const credentialDelta = await syncVerifyAndAck({
    exchange: input.exchange,
    contracts: input.contracts,
    issuers: input.issuers,
    holderDid: input.holder.did,
    cursor: input.initialPage.nextCursor,
    knownCredentials,
    ackKey: `p0-credential-ack-${input.username}-${runId}`,
  });
  const issuedDocument = credentialDelta.documents.find(
    (document) => document.documentType === "medical_certificate",
  );
  if (!issuedDocument?.credential.jwt) {
    throw new Error(
      `Portal did not deliver the Maker/Checker medical certificate for ${input.username}.`,
    );
  }

  const directVp = await createHolderSignedDirectVp({
    identity: input.holder,
    audience: portalBaseUrl,
    recipient: tcc.issuerDid,
    context: "opd_visit",
    purpose,
    consentRef,
    credentialJwts: [issuedDocument.credential.jwt],
  });
  const submissionRequest = {
    clientSubmissionId: `p0-submission-${input.username}-${runId}`,
    context: "opd_visit" as const,
    purpose,
    consentRef,
    transport: directVp.transport,
  };
  const submissionKey = `p0-submission-${input.username}-${runId}`;
  const submission = await input.exchange.submitDocuments(
    submissionRequest,
    submissionKey,
  );
  const submissionReplay = await input.exchange.submitDocuments(
    submissionRequest,
    submissionKey,
  );
  expect(submissionReplay).toMatchObject({
    submissionId: submission.submissionId,
    idempotent: true,
  });
  const submissionStatus = await input.exchange.getSubmissionStatus(
    submission.submissionId,
  );
  expect(["accepted", "needs_review", "partial"]).toContain(
    submissionStatus.status,
  );
  expect(submissionStatus.status).not.toBe("rejected");

  const shlPackageId = createShlPackageId();
  const shareGateway = input.contracts.discovery.endpoints.shareGateway.replace(
    /\/$/,
    "",
  );
  const preparedShl = await prepareHolderAttestedShl({
    identity: input.holder,
    portalOrigin: portalBaseUrl,
    publicationId: shlPackageId,
    manifestUrl: `${shareGateway}/manifests/${shlPackageId}.json`,
    fileBaseUrl: `${shareGateway}/files/`,
    documents: [issuedDocument],
    trustedIssuerDids: input.issuers.map((issuer) => issuer.issuerDid),
    purpose,
    recipient: tcc.issuerDid,
    audience: portalBaseUrl,
    context: "opd_visit",
    consentRef,
    targetHospitalCode: "TCC",
    expiresAt: new Date(Date.now() + 20 * 60_000),
    passcodeRequired: false,
    maxAccessCount: 5,
  });
  const shlRequestKey = `p0-shl-certification-${input.username}-${runId}`;
  const shlRequest = await input.exchange.requestShlCertification(
    preparedShl.certificationRequest,
    shlRequestKey,
  );
  expect(shlRequest.sandboxRunId).toMatch(/^sandbox:v1:[a-f0-9]{64}$/);
  let shlRequestStatus = await input.exchange.getCredentialRequestStatus(
    shlRequest.requestId,
  );
  if (shlRequestStatus.nextAction !== "sync_credentials") {
    const maker = await portalStaffLogin(
      "demo-nurse-001",
      "issuer_maker",
    );
    const checker = await portalStaffLogin(
      "demo-doctor-001",
      "issuer_checker",
    );
    const pending = await portalTrpc<unknown[]>(
      maker,
      "credential.pendingWalletShlCertificationRequests",
      "query",
      { hospitalId: maker.user.hospitalId },
    );
    const queueItem = findWalletQueueItem({
      pending,
      exchangeRequestId: shlRequest.requestId,
      itemRequestIds: shlRequestStatus.items.map((item) => item.requestId),
      shlPackageId,
    });
    const claimed = await portalTrpc<Record<string, unknown>>(
      maker,
      "credential.claimWalletShlCertificationRequest",
      "mutation",
      { walletDocumentRequestId: queueItem.id },
    );
    const issuanceRequestId = positiveInteger(
      claimed.id,
      "Portal SHL issuance request ID",
    );
    const approval = await portalTrpc<Record<string, unknown>>(
      checker,
      "makerChecker.approve",
      "mutation",
      {
        id: issuanceRequestId,
        comment: "Independent Checker approval for certified SHL",
      },
    );
    if (approval.success !== true) {
      throw new Error("Portal Checker did not issue the Manifest VC.");
    }
    shlRequestStatus = await pollCredentialRequestReady(
      input.exchange,
      shlRequest.requestId,
    );
  }
  expect(shlRequestStatus.nextAction).toBe("sync_credentials");

  const shlDelta = await syncVerifyAndAck({
    exchange: input.exchange,
    contracts: input.contracts,
    issuers: input.issuers,
    holderDid: input.holder.did,
    cursor: credentialDelta.nextCursor,
    knownCredentials,
    ackKey: `p0-shl-ack-${input.username}-${runId}`,
  });
  const manifestDocument = shlDelta.documents.find(
    (document) => document.documentType === "shl_manifest",
  );
  const manifestCredentialJwt = manifestDocument?.credential.jwt;
  if (!manifestDocument || !manifestCredentialJwt) {
    throw new Error(
      `Portal did not deliver the hospital-signed Manifest VC for ${input.username}.`,
    );
  }
  const manifestPayload = decodeJwt(manifestCredentialJwt);
  const manifestClaims = record(
    record(manifestPayload.credentialSubject).data,
  );
  const shlId = positiveInteger(
    manifestClaims.smartHealthLinkId,
    "Portal SHL ID",
  );
  const manifestCredentialId = String(manifestPayload.id ?? "");
  if (!manifestCredentialId) throw new Error("Manifest VC ID is missing.");
  expect(manifestClaims.manifestHash).toBe(preparedShl.manifestHash);
  expect(manifestClaims.sourceBundleHash).toBe(preparedShl.sourceBundleHash);

  const associationAudience = shlAssociationEndpoint(
    input.contracts.discovery.endpoints.shlAssociations,
    shlId,
  );
  const holderVp = await createHolderSignedShlAssociationVp({
    identity: input.holder,
    audience: associationAudience,
    recipient: tcc.issuerDid,
    context: "opd_visit",
    purpose,
    consentRef,
    shlId,
    manifestHash: preparedShl.manifestHash as `sha256:${string}`,
    sourceBundleHash: preparedShl.sourceBundleHash as `sha256:${string}`,
    manifestCredentialId,
    manifestCredentialJwt,
  });
  if (input.username === linkedUsernames[0]) {
    await expectWalletProblem(
      () =>
        input.exchange.associateShlPresentation(
          shlId,
          {
            clientAssociationId: `negative-altered-${runId}`,
            consentRef,
            holderVpJwt: alterCompactJwt(holderVp.vpJwt),
          },
          `negative-altered-${runId}`,
        ),
      [409, 422],
      "altered_holder_vp",
    );
    const wrongAudienceVp = await createHolderSignedShlAssociationVp({
      identity: input.holder,
      audience: `${portalBaseUrl}/verifier`,
      recipient: tcc.issuerDid,
      context: "opd_visit",
      purpose,
      consentRef,
      shlId,
      manifestHash: preparedShl.manifestHash as `sha256:${string}`,
      sourceBundleHash: preparedShl.sourceBundleHash as `sha256:${string}`,
      manifestCredentialId,
      manifestCredentialJwt,
    });
    await expectWalletProblem(
      () =>
        input.exchange.associateShlPresentation(
          shlId,
          {
            clientAssociationId: `negative-audience-${runId}`,
            consentRef,
            holderVpJwt: wrongAudienceVp.vpJwt,
          },
          `negative-audience-${runId}`,
        ),
      [422],
      "wrong_shl_audience",
    );
  }
  const associationRequest = {
    clientAssociationId: `p0-association-${input.username}-${runId}`,
    consentRef,
    holderVpJwt: holderVp.vpJwt,
  };
  const associationKey = `p0-association-${input.username}-${runId}`;
  const associated = await input.exchange.associateShlPresentation(
    shlId,
    associationRequest,
    associationKey,
  );
  expect(associated).toMatchObject({
    status: "active",
    trustLevel: "hospital_certified",
    holderPresentationJwt: holderVp.vpJwt,
    holderDid: input.holder.did,
    manifestCredentialId,
    manifestHash: preparedShl.manifestHash,
    sourceBundleHash: preparedShl.sourceBundleHash,
  });
  const associationReplay = await input.exchange.associateShlPresentation(
    shlId,
    associationRequest,
    associationKey,
  );
  expect(associationReplay).toMatchObject({
    holderPresentationJwt: holderVp.vpJwt,
    idempotent: true,
  });

  const restartedExchange = new WalletExchangeV2Client({
    contracts: input.contracts,
    identity: input.holder,
    appId,
    requestedScopes: [
      "credentials:read",
      "credentials:request",
      "credentials:present",
      "documents:read",
      "documents:write",
    ],
  });
  await restartedExchange.createSession();
  const recovered = await restartedExchange.getShlAssociation(shlId);
  expect(recovered).toMatchObject({
    shlId,
    status: "active",
    holderPresentationJwt: holderVp.vpJwt,
    holderPresentationDigest: associated.holderPresentationDigest,
    holderDid: input.holder.did,
    appId,
  });

  const graph = await syncGraphToEnd({
    exchange: restartedExchange,
    contracts: input.contracts,
    state: input.graphState,
  });
  expect(graph.artifacts.length).toBeGreaterThan(0);
  expect(graph.presentations).toBe(graph.artifacts.length);
  console.info("Live Wallet P0 completion", {
    username: input.username,
    credentialRequestId: credentialRequest.requestId,
    credentialStatus: credentialRequestStatus.status,
    credentialDeltaAccepted: credentialDelta.documents.length,
    directSubmissionId: submission.submissionId,
    directSubmissionStatus: submissionStatus.status,
    shlRequestId: shlRequest.requestId,
    shlStatus: associated.status,
    shlId,
    recoveredExactHolderVp: recovered.holderPresentationJwt === holderVp.vpJwt,
    graphArtifacts: graph.artifacts.length,
    graphStages: 8,
    requestId: restartedExchange.lastResponseTrace?.requestId,
    correlationId: restartedExchange.lastResponseTrace?.correlationId,
  });
}

async function syncVerifyAndAck(input: {
  exchange: WalletExchangeV2Client;
  contracts: LiveContracts;
  issuers: LiveIssuers;
  holderDid: string;
  cursor: string;
  knownCredentials: Map<string, string>;
  ackKey: string;
}): Promise<{
  nextCursor: string;
  documents: WalletDocumentRecordV2[];
}> {
  let cursor = input.cursor;
  const documents: WalletDocumentRecordV2[] = [];
  let pageIndex = 0;
  while (true) {
    const page = await input.exchange.syncCredentials({
      cursor,
      limit: 100,
      knownCredentials: [...input.knownCredentials].map(
        ([credentialId, contentHash]) => ({
          credentialId,
          contentHash,
          status: "active" as const,
        }),
      ),
    });
    const results: Array<{
      eventId: string;
      outcome: "applied" | "archived";
    }> = [];
    for (const change of page.changes) {
      if (change.type === "credential.upsert") {
        const prepared = await prepareWalletExchangeCredential({
          change,
          portalBaseUrl,
          holderDid: input.holderDid,
          requiredRenderBlocks: input.contracts.renderContract.payload.requiredBlocks,
          resolvedIssuer: input.issuers.find(
            (issuer) => issuer.issuerDid === change.credential.issuerDid,
          ),
        });
        if (!prepared.document) {
          throw new Error(
            `New Portal credential ${change.credentialId} failed strict Wallet verification.`,
          );
        }
        documents.push(prepared.document);
        input.knownCredentials.set(change.credentialId, change.contentHash);
        results.push({ eventId: change.eventId, outcome: "applied" });
      } else {
        results.push({ eventId: change.eventId, outcome: "archived" });
      }
    }
    await input.exchange.acknowledgeSync(
      { syncId: page.syncId, cursor: page.nextCursor, results },
      `${input.ackKey}-${pageIndex}`,
    );
    cursor = page.nextCursor;
    pageIndex += 1;
    if (!page.hasMore) break;
  }
  return { nextCursor: cursor, documents };
}

async function syncGraphToEnd(input: {
  exchange: WalletExchangeV2Client;
  contracts: LiveContracts;
  state: LiveGraphState;
}): Promise<{
  state: LiveGraphState;
  artifacts: ReturnType<typeof listClinicalDocumentGraphArtifacts>;
  presentations: number;
}> {
  let state = input.state;
  while (true) {
    const page = await input.exchange.syncClinicalDocumentGraph({
      cursor: state.nextCursor,
      limit: 1_000,
    });
    state = prepareWalletClinicalDocumentGraphSyncCommit({
      state,
      page,
      graphContract: input.contracts.clinicalDocumentGraph.payload,
    }).state;
    if (!page.hasMore) break;
  }
  const artifacts = listClinicalDocumentGraphArtifacts(state);
  for (const artifact of artifacts) {
    const presentation = buildClinicalDocumentGraphPresentation({
      state,
      graphContract: input.contracts.clinicalDocumentGraph.payload,
      selectedArtifactId: artifact.artifactId,
    });
    expect(presentation.stages.map((stage) => stage.key)).toEqual([
      "source",
      "fhir",
      "document",
      "retrieval",
      "attestation",
      "vc",
      "shl",
      "vp",
    ]);
  }
  return { state, artifacts, presentations: artifacts.length };
}

async function portalStaffLogin(
  openId: string,
  activeRole: "issuer_maker" | "issuer_checker",
): Promise<PortalStaffSession> {
  const key = `${openId}:${activeRole}`;
  const existing = staffSessionCache.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(`${portalBaseUrl}/api/iam/test-login`, {
      method: "POST",
      headers: {
        accept: "application/json, application/problem+json",
        "content-type": "application/json",
        "x-request-id": `wallet-p0-staff-${globalThis.crypto.randomUUID()}`,
      },
      body: JSON.stringify({ openId, activeRole }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw tracedHttpError("Portal staff test login failed", response, payload);
    }
    const object = record(payload);
    const user = record(object.user);
    const cookieHeader = response.headers.get("set-cookie") ?? "";
    const cookie = cookieHeader.match(/(?:^|[, ]+)app_session_id=([^;, ]+)/)?.[1];
    if (!cookie) throw new Error("Portal staff login did not return a session cookie.");
    return {
      cookie: `app_session_id=${cookie}`,
      user: {
        id: positiveInteger(user.id, "Portal staff user ID"),
        openId: String(user.openId ?? ""),
        hospitalId: positiveInteger(user.hospitalId, "Portal staff hospital ID"),
      },
    };
  })();
  staffSessionCache.set(key, pending);
  try {
    return await pending;
  } catch (reason) {
    staffSessionCache.delete(key);
    throw reason;
  }
}

async function portalTrpc<T>(
  session: PortalStaffSession,
  procedure: string,
  method: "query" | "mutation",
  input: unknown,
): Promise<T> {
  const endpoint = new URL(`${portalBaseUrl}/api/trpc/${procedure}`);
  const serialized = JSON.stringify({ json: input });
  if (method === "query") endpoint.searchParams.set("input", serialized);
  const response = await fetch(endpoint, {
    method: method === "query" ? "GET" : "POST",
    headers: {
      accept: "application/json, application/problem+json",
      ...(method === "mutation" ? { "content-type": "application/json" } : {}),
      cookie: session.cookie,
      "x-request-id": `wallet-p0-trpc-${globalThis.crypto.randomUUID()}`,
    },
    ...(method === "mutation" ? { body: serialized } : {}),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || record(payload).error) {
    throw tracedHttpError(`Portal tRPC ${procedure} failed`, response, payload);
  }
  const result = record(record(payload).result);
  const data = record(result.data);
  return data.json as T;
}

function findWalletQueueItem(input: {
  pending: unknown[];
  exchangeRequestId: string;
  itemRequestIds: string[];
  shlPackageId?: string;
}): { id: number } {
  const itemRequestIds = new Set(input.itemRequestIds);
  for (const candidate of input.pending) {
    const row = record(candidate);
    const metadata = record(row.metadata);
    if (
      itemRequestIds.has(String(row.requestId ?? "")) ||
      metadata.exchangeRequestId === input.exchangeRequestId ||
      (input.shlPackageId !== undefined &&
        metadata.shlPackageId === input.shlPackageId)
    ) {
      return { id: positiveInteger(row.id, "Wallet queue item ID") };
    }
  }
  throw new Error(
    `Portal Maker queue does not contain Wallet request ${input.exchangeRequestId}.`,
  );
}

function makerDocumentData(
  source: WalletDocumentRecordV2,
  runId: string,
): Record<string, unknown> {
  const payload = record(source.content.credentialPayload);
  const subject = record(payload.credentialSubject);
  const signedData = record(subject.data);
  const humanDocument = record(signedData.humanDocument);
  const result: Record<string, unknown> = {
    schemaVersion: "1.0.0",
    clinical: signedData.clinical ?? source.content.patientSummary ?? {},
    fhir: signedData.fhir ?? source.content.fhirDocument ?? {},
    humanDocument,
    diagnosisText: "Continuity-of-care assessment completed in sandbox",
    fitnessForWork: "fit_with_restrictions",
    recommendations: [
      "Continue the current treatment plan and attend the scheduled follow-up.",
    ],
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    sourceOfTruth: {
      system: "hospital_his",
      sourceCredentialId: source.credential.credentialId,
      sandboxRunId: runId,
    },
  };
  assertNoPatientId(result);
  return result;
}

async function pollCredentialRequestReady(
  exchange: WalletExchangeV2Client,
  requestId: string,
): ReturnType<WalletExchangeV2Client["getCredentialRequestStatus"]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await exchange.getCredentialRequestStatus(requestId);
    if (status.nextAction === "sync_credentials") return status;
    if (status.status === "rejected") {
      throw new Error(`Portal rejected credential request ${requestId}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Portal credential request ${requestId} did not become ready.`);
}

async function expectWalletProblem(
  operation: () => Promise<unknown>,
  expectedStatuses: number[],
  label: string,
): Promise<void> {
  let problem: WalletExchangeProblemError | undefined;
  try {
    await operation();
  } catch (reason) {
    if (reason instanceof WalletExchangeProblemError) problem = reason;
    else throw reason;
  }
  if (!problem || !expectedStatuses.includes(problem.status ?? 0)) {
    throw new Error(`${label} did not fail with the expected Portal problem.`);
  }
  expect(problem.requestId).toEqual(expect.any(String));
  expect(problem.correlationId).toEqual(expect.any(String));
  console.info("Live Wallet negative P0 result", {
    label,
    status: problem.status,
    code: problem.code,
    requestId: problem.requestId,
    correlationId: problem.correlationId,
  });
}

function shlAssociationEndpoint(template: string, shlId: number): string {
  return template.includes("{shlId}")
    ? template.replace("{shlId}", String(shlId))
    : `${template.replace(/\/$/, "")}/${shlId}`;
}

function alterCompactJwt(jwt: string): string {
  const replacement = jwt.endsWith("A") ? "B" : "A";
  return `${jwt.slice(0, -1)}${replacement}`;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function isTerminalDocumentStatus(status: string): boolean {
  return [
    "superseded",
    "entered_in_error",
    "expired",
    "suspended",
    "revoked",
  ].includes(status);
}

function assertNoPatientId(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(assertNoPatientId);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
      throw new Error("Wallet P0 request must not contain Portal patientId.");
    }
    assertNoPatientId(nested);
  }
}

function tracedHttpError(
  label: string,
  response: Response,
  payload: unknown,
): Error {
  const body = record(payload);
  const error = record(body.error);
  const json = record(error.json);
  return new Error(
    [
      label,
      `status=${response.status}`,
      `code=${String(body.code ?? json.code ?? "unknown")}`,
      `detail=${String(body.detail ?? error.message ?? json.message ?? "unknown")}`,
      `requestId=${response.headers.get("x-request-id") ?? "missing"}`,
      `correlationId=${response.headers.get("x-correlation-id") ?? "missing"}`,
    ].join(" "),
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
