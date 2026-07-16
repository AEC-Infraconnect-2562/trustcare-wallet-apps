import { describe, expect, it } from "vitest";
import type { WalletCard } from "./models";
import {
  normalizePhotoUrl,
  normalizePhotoUrlCandidates,
  photoCandidatesForCard,
} from "./photoSources";

const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";

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
  createdAt: "2026-07-07T00:00:00.000Z",
};

describe("photoSources", () => {
  it("keeps TrustCare storage URLs production-resolvable with source-equivalent variants", () => {
    expect(
      normalizePhotoUrl("/manus-storage/patient_somsak_a2e00e97.jpg"),
    ).toBe(`${portalOrigin}/manus-storage/patient_somsak_a2e00e97.jpg`);
    expect(
      normalizePhotoUrlCandidates(
        "/api/storage-proxy/patient_somsak_a2e00e97.jpg",
      ),
    ).toEqual([
      `${portalOrigin}/manus-storage/patient_somsak_a2e00e97.jpg`,
      `${portalOrigin}/api/storage-proxy/patient_somsak_a2e00e97.jpg`,
    ]);
  });

  it("keeps a supplied Portal portrait scoped to its own filename", () => {
    expect(
      normalizePhotoUrlCandidates(
        `${portalOrigin}/manus-storage/patient_malee_74d2ef04.jpg`,
      ),
    ).toEqual([
      `${portalOrigin}/manus-storage/patient_malee_74d2ef04.jpg`,
      `${portalOrigin}/api/storage-proxy/patient_malee_74d2ef04.jpg`,
    ]);
  });

  it("keeps fallbacks scoped to the canonical renderData photo", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      patientAvatarUrl: `${portalOrigin}/manus-storage/legacy-owner.jpg`,
      credentialData: {
        credentialSubject: {
          patient: {
            photoUrl: "/manus-storage/legacy-subject.jpg",
          },
          data: {
            humanDocument: {
              renderData: {
                patient: {
                  photoUrl: "/manus-storage/canonical-patient.jpg",
                },
              },
            },
          },
        },
      },
    });

    expect(candidates[0]).toMatchObject({
      label:
        "credentialSubject.data.humanDocument.renderData.patient.photoUrl",
      url: `${portalOrigin}/manus-storage/canonical-patient.jpg`,
    });
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      `${portalOrigin}/manus-storage/canonical-patient.jpg`,
      `${portalOrigin}/api/storage-proxy/canonical-patient.jpg`,
    ]);
    expect(
      candidates.map((candidate) => candidate.url).join(" "),
    ).not.toContain("legacy-owner.jpg");
  });

  it("reads a portrait from the signed flattened humanDocument contract", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      sourceSystem: "trustcare_portal",
      credentialData: {
        credentialSubject: {
          data: {
            humanDocument: {
              patient: {
                portraitUrl: `${portalOrigin}/seed-avatars/patient-signed.jpg`,
              },
            },
          },
        },
      },
    });

    expect(candidates).toEqual([
      {
        label:
          "credentialSubject.data.humanDocument.patient.portraitUrl",
        url: `${portalOrigin}/seed-avatars/patient-signed.jpg`,
      },
    ]);
  });

  it("does not cross-fallback from a staff credential to a patient portrait", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      cardType: "staff_identity",
      patientAvatarUrl: null,
      credentialData: {
        credentialSubject: {
          data: {
            humanDocument: {
              renderData: {
                patient: { photoUrl: "/manus-storage/wrong-patient.jpg" },
                staff: { photoUrl: "/manus-storage/correct-staff.jpg" },
              },
            },
          },
        },
      },
    });

    expect(candidates.map((candidate) => candidate.url).join(" ")).toContain(
      "correct-staff.jpg",
    );
    expect(
      candidates.map((candidate) => candidate.url).join(" "),
    ).not.toContain("wrong-patient.jpg");
  });

  it("normalizes staff aliases before selecting the subject portrait", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      cardType: "staff_badge",
      patientAvatarUrl: "/manus-storage/wrong-owner.jpg",
      credentialData: {
        credentialSubject: {
          data: {
            humanDocument: {
              renderData: {
                patient: { photoUrl: "/manus-storage/wrong-patient.jpg" },
                staff: { photoUrl: "/manus-storage/correct-staff.jpg" },
              },
            },
          },
        },
      },
    });

    expect(candidates.map((candidate) => candidate.url).join(" ")).toContain(
      "correct-staff.jpg",
    );
    expect(
      candidates.map((candidate) => candidate.url).join(" "),
    ).not.toContain("wrong-patient.jpg");
    expect(
      candidates.map((candidate) => candidate.url).join(" "),
    ).not.toContain("wrong-owner.jpg");
  });

  it("uses the canonical staff renderData subject without borrowing another photo", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      cardType: "staff_identity",
      patientAvatarUrl: "/manus-storage/wrong-owner.jpg",
      credentialData: {
        credentialSubject: {
          data: {
            humanDocument: {
              renderData: {
                staff: { photoUrl: "/manus-storage/correct-staff.jpg" },
              },
            },
          },
        },
      },
    });

    expect(candidates.map((candidate) => candidate.url).join(" ")).toContain(
      "correct-staff.jpg",
    );
    expect(
      candidates.map((candidate) => candidate.url).join(" "),
    ).not.toContain("wrong-owner.jpg");
  });

  it("does not read portraits outside the canonical Portal render path", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      sourceSystem: "trustcare_portal",
      patientAvatarUrl: "/manus-storage/wrong-owner.jpg",
      credentialData: {
        credentialSubject: {
          patient: {
            demographics: {
              photoUrl: "/manus-storage/patient_somsak_a2e00e97.jpg",
            },
          },
        },
      },
    });

    expect(candidates).toEqual([]);
  });

  it("dedupes owner and embedded photo candidates", () => {
    const candidates = photoCandidatesForCard({
      ...baseCard,
      patientAvatarUrl: `${portalOrigin}/manus-storage/patient_somsak_a2e00e97.jpg`,
      credentialData: {
        credentialSubject: {
          patient: {
            photoUrl: "/manus-storage/patient_somsak_a2e00e97.jpg",
          },
        },
      },
    });

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      `${portalOrigin}/manus-storage/patient_somsak_a2e00e97.jpg`,
      `${portalOrigin}/api/storage-proxy/patient_somsak_a2e00e97.jpg`,
    ]);
  });
});
