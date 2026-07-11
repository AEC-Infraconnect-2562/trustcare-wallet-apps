import { describe, expect, it } from "vitest";
import { resolveAllPortalHospitalIssuers } from "./portalIssuerResolver";

const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_CONTRACT_TEST === "1";
const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";

describe.skipIf(!liveEnabled)("live Portal hospital issuers", () => {
  it("resolves matching did:web and JWKS for TCC, TCP, and TCM", async () => {
    const issuers = await resolveAllPortalHospitalIssuers({ portalBaseUrl });

    expect(issuers.map((issuer) => issuer.hospitalCode)).toEqual([
      "TCC",
      "TCP",
      "TCM",
    ]);
    for (const issuer of issuers) {
      expect(issuer.issuerDid).toBe(
        `did:web:trustcare-hospital-network-production.up.railway.app:hospital:${issuer.hospitalCode.toLowerCase()}`,
      );
      expect(issuer.activeAssertionMethod.publicKeyJwk.alg).toBe("ES256");
      expect(issuer.didDocument.trustcare.syntheticTestData).toBe(false);
    }
  }, 30_000);
});
