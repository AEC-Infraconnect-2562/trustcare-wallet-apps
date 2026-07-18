import { describe, expect, it } from "vitest";
import { assertShlCertificationRequest } from "./shlCertification";

const compactVpJwt =
  "eyJhbGciOiJFUzI1NiIsInR5cCI6InZwK2p3dCIsImN0eSI6InZwIn0.eyJob2xkZXIiOiJkaWQ6a2V5OnoifQ.c2ln";
const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";

function request() {
  const shlPackageId = "A".repeat(43);
  return {
    clientRequestId: "wallet-shl-certification-001",
    shlPackageId,
    targetHospitalCode: "TCC" as const,
    context: "opd_visit" as const,
    purpose: "OPD registration",
    consentRef: "urn:trustcare:consent:001",
    manifestUrl: `${portalOrigin}/s/${shlPackageId}`,
    manifestHash: `sha256:${"a".repeat(64)}`,
    sourceBundleHash: `sha256:${"b".repeat(64)}`,
    fileHashes: [`sha256:${"c".repeat(64)}`],
    expiresAt: "2026-07-14T00:10:00.000Z",
    holderAuthorizationVpJwt: compactVpJwt,
  };
}

describe("SHL hospital certification wire contract", () => {
  it("accepts the exact Portal Wallet Exchange v2 request", () => {
    expect(assertShlCertificationRequest(request(), portalOrigin)).toEqual(
      request(),
    );
  });

  it("rejects patientId and unsigned holder authorization", () => {
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        patientId: "portal-1",
      } as never, portalOrigin),
    ).toThrow("patientId is forbidden");
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        holderAuthorizationVpJwt: JSON.stringify({ holder: "did:key:z" }),
      }, portalOrigin),
    ).toThrow("request is invalid");
  });

  it("rejects unknown hospitals, non-HTTPS manifests, and malformed hashes", () => {
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        targetHospitalCode: "OLD" as never,
      }, portalOrigin),
    ).toThrow("request is invalid");
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        manifestUrl: "http://share.example/manifest",
      }, portalOrigin),
    ).toThrow("request is invalid");
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        sourceBundleHash: "sha256:copied",
      }, portalOrigin),
    ).toThrow("request is invalid");
    expect(() =>
      assertShlCertificationRequest({
        ...request(),
        shlPackageId: "low-entropy",
      }, portalOrigin),
    ).toThrow("request is invalid");
  });

  it("rejects the retired route, cross-origin URLs, query strings, and long URLs", () => {
    const id = request().shlPackageId;
    for (const manifestUrl of [
      `${portalOrigin}/api/share-gateway/manifests/${id}.json`,
      `https://wallet.example/s/${id}`,
      `${portalOrigin}/s/${id}?token=legacy`,
      `${portalOrigin}/s/${id}#shlink`,
    ]) {
      expect(() =>
        assertShlCertificationRequest(
          { ...request(), manifestUrl },
          portalOrigin,
        ),
      ).toThrow("request is invalid");
    }
  });
});
