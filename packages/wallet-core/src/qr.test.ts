import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  createPresentationQrPayload,
  parseTrustCareQr,
} from "./qr";
import {
  assertImmutablePresentationResolverQrPayload,
  assertProductionCrossDeviceQrPayload,
  classifyQrPayload,
} from "./qrContracts";

describe("presentation QR hard cutover", () => {
  const resolver =
    "https://portal.example/api/share-gateway/presentations/vp_123.jwt";

  it("uses only the exact immutable Share Gateway resolver", async () => {
    expect(
      createPresentationQrPayload({
        origin: "https://portal.example",
        presentationId: "vp_123",
        qrData: resolver,
      }),
    ).toBe(resolver);
    expect(parseTrustCareQr(resolver)).toMatchObject({
      kind: "vp-url",
      presentationId: "vp_123",
    });
    expect(classifyQrPayload(resolver)).toMatchObject({
      kind: "vp_resolver",
      verifierResolvable: true,
      productionResolvable: true,
    });
    expect(() =>
      assertImmutablePresentationResolverQrPayload(resolver, {
        origin: "https://portal.example",
        artifactId: "vp_123",
      }),
    ).not.toThrow();
    await expect(QRCode.toDataURL(resolver)).resolves.toContain(
      "data:image/png;base64,",
    );
  });

  it.each([
    "eyJhbGciOiJFZERTQSJ9.eyJ0eXBlIjpbIlZlcmlmaWFibGVQcmVzZW50YXRpb24iXX0.signature",
    "https://portal.example/verifier?vp=vp_123",
    "https://portal.example/verify?vc=vc_123",
    "https://portal.example/verify?token=secret",
    "https://portal.example/verify#scan=payload",
    "https://portal.example/api/share-gateway/presentations/vp_123.jwt?download=1",
    "http://portal.example/api/share-gateway/presentations/vp_123.jwt",
    "vp_123",
  ])("rejects prohibited public QR payload %s", (payload) => {
    expect(() => assertProductionCrossDeviceQrPayload(payload)).toThrow();
    expect(() =>
      assertImmutablePresentationResolverQrPayload(payload),
    ).toThrow();
    expect(parseTrustCareQr(payload).kind).toBe("unknown");
  });

  it("never falls back from inline or oversized VP bytes", () => {
    expect(() =>
      createPresentationQrPayload({
        origin: "https://portal.example",
        presentationId: "vp_123",
        qrData: "ey.inline.jwt",
      }),
    ).toThrow(/immutable HTTPS/);
  });
});
