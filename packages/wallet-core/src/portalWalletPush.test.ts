import { SignJWT, compactVerify, generateKeyPair, importJWK } from "jose";
import { describe, expect, it } from "vitest";
import {
  generateHolderIdentity,
  type HolderKeyAlgorithm,
} from "./holderIdentity";
import { createHolderSignedDirectVp } from "./portalWalletPush";

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
        kid: identity.kid,
      });
      expect(payload).toEqual(result.payload);
      expect(payload).toMatchObject({
        iss: identity.did,
        sub: identity.did,
        aud: AUDIENCE,
        iat: 1_783_764_000,
        exp: 1_783_764_600,
        vp: {
          type: ["VerifiablePresentation"],
          holder: identity.did,
          purpose: "Prepare documents for follow-up treatment",
          trustcare: {
            context: "opd_visit",
            consentRef: "urn:trustcare:consent:patient:follow-up:2026-07-11",
            recipient: RECIPIENT,
            audience: AUDIENCE,
          },
          verifiableCredential: [credentialJwt],
        },
      });
      expect(payload.jti).toMatch(
        /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(result.transport).toEqual({
        mode: "direct_vp",
        vpJwt: result.vpJwt,
      });
      expect(result.payload.vp.verifiableCredential[0]).toBe(credentialJwt);
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

    expect(first.payload.jti).not.toBe(second.payload.jti);
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
      payload: { aud: "http://localhost:3000/verifier" },
    });
    await expect(
      createHolderSignedDirectVp({
        ...base,
        audience: "http://portal.example/verifier",
      }),
    ).rejects.toThrow("absolute HTTPS URL");
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
    ...additions,
    vc: {
      type: ["VerifiableCredential", "MedicalCertificateCredential"],
      issuer: issuerDid,
      credentialSubject: { id: holderDid },
    },
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: `${issuerDid}#vc-signing-test`,
    })
    .setIssuer(issuerDid)
    .setSubject(holderDid)
    .setIssuedAt(Math.floor(NOW.getTime() / 1_000))
    .setExpirationTime(Math.floor(NOW.getTime() / 1_000) + 3_600)
    .sign(keyPair.privateKey);
}
