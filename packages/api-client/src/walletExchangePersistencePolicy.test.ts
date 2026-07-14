import { describe, expect, it } from "vitest";
import { createWalletExchangePersistencePolicy } from "./walletExchangePersistencePolicy";

const portalOrigin = "https://portal.example";
const holderDid = "did:key:z6MknPersistencePolicyHolder";

describe("Wallet Exchange shared persistence policy", () => {
  it("accepts only explicitly discovered did:web issuer identities", () => {
    const policy = createWalletExchangePersistencePolicy({
      portalOrigin,
      holderDid,
    });

    expect(() => policy.configureTrustedIssuers([])).toThrow(
      "requires live Portal trusted issuers",
    );
    expect(() =>
      policy.configureTrustedIssuers(["did:key:z6MknNotAnIssuer"]),
    ).toThrow("did:web");
    expect(() =>
      policy.configureTrustedIssuers(["did:web:issuer.portal.example:tcc"]),
    ).not.toThrow();
  });

  it("keeps durable keys holder-partitioned and rejects sensitive material", () => {
    const policy = createWalletExchangePersistencePolicy({
      portalOrigin,
      holderDid,
    });

    expect(policy.documentKey("document/1")).toBe(
      `${policy.partition.key}::document%2F1`,
    );
    expect(() =>
      policy.assertNoSensitiveMaterial({ nested: { access_token: "secret" } }),
    ).toThrow("must never store session, token, or private-key material");
    expect(() =>
      policy.assertNoSensitiveMaterial({ kty: "EC", d: "private" }),
    ).toThrow("private JWK");
  });

  it("pins persisted status links to the configured Portal origin", () => {
    const policy = createWalletExchangePersistencePolicy({
      portalOrigin,
      holderDid,
    });
    const link = {
      clientRequestId: "client-request-1",
      requestId: "portal-request-1",
      idempotencyKey: "request-idempotency-1",
      statusUrl:
        "https://portal.example/api/wallet/v2/credential-requests/portal-request-1",
      targetHospitalCode: "TCC" as const,
      context: "opd_visit" as const,
      purpose: "OPD registration",
      credentialTypes: ["PatientIdentityCredential"],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };

    expect(() => policy.assertRequestLink(link)).not.toThrow();
    expect(() =>
      policy.assertRequestLink({
        ...link,
        statusUrl:
          "https://other.example/api/wallet/v2/credential-requests/portal-request-1",
      }),
    ).toThrow("exact Portal status endpoint");
  });

  it("persists only holder-bound SHL certification metadata without transport secrets", () => {
    const policy = createWalletExchangePersistencePolicy({
      portalOrigin,
      holderDid,
    });
    const shlPackageId = "A".repeat(43);
    const link = {
      clientRequestId: "client-shl-request-1",
      requestId: "portal-shl-request-1",
      idempotencyKey: "client-shl-request-1",
      statusUrl:
        "https://portal.example/api/wallet/v2/credential-requests/portal-shl-request-1",
      targetHospitalCode: "TCC" as const,
      context: "opd_visit" as const,
      purpose: "OPD registration",
      credentialTypes: ["shl_manifest"],
      documentTypes: ["shl_manifest"],
      shlCertification: {
        schema: "trustcare.wallet.shl-certification-link.v1" as const,
        binding: {
          schema: "trustcare.wallet.shl-certification-binding.v1" as const,
          shlPackageId,
          holderDid,
          manifestUrl: `https://portal.example/api/share-gateway/manifests/${shlPackageId}.json`,
          manifestHash: `sha256:${"a".repeat(64)}`,
          sourceBundleHash: `sha256:${"b".repeat(64)}`,
          fileHashes: [`sha256:${"c".repeat(64)}`],
          purpose: "OPD registration",
          recipient: "did:web:portal.example:issuers:tcc",
          audience: "https://portal.example",
          context: "opd_visit" as const,
          consentRef: "urn:trustcare:consent:001",
          issuedAt: "2026-07-14T00:00:00.000Z",
          expiresAt: "2026-07-14T00:10:00.000Z",
          holderPresentationId: "urn:uuid:holder-presentation-1",
          holderPresentationJwt: "header.payload.signature",
          sourceCredentials: [
            {
              documentId: "document-1",
              credentialId: "credential-1",
              plaintextSha256: `sha256:${"d".repeat(64)}`,
            },
          ],
        },
      },
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    expect(() => policy.assertRequestLink(link)).not.toThrow();
    expect(() =>
      policy.assertRequestLink({
        ...link,
        shlCertification: {
          ...link.shlCertification,
          binding: {
            ...link.shlCertification.binding,
            holderDid: "did:key:z6MknAnotherHolder",
          },
        },
      }),
    ).toThrow("binding is inconsistent");
    expect(() =>
      policy.assertRequestLink({
        ...link,
        shlCertification: {
          ...link.shlCertification,
          binding: {
            ...link.shlCertification.binding,
            shlContentKey: "must-not-persist",
          },
        },
      } as never),
    ).toThrow("Unknown Wallet Exchange persistence field");
  });
});
