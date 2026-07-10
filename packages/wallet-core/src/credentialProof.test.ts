import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  assessDataIntegrityProof,
  buildTrustCareJwksCandidateResult,
  buildTrustCareJwksCandidates,
  createDataIntegrityProof,
  credentialIssuerName,
  documentTypesFromCredentials,
  envelopedVerifiableCredentialFromJwt,
  envelopedVerifiablePresentationFromJwt,
  extractCredentialJwt,
  extractPresentationJwt,
  hasVerifiableProof,
  jwtFromSecuredDataUrl,
  keyMatchesKid,
  parseJwtPayload,
  proofSummary,
  splitJwtToken,
  unwrapVpPayload,
  verifyDataIntegrityProof,
  walletCardHasCryptographicProof,
} from "./index";
import type { WalletCard } from "./models";

describe("credential proof standards layer", () => {
  it("parses W3C direct JWT payloads and secured data URL envelopes", () => {
    const vcJwt = makeJwt({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "vc-shared-001",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: "did:web:issuer.example",
      credentialSubject: { id: "did:key:patient" },
    });
    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "vp-shared-001",
      type: ["VerifiablePresentation", "PurposeVP"],
      holder: "did:key:patient",
      verifiableCredential: [envelopedVerifiableCredentialFromJwt(vcJwt)],
    };
    const jwt = makeJwt({
      ...vp,
      iss: "did:web:wallet.example",
      aud: "https://trustcare.network/verifier",
    });
    const envelopedVp = envelopedVerifiablePresentationFromJwt(jwt);

    expect(splitJwtToken(`${jwt}~disclosure`)?.disclosures).toEqual([
      "disclosure",
    ]);
    expect(parseJwtPayload(jwt)?.iss).toBe("did:web:wallet.example");
    expect(unwrapVpPayload({ payload: jwt })?.id).toBe("vp-shared-001");
    expect(extractPresentationJwt(envelopedVp)).toBe(jwt);
    expect(extractCredentialJwt(vp.verifiableCredential[0])).toBe(vcJwt);
    expect(jwtFromSecuredDataUrl(String(envelopedVp.id), "vp")).toBe(jwt);
  });

  it("keeps proof usability checks out of verifier and gateway code", () => {
    expect(
      hasVerifiableProof({
        proof: {
          type: "DataIntegrityProof",
          proofPurpose: "authentication",
          proofValue: "zRealisticProofValue",
        },
      }),
    ).toBe(true);
    expect(
      hasVerifiableProof({
        proof: {
          type: "DataIntegrityProof",
          proofValue: "test_proof_value_only",
        },
      }),
    ).toBe(false);
    expect(proofSummary({ trustcare: { signingStatus: "jwt_signed" } })).toBe(
      "jwt_signed",
    );
    expect(
      assessDataIntegrityProof({
        proof: {
          type: "DataIntegrityProof",
          proofValue: "zRealisticProofValue",
        },
      }),
    ).toMatchObject({
      present: true,
      verified: false,
    });
  });

  it("normalizes credential claims and issuer metadata", () => {
    const vcJwt = makeJwt({
      id: "vc-001",
      type: ["VerifiableCredential", "PatientSummaryCredential"],
      issuer: { id: "did:web:tcc.example", name: "TrustCare Central" },
      credentialSubject: { id: "did:key:patient" },
    });
    const credentials = [envelopedVerifiableCredentialFromJwt(vcJwt)];

    expect(extractCredentialJwt(credentials[0])).toBe(vcJwt);
    expect(credentialIssuerName(parseJwtPayload(vcJwt))).toBe(
      "TrustCare Central",
    );
    expect(documentTypesFromCredentials(credentials)).toEqual([
      "PatientSummaryCredential",
    ]);
  });

  it("centralizes TrustCare DID/JWKS candidate and kid matching rules", () => {
    const candidates = buildTrustCareJwksCandidates({
      header: { jku: "https://wallet.example/.well-known/jwks.json" },
      payload: { iss: "did:web:trustcare.network:hospital:TCC" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });

    expect(candidates).toContain(
      "https://wallet.example/.well-known/jwks.json",
    );
    expect(candidates).toContain(
      "https://wallet.example/api/share-gateway/.well-known/jwks.json",
    );
    expect(candidates).toContain(
      "https://trustcarehealth.live/hospital/tcc/did/jwks.json",
    );
    expect(
      keyMatchesKid({ kid: "did:web:issuer.example#key-1" }, "key-1"),
    ).toBe(true);
  });

  it("rejects untrusted cross-origin jku before verifier fetches JWKS", () => {
    const result = buildTrustCareJwksCandidateResult({
      header: { jku: "https://evil.example/jwks.json" },
      payload: { iss: "did:web:wallet.example" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });

    expect(result.candidates).not.toContain("https://evil.example/jwks.json");
    expect(result.warnings.join(" ")).toContain("jku");
    expect(result.warnings.join(" ")).toContain("rejected");
  });

  it("accepts jku from the issuer DID origin and configured TrustCare origins", () => {
    const issuerResult = buildTrustCareJwksCandidateResult({
      header: { jku: "https://issuer.example/did/jwks.json" },
      payload: { iss: "did:web:issuer.example:hospital:tcc" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });
    const trustedOriginResult = buildTrustCareJwksCandidateResult({
      header: { jku: "https://portal.example/.well-known/jwks.json" },
      payload: { iss: "did:web:issuer.example:hospital:tcc" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
      trustcareOrigins: ["https://portal.example"],
    });

    expect(issuerResult.candidates).toContain(
      "https://issuer.example/did/jwks.json",
    );
    expect(trustedOriginResult.candidates).toContain(
      "https://portal.example/.well-known/jwks.json",
    );
  });

  it("blocks private and loopback jku in production but allows same-origin local dev", () => {
    const productionResult = buildTrustCareJwksCandidateResult({
      header: { jku: "http://127.0.0.1:8787/jwks.json" },
      payload: { iss: "did:web:wallet.example" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });
    const localDevResult = buildTrustCareJwksCandidateResult({
      header: { jku: "http://127.0.0.1:5175/.well-known/jwks.json" },
      payload: { iss: "did:web:localhost%3A5175" },
      sourceUrl: "http://127.0.0.1:5175/api/share-gateway/presentations/vp.jwt",
    });

    expect(productionResult.candidates).not.toContain(
      "http://127.0.0.1:8787/jwks.json",
    );
    expect(productionResult.warnings.join(" ")).toContain(
      "private or loopback",
    );
    expect(localDevResult.candidates).toContain(
      "http://127.0.0.1:5175/.well-known/jwks.json",
    );
  });

  it("requires a verification result before proof material is trusted", () => {
    const card: WalletCard = {
      id: 1,
      cardType: "patient_summary",
      displayName: "Patient Summary",
      documentCategory: "clinical",
      credentialId: "cred-1",
      credentialStatus: "active",
      credentialData: {
        proof: {
          type: "DataIntegrityProof",
          proofValue: "zProof",
        },
      },
      createdAt: "2026-07-08T00:00:00.000Z",
    };

    expect(walletCardHasCryptographicProof(card)).toBe(false);
    expect(
      walletCardHasCryptographicProof({
        ...card,
        credentialJwt: makeJwt({
          id: "vc-001",
          type: ["VerifiableCredential"],
        }),
      }),
    ).toBe(false);
    expect(
      walletCardHasCryptographicProof({
        ...card,
        credentialJwt: makeJwt({
          id: "vc-verified-001",
          type: ["VerifiableCredential"],
        }),
        portalVerification: {
          verified: true,
          status: "verified",
          checkedAt: "2026-07-10T00:00:00.000Z",
        },
      }),
    ).toBe(true);
  });

  it("cryptographically verifies ecdsa-jcs-2019 Data Integrity proofs", async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
    const verificationMethod = "did:web:issuer.example#wallet-key-1";
    const document = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "vp-di-001",
      type: ["VerifiablePresentation"],
      holder: "did:key:zPatient",
      verifiableCredential: [
        {
          "@context": ["https://www.w3.org/ns/credentials/v2"],
          id: "vc-di-001",
          type: ["VerifiableCredential", "PatientIdentityCredential"],
          issuer: "did:web:issuer.example",
          credentialSubject: { id: "did:key:zPatient", familyName: "Jaidee" },
        },
      ],
    };
    const proof = await createDataIntegrityProof(document, {
      privateKeyJwk: {
        ...privateJwk,
        alg: "ES256",
        kid: verificationMethod,
      },
      verificationMethod,
      proofPurpose: "authentication",
      created: "2026-07-09T00:00:00.000Z",
    });
    const signed = { ...document, proof };
    const fetcher = async () =>
      new Response(
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
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    await expect(verifyDataIntegrityProof(signed, { fetcher })).resolves
      .toMatchObject({
        present: true,
        verified: true,
        cryptosuite: "ecdsa-jcs-2019",
        verificationMethod,
      });

    await expect(
      verifyDataIntegrityProof(
        {
          ...signed,
          holder: "did:key:zAttacker",
        },
        { fetcher },
      ),
    ).resolves.toMatchObject({
      present: true,
      verified: false,
    });
  });

  it("rejects RDF canonicalization suites until TrustCare ships RDF Dataset Canonicalization", async () => {
    await expect(
      verifyDataIntegrityProof({
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "vp-rdfc-001",
        type: ["VerifiablePresentation"],
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "ecdsa-rdfc-2019",
          proofPurpose: "authentication",
          verificationMethod: "did:web:issuer.example#key-1",
          proofValue: "zProof",
        },
      }),
    ).resolves.toMatchObject({
      present: true,
      verified: false,
      cryptosuite: "ecdsa-rdfc-2019",
    });
  });
});

function makeJwt(payload: Record<string, unknown>): string {
  const header = { alg: "ES256", kid: "did:web:issuer.example#key-1" };
  return [
    Buffer.from(JSON.stringify(header)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
