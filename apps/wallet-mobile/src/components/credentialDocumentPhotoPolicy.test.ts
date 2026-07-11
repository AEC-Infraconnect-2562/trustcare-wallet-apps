import { describe, expect, it } from "vitest";
import {
  TRUSTCARE_PORTAL_ASSET_ORIGIN,
  type WalletCard,
} from "@trustcare/wallet-core";
import { photoCandidatesForNativeDocument } from "./credentialDocumentPhotoPolicy";

const baseCard: WalletCard = {
  id: 1,
  cardType: "patient_identity",
  displayName: "Patient identity",
  documentCategory: "identity_and_access",
  credentialId: "vc-mobile-photo-test",
  credentialStatus: "active",
  credentialData: {},
  ownerUserId: "patient-001",
  createdAt: "2026-07-10T00:00:00.000Z",
};

describe("mobile credential document photo policy", () => {
  it("uses only photo candidates carried by a photo-bearing credential", () => {
    const candidates = photoCandidatesForNativeDocument(
      {
        ...baseCard,
        credentialData: {
          credentialSubject: {
            humanDocument: {
              renderData: {
                patient: {
                  photoUrl: "/manus-storage/patient-source.jpg",
                },
              },
            },
          },
        },
      },
      "patient_identity",
    );

    expect(candidates[0]).toMatchObject({
      label: "credentialSubject.humanDocument.renderData.patient.photoUrl",
      url: `${TRUSTCARE_PORTAL_ASSET_ORIGIN}/manus-storage/patient-source.jpg`,
    });
  });

  it("does not use a patient portrait for a staff identity", () => {
    const candidates = photoCandidatesForNativeDocument(
      {
        ...baseCard,
        cardType: "staff_identity",
        patientAvatarUrl: null,
        credentialData: {
          credentialSubject: {
            patient: { photoUrl: "/manus-storage/wrong-patient.jpg" },
            staff: { photoUrl: "/manus-storage/correct-staff.jpg" },
          },
        },
      },
      "staff_identity",
    );
    const urls = candidates.map((candidate) => candidate.url).join(" ");

    expect(urls).toContain("correct-staff.jpg");
    expect(urls).not.toContain("wrong-patient.jpg");
  });

  it("renders no identity photo slot for a non-photo document type", () => {
    expect(
      photoCandidatesForNativeDocument(
        {
          ...baseCard,
          cardType: "medical_certificate",
          patientAvatarUrl: "/manus-storage/unrelated-profile.jpg",
        },
        "medical_certificate",
      ),
    ).toEqual([]);
  });
});
