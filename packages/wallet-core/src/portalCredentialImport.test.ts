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
});
