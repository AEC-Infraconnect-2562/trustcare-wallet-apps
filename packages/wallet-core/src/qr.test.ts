import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  createPresentationQrPayload,
  demoPresentationUrl,
  presentationQrInlineMaxLength,
} from "./qr";

describe("presentation QR payloads", () => {
  it("keeps short direct payloads inline", () => {
    expect(
      createPresentationQrPayload({
        origin: "https://wallet.example",
        presentationId: "vp_short",
        qrData: "ey.short.jwt",
      }),
    ).toBe("ey.short.jwt");
  });

  it("uses a resolver URL for oversized presentation payloads", async () => {
    const payload = createPresentationQrPayload({
      origin: "https://wallet.example/",
      presentationId: "vc_large_payload",
      qrData: `eyJ${"a".repeat(presentationQrInlineMaxLength + 1)}.sig`,
    });

    expect(payload).toBe(
      demoPresentationUrl("https://wallet.example", "vc_large_payload"),
    );
    expect(payload.length).toBeLessThan(120);
    await expect(QRCode.toDataURL(payload)).resolves.toContain(
      "data:image/png;base64,",
    );
  });

  it("does not wrap an existing presentation resolver URL again", () => {
    const resolver = "https://wallet.example/presentations/vp_123.jwt";
    expect(
      createPresentationQrPayload({
        origin: "https://wallet.example",
        presentationId: "vp_123",
        qrData: resolver,
      }),
    ).toBe(resolver);
  });
});
