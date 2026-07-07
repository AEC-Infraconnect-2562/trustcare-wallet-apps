import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  createDemoResolverUrl,
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
  signTrustCareCredentialJwt,
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
    const legacyVpWithProof = {
      ...unsignedVp,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "ecdsa-rdfc-2019",
        proofPurpose: "authentication",
        proofValue: "zLegacyProofForCompatibilityOnly"
      }
    };
    const legacyUrl = createDemoResolverUrl(
      "https://wallet.example",
      "vp",
      "vp-legacy",
      legacyVpWithProof
    );
    const result = await verifyQr(
      { url: "https://trustcare.example.com/trpc" },
      legacyUrl
    );

    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("legacy");
    expect(result.warnings?.join(" ")).toContain("tc_payload");
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

  it("verifies a Portal-signed VC JWT through hospital JWKS and Portal status check", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc"
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:patient_identity",
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล"
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee"
          }
        }
      },
      signingKey,
      credentialType: "PatientIdentityCredential"
    });
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(JSON.stringify(publicJwksForSigningKey(signingKey)), {
              headers: { "content-type": "application/json" }
            });
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: signed.jwt });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active"
              }),
              { headers: { "content-type": "application/json" } }
            );
          }
          return new Response("not found", { status: 404 });
        }
      },
      signed.jwt
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain("TrustCare Portal status");
  });

  it("does not fallback to a single JWKS key when the JWT kid does not match", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network"
    });
    const wrongHospitalKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc"
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:network-key",
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล"
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee"
          }
        }
      },
      signingKey,
      credentialType: "PatientIdentityCredential"
    });
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const rootJwksUrl = "https://trustcarehealth.live/.well-known/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(wrongHospitalKey)),
              { headers: { "content-type": "application/json" } }
            );
          }
          if (url === rootJwksUrl) {
            return new Response(JSON.stringify(publicJwksForSigningKey(signingKey)), {
              headers: { "content-type": "application/json" }
            });
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: signed.jwt });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active"
              }),
              { headers: { "content-type": "application/json" } }
            );
          }
          return new Response("not found", { status: 404 });
        }
      },
      signed.jwt
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain(rootJwksUrl);
  });

  it("verifies a Portal SD-JWT-VC QR while preserving disclosures for Portal cross-check", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc"
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:patient_summary",
        type: ["VerifiableCredential", "PatientSummaryCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล"
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee"
          },
          _sd: ["demo-disclosure-digest"]
        }
      },
      signingKey,
      credentialType: "PatientSummaryCredential"
    });
    const disclosure = Buffer.from(JSON.stringify(["salt", "patient_name", "Somchai"])).toString("base64url");
    const sdJwtVc = `${signed.jwt}~${disclosure}`;
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(JSON.stringify(publicJwksForSigningKey(signingKey)), {
              headers: { "content-type": "application/json" }
            });
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: sdJwtVc });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active"
              }),
              { headers: { "content-type": "application/json" } }
            );
          }
          return new Response("not found", { status: 404 });
        }
      },
      sdJwtVc
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(result.warnings?.join(" ")).toContain("SD-JWT-VC");
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
