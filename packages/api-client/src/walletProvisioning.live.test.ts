import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  buildClinicalDocumentGraphPresentation,
  createWalletClinicalDocumentGraphState,
  credentialRenderModelFromCard,
  listClinicalDocumentGraphArtifacts,
  prepareWalletClinicalDocumentGraphSyncCommit,
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
  }, 120_000);
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
