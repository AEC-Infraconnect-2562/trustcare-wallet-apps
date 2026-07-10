import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  createDemoResolverUrl,
  createDataIntegrityProof,
  createEphemeralEs256SigningKey,
  extractCredentialJwt,
  parseJwtPayload,
  publicJwksForSigningKey,
  sha256Hex,
  signTrustCareCredentialJwt,
  signTrustCarePresentationJwt,
  unwrapVcPayload,
  type VerificationEvidenceProvider,
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
      credentialSubject: { id: "patient-001" },
    },
  ],
};

describe("verifyQr VP resolver behavior", () => {
  it("never promotes an internal SHL planning JSON object to verified", async () => {
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        runtimeEnvironment: "demo",
      },
      JSON.stringify({
        type: "TrustCareShlManifestVP",
        manifestCredentialId: "manifest-vc-1",
        holderPresentationId: "holder-vp-1",
        documents: [{ manifestCredentialId: "document-vc-1" }],
        trustcareCertification: {
          status: "maker_checker_approved",
          ownerConfirmed: true,
          makerApprovedAt: "2026-07-10T00:00:00.000Z",
          checkerApprovedAt: "2026-07-10T00:01:00.000Z",
        },
      }),
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).not.toBe("green");
    expect(result.warnings?.join(" ")).toContain("verifier artifact");
  });

  it("resolves deterministic demo VP references without promoting them to verified trust", async () => {
    const result = await verifyQr(
      { url: "https://trustcare.example.com/trpc" },
      "https://wallet.example/?tc_resolver=vp&tc_id=vp_demo_1008_abc&tc_ref=1",
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("red");
    expect(result.credentials?.length).toBe(1);
    expect(JSON.stringify(result.credentials)).toContain(
      "InsuranceEligibilityCredential",
    );
  });

  it("resolves VP URLs but does not return green without proof", async () => {
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async () =>
          new Response(JSON.stringify(unsignedVp), {
            headers: { "content-type": "application/vp+json" },
          }),
      },
      "http://127.0.0.1:5175/api/share-gateway/presentations/vp-test-001.json",
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("ES256");
    expect(result.verificationPayload).toMatchObject({
      presentationId: "vp-test-001",
      holderDid: "did:key:test-holder",
      validUntil: unsignedVp.validUntil,
    });
  });

  it("does not return green for an unverified Data Integrity proof shape", async () => {
    const signedVp = {
      ...unsignedVp,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "ecdsa-rdfc-2019",
        proofPurpose: "authentication",
        proofValue: "z3ES256ProofValueForTest",
      },
    };
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async () =>
          new Response(JSON.stringify(signedVp), {
            headers: { "content-type": "application/vp+json" },
          }),
      },
      "http://127.0.0.1:5175/api/share-gateway/presentations/vp-test-001.json",
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("red");
    expect(result.warnings?.join(" ")).toContain("Data Integrity proof");
    expect(result.warnings?.join(" ")).toContain("cryptosuite");
  });

  it("does not return green from a VP signature without holder, status and policy evidence", async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
    const verificationMethod = "did:web:issuer.example#wallet-key-1";
    const proof = await createDataIntegrityProof(unsignedVp, {
      privateKeyJwk: {
        ...privateJwk,
        alg: "ES256",
        kid: verificationMethod,
      },
      verificationMethod,
      proofPurpose: "authentication",
      created: "2026-07-09T00:00:00.000Z",
    });
    const signedVp = { ...unsignedVp, proof };
    const presentationUrl =
      "https://wallet.example/api/share-gateway/presentations/vp-test-001.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(JSON.stringify(signedVp), {
              headers: { "content-type": "application/vp+json" },
            });
          }
          if (url === "https://issuer.example/.well-known/did.json") {
            return new Response(
              JSON.stringify({
                id: "did:web:issuer.example",
                verificationMethod: [
                  {
                    id: verificationMethod,
                    type: "JsonWebKey",
                    controller: "did:web:issuer.example",
                    publicKeyJwk: {
                      ...publicJwk,
                      alg: "ES256",
                      kid: verificationMethod,
                    },
                  },
                ],
                authentication: [verificationMethod],
              }),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      presentationUrl,
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).not.toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "Data Integrity proof",
    );
    expect(JSON.stringify(result.verificationChecklist)).not.toContain(
      "controller does not match did:key:test-holder",
    );
    expect(
      (
        result.verificationChecklist as Array<{ key?: string; ok?: boolean }>
      ).find((item) => item.key === "data_integrity")?.ok,
    ).toBe(true);
  });

  it("keeps legacy embedded demo VP URLs out of green trust", async () => {
    const legacyVpWithProof = {
      ...unsignedVp,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "ecdsa-rdfc-2019",
        proofPurpose: "authentication",
        proofValue: "zLegacyProofForCompatibilityOnly",
      },
    };
    const legacyUrl = createDemoResolverUrl(
      "https://wallet.example",
      "vp",
      "vp-legacy",
      legacyVpWithProof,
    );
    const result = await verifyQr(
      { url: "https://trustcare.example.com/trpc" },
      legacyUrl,
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("yellow");
    expect(result.warnings?.join(" ")).toContain("legacy");
    expect(result.warnings?.join(" ")).toContain("tc_payload");
  });

  it("keeps ES256 vp+jwt pending without holder-bound external evidence", async () => {
    const jwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: jwksUrl,
    });
    const signed = await signTrustCarePresentationJwt({
      vp: unsignedVp,
      signingKey,
      signUnsignedCredentials: true,
    });
    const signedPayload = parseJwtPayload(signed.jwt) ?? {};
    const nestedCredential = Array.isArray(signedPayload.verifiableCredential)
      ? signedPayload.verifiableCredential[0]
      : undefined;
    const nestedCredentialJwt = extractCredentialJwt(nestedCredential);
    expect(signedPayload.vp).toBeUndefined();
    expect(signedPayload.type).toEqual(
      expect.arrayContaining(["VerifiablePresentation"]),
    );
    expect(signedPayload.proof).toMatchObject({
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-jcs-2019",
      proofPurpose: "authentication",
      verificationMethod: signingKey.kid,
    });
    expect(nestedCredential).toMatchObject({
      type: ["VerifiableCredential", "EnvelopedVerifiableCredential"],
    });
    expect(nestedCredentialJwt).toEqual(expect.stringMatching(/^eyJ/));
    expect(parseJwtPayload(String(nestedCredentialJwt))?.vc).toBeUndefined();
    const presentationUrl =
      "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(signed.jwt, {
              headers: { "content-type": "application/vp+jwt" },
            });
          }
          if (url === jwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      presentationUrl,
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).not.toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "Signature status",
    );
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "Data Integrity proof",
    );
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "did:web:wallet.example",
    );
    expect(
      (
        result.verificationChecklist as Array<{ key?: string; ok?: boolean }>
      ).find((item) => item.key === "signature")?.ok,
    ).toBe(true);
    expect(result.warnings?.join(" ")).toContain(
      "Share Gateway evidence request failed",
    );
  });

  it("verifies a gateway-signed VP while keeping the holder DID as a separate binding subject", async () => {
    const jwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: jwksUrl,
    });
    const audience = "did:web:receiver.example";
    const signed = await signTrustCarePresentationJwt({
      vp: { ...unsignedVp, recipient: audience },
      signingKey,
      purpose: "care-entry",
      audience,
      signUnsignedCredentials: true,
    });
    const vpPayload = parseJwtPayload(signed.jwt)!;
    const envelopedCredential = Array.isArray(vpPayload.verifiableCredential)
      ? vpPayload.verifiableCredential[0]
      : undefined;
    const nestedJwt = extractCredentialJwt(envelopedCredential)!;
    const nestedCredential = unwrapVcPayload(parseJwtPayload(nestedJwt))!;
    const vpDigest = `sha256:${await sha256Hex(vpPayload)}` as const;
    const credentialDigest =
      `sha256:${await sha256Hex(nestedCredential)}` as const;
    const presentationUrl =
      "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const evidenceUrl =
      "https://wallet.example/api/share-gateway/verification-evidence";

    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(signed.jwt, {
              headers: { "content-type": "application/vp+jwt" },
            });
          }
          if (url === jwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              { headers: { "content-type": "application/json" } },
            );
          }
          if (url === evidenceUrl) {
            const body = JSON.parse(String(init?.body)) as {
              artifactId: string;
              request: {
                purpose?: string;
                recipient?: string;
                audience?: string;
                subjectDigest?: string;
                packageDigest: `sha256:${string}`;
                contextDigest: `sha256:${string}`;
              };
            };
            expect(body).toMatchObject({
              artifactId: "vp-test-001",
              request: {
                purpose: "care-entry",
                recipient: audience,
                audience,
                subjectDigest: vpDigest,
              },
            });
            const checkedAt = new Date().toISOString();
            const subjectDigests = [vpDigest, credentialDigest];
            return new Response(
              JSON.stringify({
                version: "1",
                providerId: "share-gateway:test",
                packageDigest: body.request.packageDigest,
                contextDigest: body.request.contextDigest,
                subjects: [
                  { role: "vp", digest: vpDigest },
                  { role: "vc", digest: credentialDigest },
                ],
                policy: { id: "gateway-vp-policy", version: "1" },
                checkedAt,
                expiresAt: new Date(
                  Date.parse(checkedAt) + 60_000,
                ).toISOString(),
                checks: [
                  "proof",
                  "issuer",
                  "status",
                  "expiry",
                  "policy",
                  "binding",
                ].map((key) => ({
                  key,
                  state: "pass",
                  subjectDigests,
                  checkedAt,
                  authority: "share-gateway:test",
                })),
              }),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      presentationUrl,
    );

    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(result.holderDid).toBe("did:key:test-holder");
    expect(
      (
        result.verificationChecklist as Array<{ key?: string; ok?: boolean }>
      ).find((item) => item.key === "signature")?.ok,
    ).toBe(true);
    expect(result.warnings?.join(" ") ?? "").not.toContain(
      "controller does not match did:key:test-holder",
    );
  });

  it("does not fetch untrusted cross-origin jku from a VP JWT header", async () => {
    const evilJwksUrl = "https://evil.example/jwks.json";
    const trustedJwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: evilJwksUrl,
    });
    const signed = await signTrustCarePresentationJwt({
      vp: unsignedVp,
      signingKey,
      signUnsignedCredentials: true,
    });
    const presentationUrl =
      "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const fetchedUrls: string[] = [];
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          fetchedUrls.push(url);
          if (url === presentationUrl) {
            return new Response(signed.jwt, {
              headers: { "content-type": "application/vp+jwt" },
            });
          }
          if (url === evilJwksUrl) {
            throw new Error("Verifier must not fetch an untrusted jku.");
          }
          if (url === trustedJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      presentationUrl,
    );

    expect(result.protocol).toBe("trustcare-vp");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).not.toBe("green");
    expect(fetchedUrls).not.toContain(evilJwksUrl);
    expect(result.warnings?.join(" ")).toContain("jku");
    expect(result.warnings?.join(" ")).toContain("rejected");
  });

  it("rejects a tampered ES256 vp+jwt even when JWKS resolves", async () => {
    const jwksUrl = "https://wallet.example/.well-known/jwks.json";
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:wallet.example",
      kidPrefix: "did:web:wallet.example",
      jku: jwksUrl,
    });
    const signed = await signTrustCarePresentationJwt({
      vp: unsignedVp,
      signingKey,
      signUnsignedCredentials: true,
    });
    const tamperedJwt = tamperJwtPayload(signed.jwt, (payload) => ({
      ...payload,
      holder: "did:key:attacker",
    }));
    const presentationUrl =
      "https://wallet.example/api/share-gateway/presentations/vp-test-001.jwt";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        fetchImpl: async (input) => {
          const url = String(input);
          if (url === presentationUrl) {
            return new Response(tamperedJwt, {
              headers: { "content-type": "application/vp+jwt" },
            });
          }
          if (url === jwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      presentationUrl,
    );

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe("red");
    expect(result.warnings?.join(" ")).toContain("signature");
  });

  it("verifies a Portal-signed VC only with hospital proof, Portal status and independent policy evidence", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc",
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:patient_identity",
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee",
          },
        },
      },
      signingKey,
      credentialType: "PatientIdentityCredential",
    });
    expect(parseJwtPayload(signed.jwt)?.vc).toBeUndefined();
    expect(parseJwtPayload(signed.jwt)?.type).toEqual(
      expect.arrayContaining(["VerifiableCredential"]),
    );
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        verificationEvidenceProvider: completeEvidenceProvider,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: signed.jwt });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active",
              }),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      signed.jwt,
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "TrustCare Portal status",
    );
  });

  it("does not treat a network-root key as hospital issuer proof", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network",
    });
    const wrongHospitalKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc",
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:network-key",
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee",
          },
        },
      },
      signingKey,
      credentialType: "PatientIdentityCredential",
    });
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const rootJwksUrl = "https://trustcarehealth.live/.well-known/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        verificationEvidenceProvider: completeEvidenceProvider,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(wrongHospitalKey)),
              { headers: { "content-type": "application/json" } },
            );
          }
          if (url === rootJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: signed.jwt });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active",
              }),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      signed.jwt,
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(false);
    expect(result.trustLevel).not.toBe("green");
    expect(JSON.stringify(result.verificationChecklist)).toContain(
      "key controller does not match",
    );
  });

  it("verifies a Portal SD-JWT-VC QR while preserving disclosures for Portal cross-check", async () => {
    const signingKey = await createEphemeralEs256SigningKey({
      issuerDid: "did:web:trustcare.network:hospital:tcc",
      kidPrefix: "did:web:trustcare.network:hospital:tcc",
    });
    const signed = await signTrustCareCredentialJwt({
      credential: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:trustcare:seed:vc:tcc:p001:patient_summary",
        type: ["VerifiableCredential", "PatientSummaryCredential"],
        issuer: {
          id: "did:web:trustcare.network:hospital:tcc",
          name: "TrustCare Central Hospital",
          nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
        },
        validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 60_000).toISOString(),
        credentialSubject: {
          id: "did:key:patient001",
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee",
          },
          _sd: ["demo-disclosure-digest"],
        },
      },
      signingKey,
      credentialType: "PatientSummaryCredential",
    });
    const disclosure = Buffer.from(
      JSON.stringify(["salt", "patient_name", "Somchai"]),
    ).toString("base64url");
    const sdJwtVc = `${signed.jwt}~${disclosure}`;
    const hospitalJwksUrl =
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json";
    const result = await verifyQr(
      {
        url: "https://trustcare.example.com/trpc",
        portalOrigin: "https://trustcarehealth.live",
        verificationEvidenceProvider: completeEvidenceProvider,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url === hospitalJwksUrl) {
            return new Response(
              JSON.stringify(publicJwksForSigningKey(signingKey)),
              {
                headers: { "content-type": "application/json" },
              },
            );
          }
          if (url === "https://trustcarehealth.live/api/wallet/sync/verify") {
            expect(JSON.parse(String(init?.body))).toEqual({ jwt: sdJwtVc });
            return new Response(
              JSON.stringify({
                verified: true,
                trustLevel: "green",
                status: "active",
              }),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      },
      sdJwtVc,
    );

    expect(result.protocol).toBe("trustcare-vc");
    expect(result.verified).toBe(true);
    expect(result.trustLevel).toBe("green");
    expect(result.warnings?.join(" ")).toContain("SD-JWT-VC");
  });
});

function tamperJwtPayload(
  jwt: string,
  mutate: (payload: Record<string, unknown>) => Record<string, unknown>,
): string {
  const [header, payload, signature] = jwt.split(".");
  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  const nextPayload = Buffer.from(JSON.stringify(mutate(decoded))).toString(
    "base64url",
  );
  return `${header}.${nextPayload}.${signature}`;
}

const completeEvidenceProvider: VerificationEvidenceProvider = {
  async evaluate(request) {
    const checkedAt = request.now;
    const expiresAt = new Date(Date.parse(checkedAt) + 60_000).toISOString();
    const subjectDigests = request.subjects.map((subject) => subject.digest);
    return {
      version: "1",
      providerId: "contract-hub:test",
      packageDigest: request.packageDigest,
      contextDigest: request.contextDigest,
      subjects: request.subjects,
      policy: { id: "test-verifier-policy", version: "1" },
      checkedAt,
      expiresAt,
      checks: ["proof", "issuer", "status", "expiry", "policy", "binding"].map(
        (key) => ({
          key: key as
            "proof" | "issuer" | "status" | "expiry" | "policy" | "binding",
          state: "pass" as const,
          subjectDigests,
          checkedAt,
          authority: "contract-hub:test",
        }),
      ),
    };
  },
};
