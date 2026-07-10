import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  assessLocalReadiness,
  buildSharePackage,
  createSharingEventArtifactId,
  createShareDraft,
  createShareDraftFromPrepare,
  createSharePolicy,
  createShareResult,
  extractCredentialJwt,
  recommendPolicyForDraft,
  validateShareDraft,
  type ReadinessContext,
  type WalletCard,
} from "./index";

describe("premium share flow policy and validation", () => {
  it("creates a cryptographically random artifact id for each sharing event", () => {
    const first = createSharingEventArtifactId("vp");
    const second = createSharingEventArtifactId("vp");

    expect(first).toMatch(/^vp_[0-9a-f]{32}$/);
    expect(second).toMatch(/^vp_[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it("uses Purpose VP by default for OPD readiness even when all OPD documents are selected", () => {
    const cards = cardsFor("opd_visit");
    const readiness = assessLocalReadiness(cards, "opd_visit");
    const draft = createShareDraftFromPrepare({
      context: "opd_visit",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
      holderDid: "did:key:holder001",
    });
    const recommendation = recommendPolicyForDraft(draft, {
      trustcareCertificationAvailable: true,
    });
    const policy = createSharePolicy({
      mode: recommendation.mode,
      disclosureMode: "sd",
      expiryMinutes: 10,
      selectedFields: ["identity", "allergy", "medication", "coverage"],
    });
    const validation = validateShareDraft(draft, policy, {
      shareGatewayReady: true,
    });

    expect(recommendation.mode).toBe("PurposeVP");
    expect(validation.ok).toBe(true);
    expect(policy.expiryMinutes).toBe(10);
  });

  it("uses Purpose VP with short expiry for pharmacy dispense", () => {
    const cards = cardsFor("pharmacy_dispense");
    const readiness = assessLocalReadiness(cards, "pharmacy_dispense");
    const draft = createShareDraftFromPrepare({
      context: "pharmacy_dispense",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const recommendation = recommendPolicyForDraft(draft, {
      trustcareCertificationAvailable: true,
    });
    const policy = createSharePolicy({
      mode: recommendation.mode,
      disclosureMode: "sd",
      expiryMinutes: 60,
      selectedFields: ["identity", "prescription", "medication", "allergy"],
    });
    const validation = validateShareDraft(draft, policy, {
      shareGatewayReady: true,
      biometricRequired: false,
    });

    expect(recommendation.mode).toBe("PurposeVP");
    expect(policy.expiryMinutes).toBe(60);
    expect(validation.ok).toBe(true);
  });

  it("recommends Certified SHL for referral bundles when TrustCare certification is available", () => {
    const cards = cardsFor("referral");
    const readiness = assessLocalReadiness(cards, "referral");
    const draft = createShareDraftFromPrepare({
      context: "referral",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const recommendation = recommendPolicyForDraft(draft, {
      trustcareCertificationAvailable: true,
    });
    const policy = createSharePolicy({
      mode: recommendation.mode,
      disclosureMode: "sd",
      expiryMinutes: 1440,
      shl: {
        passcodeRequired: true,
        passcode: "1973",
        expiryHours: 72,
        maxAccessCount: 8,
      },
    });
    const validation = validateShareDraft(draft, policy, {
      shareGatewayReady: true,
      certifiedShlReady: true,
    });

    expect(recommendation.mode).toBe("CertifiedSHLManifestPackage");
    expect(validation.ok).toBe(true);
  });

  it("blocks sharing when required documents are missing and warns when optional documents are missing", () => {
    const cards = [
      card(1, "patient_identity"),
      card(2, "allergy_alert"),
      card(3, "medication_summary"),
    ];
    const readiness = assessLocalReadiness(cards, "opd_visit");
    const draft = createShareDraftFromPrepare({
      context: "opd_visit",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({
        mode: "PurposeVP",
        selectedFields: ["identity"],
      }),
      { shareGatewayReady: true },
    );

    expect(validation.requiredMissingCount).toBe(0);
    expect(validation.optionalMissingCount).toBe(2);
    expect(validation.ok).toBe(true);
    expect(validation.warnings.map((issue) => issue.key)).toContain(
      "missing_optional",
    );
  });

  it("blocks strict sharing when a required document is missing", () => {
    const cards = [card(1, "patient_identity"), card(2, "allergy_alert")];
    const readiness = assessLocalReadiness(cards, "opd_visit");
    const draft = createShareDraftFromPrepare({
      context: "opd_visit",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({ mode: "PurposeVP", selectedFields: ["identity"] }),
      { shareGatewayReady: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.requiredMissingCount).toBe(1);
    expect(validation.primaryDisabledReason?.reason).toContain("ยังขาด");
  });

  it("does not allow unverified patient uploads to become Certified SHL proof", () => {
    const cards = [
      card(1, "patient_identity"),
      {
        ...card(2, "lab_result"),
        credentialStatus: "unverified",
        issuerDid: null,
      },
    ];
    const draft = createShareDraft({
      source: "manual",
      context: "referral",
      cards,
      selectedCardIds: cards.map((item) => item.id),
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({
        mode: "CertifiedSHLManifestPackage",
        shl: {
          passcodeRequired: true,
          passcode: "1973",
          expiryHours: 72,
          maxAccessCount: 8,
        },
      }),
      { shareGatewayReady: true, certifiedShlReady: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "certified_shl_no_unverified_upload",
    );
  });

  it("blocks SHL generation when passcode is enabled but not set", () => {
    const cards = cardsFor("referral");
    const readiness = assessLocalReadiness(cards, "referral");
    const draft = createShareDraftFromPrepare({
      context: "referral",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({
        mode: "StandardSHL",
        shl: {
          passcodeRequired: true,
          passcode: "",
          expiryHours: 24,
          maxAccessCount: 5,
        },
      }),
      { shareGatewayReady: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "shl_passcode_missing",
    );
  });

  it("blocks real VP publishing when a resolver gateway is missing", () => {
    const cards = cardsFor("opd_visit");
    const readiness = assessLocalReadiness(cards, "opd_visit");
    const draft = createShareDraftFromPrepare({
      context: "opd_visit",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({ mode: "PurposeVP", selectedFields: ["identity"] }),
      { shareGatewayReady: false, requireResolvableQr: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "vp_gateway_missing",
    );
  });

  it("blocks revoked credentials from VP QR publishing", () => {
    const cards = cardsFor("opd_visit").map((item) =>
      item.cardType === "patient_identity"
        ? { ...item, credentialStatus: "revoked" }
        : item,
    );
    const draft = createShareDraft({
      source: "manual",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.map((item) => item.id),
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({ mode: "PurposeVP", selectedFields: ["identity"] }),
      { shareGatewayReady: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "vp_requires_active_vc",
    );
  });

  it("locks OID4VP request documents and claims", () => {
    const cards = cardsFor("opd_visit");
    const readiness = assessLocalReadiness(cards, "opd_visit");
    const draft = createShareDraftFromPrepare({
      context: "opd_visit",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
      lockedCardIds: [readiness.selectedCardIds[0]],
      lockedFields: ["identity"],
      sourceRequestId: "oid4vp-demo",
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({ mode: "PurposeVP", selectedFields: ["identity"] }),
      { shareGatewayReady: true, oid4vpLocked: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "oid4vp_request_locked",
    );
  });

  it("requires manifest and holder trust layer readiness for Certified SHL", () => {
    const cards = cardsFor("referral");
    const readiness = assessLocalReadiness(cards, "referral");
    const draft = createShareDraftFromPrepare({
      context: "referral",
      cards,
      readiness,
      selectedCardIds: readiness.selectedCardIds,
    });
    const validation = validateShareDraft(
      draft,
      createSharePolicy({
        mode: "CertifiedSHLManifestPackage",
        shl: {
          passcodeRequired: true,
          passcode: "1973",
          expiryHours: 72,
          maxAccessCount: 8,
        },
      }),
      { shareGatewayReady: true, certifiedShlReady: false },
    );

    expect(validation.ok).toBe(false);
    expect(validation.primaryDisabledReason).toBeTruthy();
    expect(validation.blockers.map((issue) => issue.key)).toContain(
      "certified_shl_not_ready",
    );
  });

  it("creates deterministic result states for draft, blocked, and ready share packages", () => {
    const blocked = createShareResult({
      ok: false,
      publishEnabled: false,
      selectedReadyCount: 0,
      requiredMissingCount: 1,
      optionalMissingCount: 0,
      blockers: [
        {
          key: "missing_required",
          message: "ยังขาดเอกสารจำเป็น",
          fix: "ขอเอกสารก่อน",
          severity: "blocked",
        },
      ],
      warnings: [],
      primaryDisabledReason: null,
      disabledReasons: [],
    });
    const draft = createShareResult({
      ok: true,
      publishEnabled: true,
      selectedReadyCount: 1,
      requiredMissingCount: 0,
      optionalMissingCount: 0,
      blockers: [],
      warnings: [],
      primaryDisabledReason: null,
      disabledReasons: [],
    });

    expect(blocked.state).toBe("blocked");
    expect(draft.state).toBe("draft");
  });

  it("keeps signed Portal credential JWTs inside Purpose VP packages", () => {
    const signedPortalJwt = makeJwt({
      id: "vc-signed-portal-001",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: "did:web:trustcare.network:hospital:tcc",
      credentialSubject: { id: "did:key:holder001" },
    });
    const cards = [
      {
        ...card(1, "patient_identity"),
        credentialJwt: signedPortalJwt,
        credentialProof: {
          type: "jwt",
          jwt: signedPortalJwt,
          alg: "ES256",
          kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key",
        },
      },
      card(2, "allergy_alert"),
    ];

    const sharePackage = buildSharePackage({
      mode: "PurposeVP",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.map((item) => item.id),
      holderDid: "did:key:holder001",
      selectedFields: ["identity", "allergy"],
      gatewayBaseUrl: "https://wallet.example/api/share-gateway",
    });

    if (sharePackage.mode !== "PurposeVP") {
      throw new Error(`Expected PurposeVP package, got ${sharePackage.mode}`);
    }
    expect(sharePackage.presentation.qrData).toMatch(
      /^https:\/\/wallet\.example\/api\/share-gateway\/presentations\/vp_.*\.jwt$/,
    );
    const credentials = sharePackage.payload.verifiableCredential as unknown[];
    expect(credentials).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^data:application\/vc\+jwt,/),
        type: ["VerifiableCredential", "EnvelopedVerifiableCredential"],
      }),
      expect.objectContaining({
        type: ["VerifiableCredential"],
      }),
    ]);
    expect(extractCredentialJwt(credentials[0])).toBe(signedPortalJwt);
    expect(credentials[1]).toMatchObject({
      trustcare: {
        shareSource: {
          authority: "portal_synced",
          signingOwner: "source_issuer",
          sourceSystem: "trustcare_portal",
        },
      },
    });
    expect(sharePackage.payload.trustcare).toMatchObject({
      credentialJwtCount: 1,
      context: "opd_visit",
    });
  });

  it("does not fabricate a holder DID for verifier-ready VP packages", () => {
    const cards = [withoutHolderDid(card(1, "patient_identity"))];

    expect(() =>
      buildSharePackage({
        mode: "PurposeVP",
        context: "opd_visit",
        cards,
        selectedCardIds: cards.map((item) => item.id),
        selectedFields: ["identity"],
        gatewayBaseUrl: "https://wallet.example/api/share-gateway",
      }),
    ).toThrow("Holder DID is required");
  });

  it("does not fabricate a holder DID for Certified SHL Manifest VP packages", () => {
    const cards = [withoutHolderDid(card(1, "patient_identity"))];

    expect(() =>
      buildSharePackage({
        mode: "CertifiedSHLManifestPackage",
        context: "referral",
        cards,
        selectedCardIds: cards.map((item) => item.id),
        gatewayBaseUrl: "https://wallet.example/api/share-gateway",
        shlPolicy: {
          passcodeRequired: true,
          passcodeHint: "****",
          maxAccessCount: 3,
          accessCodeDelivery: "separate_channel",
        },
      }),
    ).toThrow("Holder DID is required");
  });
});

function cardsFor(context: ReadinessContext): WalletCard[] {
  if (context === "pharmacy_dispense") {
    return [
      card(1, "patient_identity"),
      card(2, "prescription"),
      card(3, "medication_summary"),
      card(4, "allergy_alert"),
      card(5, "pharmacy_dispense"),
    ];
  }
  if (context === "referral") {
    return [
      card(1, "patient_identity"),
      card(2, "referral_vc"),
      card(3, "patient_summary"),
      card(4, "lab_result"),
      card(5, "insurance_eligibility"),
    ];
  }
  return [
    card(1, "patient_identity"),
    card(2, "allergy_alert"),
    card(3, "medication_summary"),
    card(4, "patient_summary"),
    card(5, "insurance_eligibility"),
  ];
}

function card(id: number, cardType: string): WalletCard {
  return {
    id,
    cardType,
    displayName: cardType,
    displayNameEn: cardType,
    documentCategory: "clinical_summary",
    credentialId: `cred-${id}`,
    credentialStatus: "active",
    credentialData: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential"],
      issuer: { id: "did:web:trustcare.network:hospital:tcc" },
      credentialSubject: {
        id: "did:key:holder001",
        documentReference: { resourceType: "DocumentReference", id },
      },
    },
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: "did:key:holder001",
    sourceSystem: "trustcare_portal",
    createdAt: "2026-07-01T00:00:00.000Z",
    issuedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2027-07-01T00:00:00.000Z",
  };
}

function withoutHolderDid(source: WalletCard): WalletCard {
  const credentialData = source.credentialData as Record<string, unknown>;
  const credentialSubject = {
    ...((credentialData.credentialSubject as Record<string, unknown>) ?? {}),
  };
  delete credentialSubject.id;
  return {
    ...source,
    holderDid: undefined,
    credentialData: {
      ...credentialData,
      credentialSubject,
    },
  };
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = { alg: "ES256", kid: "did:web:issuer.example#key-1" };
  return [
    Buffer.from(JSON.stringify(header)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
