import { describe, expect, it, vi } from "vitest";
import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";
import { synchronizeWalletAvatar } from "./walletAvatarSync";

const holderDid = "did:key:z6MkWalletAvatarHolder";
const portraitUrl = "https://portal.example/seed-avatars/patient-001.jpg";
const bytesDigest =
  "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

describe("Wallet avatar synchronization", () => {
  it("fetches only the signed HTTPS portrait and records cache-integrity metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "x-request-id": "avatar-request-001",
          "x-correlation-id": "avatar-correlation-001",
        },
      }),
    ) as unknown as typeof fetch;

    const result = await synchronizeWalletAvatar({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [documentFixture()],
      expectedSandboxPortraitUrl: portraitUrl,
      fetchImpl,
      now: () => new Date("2026-07-14T12:00:00.000Z"),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      portraitUrl,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
      }),
    );
    expect(result).toMatchObject({
      status: "ready",
      mediaType: "image/jpeg",
      httpStatus: 200,
      localSha256: bytesDigest,
      proofScope: "cache_integrity_only",
      sourceCredentialId: "credential-patient-001",
      requestId: "avatar-request-001",
      correlationId: "avatar-correlation-001",
    });
    expect(result.contentBase64).toBe("AQID");
  });

  it("marks a matching signed digest as issuer-bound and rejects mismatched bytes", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as unknown as typeof fetch;
    const accepted = await synchronizeWalletAvatar({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [documentFixture({ signedDigest: bytesDigest })],
      fetchImpl,
    });
    const rejected = await synchronizeWalletAvatar({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [
        documentFixture({ signedDigest: `sha256:${"a".repeat(64)}` }),
      ],
      fetchImpl,
    });

    expect(accepted).toMatchObject({
      status: "ready",
      signedDigest: bytesDigest,
      proofScope: "issuer_signed_digest",
    });
    expect(rejected).toMatchObject({
      status: "validation_failed",
      errorCode: "avatar_signed_digest_mismatch",
    });
    expect(rejected.contentBase64).toBeUndefined();
  });

  it("keeps media failures separate from credential quarantine", async () => {
    const result = await synchronizeWalletAvatar({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [documentFixture()],
      fetchImpl: vi.fn(async () =>
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ) as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      status: "validation_failed",
      errorCode: "avatar_media_type_invalid",
      sourceDocumentId: "document-patient-001",
    });
  });

  it("does not fetch when the signed portrait conflicts with the sandbox catalog", async () => {
    const fetchImpl = vi.fn();
    const result = await synchronizeWalletAvatar({
      walletUserId: "demo-patient-001",
      holderDid,
      documents: [documentFixture()],
      expectedSandboxPortraitUrl:
        "https://portal.example/seed-avatars/other-person.jpg",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "validation_failed",
      errorCode: "avatar_catalog_mismatch",
    });
  });
});

function documentFixture(input?: {
  signedDigest?: string;
}): WalletDocumentRecordV2 {
  return {
    schemaVersion: "2.0",
    id: "document-patient-001",
    owner: { id: holderDid, holderDid },
    documentType: "patient_identity",
    category: "identity_and_access",
    title: { th: "บัตรประจำตัวผู้ป่วย" },
    clinicalContext: {},
    lifecycle: { status: "final", versionId: "1" },
    provenance: {
      sourceKind: "trustcare_portal",
      receivedAt: "2026-07-14T10:00:00.000Z",
    },
    content: {
      credentialPayload: {
        id: "credential-patient-001",
        credentialSubject: {
          id: holderDid,
          data: {
            humanDocument: {
              noPortrait: false,
              renderData: {
                patient: {
                  photoUrl: portraitUrl,
                  ...(input?.signedDigest
                    ? { photoDigest: input.signedDigest }
                    : {}),
                },
              },
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
      credentialId: "credential-patient-001",
      credentialType: "PatientIdentityCredential",
      format: "vc+jwt",
      jwt: "header.payload.signature",
    },
    trust: { state: "issuer_signed_untrusted", checks: [] },
    privacy: { defaultDisclosure: "ask", selectivelyDisclosableFields: [] },
    local: { pinned: false, availableOffline: true },
  };
}
