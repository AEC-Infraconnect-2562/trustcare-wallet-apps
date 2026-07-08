import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildTrustCareJwksCandidateResult,
  buildTrustCareJwksCandidates,
  credentialIssuerName,
  documentTypesFromCredentials,
  extractCredentialJwt,
  extractPresentationJwt,
  hasVerifiableProof,
  keyMatchesKid,
  parseJwtPayload,
  proofSummary,
  splitJwtToken,
  unwrapVpPayload,
  walletCardHasCryptographicProof,
} from "./index";
import type { WalletCard } from "./models";

describe("credential proof standards layer", () => {
  it("parses JWT and unwraps nested VP payloads through shared helpers", () => {
    const vp = {
      id: "vp-shared-001",
      type: ["VerifiablePresentation", "PurposeVP"],
      holder: "did:key:patient",
    };
    const jwt = makeJwt({
      iss: "did:web:wallet.example",
      aud: "https://trustcare.network/verifier",
      vp,
    });

    expect(splitJwtToken(`${jwt}~disclosure`)?.disclosures).toEqual([
      "disclosure",
    ]);
    expect(parseJwtPayload(jwt)?.iss).toBe("did:web:wallet.example");
    expect(unwrapVpPayload({ payload: jwt })?.id).toBe("vp-shared-001");
    expect(
      extractPresentationJwt({ result: { data: { presentationJwt: jwt } } }),
    ).toBe(jwt);
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
  });

  it("normalizes credential claims and issuer metadata", () => {
    const vcJwt = makeJwt({
      vc: {
        id: "vc-001",
        type: ["VerifiableCredential", "PatientSummaryCredential"],
      },
    });
    const credentials = [
      {
        jwt: vcJwt,
        vc: {
          type: ["VerifiableCredential", "PatientIdentityCredential"],
          issuer: { id: "did:web:tcc.example", name: "TrustCare Central" },
        },
      },
    ];

    expect(extractCredentialJwt(credentials[0])).toBe(vcJwt);
    expect(credentialIssuerName(credentials[0].vc)).toBe("TrustCare Central");
    expect(documentTypesFromCredentials(credentials)).toEqual([
      "PatientIdentityCredential",
    ]);
  });

  it("centralizes TrustCare DID/JWKS candidate and kid matching rules", () => {
    const candidates = buildTrustCareJwksCandidates({
      header: { jku: "https://wallet.example/.well-known/jwks.json" },
      payload: { iss: "did:web:trustcare.network:hospital:TCC" },
      sourceUrl:
        "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });

    expect(candidates).toContain("https://wallet.example/.well-known/jwks.json");
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
      sourceUrl:
        "http://127.0.0.1:5175/api/share-gateway/presentations/vp.jwt",
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

  it("uses the same cryptographic proof predicate for wallet cards and envelopes", () => {
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

    expect(walletCardHasCryptographicProof(card)).toBe(true);
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
