import { describe, expect, it } from "vitest";
import {
  TrustCareContractError,
  assertOid4vciIssuerMetadata,
  assertShareGatewayPublicationResponse,
  assertVerifierResult,
  assertWalletSyncResponse,
} from "./index";

describe("TrustCare shared contracts", () => {
  it("validates share gateway publication responses", () => {
    expect(
      assertShareGatewayPublicationResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: "vp_123",
        kind: "vp",
        publicUrl: "https://trustcare.example/presentations/vp_123.jwt",
        warnings: [],
        errors: [],
      }),
    ).toMatchObject({ ok: true, artifactId: "vp_123" });

    expect(
      assertShareGatewayPublicationResponse({
        ok: true,
        mode: "trustcare_production_gateway",
        artifactId: "vp_railway_123",
        kind: "vp",
        publicUrl:
          "https://wallet-web-production-6a00.up.railway.app/api/share-gateway/presentations/vp_railway_123.jwt",
        qrPayload:
          "https://wallet-web-production-6a00.up.railway.app/api/share-gateway/presentations/vp_railway_123.jwt",
        jwksUrl:
          "https://wallet-web-production-6a00.up.railway.app/api/share-gateway/.well-known/jwks.json",
        warnings: [],
        errors: [],
      }),
    ).toMatchObject({
      mode: "trustcare_production_gateway",
      artifactId: "vp_railway_123",
    });

    expect(() =>
      assertShareGatewayPublicationResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: "vp_123",
        kind: "vp",
      }),
    ).toThrow(TrustCareContractError);
  });

  it("requires Portal wallet sync credentials to be an array", () => {
    expect(
      assertWalletSyncResponse({
        credentials: [],
        presentations: [],
        syncedAt: "2026-07-08T00:00:00.000Z",
      }),
    ).toMatchObject({ credentials: [] });

    expect(() =>
      assertWalletSyncResponse({ credentials: { id: "not-array" } }),
    ).toThrow(/WalletSyncResponse/);
  });

  it("validates verifier results before UI consumes them", () => {
    expect(
      assertVerifierResult({
        verified: false,
        trustLevel: "yellow",
        protocol: "shl",
        warnings: ["standard SHL"],
        errors: [],
      }),
    ).toMatchObject({ protocol: "shl" });
  });

  it("validates OID4VCI issuer metadata", () => {
    expect(
      assertOid4vciIssuerMetadata({
        credential_issuer: "https://issuer.example",
        credential_endpoint: "https://issuer.example/credential",
        token_endpoint: "https://issuer.example/token",
        jwks: { keys: [] },
        credential_configurations_supported: {},
      }),
    ).toMatchObject({ credential_issuer: "https://issuer.example" });
  });
});
