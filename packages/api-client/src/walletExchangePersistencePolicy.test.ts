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
});
