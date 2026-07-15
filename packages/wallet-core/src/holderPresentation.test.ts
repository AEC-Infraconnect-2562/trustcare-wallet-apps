import { SignJWT, compactVerify, decodeJwt, generateKeyPair, importJWK } from "jose";
import { describe, expect, it } from "vitest";
import {
  generateHolderIdentity,
  type HolderKeyAlgorithm,
} from "./holderIdentity";
import {
  createHolderSignedDirectVp,
  createHolderSignedShlAssociationVp,
} from "./holderPresentation";

const NOW = new Date("2026-07-11T10:00:00.000Z");
const AUDIENCE =
  "https://trustcare-hospital-network-production.up.railway.app/verifier";
const RECIPIENT =
  "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";

describe("createHolderSignedDirectVp", () => {
  it.each<HolderKeyAlgorithm>(["Ed25519", "P-256"])(
    "creates a holder-signed %s VP while preserving nested issuer JWT bytes",
    async (algorithm) => {
      const identity = await generateHolderIdentity({ algorithm });
      const credentialJwt = await issuerCredentialJwt(identity.did);

      const result = await createHolderSignedDirectVp({
        identity,
        holderDid: identity.did,
        audience: AUDIENCE,
        recipient: RECIPIENT,
        context: "opd_visit",
        purpose: "Prepare documents for follow-up treatment",
        consentRef: "urn:trustcare:consent:patient:follow-up:2026-07-11",
        credentialJwts: [credentialJwt],
        now: NOW,
      });

      const verified = await compactVerify(
        result.vpJwt,
        await importJWK(identity.publicJwk, identity.jwsAlgorithm),
        { algorithms: [identity.jwsAlgorithm] },
      );
      const payload = JSON.parse(new TextDecoder().decode(verified.payload));

      expect(verified.protectedHeader).toEqual({
        alg: identity.jwsAlgorithm,
        typ: "vp+jwt",
        cty: "vp",
        kid: identity.kid,
      });
      expect(payload).toEqual(result.payload);
      expect(payload).toMatchObject({
        "@context": [
          "https://www.w3.org/ns/credentials/v2",
          "https://trustcare-hospital-network-production.up.railway.app/contexts/trustcare-credentials-v1.jsonld",
        ],
        type: ["VerifiablePresentation", "TrustcarePatientPresentation"],
        holder: identity.did,
        purpose: "Prepare documents for follow-up treatment",
        trustcare: {
          context: "opd_visit",
          consentRef: "urn:trustcare:consent:patient:follow-up:2026-07-11",
          recipient: RECIPIENT,
          audience: AUDIENCE,
          issuedAt: NOW.toISOString(),
          expiresAt: "2026-07-11T10:10:00.000Z",
        },
      });
      expect(payload.id).toMatch(
        /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(payload).not.toHaveProperty("iss");
      expect(payload).not.toHaveProperty("vp");
      expect(result.transport).toEqual({
        mode: "direct_vp",
        vpJwt: result.vpJwt,
      });
      expect(result.payload.verifiableCredential).toEqual([
        {
          "@context": "https://www.w3.org/ns/credentials/v2",
          id: `data:application/vc+jwt,${credentialJwt}`,
          type: "EnvelopedVerifiableCredential",
        },
      ]);
    },
  );

  it("creates a fresh presentation ID for every sharing event", async () => {
    const identity = await generateHolderIdentity();
    const credentialJwt = await issuerCredentialJwt(identity.did);
    const input = {
      identity,
      audience: AUDIENCE,
      recipient: RECIPIENT,
      context: "referral" as const,
      purpose: "Referral intake",
      consentRef: "urn:trustcare:consent:referral",
      credentialJwts: [credentialJwt],
      now: NOW,
    };

    const [first, second] = await Promise.all([
      createHolderSignedDirectVp(input),
      createHolderSignedDirectVp(input),
    ]);

    expect(first.payload.id).not.toBe(second.payload.id);
    expect(first.vpJwt).not.toBe(second.vpJwt);
  });

  it("rejects an empty or unsigned nested credential collection", async () => {
    const identity = await generateHolderIdentity();
    const base = {
      identity,
      audience: AUDIENCE,
      recipient: RECIPIENT,
      context: "opd_visit" as const,
      purpose: "Follow-up treatment",
      consentRef: "urn:trustcare:consent:follow-up",
      now: NOW,
    };

    await expect(
      createHolderSignedDirectVp({ ...base, credentialJwts: [] }),
    ).rejects.toThrow("at least one issuer-signed VC JWT");
    await expect(
      createHolderSignedDirectVp({
        ...base,
        credentialJwts: [
          {
            type: ["VerifiableCredential"],
            credentialSubject: { id: identity.did },
          } as unknown as string,
        ],
      }),
    ).rejects.toThrow("compact VC JWT string");
  });

  it("rejects a signer assertion or nested credential bound to another holder", async () => {
    const identity = await generateHolderIdentity();
    const other = await generateHolderIdentity();
    const credentialJwt = await issuerCredentialJwt(identity.did);
    const base = {
      identity,
      audience: AUDIENCE,
      recipient: RECIPIENT,
      context: "opd_visit" as const,
      purpose: "Follow-up treatment",
      consentRef: "urn:trustcare:consent:follow-up",
      now: NOW,
    };

    await expect(
      createHolderSignedDirectVp({
        ...base,
        holderDid: other.did,
        credentialJwts: [credentialJwt],
      }),
    ).rejects.toThrow("does not match the asserted holder DID");
    await expect(
      createHolderSignedDirectVp({
        ...base,
        credentialJwts: [await issuerCredentialJwt(other.did)],
      }),
    ).rejects.toThrow("credentialSubject.id does not match");
  });

  it("rejects patientId at the request boundary or inside a nested JWT", async () => {
    const identity = await generateHolderIdentity();
    const base = {
      identity,
      audience: AUDIENCE,
      recipient: RECIPIENT,
      context: "opd_visit" as const,
      purpose: "Follow-up treatment",
      consentRef: "urn:trustcare:consent:follow-up",
      credentialJwts: [await issuerCredentialJwt(identity.did)],
      now: NOW,
    };

    await expect(
      createHolderSignedDirectVp({
        ...base,
        patientId: 42,
      } as Parameters<typeof createHolderSignedDirectVp>[0]),
    ).rejects.toThrow("patientId is forbidden");
    await expect(
      createHolderSignedDirectVp({
        ...base,
        credentialJwts: [
          await issuerCredentialJwt(identity.did, { patientId: 42 }),
        ],
      }),
    ).rejects.toThrow("patientId is forbidden");
  });

  it("rejects expired presentations and lifetimes over 15 minutes", async () => {
    const identity = await generateHolderIdentity();
    const credentialJwt = await issuerCredentialJwt(identity.did);
    const base = {
      identity,
      audience: AUDIENCE,
      recipient: RECIPIENT,
      context: "opd_visit" as const,
      purpose: "Follow-up treatment",
      consentRef: "urn:trustcare:consent:follow-up",
      credentialJwts: [credentialJwt],
      now: NOW,
    };

    await expect(
      createHolderSignedDirectVp({
        ...base,
        expiresAt: "2026-07-11T09:59:59.000Z",
      }),
    ).rejects.toThrow("expiry must be later");
    await expect(
      createHolderSignedDirectVp({
        ...base,
        expiresAt: "2026-07-11T10:15:01.000Z",
      }),
    ).rejects.toThrow("must not exceed 15 minutes");
  });

  it("accepts HTTPS and loopback audiences but rejects an insecure remote URL", async () => {
    const identity = await generateHolderIdentity();
    const credentialJwt = await issuerCredentialJwt(identity.did);
    const base = {
      identity,
      recipient: RECIPIENT,
      context: "opd_visit" as const,
      purpose: "Follow-up treatment",
      consentRef: "urn:trustcare:consent:follow-up",
      credentialJwts: [credentialJwt],
      now: NOW,
    };

    await expect(
      createHolderSignedDirectVp({
        ...base,
        audience: "http://localhost:3000/verifier",
      }),
    ).resolves.toMatchObject({
      payload: { trustcare: { audience: "http://localhost:3000/verifier" } },
    });
    await expect(
      createHolderSignedDirectVp({
        ...base,
        audience: "http://portal.example/verifier",
      }),
    ).rejects.toThrow("absolute HTTPS URL");
  });
});

describe("createHolderSignedShlAssociationVp", () => {
  it("envelopes the exact Portal Manifest VC and signs every SHL binding with the holder key", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const manifestCredentialJwt = await issuerManifestCredentialJwt(
      identity.did,
    );
    expect(decodeJwt(manifestCredentialJwt)).not.toHaveProperty("aud");
    const audience = `${AUDIENCE.replace(/\/verifier$/, "")}/api/wallet/v2/shl-associations/42`;
    const result = await createHolderSignedShlAssociationVp({
      identity,
      audience,
      recipient: RECIPIENT,
      context: "opd_visit",
      purpose: "patient_summary",
      consentRef: "urn:trustcare:consent:shl:42",
      shlId: 42,
      manifestHash: `sha256:${"1".repeat(64)}`,
      sourceBundleHash: `sha256:${"2".repeat(64)}`,
      manifestCredentialId: "urn:trustcare:vc:shl:42",
      manifestCredentialJwt,
      presentationId: "urn:uuid:holder-presentation-42",
      now: NOW,
    });

    const verified = await compactVerify(
      result.vpJwt,
      await importJWK(identity.publicJwk, identity.jwsAlgorithm),
      { algorithms: [identity.jwsAlgorithm] },
    );
    expect(verified.protectedHeader).toEqual({
      alg: "ES256",
      typ: "vp+jwt",
      cty: "vp",
      kid: identity.kid,
    });
    expect(result.payload).toMatchObject({
      id: "urn:uuid:holder-presentation-42",
      type: [
        "VerifiablePresentation",
        "TrustcareShlAssociationPresentation",
      ],
      holder: identity.did,
      purpose: "patient_summary",
      trustcare: {
        context: "opd_visit",
        consentRef: "urn:trustcare:consent:shl:42",
        recipient: RECIPIENT,
        audience,
        shl: {
          packageId: "42",
          manifestHash: `sha256:${"1".repeat(64)}`,
          sourceBundleHash: `sha256:${"2".repeat(64)}`,
          manifestCredentialId: "urn:trustcare:vc:shl:42",
        },
      },
    });
    expect(result.payload.verifiableCredential).toEqual([
      {
        "@context": "https://www.w3.org/ns/credentials/v2",
        id: `data:application/vc+jwt,${manifestCredentialJwt}`,
        type: "EnvelopedVerifiableCredential",
      },
    ]);
  });

  it("fails closed when signed Manifest VC claims differ from the requested SHL", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const manifestCredentialJwt = await issuerManifestCredentialJwt(
      identity.did,
    );
    await expect(
      createHolderSignedShlAssociationVp({
        identity,
        audience: `${AUDIENCE.replace(/\/verifier$/, "")}/api/wallet/v2/shl-associations/43`,
        recipient: RECIPIENT,
        context: "opd_visit",
        purpose: "patient_summary",
        consentRef: "urn:trustcare:consent:shl:43",
        shlId: 43,
        manifestHash: `sha256:${"1".repeat(64)}`,
        sourceBundleHash: `sha256:${"2".repeat(64)}`,
        manifestCredentialId: "urn:trustcare:vc:shl:42",
        manifestCredentialJwt,
        now: NOW,
      }),
    ).rejects.toThrow("smartHealthLinkId does not match");

    const wrongAudienceJwt = await issuerManifestCredentialJwt(
      identity.did,
      "https://portal.example/api/shl/wrong-manifest",
    );
    await expect(
      createHolderSignedShlAssociationVp({
        identity,
        audience: `${AUDIENCE.replace(/\/verifier$/, "")}/api/wallet/v2/shl-associations/42`,
        recipient: RECIPIENT,
        context: "opd_visit",
        purpose: "patient_summary",
        consentRef: "urn:trustcare:consent:shl:42",
        shlId: 42,
        manifestHash: `sha256:${"1".repeat(64)}`,
        sourceBundleHash: `sha256:${"2".repeat(64)}`,
        manifestCredentialId: "urn:trustcare:vc:shl:42",
        manifestCredentialJwt: wrongAudienceJwt,
        now: NOW,
      }),
    ).rejects.toThrow("audience does not match");
  });
});

async function issuerCredentialJwt(
  holderDid: string,
  additions: Record<string, unknown> = {},
): Promise<string> {
  const issuerDid =
    "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";
  const keyPair = await generateKeyPair("ES256");
  return new SignJWT({
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare-hospital-network-production.up.railway.app/contexts/trustcare-credentials-v1.jsonld",
    ],
    ...additions,
    id: "urn:uuid:credential-test-001",
    type: ["VerifiableCredential", "MedicalCertificateCredential"],
    issuer: issuerDid,
    credentialSubject: { id: holderDid, data: {} },
    validFrom: NOW.toISOString(),
    validUntil: "2026-07-11T11:00:00.000Z",
    credentialStatus: [{
      id: "https://trustcare-hospital-network-production.up.railway.app/status/1#0",
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: "0",
      statusListCredential: "https://trustcare-hospital-network-production.up.railway.app/status/1",
    }],
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: `${issuerDid}#vc-signing-test`,
      cty: "vc",
    })
    .sign(keyPair.privateKey);
}

async function issuerManifestCredentialJwt(
  holderDid: string,
  intendedAudience?: string,
): Promise<string> {
  const keyPair = await generateKeyPair("ES256");
  const manifestUrl =
    "https://trustcare-hospital-network-production.up.railway.app/api/shl/42/manifest";
  return new SignJWT({
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare-hospital-network-production.up.railway.app/contexts/trustcare-credentials-v1.jsonld",
    ],
    id: "urn:trustcare:vc:shl:42",
    type: ["VerifiableCredential", "ShlManifestCredential"],
    issuer: RECIPIENT,
    credentialSubject: {
      id: holderDid,
      data: {
        smartHealthLinkId: 42,
        manifestUrl,
        manifestHash: `sha256:${"1".repeat(64)}`,
        sourceBundleHash: `sha256:${"2".repeat(64)}`,
        purpose: "patient_summary",
        context: "opd_visit",
        hospital: { did: RECIPIENT },
      },
    },
    trustcare: {
      intendedAudience: intendedAudience ?? manifestUrl,
    },
    validFrom: NOW.toISOString(),
    validUntil: "2026-07-11T11:00:00.000Z",
    credentialStatus: [
      {
        id: "https://trustcare-hospital-network-production.up.railway.app/status/1#0",
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "0",
        statusListCredential:
          "https://trustcare-hospital-network-production.up.railway.app/status/1",
      },
    ],
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: `${RECIPIENT}#vc-signing-test`,
      cty: "vc",
    })
    .sign(keyPair.privateKey);
}
