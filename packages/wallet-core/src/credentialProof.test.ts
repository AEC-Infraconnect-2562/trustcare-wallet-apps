import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
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

    expect(splitJwtToken(`${jwt}~disclosure`)?.disclosures).toEqual(["disclosure"]);
    expect(parseJwtPayload(jwt)?.iss).toBe("did:web:wallet.example");
    expect(unwrapVpPayload({ payload: jwt })?.id).toBe("vp-shared-001");
    expect(extractPresentationJwt({ result: { data: { presentationJwt: jwt } } })).toBe(jwt);
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
    expect(proofSummary({ trustcare: { signingStatus: "jwt_signed" } })).toBe("jwt_signed");
  });

  it("normalizes credential claims and issuer metadata", () => {
    const vcJwt = makeJwt({ vc: { id: "vc-001", type: ["VerifiableCredential", "PatientSummaryCredential"] } });
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
    expect(documentTypesFromCredentials(credentials)).toEqual(["PatientIdentityCredential"]);
  });

  it("centralizes TrustCare DID/JWKS candidate and kid matching rules", () => {
    const candidates = buildTrustCareJwksCandidates({
      header: { jku: "https://issuer.example/jwks.json" },
      payload: { iss: "did:web:trustcare.network:hospital:TCC" },
      sourceUrl: "https://wallet.example/api/share-gateway/presentations/vp.jwt",
    });

    expect(candidates).toContain("https://issuer.example/jwks.json");
    expect(candidates).toContain("https://wallet.example/api/share-gateway/.well-known/jwks.json");
    expect(candidates).toContain("https://trustcarehealth.live/hospital/tcc/did/jwks.json");
    expect(keyMatchesKid({ kid: "did:web:issuer.example#key-1" }, "key-1")).toBe(true);
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
