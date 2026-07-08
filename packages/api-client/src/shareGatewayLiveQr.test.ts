import { describe, expect, it } from "vitest";
import {
  buildSharePackage,
  createShareGatewayPublicationRequest,
  fetchShlManifest,
  getDemoWalletCards,
  type BuiltSharePackage,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";
import { verifyQr } from "./verifier";

const gatewayBaseUrl = process.env.TRUSTCARE_WALLET_TEST_GATEWAY_URL?.replace(
  /\/$/,
  "",
);
const appOrigin =
  process.env.TRUSTCARE_WALLET_TEST_APP_ORIGIN?.replace(/\/$/, "") ??
  gatewayBaseUrl?.replace(/\/api\/share-gateway$/, "");

const runLiveGatewayTest =
  gatewayBaseUrl && appOrigin ? describe : describe.skip;

runLiveGatewayTest("live share gateway QR resolution", () => {
  const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 4);

  it("publishes and verifies Direct/Purpose VP, Standard SHL, and Certified SHL QR payloads", async () => {
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const vp = buildSharePackage({
      mode: "PurposeVP",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.slice(0, 2).map((card) => card.id),
      recipient: "TrustCare live QR verifier",
      purpose: "เตรียมเข้ารับบริการ OPD",
      gatewayBaseUrl,
      viewerBaseUrl: appOrigin,
      origin: appOrigin,
    });
    const vpPackage = expectVpPackage(vp);
    const vpPublication = await publishArtifact({
      artifactId: vpPackage.presentation.presentationId,
      kind: "vp",
      contentType: "application/vp+json",
      payload: vpPackage.payload,
      holderDid: String(cards[0]?.holderDid ?? ""),
      purpose: "เตรียมเข้ารับบริการ OPD",
      expiresAt: vpPackage.presentation.expiresAt,
    });
    expect(vpPublication.qrPayload).toMatch(/\/presentations\/.+\.jwt$/);
    const vpVerification = await verifyQr(
      { url: "https://trustcare.example.test/trpc" },
      vpPublication.qrPayload!,
    );
    expect(vpVerification.protocol).toBe("trustcare-vp");
    expect(vpVerification.trustLevel).toBe("green");
    expect(vpVerification.verified).toBe(true);

    const standardShl = buildSharePackage({
      mode: "StandardSHL",
      context: "referral",
      cards,
      selectedCardIds: cards.slice(0, 3).map((card) => card.id),
      recipient: "External SMART Health Links verifier",
      purpose: "ส่งต่อผู้ป่วย",
      gatewayBaseUrl,
      viewerBaseUrl: appOrigin,
      origin: appOrigin,
      shlPolicy: { maxAccessCount: 5, accessCodeDelivery: "not_required" },
    });
    const standardShlPackage = expectShlPackage(standardShl);
    await publishShlManifest(standardShlPackage);
    const standardFetch = await fetchShlManifest(
      standardShlPackage.shl.qrPayload,
    );
    expect(standardFetch.ok).toBe(true);
    expect(standardFetch.fileCount).toBe(3);
    const standardVerification = await verifyQr(
      { url: "https://trustcare.example.test/trpc" },
      standardShlPackage.shl.qrPayload,
    );
    expect(standardVerification.protocol).toBe("shl");
    expect(standardVerification.trustLevel).toBe("blue");
    expect(standardVerification.verified).toBe(false);
    expect(standardVerification.requestSummary).toContain("Standard SHL");

    const certifiedShl = buildSharePackage({
      mode: "CertifiedSHLManifestPackage",
      context: "cross_border",
      cards,
      selectedCardIds: cards.map((card) => card.id),
      recipient: "TrustCare certified verifier",
      purpose: "ส่งต่อข้ามเครือข่าย/ข้ามแดน",
      gatewayBaseUrl,
      viewerBaseUrl: appOrigin,
      origin: appOrigin,
      shlPolicy: { maxAccessCount: 5, accessCodeDelivery: "not_required" },
    });
    const certifiedShlPackage = expectShlPackage(certifiedShl);
    await publishShlManifest(certifiedShlPackage);
    const certifiedFetch = await fetchShlManifest(
      certifiedShlPackage.shl.qrPayload,
    );
    expect(certifiedFetch.ok).toBe(true);
    expect(certifiedFetch.fileCount).toBe(cards.length);
    expect((certifiedFetch.manifest?.trustcare as any)?.trustLayerStatus).toBe(
      "certified_manifest_vp",
    );
    const certifiedVerification = await verifyQr(
      { url: "https://trustcare.example.test/trpc" },
      certifiedShlPackage.shl.qrPayload,
    );
    expect(certifiedVerification.protocol).toBe("shl");
    expect(certifiedVerification.trustLevel).toBe("green");
    expect(certifiedVerification.verified).toBe(true);
  }, 60_000);
});

function expectVpPackage(
  sharePackage: BuiltSharePackage,
): Extract<BuiltSharePackage, { presentation: unknown }> {
  expect("presentation" in sharePackage).toBe(true);
  if (!("presentation" in sharePackage)) {
    throw new Error("Expected VP share package.");
  }
  return sharePackage;
}

function expectShlPackage(
  sharePackage: BuiltSharePackage,
): Extract<BuiltSharePackage, { shl: unknown }> {
  expect("shl" in sharePackage).toBe(true);
  if (!("shl" in sharePackage)) {
    throw new Error("Expected SHL share package.");
  }
  return sharePackage;
}

async function publishShlManifest(
  sharePackage: Extract<BuiltSharePackage, { shl: unknown }>,
) {
  const shl = sharePackage.shl;
  const publicationId = String(shl.gatewayPublicationId ?? shl.shlId);
  await publishArtifact({
    artifactId: publicationId,
    kind:
      shl.trustLayerStatus === "certified_manifest_vp"
        ? "certified_shl_manifest"
        : "standard_shl_manifest",
    contentType: "application/json",
    payload: shl.manifest,
    purpose: String(sharePackage.payload.purpose ?? ""),
    expiresAt: shl.expiresAt,
    accessPolicy: {
      expiresAt: shl.expiresAt,
      passcodeRequired: shl.passcodeRequired,
      maxAccessCount: shl.maxAccessCount,
      accessCodeDelivery: shl.accessCodeDelivery,
    },
  });
}

async function publishArtifact(
  request: Parameters<typeof createShareGatewayPublicationRequest>[0],
): Promise<ShareGatewayPublicationResponse> {
  const response = await fetch(`${gatewayBaseUrl}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(createShareGatewayPublicationRequest(request)),
  });
  const payload = (await response.json()) as ShareGatewayPublicationResponse;
  expect(response.ok, JSON.stringify(payload)).toBe(true);
  expect(payload.ok, JSON.stringify(payload)).toBe(true);
  return payload;
}
