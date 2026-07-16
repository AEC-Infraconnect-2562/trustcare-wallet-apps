import { describe, expect, it } from "vitest";
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";
import {
  walletAvatarBindingKey,
  walletAvatarDataUrl,
  walletAvatarSourceFromDocuments,
} from "./walletAvatar";

const holderDid = "did:key:z6MkWalletAvatarHolder";
const portraitUrl = "https://portal.example/seed-avatars/patient-001.jpg";

describe("Wallet avatar identity binding", () => {
  it("selects a signed portrait from the exact holder and sandbox catalog URL", () => {
    const source = walletAvatarSourceFromDocuments({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [documentFixture()],
      expectedSandboxPortraitUrl: portraitUrl,
    });

    expect(source).toMatchObject({
      binding: {
        walletUserId: "demo-patient-001",
        holderDid,
        credentialSubjectId: holderDid,
      },
      sourceUrl: portraitUrl,
      sourceCredentialId: "credential-patient-001",
      sourceDocumentId: "document-patient-001",
    });
  });

  it("selects the portrait from Portal v4 flattened humanDocument render data", () => {
    const source = walletAvatarSourceFromDocuments({
      walletUserId: "demo-patient-004",
      holderDid,
      documents: [documentFixture({ flattened: true })],
      expectedSandboxPortraitUrl: portraitUrl,
    });

    expect(source?.sourceUrl).toBe(portraitUrl);
  });

  it("resolves a signed Portal root path to the verified HTTPS source origin", () => {
    const source = walletAvatarSourceFromDocuments({
      walletUserId: "demo-patient-004",
      holderDid,
      documents: [documentFixture({ portraitPath: "/seed-avatars/patient-001.jpg" })],
      expectedSandboxPortraitUrl: portraitUrl,
    });

    expect(source?.sourceUrl).toBe(portraitUrl);
  });

  it("fails closed when the signed portrait differs from the catalog", () => {
    expect(() =>
      walletAvatarSourceFromDocuments({
        walletUserId: "demo-patient-001",
        holderDid,
        documents: [documentFixture()],
        expectedSandboxPortraitUrl:
          "https://portal.example/seed-avatars/different-person.jpg",
      }),
    ).toThrow(/does not match/);
  });

  it("does not use a portrait from another holder or a noPortrait credential", () => {
    expect(
      walletAvatarSourceFromDocuments({
        walletUserId: "demo-patient-001",
        holderDid,
        documents: [
          documentFixture({ subjectId: "did:key:z6MkDifferentHolder" }),
          documentFixture({ noPortrait: true }),
        ],
      }),
    ).toBeUndefined();
  });

  it("creates stable three-part binding keys and data URLs only for ready assets", () => {
    const binding = {
      walletUserId: "demo-patient-001",
      holderDid,
      credentialSubjectId: holderDid,
    };
    expect(walletAvatarBindingKey(binding).split("\u0000")).toHaveLength(3);
    expect(
      walletAvatarDataUrl({
        schema: "trustcare.wallet.avatar.v1",
        binding,
        status: "ready",
        fetchedAt: "2026-07-14T12:00:00.000Z",
        sourceUrl: portraitUrl,
        sourceCredentialId: "credential-patient-001",
        sourceDocumentId: "document-patient-001",
        mediaType: "image/jpeg",
        httpStatus: 200,
        localSha256: `sha256:${"a".repeat(64)}`,
        proofScope: "cache_integrity_only",
        contentBase64: "AQID",
      }),
    ).toBe("data:image/jpeg;base64,AQID");
  });
});

function documentFixture(input?: {
  subjectId?: string;
  noPortrait?: boolean;
  flattened?: boolean;
  portraitPath?: string;
}): WalletDocumentRecordV2 {
  const subjectId = input?.subjectId ?? holderDid;
  return {
    schemaVersion: "2.0",
    id: "document-patient-001",
    owner: { id: holderDid, holderDid },
    documentType: "patient_identity",
    category: "identity_and_access",
    title: { th: "บัตรประจำตัวผู้ป่วย", en: "Patient identity" },
    clinicalContext: {},
    lifecycle: {
      status: "final",
      versionId: "1",
      issuedAt: "2026-07-14T10:00:00.000Z",
      updatedAt: "2026-07-14T10:01:00.000Z",
    },
    provenance: {
      sourceKind: "trustcare_portal",
      issuerDid: "did:web:portal.example:hospital:tcc",
      sourceEndpoint: "https://portal.example/api/wallet/v2/credentials/sync",
      receivedAt: "2026-07-14T10:02:00.000Z",
    },
    content: {
      credentialPayload: {
        id: "credential-patient-001",
        credentialSubject: {
          id: subjectId,
          data: {
            humanDocument: {
              noPortrait: input?.noPortrait ?? false,
              ...(input?.flattened
                ? { patient: { photoUrl: input.portraitPath ?? portraitUrl } }
                : {
                    renderData: {
                      patient: { photoUrl: input?.portraitPath ?? portraitUrl },
                    },
                  }),
            },
          },
        },
      },
      documentReference: {
        resourceType: "DocumentReference",
        id: "document-reference-patient-001",
        status: "current",
        content: [],
      },
      originalAttachments: [],
    },
    credential: {
      credentialType: "PatientIdentityCredential",
      format: "vc+jwt",
      credentialId: "credential-patient-001",
      jwt: "header.payload.signature",
    },
    trust: { state: "issuer_signed_untrusted", checks: [] },
    privacy: { defaultDisclosure: "ask", selectivelyDisclosableFields: [] },
    local: { pinned: false, availableOffline: true },
  };
}
