import { describe, expect, it } from "vitest";
import { getDemoUser } from "./demoData";
import { normalizeTrustCarePortalWalletCards } from "./portalCredentialImport";

describe("normalizeTrustCarePortalWalletCards", () => {
  it("imports only Portal cards with real credentialData", () => {
    const owner = getDemoUser("demo-patient-001");
    const credentialData = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:trustcare:portal:vc:patient-identity:414",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: {
        id: "did:web:trustcare.network:hospital:tcc",
        name: "TrustCare Central Hospital",
        nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล"
      },
      validFrom: "2026-07-01T02:00:00.000Z",
      validUntil: "2027-07-01T02:00:00.000Z",
      credentialSubject: {
        id: owner.holderDid,
        patient: {
          photoUrl: "/manus-storage/patient_somsak_a2e00e97.jpg"
        }
      }
    };

    const result = normalizeTrustCarePortalWalletCards({
      owner,
      groupedCards: {
        identity_and_access: [
          {
            id: 1,
            patientId: 414,
            credentialId: 1001,
            cardType: "identity",
            displayName: "บัตรประจำตัวผู้ป่วย",
            displayNameEn: "Patient ID Card",
            documentCategory: "identity_and_access",
            issuerHospitalName: "TrustCare Central Hospital",
            credentialStatus: "active",
            credentialType: "patient_identity",
            issuedAt: "2026-07-01T02:00:00.000Z",
            expiresAt: "2027-07-01T02:00:00.000Z",
            proof: {
              type: "jwt",
              jwt: "ey.portal.patient.identity.sd-jwt-vc",
              alg: "ES256",
              kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key"
            },
            credentialData
          },
          {
            id: 2,
            patientId: 414,
            credentialId: 1002,
            cardType: "patient_summary",
            displayName: "สรุปข้อมูลผู้ป่วย",
            displayNameEn: "Patient Summary",
            documentCategory: "clinical_summary",
            credentialStatus: "active",
            credentialData: null
          }
        ]
      },
      syncedAt: "2026-07-06T10:00:00.000Z"
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.cardType).toBe("patient_identity");
    expect(result.cards[0]?.credentialData).toBe(credentialData);
    expect(result.cards[0]?.credentialJwt).toBe("ey.portal.patient.identity.sd-jwt-vc");
    expect(result.cards[0]?.credentialProof).toMatchObject({
      type: "jwt",
      alg: "ES256",
      kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key",
      source: "trustcare_portal_sync_proof"
    });
    expect(result.cards[0]?.patientAvatarUrl).toBe(
      "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg"
    );
    expect(result.report.portalCardCount).toBe(2);
    expect(result.report.importedCredentialCount).toBe(1);
    expect(result.report.metadataOnlyCount).toBe(1);
    expect(result.report.skipped[0]?.reason).toBe("metadata_only");
  });

  it("uses credentialSubject.documentType before broad Portal cardType metadata", () => {
    const owner = getDemoUser("demo-patient-003");
    const result = normalizeTrustCarePortalWalletCards({
      owner,
      groupedCards: {
        claims_and_finance: [
          portalCard({
            id: 101,
            cardType: "claim",
            displayName: "ใบเสร็จรับเงิน",
            displayNameEn: "Claim Receipt",
            documentType: "claim_receipt"
          }),
          portalCard({
            id: 102,
            cardType: "claim",
            displayName: "ชุดเอกสารเคลม",
            displayNameEn: "Claim Package",
            documentType: "claim_package"
          })
        ],
        medical_tourism: [
          portalCard({
            id: 201,
            cardType: "travel_document",
            displayName: "ตรวจเอกสารผู้ป่วยต่างชาติ",
            displayNameEn: "Travel Document Verification",
            documentType: "travel_document_verification"
          })
        ]
      },
      syncedAt: "2026-07-06T10:00:00.000Z"
    });

    expect(result.cards.map((card) => card.cardType).sort()).toEqual([
      "claim_package",
      "claim_receipt",
      "travel_document_verification"
    ]);
  });
});

function portalCard(input: {
  id: number;
  cardType: string;
  displayName: string;
  displayNameEn: string;
  documentType: string;
}) {
  return {
    id: input.id,
    patientId: 3003,
    credentialId: input.id + 10_000,
    cardType: input.cardType,
    displayName: input.displayName,
    displayNameEn: input.displayNameEn,
    documentCategory: "clinical_summary",
    issuerHospitalName: "TrustCare Phuket International Hospital",
    credentialStatus: "active",
    issuedAt: "2026-07-01T02:00:00.000Z",
    expiresAt: "2027-07-01T02:00:00.000Z",
    credentialData: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: `urn:trustcare:portal:vc:test:${input.id}`,
      type: ["VerifiableCredential", "TrustCareHealthCredential"],
      issuer: {
        id: "did:web:trustcare.network:hospital:tcp",
        name: "TrustCare Phuket International Hospital"
      },
      validFrom: "2026-07-01T02:00:00.000Z",
      validUntil: "2027-07-01T02:00:00.000Z",
      credentialSubject: {
        id: "did:key:test-holder",
        documentType: input.documentType,
        patient: {
          fullNameEn: "Mr. John Williams"
        }
      },
      evidence: [
        {
          type: "DocumentReference",
          documentReference: {
            id: `DocumentReference/${input.id}`
          }
        }
      ]
    }
  };
}
