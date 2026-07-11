import { describe, expect, it } from "vitest";
import {
  TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
  resolvePortalBaseUrl,
} from "./portalBaseUrl";

describe("resolvePortalBaseUrl", () => {
  it("uses the one canonical live Portal origin in every runtime", () => {
    expect(resolvePortalBaseUrl({ runtimeEnvironment: "sandbox" })).toBe(
      TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
    );
    expect(resolvePortalBaseUrl({ runtimeEnvironment: "demo" })).toBe(
      TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
    );
    expect(resolvePortalBaseUrl({ runtimeEnvironment: "production" })).toBe(
      TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
    );
  });

  it("uses one explicitly configured HTTPS origin and rejects endpoint paths", () => {
    expect(
      resolvePortalBaseUrl({
        runtimeEnvironment: "production",
        configuredUrl: "https://portal.example/",
      }),
    ).toBe("https://portal.example");
    expect(() =>
      resolvePortalBaseUrl({
        runtimeEnvironment: "production",
        configuredUrl: "https://portal.example/api/wallet/v2",
      }),
    ).toThrow("path");
  });
});
