import { describe, expect, it } from "vitest";
import {
  assertShlCertificationRequest,
  assertShlCertificationResponse,
} from "./shlCertification";

const compactJwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6a2V5OnoifQ.c2ln";

describe("SHL hospital certification wire contract", () => {
  it("accepts holder-bound requests without Portal patient identifiers", () => {
    expect(
      assertShlCertificationRequest({
        schema: "trustcare.shl-certification-request.v1",
        requestId: "urn:uuid:request-1",
        targetHospitalCode: "TCC",
        shlPackageId: "shl-package-1",
        holderDid: "did:key:zHolder",
        holderPresentationId: "urn:uuid:holder-vp-1",
        holderPresentationJwt: compactJwt,
        manifestUrl: "https://share.example/manifests/shl-package-1.json",
        manifestHash: `sha256:${"a".repeat(64)}`,
        fileHashes: [
          {
            fileId: "file-1",
            documentId: "document-1",
            plaintextSha256: `sha256:${"b".repeat(64)}`,
            jweSha256: `sha256:${"c".repeat(64)}`,
          },
        ],
        accessPolicy: {
          purpose: "OPD registration",
          recipient: "TrustCare registration",
          audience: "https://portal.example/api/wallet/v2/submissions",
          context: "opd_visit",
          consentRef: "consent:1",
          issuedAt: "2026-07-12T00:00:00.000Z",
          expiresAt: "2026-07-12T00:10:00.000Z",
          passcodeRequired: false,
          maxAccessCount: 3,
        },
        accessPolicyHash: `sha256:${"d".repeat(64)}`,
        sourceCredentials: [
          {
            documentId: "document-1",
            credentialId: "credential-1",
            issuerDid: "did:web:issuer.example:hospital:tcc",
            plaintextSha256: `sha256:${"b".repeat(64)}`,
          },
        ],
      }),
    ).toMatchObject({ shlPackageId: "shl-package-1" });
  });

  it("rejects patientId and Manifest VC before approval", () => {
    expect(() =>
      assertShlCertificationRequest({ patientId: "portal-1" } as never),
    ).toThrow("patientId is forbidden");

    expect(() =>
      assertShlCertificationResponse({
        schema: "trustcare.wallet.shl-certification.v1",
        certificationRequestId: "cert-1",
        requestId: "request-1",
        shlPackageId: "shl-package-1",
        status: "pending_review",
        statusUrl: "https://portal.example/api/wallet/v2/shl-certifications/cert-1",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:01.000Z",
        manifestCredentialJwt: compactJwt,
        correlationId: "corr-1",
        idempotent: false,
      }),
    ).toThrow("approved application/vc+jwt");
  });

  it("rejects unsigned Manifest Credential JSON in approved responses", () => {
    expect(() =>
      assertShlCertificationResponse({
        schema: "trustcare.wallet.shl-certification.v1",
        certificationRequestId: "cert-1",
        requestId: "request-1",
        shlPackageId: "shl-package-1",
        status: "approved",
        statusUrl: "https://portal.example/api/wallet/v2/shl-certifications/cert-1",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:01.000Z",
        manifestCredentialContentType: "application/vc+jwt",
        manifestCredentialJwt: JSON.stringify({ issuer: "did:web:copied" }),
        correlationId: "corr-1",
        idempotent: false,
      }),
    ).toThrow("approved application/vc+jwt");
  });

  it("accepts only a compact application/vc+jwt after approval", () => {
    expect(
      assertShlCertificationResponse({
        schema: "trustcare.wallet.shl-certification.v1",
        certificationRequestId: "cert-1",
        requestId: "request-1",
        shlPackageId: "shl-package-1",
        status: "approved",
        statusUrl: "https://portal.example/api/wallet/v2/shl-certifications/cert-1",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:01.000Z",
        manifestCredentialContentType: "application/vc+jwt",
        manifestCredentialJwt: compactJwt,
        correlationId: "corr-1",
        idempotent: false,
      }),
    ).toMatchObject({
      status: "approved",
      manifestCredentialContentType: "application/vc+jwt",
      manifestCredentialJwt: compactJwt,
    });
  });
});
