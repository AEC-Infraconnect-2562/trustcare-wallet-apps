import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { generateHolderIdentity } from "@trustcare/wallet-core";
import type { ResolvedPortalHospitalIssuer } from "./portalIssuerResolver";
import {
  OID4VCI_FINAL_PROFILE,
  OID4VP_FINAL_PROFILE,
  PortalInteroperabilityProblemError,
  PortalQrInteroperabilityClient,
  QR_INTEROPERABILITY_CONTRACT_VERSION,
  TRUSTCARE_DIRECT_VC_FORMAT,
  type PortalInteroperabilityDiscovery,
} from "./qrInteroperability";

const ORIGIN = "https://portal.example";
const TRANSACTION_ID = "oid4vp_transaction_123";
const REQUEST_URI = `${ORIGIN}/api/qr/v1/oid4vp/requests/${TRANSACTION_ID}`;
const RESPONSE_URI = `${ORIGIN}/api/qr/v1/oid4vp/direct-post`;
const WALLET_NONCE = "wallet-nonce-1234567890";
const NOW_SECONDS = Math.floor(
  Date.parse("2026-07-19T03:00:00.000Z") / 1_000,
);

describe("Portal QR interoperability", () => {
  it("verifies a hospital-signed reference OID4VP request and its exact bindings", async () => {
    const fixture = await fixtureClient();
    const requestJwt = await fixture.requestJwt();
    const client = fixture.client(async () =>
      new Response(requestJwt, {
        status: 200,
        headers: {
          "content-type": "application/oauth-authz-req+jwt",
          "x-request-id": "request-1",
          "x-correlation-id": "correlation-1",
        },
      }),
    );

    const request = await client.resolveOid4vpRequest(
      oid4vpQr(fixture.issuer.issuerDid),
      WALLET_NONCE,
    );

    expect(request).toMatchObject({
      transactionId: TRANSACTION_ID,
      recipient: fixture.issuer.issuerDid,
      audience: RESPONSE_URI,
      context: "opd_visit",
      requiredCredentialTypes: ["PatientIdentityCredential"],
      requestId: "request-1",
      correlationId: "correlation-1",
    });
  });

  it("rejects a request kid that is not controlled by the signed hospital DID", async () => {
    const fixture = await fixtureClient();
    const requestJwt = await fixture.requestJwt({
      kid: `${fixture.issuer.issuerDid}#unregistered`,
    });
    const client = fixture.client(async () =>
      new Response(requestJwt, {
        status: 200,
        headers: { "content-type": "application/oauth-authz-req+jwt" },
      }),
    );

    await expect(
      client.resolveOid4vpRequest(
        oid4vpQr(fixture.issuer.issuerDid),
        WALLET_NONCE,
      ),
    ).rejects.toMatchObject({
      code: "portal_interoperability_contract_incompatible",
    });
  });

  it("rejects legacy vp wrapper claims in the signed request object", async () => {
    const fixture = await fixtureClient();
    const requestJwt = await fixture.requestJwt({ payload: { vp: {} } });
    const client = fixture.client(async () =>
      new Response(requestJwt, {
        status: 200,
        headers: { "content-type": "application/oauth-authz-req+jwt" },
      }),
    );

    await expect(
      client.resolveOid4vpRequest(
        oid4vpQr(fixture.issuer.issuerDid),
        WALLET_NONCE,
      ),
    ).rejects.toMatchObject({
      code: "portal_interoperability_contract_incompatible",
    });
  });

  it("preserves RFC 9457 status, code and trace identifiers", async () => {
    const fixture = await fixtureClient();
    const client = fixture.client(async () =>
      new Response(
        JSON.stringify({
          type: "https://portal.example/problems/replay",
          title: "Request already used",
          detail: "The request URI is no longer available.",
          code: "oid4vp_request_replayed",
          status: 409,
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": "request-replay",
            "x-correlation-id": "correlation-replay",
          },
        },
      ),
    );

    const error = await client
      .resolveOid4vpRequest(
        oid4vpQr(fixture.issuer.issuerDid),
        WALLET_NONCE,
      )
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PortalInteroperabilityProblemError);
    expect(error).toMatchObject({
      status: 409,
      code: "oid4vp_request_replayed",
      requestId: "request-replay",
      correlationId: "correlation-replay",
    });
  });

  it("accepts only a reference OID4VCI offer and never an embedded offer", async () => {
    const fixture = await fixtureClient();
    const offerUri = `${ORIGIN}/api/qr/v1/oid4vci/offers/offer_12345678`;
    const client = fixture.client(async () =>
      new Response(
        JSON.stringify({
          credential_issuer: ORIGIN,
          credential_configuration_ids: ["trustcare-patient-identity-vc2"],
          grants: {
            "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
              "pre-authorized_code": "one-time-pre-authorized-code",
              tx_code: { input_mode: "numeric", length: 6 },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(
      client.resolveOid4vciOffer(
        `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUri)}`,
      ),
    ).resolves.toMatchObject({
      offerUri,
      transactionCodeRequired: true,
      transactionCodeLength: 6,
    });
    await expect(
      client.resolveOid4vciOffer(
        "openid-credential-offer://?credential_offer=%7B%7D",
      ),
    ).rejects.toMatchObject({ code: "oid4vci_qr_invalid" });
  });
});

async function fixtureClient() {
  const holder = await generateHolderIdentity({ algorithm: "P-256" });
  const signing = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(signing.publicKey);
  const issuerDid = "did:web:portal.example:hospital:tcc";
  const kid = `${issuerDid}#issuer-key`;
  const issuer: ResolvedPortalHospitalIssuer = {
    portalOrigin: ORIGIN,
    hospitalCode: "TCC",
    issuerDid,
    didUrl: `${ORIGIN}/hospital/tcc/did.json`,
    jwksUrl: `${ORIGIN}/hospital/tcc/did/jwks.json`,
    didDocument: {
      id: issuerDid,
      verificationMethod: [
        {
          id: kid,
          type: "JsonWebKey2020",
          controller: issuerDid,
          publicKeyJwk: { ...publicJwk, kid },
        },
      ],
      assertionMethod: [kid],
      trustcare: { hospitalCode: "TCC", name: "TrustCare Central" },
    },
    jwks: {
      issuer: issuerDid,
      hospitalCode: "TCC",
      keys: [{ ...publicJwk, kid }],
    },
    activeAssertionMethod: {
      id: kid,
      type: "JsonWebKey2020",
      controller: issuerDid,
      publicKeyJwk: { ...publicJwk, kid },
    },
  };
  const discovery = interoperabilityDiscovery();
  return {
    issuer,
    client: (fetchImpl: typeof fetch) =>
      new PortalQrInteroperabilityClient({
        discovery,
        identity: holder,
        issuers: [issuer],
        fetchImpl,
        now: () => new Date("2026-07-19T03:00:00.000Z"),
        randomUUID: () => "test-random-id",
      }),
    requestJwt: async (options?: {
      kid?: string;
      payload?: Record<string, unknown>;
    }) =>
      new SignJWT({
        iss: `decentralized_identifier:${issuerDid}`,
        client_id: `decentralized_identifier:${issuerDid}`,
        aud: "https://self-issued.me/v2",
        response_type: "vp_token",
        response_mode: "direct_post",
        response_uri: RESPONSE_URI,
        purpose: "ยืนยันตัวตนเพื่อรับบริการ",
        state: "state-1234567890",
        nonce: "portal-nonce-1234567890",
        wallet_nonce: WALLET_NONCE,
        iat: NOW_SECONDS - 10,
        exp: NOW_SECONDS + 290,
        jti: TRANSACTION_ID,
        dcql_query: {
          credentials: [
            {
              id: "patient_identity",
              format: TRUSTCARE_DIRECT_VC_FORMAT,
              meta: {
                credential_definition: {
                  type: ["VerifiableCredential", "PatientIdentityCredential"],
                },
              },
            },
          ],
        },
        trustcare: {
          contractVersion: QR_INTEROPERABILITY_CONTRACT_VERSION,
          transactionId: TRANSACTION_ID,
          context: "opd_visit",
          recipient: issuerDid,
          audience: RESPONSE_URI,
          consentRequired: true,
        },
        ...options?.payload,
      })
        .setProtectedHeader({
          alg: "ES256",
          typ: "oauth-authz-req+jwt",
          kid: options?.kid ?? kid,
        })
        .sign(signing.privateKey),
  };
}

function oid4vpQr(issuerDid: string): string {
  const query = new URLSearchParams({
    client_id: `decentralized_identifier:${issuerDid}`,
    request_uri: REQUEST_URI,
    request_uri_method: "post",
  });
  return `openid4vp://authorize?${query.toString()}`;
}

function interoperabilityDiscovery(): PortalInteroperabilityDiscovery {
  const credentialConfiguration: PortalInteroperabilityDiscovery["credentialIssuer"]["credential_configurations_supported"][string] = {
    format: TRUSTCARE_DIRECT_VC_FORMAT,
    cryptographic_binding_methods_supported: ["did:key"],
    credential_signing_alg_values_supported: ["ES256"],
    proof_types_supported: { jwt: {} },
    credential_definition: {
      type: ["VerifiableCredential", "PatientIdentityCredential"],
    },
  };
  return {
    portalOrigin: ORIGIN,
    portalRevision: "a".repeat(40),
    catalog: {
      payload: { version: "2026.07.portal-wallet.v8", status: "active" },
    } as PortalInteroperabilityDiscovery["catalog"],
    qrAcceptance: {
      etag: `"sha256-${"0".repeat(64)}"`,
      contentDigest: "sha-256=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=:",
      sha256: "0".repeat(64),
      payload: {
        contractVersion: QR_INTEROPERABILITY_CONTRACT_VERSION,
        portalWalletContractVersion: "2026.07.portal-wallet.v8",
        status: "active",
        purpose: "wallet_graph_qr_acceptance",
        discoveryEndpoint: "/api/qr/v1",
        graphContractVersion: "2026.07.pcdg.v2",
        limits: {
          referenceUrlCharacters: 2048,
          standardShlManifestUrlCharacters: 128,
          holderVpBytes: 2_000_000,
          requestObjectBytes: 32_768,
        },
        profiles: [
          { profile: "openid4vp" },
          { profile: "openid4vci" },
          { profile: "trustcare-direct-holder-vp" },
          { profile: "smart-health-links" },
          { profile: "trustcare-certified-shl-sidecars" },
        ],
        endpoints: { qrDiscovery: "/api/qr/v1" },
        graphBinding: {
          qrNeverCreatesGraphTruth: true,
          graphChangesAreSyncedByWalletExchange: true,
          immutableUpdates: "supersede",
          unknownRequiredFields: "quarantine",
        },
        failClosedRules: [
          "do_not_accept_raw_vc_or_raw_vp_qr_payloads",
          "do_not_treat_shlink_as_a_verifiable_credential",
          "do_not_embed_trustcare_vc_or_vp_fields_in_standard_shl_manifest",
          "do_not_create_or_repair_holder_vp_in_portal",
          "do_not_accept_patient_id_from_wallet_or_qr_payload",
          "reject_unknown_required_graph_or_qr_semantics",
          "reject_stale_replayed_or_status_uncertain_artifacts",
        ],
      },
    } as PortalInteroperabilityDiscovery["qrAcceptance"],
    qr: {
      name: "TrustCare QR Interoperability",
      version: "1.0.0",
      contractVersion: QR_INTEROPERABILITY_CONTRACT_VERSION,
      profiles: {
        oid4vp: {
          status: "active",
          profile: OID4VP_FINAL_PROFILE,
          format: TRUSTCARE_DIRECT_VC_FORMAT,
        },
        oid4vci: {
          status: "active",
          profile: OID4VCI_FINAL_PROFILE,
          format: TRUSTCARE_DIRECT_VC_FORMAT,
        },
        directHolderVp: { status: "active", profile: "direct-vp.v1" },
        smartHealthLinks: { status: "active", profile: "shl.v1" },
        certifiedShlSidecars: {
          status: "active",
          profile: "sidecar.v1",
          transportConformance: false,
        },
      },
      acceptedSchemes: [
        "openid4vp",
        "openid-credential-offer",
        "https",
        "shlink",
      ],
      endpoints: {
        contractHubAcceptance: `${ORIGIN}/api/public/wallet-contracts/qr-interoperability`,
        oid4vpCreate: `${ORIGIN}/api/qr/v1/oid4vp/requests`,
        oid4vpRequestUri: `${ORIGIN}/api/qr/v1/oid4vp/requests/{transactionId}`,
        oid4vpDirectPost: RESPONSE_URI,
        oid4vciOfferCreate: `${ORIGIN}/api/qr/v1/oid4vci/offers`,
        oid4vciOfferUri: `${ORIGIN}/api/qr/v1/oid4vci/offers/{transactionId}`,
        oid4vciToken: `${ORIGIN}/api/qr/v1/oid4vci/token`,
        oid4vciNonce: `${ORIGIN}/api/qr/v1/oid4vci/nonce`,
        oid4vciCredential: `${ORIGIN}/api/qr/v1/oid4vci/credential`,
        directHolderVpResolver: `${ORIGIN}/api/share-gateway/presentations/{artifactId}.jwt`,
        standardShlManifest: `${ORIGIN}/s/{256-bit-token}`,
      },
      limits: {
        requestObjectBytes: 32768,
        holderVpBytes: 2_000_000,
        referenceUrlCharacters: 2048,
        standardShlManifestUrlCharacters: 128,
        oid4vpTtlSeconds: { min: 60, max: 600 },
        oid4vciTtlSeconds: { min: 60, max: 900 },
      },
      requiredBindings: [
        "holder",
        "recipient",
        "audience",
        "purpose",
        "consentRef",
        "context",
        "nonce",
        "expiry",
      ],
      prohibitedUses: ["raw_jwt_qr"],
    },
    credentialIssuer: {
      credential_issuer: ORIGIN,
      authorization_servers: [ORIGIN],
      credential_endpoint: `${ORIGIN}/api/qr/v1/oid4vci/credential`,
      nonce_endpoint: `${ORIGIN}/api/qr/v1/oid4vci/nonce`,
      credential_configurations_supported: {
        "trustcare-patient-identity-vc2": credentialConfiguration,
      },
    },
    authorizationServer: {
      issuer: ORIGIN,
      token_endpoint: `${ORIGIN}/api/qr/v1/oid4vci/token`,
      grant_types_supported: [
        "urn:ietf:params:oauth:grant-type:pre-authorized_code",
      ],
      token_endpoint_auth_methods_supported: ["none"],
      pre_authorized_grant_anonymous_access_supported: true,
    },
    provisioning: {},
    walletExchange: {} as PortalInteroperabilityDiscovery["walletExchange"],
    loadedAt: "2026-07-19T03:00:00.000Z",
  };
}
