import { describe, expect, it } from "vitest";
import {
  buildMicroIpsPlusPack,
  canPresentCredential,
  credentialPresentationPolicy,
  credentialStatusTone,
  evaluateShlAccessPolicy,
  evaluateTrustCareShlGatewayAccess,
  requiredWalletUxCoverage,
  validateOid4vpBinding,
  validateMicroIpsPlusPack,
  walletDocumentRecordFromCard,
} from "./index";
import { completeWalletSeedCards } from "./completeSeedData";
import type { WalletCard } from "./models";

describe("wallet UX status and policy hardening", () => {
  it("maps lifecycle status colors without treating every inactive state as red", () => {
    expect(credentialStatusTone("active")).toBe("green");
    expect(credentialStatusTone("superseded")).toBe("yellow");
    expect(credentialStatusTone("suspended")).toBe("yellow");
    expect(credentialStatusTone("revoked")).toBe("red");
    expect(credentialStatusTone("metadata_only")).toBe("neutral");
  });

  it("blocks presentation when a credential is inactive or expired by date", () => {
    const activeCard = card({ credentialStatus: "active", expiresAt: "2026-07-09T00:00:00.000Z" });
    const expiredByDate = card({ credentialStatus: "active", expiresAt: "2026-07-01T00:00:00.000Z" });
    const revokedCard = card({ credentialStatus: "revoked", expiresAt: "2026-07-09T00:00:00.000Z" });

    expect(canPresentCredential(activeCard, new Date("2026-07-08T00:00:00.000Z"))).toBe(true);
    expect(credentialPresentationPolicy(expiredByDate, new Date("2026-07-08T00:00:00.000Z")).presentable).toBe(false);
    expect(credentialPresentationPolicy(revokedCard, new Date("2026-07-08T00:00:00.000Z")).presentable).toBe(false);
  });

  it("enforces SHL expiry, access count, and passcode policy decisions", () => {
    const expired = evaluateShlAccessPolicy(
      { status: "active", expiresAt: "2026-07-01T00:00:00.000Z", currentAccessCount: 0, maxAccessCount: 5 },
      new Date("2026-07-08T00:00:00.000Z"),
    );
    expect(expired.allowed).toBe(false);

    const exhausted = evaluateShlAccessPolicy(
      { status: "active", expiresAt: "2026-07-09T00:00:00.000Z", currentAccessCount: 5, maxAccessCount: 5 },
      new Date("2026-07-08T00:00:00.000Z"),
    );
    expect(exhausted.allowed).toBe(false);

    const gatewayDecision = evaluateTrustCareShlGatewayAccess({
      publication: {
        gatewayPublicationId: "shl-opd-001",
        shlId: "shl-opd-001",
        status: "active",
        expiresAt: "2026-07-09T00:00:00.000Z",
        maxAccessCount: 5,
        currentAccessCount: 1,
        passcodeRequired: true,
        accessCodeDelivery: "separate_channel",
      },
      recipient: "TrustCare verifier",
      now: new Date("2026-07-08T00:00:00.000Z"),
    });
    expect(gatewayDecision.allowed).toBe(false);
    expect(gatewayDecision.requestMethod).toBe("POST");
    expect(gatewayDecision.auditEvent.outcome).toBe("blocked");
  });

  it("requires verifier binding signals for OID4VP requests", () => {
    expect(
      validateOid4vpBinding({
        kind: "oid4vp",
        raw: "openid4vp://authorize",
        descriptorCount: 0,
        requestedCredentialTypes: [],
      }).ok,
    ).toBe(false);

    expect(
      validateOid4vpBinding({
        kind: "oid4vp",
        raw: "openid4vp://authorize",
        verifier: "redirect_uri:https://verifier.example/cb",
        nonce: "nonce-001",
        responseMode: "direct_post",
        descriptorCount: 1,
        requestedCredentialTypes: ["patient_identity"],
      }).ok,
    ).toBe(true);
  });

  it("keeps Micro-IPS+ scoped to minimum-necessary patient-held sharing", () => {
    const records = completeWalletSeedCards
      .filter((item) => item.ownerUserId === "demo-patient-complete-001")
      .map((item) => walletDocumentRecordFromCard(item));
    const pack = buildMicroIpsPlusPack({
      context: "opd_visit",
      records,
      generatedAt: "2026-07-01T00:00:00.000Z",
      consent: {
        consentId: "consent-opd-001",
        purpose: "opd_visit",
        grantedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-01T01:00:00.000Z",
      },
    });
    const validation = validateMicroIpsPlusPack(pack);

    expect(validation.ok).toBe(true);
    expect(pack.standards.systemOfRecord).toBe(false);
    expect(pack.provenance.selectedBy).toBe("minimum-necessary");
    expect(["PurposeVP", "CertifiedSHLManifestPackage"]).toContain(pack.provenance.shareOnlyVia);
  });

  it("pins required wallet UX coverage items", () => {
    const items = requiredWalletUxCoverage([
      "status-tone.shared",
      "mobile.selective-disclosure-picker",
      "mobile.scan-manual-paste",
      "mobile.detail-history",
      "mobile.home-state",
      "shl.policy",
      "micro-ips.scope",
      "standards.proof-shared",
    ]);

    expect(items).toHaveLength(8);
  });
});

function card(input: Partial<WalletCard>): WalletCard {
  return {
    id: 1,
    cardType: "patient_identity",
    displayName: "Patient Identity",
    documentCategory: "identity",
    credentialId: "cred-1",
    credentialStatus: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...input,
  };
}
