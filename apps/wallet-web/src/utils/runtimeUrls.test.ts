import { describe, expect, it } from "vitest";
import { publicPresentationArtifactUrl } from "./runtimeUrls";

describe("publicPresentationArtifactUrl", () => {
  it("resolves a Wallet verify route id through the Portal Share Gateway", () => {
    expect(
      publicPresentationArtifactUrl(
        "https://portal.example/",
        "urn:uuid:share event/1",
      ),
    ).toBe(
      "https://portal.example/api/share-gateway/presentations/urn%3Auuid%3Ashare%20event%2F1.jwt",
    );
  });
});
