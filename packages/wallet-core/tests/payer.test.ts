import { describe, expect, it } from "vitest";
import {
  assessLocalReadiness,
  buildClaimEvidencePackage,
  buildSharePackage,
  claimStatusToFhirResponse,
  claimSubmissionReceiptCredential,
  claimSubmissionToFhir,
  createMockPayerRegistry,
  eligibilityDecisionToFhir,
  eligibilityRequestToFhir,
  eligibilityResultCredential,
  getDemoUser,
  getDemoWalletCards,
  getMockPayerAdapter,
  listMockPayerProfiles,
  normalizePayerEvidenceDocumentType,
  preAuthDecisionCredential,
  preAuthRequestToFhir,
  recommendSharePacket,
  type ClaimSubmission,
  type EligibilityRequest,
  type PreAuthRequest,
} from "../src";

describe("payer orchestration foundation", () => {
  it("keeps demo payer profiles adapter-based and free of real endpoints", () => {
    const profiles = listMockPayerProfiles();

    expect(profiles.map((profile) => profile.payerId)).toEqual([
      "nhso_mock",
      "global_care_insurance_demo",
      "international_tpa_mock",
      "self_pay_mock",
    ]);
    expect(
      profiles.every((profile) => profile.adapterKind === "mock_demo"),
    ).toBe(true);
    expect(
      profiles.every((profile) => profile.endpointConfigured === false),
    ).toBe(true);
  });

  it("maps demo eligibility and pre-authorization without making claim decisions", async () => {
    const adapter = getMockPayerAdapter("international_tpa_mock");
    expect(adapter).not.toBeNull();

    const eligibility = await adapter!.verifyEligibility({
      payerId: "international_tpa_mock",
      patientId: "demo-patient-002",
      context: "medical_tourist",
      serviceCode: "MT-OPD",
      consentReceiptId: "consent_medical_tourist",
      requestedAt: "2026-07-10T00:00:00.000Z",
    });
    const preAuth = await adapter!.requestPreAuth({
      payerId: "international_tpa_mock",
      patientId: "demo-patient-002",
      context: "medical_tourist",
      serviceCode: "PROC_MORE",
      requestedAmount: 125000,
      currency: "THB",
      evidencePackageId: "claim_pkg_demo",
      consentReceiptId: "consent_demo",
      requestedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(eligibility.status).toBe("requires_preauth");
    expect(eligibility.guaranteeLetterAvailable).toBe(true);
    expect(preAuth.status).toBe("need_more_evidence");
    expect(preAuth.additionalEvidenceRequested).toContain("patient_summary");
    expect(preAuth.warnings?.join(" ")).toContain("mock payer adapter");
  });

  it("flags public e-Claim demo submissions as manual follow-up, not payer approval", async () => {
    const adapter = getMockPayerAdapter("nhso_mock");
    expect(adapter).not.toBeNull();

    const receipt = await adapter!.submitClaimPackage({
      claimCaseId: "claim-case-public-001",
      payerId: "nhso_mock",
      patientId: "demo-patient-001",
      claimType: "public_eclaim",
      context: "insurance_claim",
      evidencePackageId: "claim_pkg_public",
      credentialIds: ["TC-demo-patient-001-1", "TC-demo-patient-001-8"],
      totalAmount: 3250,
      currency: "THB",
      consentReceiptId: "consent_public",
      submittedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(receipt.status).toBe("manual_followup_required");
    expect(receipt.manualFollowUpRequired).toBe(true);
    expect(receipt.channel).toBe("payer_manual_portal");
    expect(receipt.warnings?.join(" ")).toContain("No real NHSO");
  });

  it("builds claim evidence packages from canonical wallet records and selects SHL when required", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001");
    const packageResult = buildClaimEvidencePackage({
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-complete-001",
      context: "insurance_claim",
      cards,
      consentReceiptId: "consent_claim_001",
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    const recommendation = recommendSharePacket({
      context: "insurance_claim",
      selectedDocumentTypes: packageResult.documentTypes,
      selectedCount: packageResult.documentIds.length,
      trustcareCertificationAvailable: true,
    });

    expect(packageResult.evidencePackageId).toContain("claim_pkg_");
    expect(packageResult.documentTypes).toContain("insurance_eligibility");
    expect(packageResult.documentTypes).toContain("claim_package");
    expect(packageResult.consentReceiptId).toBe("consent_claim_001");
    expect(packageResult.recommendedPackageMode).toBe(
      "CertifiedSHLManifestPackage",
    );
    expect(recommendation.mode).toBe("CertifiedSHLManifestPackage");
  });

  it("normalizes payer document aliases through the canonical document layer", () => {
    expect(normalizePayerEvidenceDocumentType("coverage eligibility")).toBe(
      "insurance_eligibility",
    );
    expect(normalizePayerEvidenceDocumentType("claim_submission_package")).toBe(
      "claim_package",
    );
    expect(normalizePayerEvidenceDocumentType("medical visa")).toBe(
      "visa_support_letter",
    );
  });

  it("maps payer orchestration requests to FHIR-like resources for adapter contracts", async () => {
    const eligibilityRequest: EligibilityRequest = {
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-001",
      context: "insurance_claim",
      serviceCode: "OPD",
      consentReceiptId: "consent_private",
      requestedAt: "2026-07-10T00:00:00.000Z",
    };
    const adapter = createMockPayerRegistry().getAdapter(
      "global_care_insurance_demo",
    );
    expect(adapter).not.toBeNull();
    const eligibilityDecision =
      await adapter!.verifyEligibility(eligibilityRequest);
    const preAuthRequest: PreAuthRequest = {
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-001",
      context: "insurance_claim",
      serviceCode: "OPD",
      requestedAmount: 9500,
      currency: "THB",
      evidencePackageId: "claim_pkg_private",
      consentReceiptId: "consent_private",
      requestedAt: "2026-07-10T00:00:00.000Z",
    };
    const claimSubmission: ClaimSubmission = {
      claimCaseId: "claim-private-001",
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-001",
      claimType: "private_insurance",
      context: "insurance_claim",
      evidencePackageId: "claim_pkg_private",
      credentialIds: ["TC-demo-patient-001-1"],
      totalAmount: 9500,
      currency: "THB",
      consentReceiptId: "consent_private",
      submittedAt: "2026-07-10T00:00:00.000Z",
    };
    const status = await adapter!.getClaimStatus({
      claimCaseId: "claim-private-001",
      payerId: "global_care_insurance_demo",
    });

    expect(eligibilityRequestToFhir(eligibilityRequest).resourceType).toBe(
      "CoverageEligibilityRequest",
    );
    expect(eligibilityDecisionToFhir(eligibilityDecision).resourceType).toBe(
      "CoverageEligibilityResponse",
    );
    expect(preAuthRequestToFhir(preAuthRequest).use).toBe("preauthorization");
    expect(claimSubmissionToFhir(claimSubmission).use).toBe("claim");
    expect(claimStatusToFhirResponse(status).resourceType).toBe(
      "ClaimResponse",
    );
  });

  it("creates payer result credentials with W3C VC shapes for demo storage", async () => {
    const user = getDemoUser("demo-patient-001");
    const adapter = getMockPayerAdapter("global_care_insurance_demo");
    expect(adapter).not.toBeNull();
    const eligibility = await adapter!.verifyEligibility({
      payerId: "global_care_insurance_demo",
      patientId: user.id,
      context: "insurance_claim",
      consentReceiptId: "consent_private",
      requestedAt: "2026-07-10T00:00:00.000Z",
    });
    const preAuth = await adapter!.requestPreAuth({
      payerId: "global_care_insurance_demo",
      patientId: user.id,
      context: "insurance_claim",
      serviceCode: "OPD",
      requestedAmount: 9500,
      currency: "THB",
      evidencePackageId: "claim_pkg_private",
      consentReceiptId: "consent_private",
      requestedAt: "2026-07-10T00:00:00.000Z",
    });
    const receipt = await adapter!.submitClaimPackage({
      claimCaseId: "claim-private-002",
      payerId: "global_care_insurance_demo",
      patientId: user.id,
      claimType: "private_insurance",
      context: "insurance_claim",
      evidencePackageId: "claim_pkg_private",
      credentialIds: ["TC-demo-patient-001-1"],
      totalAmount: 9500,
      currency: "THB",
      consentReceiptId: "consent_private",
      submittedAt: "2026-07-10T00:00:00.000Z",
    });

    const eligibilityVc = eligibilityResultCredential({
      id: "vc-eligibility-demo",
      issuerDid: "did:web:trustcare.example:payer:global-care-demo",
      issuerName: "Global Care Insurance Demo Co., Ltd.",
      holderDid: user.holderDid,
      subject: eligibility,
      validFrom: "2026-07-10T00:00:00.000Z",
    });
    const preAuthVc = preAuthDecisionCredential({
      id: "vc-preauth-demo",
      issuerDid: "did:web:trustcare.example:payer:global-care-demo",
      issuerName: "Global Care Insurance Demo Co., Ltd.",
      holderDid: user.holderDid,
      subject: preAuth,
      validFrom: "2026-07-10T00:00:00.000Z",
    });
    const receiptVc = claimSubmissionReceiptCredential({
      id: "vc-claim-receipt-demo",
      issuerDid: "did:web:trustcare.example:payer:global-care-demo",
      issuerName: "Global Care Insurance Demo Co., Ltd.",
      holderDid: user.holderDid,
      subject: receipt,
      validFrom: "2026-07-10T00:00:00.000Z",
    });

    expect(eligibilityVc.type).toContain("EligibilityResultCredential");
    expect(preAuthVc.type).toContain("PreAuthDecisionCredential");
    expect(receiptVc.type).toContain("ClaimSubmissionReceiptCredential");
    expect(eligibilityVc.credentialSubject).toMatchObject({
      id: user.holderDid,
    });
  });

  it("keeps insurance claim readiness and package sharing on the shared profile", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001");
    const readiness = assessLocalReadiness(cards, "insurance_claim");
    const packageResult = buildClaimEvidencePackage({
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-complete-001",
      context: "insurance_claim",
      cards,
      consentReceiptId: "consent_claim_share",
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    const sharePackage = buildSharePackage({
      mode: packageResult.recommendedPackageMode,
      context: "insurance_claim",
      cards,
      selectedCardIds: packageResult.cards.map((card) => card.id),
      recipient: "global_care_insurance_demo",
      holderDid: cards[0]?.holderDid ?? undefined,
      origin: "https://wallet.example",
      gatewayBaseUrl: "https://wallet.example",
      viewerBaseUrl: "https://wallet.example/shl",
      expiresAt: "2026-07-10T01:00:00.000Z",
    });

    expect(readiness.criticalReady).toBe(true);
    expect(sharePackage.mode).toBe("CertifiedSHLManifestPackage");
    expect(sharePackage.payload).toMatchObject({
      type: "CertifiedSHLManifestPackage",
    });
  });
});
