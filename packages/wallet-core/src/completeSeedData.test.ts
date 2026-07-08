import { describe, expect, it } from "vitest";
import {
  assessLocalReadiness,
  completeSeedDocumentDefinitions,
  completeWalletSeedCards,
  exportWalletCard,
  getCompleteWalletSeed,
  readinessContextValues,
} from "./index";
import type { WalletCard } from "./models";

const canonicalCardTypes = [
  "patient_identity",
  "staff_identity",
  "consent_receipt",
  "mpi_link_certificate",
  "patient_summary",
  "allergy_alert",
  "immunization",
  "medical_certificate",
  "medication_summary",
  "prescription",
  "pharmacy_dispense",
  "lab_result",
  "diagnostic_report",
  "referral_vc",
  "discharge_summary",
  "insurance_eligibility",
  "claim_package",
  "claim_receipt",
  "travel_document_verification",
  "visa_support_letter",
  "quotation",
  "guarantee_letter",
  "shl_manifest",
  "sync_receipt",
  "appointment",
] as const;

const canonicalCategories = new Set([
  "identity_and_access",
  "clinical_summary",
  "medication_and_pharmacy",
  "diagnostics_and_results",
  "care_transition",
  "claims_and_finance",
  "medical_tourism",
  "sharing_and_sync",
  "operations",
]);

describe("complete TrustCare wallet seed data", () => {
  it("covers every canonical cardType exactly once at seed definition level", () => {
    const definitionTypes = new Set(
      completeSeedDocumentDefinitions.map((def) => def.cardType),
    );
    const seedTypes = new Set(
      completeWalletSeedCards.map((card) => card.cardType),
    );

    expect(
      [...canonicalCardTypes].filter((type) => !definitionTypes.has(type)),
    ).toEqual([]);
    expect(
      [...canonicalCardTypes].filter((type) => !seedTypes.has(type)),
    ).toEqual([]);
    expect(completeWalletSeedCards).toHaveLength(canonicalCardTypes.length);
  });

  it("keeps document categories normalized to the canonical TrustCare taxonomy", () => {
    const unknownCategories = [
      ...completeSeedDocumentDefinitions.map((def) => def.documentCategory),
      ...completeWalletSeedCards.map((card) => card.documentCategory),
    ].filter((category) => !canonicalCategories.has(category));

    expect(unknownCategories).toEqual([]);
  });

  it("scopes complete patient and staff wallets without leaking staff credentials into patient data", () => {
    const patientCards = getCompleteWalletSeed("demo-patient-complete-001");
    const staffCards = getCompleteWalletSeed("demo-staff-complete-001");
    const patientRelevantTypes = canonicalCardTypes.filter(
      (type) => type !== "staff_identity",
    );

    expect(patientCards.map((card) => card.cardType).sort()).toEqual(
      [...patientRelevantTypes].sort(),
    );
    expect(staffCards.map((card) => card.cardType)).toEqual(["staff_identity"]);
    expect(
      patientCards.every(
        (card) => card.ownerUserId === "demo-patient-complete-001",
      ),
    ).toBe(true);
    expect(
      staffCards.every(
        (card) => card.ownerUserId === "demo-staff-complete-001",
      ),
    ).toBe(true);
  });

  it("stores every complete seed card as a VC-like credential with DocumentReference evidence", () => {
    for (const card of completeWalletSeedCards) {
      const credential = credentialData(card);
      const evidence = Array.isArray(credential.evidence)
        ? credential.evidence
        : [];
      const documentEvidence = evidence.find(
        (item) =>
          item &&
          typeof item === "object" &&
          String((item as Record<string, unknown>).type).includes(
            "DocumentReference",
          ),
      ) as Record<string, unknown> | undefined;

      expect(credential["@context"], card.cardType).toBeTruthy();
      expect(credential.type, card.cardType).toEqual(
        expect.arrayContaining(["VerifiableCredential"]),
      );
      expect(credential.issuer, card.cardType).toBeTruthy();
      expect(credential.credentialSubject, card.cardType).toBeTruthy();
      expect(credential.credentialStatus, card.cardType).toBeTruthy();
      expect(documentEvidence, card.cardType).toBeTruthy();
      expect(
        String(documentEvidence?.documentReferenceId),
        card.cardType,
      ).toContain("DocumentReference/");
      expect(
        (documentEvidence?.attachment as Record<string, unknown> | undefined)
          ?.contentType,
        card.cardType,
      ).toBeTruthy();

      const exported = exportWalletCard(card);
      expect(exported.ok, card.cardType).toBe(true);
      expect(JSON.parse(exported.data).type, card.cardType).toEqual(
        expect.arrayContaining(["VerifiableCredential"]),
      );
    }
  });

  it("can assess every readiness context against the complete patient wallet", () => {
    const patientCards = getCompleteWalletSeed("demo-patient-complete-001");
    for (const context of readinessContextValues) {
      const result = assessLocalReadiness(patientCards, context);
      expect(result.criticalReady, context).toBe(true);
      expect(result.requiredReady, context).toBe(result.requiredTotal);
      expect(result.selectedCardIds.length, context).toBeGreaterThan(0);
    }
  });
});

function credentialData(card: WalletCard): Record<string, unknown> {
  expect(card.credentialData, card.cardType).toBeTruthy();
  return card.credentialData as Record<string, unknown>;
}
