import { describe, expect, it } from "vitest";
import {
  CANONICAL_DOCUMENT_TYPES,
  buildMicroIpsPlusPack,
  classifyPortableTrustStatus,
  completeWalletSeedCards,
  presentationEnvelopeFromWalletCard,
  presentationEnvelopeFromPresentation,
  selectableDisclosureFieldsFromEnvelope,
  validateMicroIpsPlusPack,
  walletDocumentRecordFromCard,
} from "./index";

describe("portable presentation envelope", () => {
  it("creates an envelope for every canonical wallet document type", () => {
    const seedTypes = new Set(
      completeWalletSeedCards.map((card) => card.cardType),
    );
    expect(
      [...CANONICAL_DOCUMENT_TYPES].filter((type) => !seedTypes.has(type)),
    ).toEqual([]);

    for (const card of completeWalletSeedCards) {
      const envelope = presentationEnvelopeFromWalletCard(card);
      expect(envelope.envelopeVersion, card.cardType).toBe("2026.07.v1");
      expect(envelope.display.documentType, card.cardType).toBe(card.cardType);
      expect(
        envelope.evidence.documentReferences.length,
        card.cardType,
      ).toBeGreaterThan(0);
      expect(envelope.sections.length, card.cardType).toBeGreaterThan(0);
    }
  });

  it("does not mark proofless credentials as green TrustCare proof", () => {
    const card = {
      ...completeWalletSeedCards.find(
        (item) => item.cardType === "patient_identity",
      )!,
      credentialJwt: undefined,
      credentialProof: undefined,
      issuerDid: null,
    };
    const envelope = presentationEnvelopeFromWalletCard(card);

    expect(classifyPortableTrustStatus(card)).toBe("proof_missing");
    expect(envelope.trust.badge).not.toBe("green");
    expect(envelope.trust.warnings).toContain("portal_issuer_proof_missing");
  });

  it("keeps an unverified issuer-profile JWT yellow until verification succeeds", () => {
    const card = {
      ...completeWalletSeedCards.find(
        (item) => item.cardType === "patient_identity",
      )!,
      issuerDid: "did:web:wallet.example:hospital:tcc",
      credentialJwt: "header.payload.signature",
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: "header.payload.signature",
        alg: "ES256",
        kid: "did:web:wallet.example:hospital:tcc#hospital-tcc-signing-key",
        source: "trustcare_hospital_issuer_profile",
      },
    };
    const envelope = presentationEnvelopeFromWalletCard(card);

    expect(classifyPortableTrustStatus(card)).toBe("proof_missing");
    expect(envelope.trust.status).toBe("proof_missing");
    expect(envelope.trust.badge).toBe("yellow");
    expect(envelope.trust.warnings).toContain("portal_issuer_proof_missing");
    expect(envelope.trust.checklist).toContainEqual(
      expect.objectContaining({
        key: "proof",
        ok: false,
        detail: "vc+jwt",
      }),
    );
  });

  it("keeps issuer proof yellow until status and policy evidence also pass", () => {
    const card = {
      ...completeWalletSeedCards.find(
        (item) => item.cardType === "patient_identity",
      )!,
      issuerDid: "did:web:wallet.example:hospital:tcc",
      credentialJwt: "header.payload.signature",
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: "header.payload.signature",
        alg: "ES256",
        kid: "did:web:wallet.example:hospital:tcc#hospital-tcc-signing-key",
        source: "trustcare_hospital_issuer_profile",
      },
      portalVerification: {
        verified: true,
        status: "verified",
        checkedAt: "2026-07-10T00:00:00.000Z",
      },
    };
    const envelope = presentationEnvelopeFromWalletCard(card);

    expect(classifyPortableTrustStatus(card)).toBe("issuer_signed");
    expect(envelope.trust.badge).toBe("yellow");
    expect(envelope.trust.checklist).toContainEqual(
      expect.objectContaining({ key: "proof", ok: true }),
    );
  });

  it("does not infer verified VP proof from a JWT format and resolver URL", () => {
    const card = {
      ...completeWalletSeedCards.find(
        (item) => item.cardType === "patient_identity",
      )!,
      credentialJwt: undefined,
      credentialProof: undefined,
    };

    const envelope = presentationEnvelopeFromPresentation(card, {
      presentationId: "vp_regression_signed_resolver",
      format: "jwt-vp",
      mode: "gateway_resolver_vp",
      credentialCount: 1,
      selectedFields: [],
      expiresAt: "2026-07-09T16:56:30.212Z",
      qrData:
        "https://wallet.example/?verify=public#scan=https%3A%2F%2Fwallet.example%2Fapi%2Fshare-gateway%2Fpresentations%2Fvp_regression_signed_resolver.jwt",
      verificationChecklist: [
        {
          key: "gateway",
          label: "Public resolver URL",
          ok: true,
          detail:
            "https://wallet.example/api/share-gateway/presentations/vp_regression_signed_resolver.jwt",
        },
      ],
    });

    expect(envelope.kind).toBe("presentation");
    expect(envelope.trust.status).toBe("proof_missing");
    expect(envelope.trust.badge).toBe("yellow");
    expect(envelope.trust.warnings).toContain("portal_issuer_proof_missing");
  });

  it("does not promote a VP from a signature-only checklist", () => {
    const card = completeWalletSeedCards.find(
      (item) => item.cardType === "patient_identity",
    )!;
    const envelope = presentationEnvelopeFromPresentation(card, {
      presentationId: "vp_verified_signature",
      format: "jwt-vp",
      mode: "gateway_resolver_vp",
      credentialCount: 1,
      selectedFields: [],
      expiresAt: "2026-07-10T01:00:00.000Z",
      qrData: "https://wallet.example/verify?vp=vp_verified_signature",
      verificationChecklist: [
        {
          key: "signature",
          label: "Signature status",
          ok: true,
          detail: "verified via issuer JWKS",
        },
      ],
    });

    expect(envelope.trust.status).toBe("issuer_signed");
    expect(envelope.trust.badge).toBe("yellow");
  });

  it("keeps trust artifacts out of clinical readiness proof semantics", () => {
    const card = completeWalletSeedCards.find(
      (item) => item.cardType === "shl_manifest",
    )!;
    const envelope = presentationEnvelopeFromWalletCard(card);

    expect(envelope.sourceObjectClass).toBe("link_manifest");
    expect(envelope.trust.warnings).toContain(
      "trust_artifact_not_clinical_readiness_document",
    );
  });

  it("excludes technical properties from selectable disclosure fields", () => {
    const envelope = presentationEnvelopeFromWalletCard(
      completeWalletSeedCards.find(
        (item) => item.cardType === "patient_summary",
      )!,
    );
    const fields = selectableDisclosureFieldsFromEnvelope(envelope);
    const forbidden = [
      "proof",
      "issuer",
      "watermark",
      "documentReference",
      "jwt",
    ];

    expect(fields.length).toBeGreaterThan(0);
    for (const fragment of forbidden) {
      expect(
        fields.some((field) =>
          field.path?.toLowerCase().includes(fragment.toLowerCase()),
        ),
      ).toBe(false);
    }
  });
});

describe("micro IPS plus pack", () => {
  it("builds a minimum-necessary pack with consent, evidence and provenance", () => {
    const records = completeWalletSeedCards
      .filter((card) => card.ownerUserId === "demo-patient-complete-001")
      .map((card) => walletDocumentRecordFromCard(card));
    const pack = buildMicroIpsPlusPack({
      context: "opd_visit",
      records,
      generatedAt: "2026-07-01T00:00:00.000Z",
      consent: {
        consentId: "consent-opd-001",
        purpose: "เตรียมเข้ารับบริการ OPD",
        grantedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-01T01:00:00.000Z",
      },
      recipient: { name: "TrustCare Central Hospital" },
    });
    const validation = validateMicroIpsPlusPack(pack);

    expect(validation.ok).toBe(true);
    expect(pack.context).toBe("opd_visit");
    expect(pack.generatedAt).toBeTruthy();
    expect(pack.expiresAt).toBeTruthy();
    expect(pack.evidence.length).toBeGreaterThan(0);
    expect(pack.standards.systemOfRecord).toBe(false);
    expect(pack.provenance.shareOnlyVia).toBeTruthy();
    expect(pack.provenance.recordTimeRange).toBeTruthy();
    expect(
      pack.records.some((record) => record.documentType === "shl_manifest"),
    ).toBe(false);
  });
});
