import { describe, expect, it } from "vitest";
import type { WalletCard } from "./models";
import { normalizePhotoUrl, normalizePhotoUrlCandidates, photoCandidatesForCard } from "./photoSources";

const baseCard: WalletCard = {
  id: 1,
  cardType: "patient_identity",
  displayName: "บัตรประจำตัวผู้ป่วย",
  displayNameEn: "Patient ID Card",
  documentCategory: "identity_and_access",
  credentialId: "vc-photo-test",
  credentialStatus: "active",
  credentialData: {},
  ownerUserId: "demo-patient-001",
  createdAt: "2026-07-07T00:00:00.000Z"
};

describe("photoSources", () => {
  it("keeps TrustCare storage URLs production-resolvable and adds proxy fallback", () => {
    expect(normalizePhotoUrl("/manus-storage/patient_somsak_a2e00e97.jpg")).toBe(
      "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg"
    );
    expect(normalizePhotoUrlCandidates("/api/storage-proxy/patient_somsak_a2e00e97.jpg")).toEqual([
      "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg",
      "https://trustcarehealth.live/api/storage-proxy/patient_somsak_a2e00e97.jpg"
    ]);
  });

  it("reads Portal photo paths from current nested credential schemas", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      credentialData: {
        credentialSubject: {
          patient: {
            demographics: {
              photoUrl: "/manus-storage/patient_somsak_a2e00e97.jpg"
            }
          }
        }
      }
    });

    expect(candidates[0]).toMatchObject({
      label: "credentialSubject.patient.demographics.photoUrl",
      url: "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg"
    });
  });

  it("dedupes owner and embedded photo candidates", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      patientAvatarUrl: "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg",
      credentialData: {
        credentialSubject: {
          patient: {
            photoUrl: "/manus-storage/patient_somsak_a2e00e97.jpg"
          }
        }
      }
    });

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://trustcarehealth.live/manus-storage/patient_somsak_a2e00e97.jpg",
      "https://trustcarehealth.live/api/storage-proxy/patient_somsak_a2e00e97.jpg"
    ]);
  });
});
