import { describe, expect, it } from "vitest";
import {
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  TrustCareContractError,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  assertWalletCredentialRequest,
  assertWalletCredentialRequestInput,
  assertWalletCredentialRequestStatus,
  assertWalletExchangeDiscovery,
  assertWalletProblemDetails,
  assertWalletSession,
  assertWalletSessionChallenge,
  assertWalletSessionChallengeRequest,
  assertWalletSessionCompletionRequest,
  assertWalletSubmission,
  assertWalletSubmissionRequest,
  assertWalletSubmissionStatus,
  assertWalletSyncAck,
  assertWalletSyncAckRequest,
  assertWalletSyncPage,
  assertWalletSyncRequest,
} from "./index";

const PORTAL = "https://trustcare-hospital-network-production.up.railway.app";
const HOLDER_DID = "did:key:z6Mktestholderpublickey";
const HOLDER_KID = `${HOLDER_DID}#z6Mktestholderpublickey`;
const JWT = `${"a".repeat(30)}.${"b".repeat(60)}.${"c".repeat(40)}`;
const HASH = `sha256:${"a".repeat(64)}`;
const CURSOR = "opaque.cursor.signature.1234567890";

function discoveryFixture() {
  return {
    name: "TrustCare Portal Wallet Exchange API",
    version: "2.0.0",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    authorization: {
      challengeEndpoint: `${PORTAL}/api/wallet/v2/session-challenges`,
      sessionEndpoint: `${PORTAL}/api/wallet/v2/sessions`,
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
      credentialSync: `${PORTAL}/api/wallet/v2/credentials/sync`,
      credentialSyncAck: `${PORTAL}/api/wallet/v2/credentials/sync/ack`,
      credentialRequests: `${PORTAL}/api/wallet/v2/credential-requests`,
      documentSubmissions: `${PORTAL}/api/wallet/v2/submissions`,
      publicContracts: `${PORTAL}/api/public/wallet-contracts`,
      shareGateway: `${PORTAL}/api/share-gateway`,
      issuerJwks: `${PORTAL}/.well-known/jwks.json`,
      shlAssociations: `${PORTAL}/api/wallet/v2/shl-associations`,
      shlCertificationRequests: `${PORTAL}/api/wallet/v2/shl-certification-requests`,
    },
    protocols: {
      credentialLifecycle: "TrustCare durable cursor sync v2",
      presentation:
        "Wallet-created VP JWT or Certified SHL/Manifest VP reference",
      certifiedShl:
        "Portal KMS Manifest VC plus Wallet holder authorization and manifest VP",
      documentMetadata:
        "FHIR R4 DocumentReference; IHE MHD ITI-65 compatible intake mapping",
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
      referenceCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      referenceCommitRole: "provenance_only",
      compatibilityGate: "contract_profile_and_schema",
      renderVersion: "trustcare-render-v2",
      modelPackage: "@trustcare/wallet-core",
      webPackage: "@trustcare/ui-web",
      rule: "Portal must consume the Wallet renderer package if hospital-side rendering is required.",
    },
  };
}

function challengeFixture() {
  return {
    challengeId: "wxc_challenge123",
    expiresAt: "2026-07-11T10:05:00.000Z",
    proof: {
      protectedHeader: {
        typ: "trustcare-wallet-session+jwt",
        alg: "EdDSA",
        kid: HOLDER_KID,
      },
      payload: {
        iss: HOLDER_DID,
        sub: HOLDER_DID,
        aud: `${PORTAL}/api/wallet/v2/sessions`,
        jti: "wxc_challenge123",
        nonce: "base64url-random-nonce-value",
        purpose: "trustcare-wallet-exchange-session",
        iat: 1_783_764_000,
        exp: 1_783_764_300,
      },
    },
  };
}

function syncedCredentialFixture() {
  return {
    credentialId: "urn:uuid:credential-1",
    cardType: "medical_certificate",
    credentialType: "medical_certificate",
    displayName: "Medical certificate",
    displayNameEn: "Medical Certificate",
    documentCategory: "clinical_records",
    credentialStatus: "active",
    credentialData: {},
    proof: {
      type: "jwt",
      jwt: JWT,
      alg: "ES256",
      kid: `${PORTAL}:hospital:tcc#vc-signing-current`,
      issuer:
        "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc",
    },
    issuerDid:
      "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc",
    issuerHospitalName: "TrustCare Central Hospital",
    holderDid: HOLDER_DID,
    sourceSystem: "trustcare_portal",
    lineageKey: "medical-certificate-lineage",
    version: "1.0.0",
    contentHash: HASH,
    issuedAt: "2026-07-11T09:00:00.000Z",
    expiresAt: "2027-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
    deliveryState: "signed",
    renderer: {
      authority: "trustcare_wallet",
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      referenceCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      referenceCommitRole: "provenance_only",
      compatibilityGate: "contract_profile_and_schema",
      renderVersion: "trustcare-render-v1",
    },
  };
}

describe("Wallet Exchange V2 live contracts", () => {
  it("pins both live contract versions", () => {
    expect(WALLET_EXCHANGE_V2_CONTRACT_VERSION).toBe(
      "2026.07.wallet-exchange.v2.1.strict-w3c",
    );
    expect(PORTAL_WALLET_V2_CONTRACT_VERSION).toBe("2026.07.portal-wallet.v4");
  });

  it("validates discovery and rejects incompatible or expanded responses", () => {
    expect(assertWalletExchangeDiscovery(discoveryFixture())).toMatchObject({
      contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
      ownership: { vpCreation: "wallet" },
    });

    expect(() =>
      assertWalletExchangeDiscovery({
        ...discoveryFixture(),
        contractVersion: "2026.08.wallet-exchange.v3",
      }),
    ).toThrow(TrustCareContractError);
    expect(() =>
      assertWalletExchangeDiscovery({ ...discoveryFixture(), patientId: 42 }),
    ).toThrow(/patientId/);
    expect(() =>
      assertWalletExchangeDiscovery({
        ...discoveryFixture(),
        endpoints: {
          ...discoveryFixture().endpoints,
          issuerJwks: "https://old-wallet.example/.well-known/jwks.json",
        },
      }),
    ).toThrow(/same live Portal origin/);
  });

  it("validates challenge and session exchanges", () => {
    expect(
      assertWalletSessionChallengeRequest({
        appId: "trustcare-wallet-production",
        holderDid: HOLDER_DID,
        requestedScopes: ["credentials:read", "documents:read"],
      }),
    ).toMatchObject({ holderDid: HOLDER_DID });
    expect(assertWalletSessionChallenge(challengeFixture())).toMatchObject({
      challengeId: "wxc_challenge123",
    });
    expect(
      assertWalletSessionCompletionRequest({
        challengeId: "wxc_challenge123",
        proofJwt: JWT,
      }),
    ).toMatchObject({ challengeId: "wxc_challenge123" });
    expect(
      assertWalletSession({
        access_token: `wxt_${"a".repeat(64)}`,
        token_type: "DPoP",
        expires_in: 1_800,
        scope: "credentials:read documents:read",
        cnf: { jkt: "a".repeat(43) },
      }),
    ).toMatchObject({ token_type: "DPoP" });
  });

  it("validates durable sync pages and acknowledgements", () => {
    expect(
      assertWalletSyncRequest({
        cursor: CURSOR,
        limit: 100,
        knownCredentials: [
          {
            credentialId: "urn:uuid:credential-1",
            contentHash: HASH,
            status: "active",
          },
        ],
      }),
    ).toMatchObject({ limit: 100 });

    expect(
      assertWalletSyncPage({
        schema: "trustcare.wallet.sync.v2",
        contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
        syncId: "sync_batch123",
        mode: "delta",
        changes: [
          {
            eventId: "wse_event123",
            type: "credential.upsert",
            credentialId: "urn:uuid:credential-1",
            status: "active",
            occurredAt: "2026-07-11T10:00:00.000Z",
            contentHash: HASH,
            credential: syncedCredentialFixture(),
          },
          {
            eventId: "wse_event124",
            type: "credential.status",
            credentialId: "urn:uuid:credential-old",
            status: "revoked",
            occurredAt: "2026-07-11T10:02:00.000Z",
            lifecycle: {
              effectiveAt: "2026-07-11T10:02:00.000Z",
              reasonCode: "issuer_revoked",
            },
          },
        ],
        nextCursor: CURSOR,
        hasMore: false,
        serverTime: "2026-07-11T10:03:00.000Z",
      }),
    ).toMatchObject({ mode: "delta", hasMore: false });

    expect(
      assertWalletSyncAckRequest({
        syncId: "sync_batch123",
        cursor: CURSOR,
        results: [
          { eventId: "wse_event123", outcome: "applied" },
          {
            eventId: "wse_event124",
            outcome: "archived",
            reasonCode: "issuer_revoked",
          },
        ],
      }),
    ).toMatchObject({ syncId: "sync_batch123" });
    expect(
      assertWalletSyncAck({
        schema: "trustcare.wallet.sync-ack.v1",
        receiptId: "wsr_receipt123",
        syncId: "sync_batch123",
        acceptedAt: "2026-07-11T10:04:00.000Z",
        summary: { applied: 1, alreadyCurrent: 0, archived: 1, rejected: 0 },
        idempotent: false,
        note: "This is protocol acknowledgement metadata, not a clinical credential.",
      }),
    ).toMatchObject({ summary: { applied: 1, archived: 1 } });
  });

  it("validates credential request Maker/Checker progress", () => {
    expect(
      assertWalletCredentialRequestInput({
        clientRequestId: "wallet-request-00043",
        targetHospitalCode: "TCC",
        context: "opd_visit",
        purpose: "Prepare follow-up documents",
        consentRef: "urn:trustcare:consent:test",
        credentialTypes: ["medical_certificate", "prescription"],
      }),
    ).toMatchObject({ targetHospitalCode: "TCC" });
    expect(
      assertWalletCredentialRequest({
        schema: "trustcare.wallet.credential-request.v1",
        requestId: "wxr_request123",
        clientRequestId: "wallet-request-00043",
        status: "received",
        credentialTypes: ["medical_certificate", "prescription"],
        statusUrl: `${PORTAL}/api/wallet/v2/credential-requests/wxr_request123`,
        nextAction: "wait_for_maker_checker",
        createdAt: "2026-07-11T10:05:00.000Z",
        idempotent: false,
      }),
    ).toMatchObject({ status: "received" });
    expect(
      assertWalletCredentialRequestStatus({
        schema: "trustcare.wallet.credential-request-status.v1",
        requestId: "wxr_request123",
        clientRequestId: "wallet-request-00043",
        status: "ready",
        items: [
          {
            requestId: "wdr_item123",
            documentType: "medical_certificate",
            status: "converted_to_vc",
            updatedAt: "2026-07-11T10:15:00.000Z",
          },
        ],
        nextAction: "sync_credentials",
        updatedAt: "2026-07-11T10:15:00.000Z",
      }),
    ).toMatchObject({ status: "ready", nextAction: "sync_credentials" });
  });

  it("validates direct and Share Gateway submissions", () => {
    expect(
      assertWalletSubmissionRequest({
        clientSubmissionId: "wallet-submission-00044",
        context: "opd_visit",
        purpose: "Prepare follow-up documents",
        consentRef: "urn:trustcare:consent:test",
        transport: { mode: "direct_vp", vpJwt: JWT },
      }),
    ).toMatchObject({ transport: { mode: "direct_vp" } });
    expect(
      assertWalletSubmissionRequest({
        clientSubmissionId: "wallet-submission-00045",
        context: "referral",
        purpose: "Referral intake",
        consentRef: "urn:trustcare:consent:referral",
        transport: {
          mode: "share_gateway",
          artifactId: "vp_referral_00045",
          binding: {
            purpose: "Referral intake",
            recipient:
              "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc",
            audience: "https://trustcare.network/verifier",
            subjectDigest: HASH,
            packageDigest: HASH,
            contextDigest: HASH,
          },
        },
      }),
    ).toMatchObject({ transport: { mode: "share_gateway" } });
    expect(() =>
      assertWalletSubmissionRequest({
        clientSubmissionId: "wallet-submission-00046",
        context: "referral",
        purpose: "Referral intake",
        consentRef: "urn:trustcare:consent:referral",
        transport: {
          mode: "share_gateway",
          artifactId: "vp_referral_00046",
          binding: {
            purpose: "Different purpose",
            recipient:
              "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc",
            audience: "https://trustcare.network/verifier",
            subjectDigest: HASH,
            packageDigest: HASH,
            contextDigest: HASH,
          },
        },
      }),
    ).toThrow(/submission purpose/);

    const response = {
      schema: "trustcare.wallet.document-submission.v1",
      submissionId: "wds_submission123",
      clientSubmissionId: "wallet-submission-00044",
      status: "needs_review",
      presentationId: "wvp_presentation123",
      results: [
        {
          credentialId: "urn:uuid:credential-1",
          documentType: "medical_certificate",
          status: "needs_review",
          importId: "wimp_import123",
        },
      ],
      statusUrl: `${PORTAL}/api/wallet/v2/submissions/wds_submission123`,
      createdAt: "2026-07-11T10:10:00.000Z",
      updatedAt: "2026-07-11T10:10:00.000Z",
      idempotent: false,
    };
    expect(assertWalletSubmission(response)).toMatchObject({
      status: "needs_review",
    });
    expect(assertWalletSubmissionStatus(response)).toMatchObject({
      presentationId: "wvp_presentation123",
    });
  });

  it("validates RFC 9457 Wallet problem details", () => {
    expect(
      assertWalletProblemDetails({
        type: "https://portal.example/problems/wallet-exchange/invalid_request",
        title: "Invalid Wallet exchange request",
        status: 400,
        detail: "patientId is not allowed",
        code: "invalid_request",
        instance: "/api/wallet/v2/session-challenges",
        correlationId: "wallet-contract-test",
      }),
    ).toMatchObject({ status: 400, code: "invalid_request" });
  });

  it("rejects patientId and every unknown request field", () => {
    const cases: Array<
      [string, (value: unknown) => unknown, Record<string, unknown>]
    > = [
      [
        "challenge",
        assertWalletSessionChallengeRequest,
        {
          appId: "trustcare-wallet-production",
          holderDid: HOLDER_DID,
          requestedScopes: ["credentials:read"],
        },
      ],
      [
        "session",
        assertWalletSessionCompletionRequest,
        { challengeId: "wxc_challenge123", proofJwt: JWT },
      ],
      ["sync", assertWalletSyncRequest, { limit: 100, knownCredentials: [] }],
      [
        "ack",
        assertWalletSyncAckRequest,
        { syncId: "sync_batch123", cursor: CURSOR, results: [] },
      ],
      [
        "credential request",
        assertWalletCredentialRequestInput,
        {
          clientRequestId: "wallet-request-00043",
          targetHospitalCode: "TCC",
          context: "opd_visit",
          purpose: "Prepare follow-up documents",
          consentRef: "urn:trustcare:consent:test",
          credentialTypes: ["medical_certificate"],
        },
      ],
      [
        "submission",
        assertWalletSubmissionRequest,
        {
          clientSubmissionId: "wallet-submission-00044",
          context: "opd_visit",
          purpose: "Prepare follow-up documents",
          consentRef: "urn:trustcare:consent:test",
          transport: { mode: "direct_vp", vpJwt: JWT },
        },
      ],
    ];

    for (const [label, assertion, valid] of cases) {
      expect(
        () => assertion({ ...valid, patientId: 123 }),
        `${label} must reject patientId`,
      ).toThrow(/patientId/);
      expect(
        () =>
          assertion({
            ...valid,
            unknownRequiredField: "future-contract-field",
          }),
        `${label} must fail closed on unknown fields`,
      ).toThrow(/unknownRequiredField/);
    }
  });
});
