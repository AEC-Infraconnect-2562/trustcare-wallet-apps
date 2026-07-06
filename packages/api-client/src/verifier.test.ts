import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  createDemoResolverUrl,
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
  signTrustCarePresentationJwt
} from "@trustcare/wallet-core";
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

  it("returns green for ES256 vp+jwt when the public key resolves from JWKS", async () => {
    const jwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: jwksUrl
    });
    const signed = await signTrustCarePresentationJwt({
      vp: unsignedVp,
      signingKey,
      signUnsignedCredentials: true
    });
    const presentationUrl = "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(signed.jwt, {
              headers: { "content-type": "application/vp+jwt" }
            });
          }
          if (url === jwksUrl) {
            return new Response(JSON.stringify(publicJwksForSigningKey(signingKey)), {
              headers: { "content-type": "application/json" }
            });
          }
          return new Response("not found", { status: 404 });
        }
      },
      presentationUrl
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain("Signature status");
  });

  it("rejects a tampered ES256 vp+jwt even when JWKS resolves", async () => {
    const jwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: jwksUrl
    });
    const signed = await signTrustCarePresentationJwt({
      vp: unsignedVp,
      signingKey,
      signUnsignedCredentials: true
    });
    const tamperedJwt = tamperJwtPayload(signed.jwt, (payload) => ({
      ...payload,
      vp: {
        ...(payload.vp as Record<string, unknown>),
        holder: "did:key:attacker"
      }
    }));
    const presentationUrl = "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(tamperedJwt, {
              headers: { "content-type": "application/vp+jwt" }
            });
          }
          if (url === jwksUrl) {
            return new Response(JSON.stringify(publicJwksForSigningKey(signingKey)), {
              headers: { "content-type": "application/json" }
            });
          }
          return new Response("not found", { status: 404 });
        }
      },
      presentationUrl
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("signature");
  });
});

function tamperJwtPayload(
  jwt: string,
  mutate: (payload: Record<string, unknown>) => Record<string, unknown>
): string {
  const [header, payload, signature] = jwt.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const nextPayload = Buffer.from(JSON.stringify(mutate(decoded))).toString("base64url");
  return `${header}.${nextPayload}.${signature}`;
}
