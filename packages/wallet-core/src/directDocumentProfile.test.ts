import { describe, expect, it } from "vitest";
import {
  assertTrustCareDirectCredential,
  assertTrustCareDirectPresentation,
  envelopCredentialJwt,
} from "./directDocumentProfile";

const now = new Date("2026-07-14T08:00:00.000Z");
const issuerDid = "did:web:portal.example:hospital:tcc";
const holderDid = "did:key:z6MknHolder";

describe("TrustCare direct secured document profile", () => {
  it("accepts a direct Portal VC without top-level iss", () => {
    expect(
      assertTrustCareDirectCredential({
        payload: credential(),
        expectedIssuerDid: issuerDid,
        expectedHolderDid: holderDid,
        now,
      }),
    ).toMatchObject({ issuerDid, holderDid });
  });

  it("accepts optional iss only when it agrees with the signed issuer", () => {
    expect(() =>
      assertTrustCareDirectCredential({
        payload: { ...credential(), iss: issuerDid },
        now,
      }),
    ).not.toThrow();
    expect(() =>
      assertTrustCareDirectCredential({
        payload: { ...credential(), iss: "did:web:attacker.example" },
        now,
      }),
    ).toThrow("iss conflicts");
  });

  it("rejects legacy wrapper and unsigned document-shaped input", () => {
    expect(() =>
      assertTrustCareDirectCredential({
        payload: { vc: credential() },
        now,
      }),
    ).toThrow("wrapper");
    expect(() => envelopCredentialJwt(JSON.stringify(credential()))).toThrow(
      "compact JWS",
    );
  });

  it("validates the signed Holder VP policy binding and envelopes", () => {
    const jwt = "a.b.c";
    const payload = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:uuid:vp-1",
      type: ["VerifiablePresentation", "TrustcarePatientPresentation"],
      holder: holderDid,
      purpose: "continuity_of_care",
      trustcare: {
        context: "cross_facility_referral",
        consentRef: "consent:1",
        recipient: issuerDid,
        audience: "https://portal.example",
        issuedAt: "2026-07-14T07:59:00.000Z",
        expiresAt: "2026-07-14T08:09:00.000Z",
      },
      verifiableCredential: [envelopCredentialJwt(jwt)],
    };
    expect(
      assertTrustCareDirectPresentation({
        payload,
        expectedHolderDid: holderDid,
        expectedPurpose: "continuity_of_care",
        expectedRecipient: issuerDid,
        expectedAudience: "https://portal.example",
        expectedConsentRef: "consent:1",
        now,
      }),
    ).toMatchObject({ holderDid, presentationId: "urn:uuid:vp-1" });
  });
});

function credential(): Record<string, unknown> {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://portal.example/contexts/trustcare-credentials-v1.jsonld",
    ],
    id: "urn:trustcare:vc:patient-identity:1",
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: { id: issuerDid },
    validFrom: "2026-07-14T07:00:00.000Z",
    validUntil: "2027-07-14T08:00:00.000Z",
    credentialStatus: [
      {
        id: "https://portal.example/status/revocation#1",
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "1",
        statusListCredential: "https://portal.example/status/revocation",
      },
    ],
    credentialSubject: { id: holderDid, data: { humanDocument: {} } },
  };
}
