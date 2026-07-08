import { describe, expect, it } from "vitest";
import { extractScannablePayload, scanPayloadFromHash } from "./AppViews";

describe("scan URL payload parsing", () => {
  it("preserves nested resolver query params inside hash scan URLs", () => {
    const payload =
      "https://wallet.example/?tc_resolver=vp&tc_id=vp_demo_1008_abc&tc_ref=1&tc_exp=2026-07-08T15%3A01%3A31.517Z";
    const hash = `#scan=${encodeURIComponent(payload)}`;

    expect(scanPayloadFromHash(hash)).toBe(payload);
    expect(extractScannablePayload(`https://wallet.example/${hash}`)).toBe(
      payload,
    );
  });
});
