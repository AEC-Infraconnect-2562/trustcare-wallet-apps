import { describe, expect, it } from "vitest";
import { createDemoResolverUrl } from "@trustcare/wallet-core";
import { verifyQr } from "./verifier";

const unsignedVp = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "vp-test-001",
  type: ["VerifiablePresentation", "PurposeVP"],
  holder: "did:key:test-holder",
  validUntil: new Date(Date.now() + 60_000).toISOString(),
  verifiableCredential: [
    {
      id: "vc-test-001",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: "did:web:trustcare.example",
      credentialSubject: { id: "patient-001" }
    }
  ]
};

describe("verifyQr VP resolver behavior", () => {
  it("resolves VP URLs but does not return green without proof", async () => {
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async () =>
          new Response(JSON.stringify(unsignedVp), {
            headers: { "content-type": "application/vp+json" }
          })
      },
      "http://127.0.0.1:5175/api/share-gateway/presentations/vp-test-001.json"
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("ES256");
  });

  it("returns green only when a usable VP proof is present", async () => {
    const signedVp = {
      ...unsignedVp,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "ecdsa-rdfc-2019",
        proofPurpose: "authentication",
        proofValue: "z3ES256ProofValueForTest"
      }
    };
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async () =>
          new Response(JSON.stringify(signedVp), {
            headers: { "content-type": "application/vp+json" }
          })
      },
      "http://127.0.0.1:5175/api/share-gateway/presentations/vp-test-001.json"
    );

    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
  });

  it("keeps legacy embedded demo VP URLs out of green trust", async () => {
    const legacyUrl = createDemoResolverUrl(
      "https://wallet.example",
      "vp",
      "vp-legacy",
      unsignedVp
    );
    const result = await verifyQr(
      { url: "https://trustcare.example.com/trpc" },
      legacyUrl
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("legacy");
  });
});
