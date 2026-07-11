import { SignJWT, generateKeyPair, jwtVerify, type CryptoKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptCertifiedShlFile,
  finalizeCertifiedShl,
  prepareCertifiedShl,
  type ManifestCredentialVerifier,
  type PreparedCertifiedShl,
} from "./certifiedShl";
import {
  generateHolderIdentity,
  type GeneratedHolderIdentity,
} from "./holderIdentity";
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";

const PORTAL_ORIGIN =
  "https://trustcare-hospital-network-production.up.railway.app";
const TCC_ISSUER =
  "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc";
const MANIFEST_ISSUER =
  "did:web:trustcare-hospital-network-production.up.railway.app";
const NOW = new Date("2026-07-11T10:00:00.000Z");
const EXPIRES_AT = new Date("2026-07-11T10:30:00.000Z");

describe("Certified SHL trust-layer primitives", () => {
  let holder: GeneratedHolderIdentity;
  let hospitalPrivateKey: CryptoKey;
  let manifestPrivateKey: CryptoKey;
  let manifestPublicKey: CryptoKey;

  beforeAll(async () => {
    holder = await generateHolderIdentity({ algorithm: "P-256" });
    const hospitalKeys = await generateKeyPair("ES256", { extractable: true });
    hospitalPrivateKey = hospitalKeys.privateKey;
    const manifestKeys = await generateKeyPair("ES256", { extractable: true });
    manifestPrivateKey = manifestKeys.privateKey;
    manifestPublicKey = manifestKeys.publicKey;
  });

  it("encrypts exact issuer JWTs with a random A256GCM key and fresh IVs", async () => {
    const documents = await Promise.all([
      documentRecord(
        "document-1",
        "credential-1",
        holder.did,
        hospitalPrivateKey,
      ),
      documentRecord(
        "document-2",
        "credential-2",
        holder.did,
        hospitalPrivateKey,
      ),
    ]);
    const prepared = await prepare(documents, holder);
    const secondPreparation = await prepare(documents, holder);

    expect(prepared.shlContentKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondPreparation.shlContentKey).not.toBe(prepared.shlContentKey);
    expect(prepared.files).toHaveLength(2);
    expect(prepared.files[0].jwe.split(".")[0]).toBe(
      prepared.files[1].jwe.split(".")[0],
    );
    expect(prepared.files[0].jwe.split(".")[2]).not.toBe(
      prepared.files[1].jwe.split(".")[2],
    );
    expect(prepared.manifest.documents[0].encryption).toEqual({
      alg: "dir",
      enc: "A256GCM",
    });
    expect(Object.isFrozen(prepared.manifest.documents)).toBe(true);
    expect(prepared.manifestJson).not.toContain(prepared.shlContentKey);
    expect(prepared.manifestJson).not.toContain(documents[0].credential.jwt);

    await expect(
      decryptCertifiedShlFile({
        file: prepared.files[0],
        shlContentKey: prepared.shlContentKey,
      }),
    ).resolves.toBe(documents[0].credential.jwt);
    await expect(
      decryptCertifiedShlFile({
        file: prepared.files[1],
        shlContentKey: prepared.shlContentKey,
      }),
    ).resolves.toBe(documents[1].credential.jwt);
  });

  it("retains the external Manifest VC and original issuer VCs inside a holder-signed VP", async () => {
    const documents = await Promise.all([
      documentRecord(
        "document-1",
        "credential-1",
        holder.did,
        hospitalPrivateKey,
      ),
      documentRecord(
        "document-2",
        "credential-2",
        holder.did,
        hospitalPrivateKey,
      ),
    ]);
    const prepared = await prepare(documents, holder);
    const manifestCredentialJwt = await signManifestCredential(
      prepared,
      manifestPrivateKey,
    );
    const publication = await finalizeCertifiedShl({
      identity: holder,
      prepared,
      manifestCredentialJwt,
      verifyManifestCredential: manifestVerifier(manifestPublicKey),
      now: NOW,
    });

    expect(publication.manifestCredentialJwt).toBe(manifestCredentialJwt);
    const vpClaims = decodeJwtPayload(publication.manifestVpJwt);
    const vp = vpClaims.vp as Record<string, unknown>;
    expect(vp.holder).toBe(holder.did);
    expect(vp.verifiableCredential).toEqual([
      manifestCredentialJwt,
      publication.holderAuthorizationJwt,
      documents[0].credential.jwt,
      documents[1].credential.jwt,
    ]);
    expect((vp.trustcare as Record<string, unknown>).manifestHash).toBe(
      prepared.manifestHash,
    );

    const authorizationClaims = decodeJwtPayload(
      publication.holderAuthorizationJwt,
    );
    const authorizationVc = authorizationClaims.vc as Record<string, unknown>;
    const subject = authorizationVc.credentialSubject as Record<
      string,
      unknown
    >;
    expect(subject).toMatchObject({
      id: holder.did,
      purpose: "OPD registration",
      recipient: "TrustCare TCC registration desk",
      audience: `${PORTAL_ORIGIN}/api/wallet/v2/submissions`,
      context: "opd_visit",
      consentRef: "consent:receipt:1",
      expiresAt: EXPIRES_AT.toISOString(),
      manifestHash: prepared.manifestHash,
    });
  });

  it("detects JWE tampering before it can become certified", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const tamperedJwe = `${prepared.files[0].jwe.slice(0, -1)}${
      prepared.files[0].jwe.endsWith("A") ? "B" : "A"
    }`;
    await expect(
      decryptCertifiedShlFile({
        file: { ...prepared.files[0], jwe: tamperedJwe },
        shlContentKey: prepared.shlContentKey,
      }),
    ).rejects.toThrow("JWE hash");

    const tamperedPrepared = {
      ...prepared,
      files: [{ ...prepared.files[0], jwe: tamperedJwe }],
    } as PreparedCertifiedShl;
    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared: tamperedPrepared,
        manifestCredentialJwt: await signManifestCredential(
          prepared,
          manifestPrivateKey,
        ),
        verifyManifestCredential: manifestVerifier(manifestPublicKey),
        now: NOW,
      }),
    ).rejects.toThrow("JWE hash changed");
  });

  it("binds every Manifest VP issuer credential to the encrypted-file plaintext hash", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const replacement = await documentRecord(
      "document-2",
      "credential-2",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const tamperedPrepared = {
      ...prepared,
      issuerCredentialJwts: [replacement.credential.jwt!],
    } as PreparedCertifiedShl;

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared: tamperedPrepared,
        manifestCredentialJwt: await signManifestCredential(
          prepared,
          manifestPrivateKey,
        ),
        verifyManifestCredential: manifestVerifier(manifestPublicKey),
        now: NOW,
      }),
    ).rejects.toThrow("no longer matches its plaintext hash");
  });

  it("rejects a cross-holder document and every patientId field", async () => {
    const otherHolder = await generateHolderIdentity({ algorithm: "P-256" });
    const crossHolder = await documentRecord(
      "document-cross-holder",
      "credential-cross-holder",
      otherHolder.did,
      hospitalPrivateKey,
    );
    await expect(prepare([crossHolder], holder)).rejects.toThrow(
      "does not belong to the signing holder",
    );

    const valid = await documentRecord(
      "document-with-patient-id",
      "credential-with-patient-id",
      holder.did,
      hospitalPrivateKey,
    );
    const withPatientId = {
      ...valid,
      owner: { ...valid.owner, patientId: "portal-patient-123" },
    };
    await expect(prepare([withPatientId], holder)).rejects.toThrow(
      "patientId is forbidden",
    );
  });

  it("rejects the retired Wallet issuer DID instead of falling back", async () => {
    const document = await documentRecord(
      "document-old-issuer",
      "credential-old-issuer",
      holder.did,
      hospitalPrivateKey,
      "did:web:trustcare.network:hospital:tcc",
    );
    await expect(prepare([document], holder)).rejects.toThrow(
      "is not a live Portal TCC, TCP, or TCM did:web",
    );
  });

  it("fails closed when the externally signed Manifest VC or verifier is missing", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        verifyManifestCredential: manifestVerifier(manifestPublicKey),
        now: NOW,
      }),
    ).rejects.toThrow("Manifest VC is required");

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        manifestCredentialJwt: await signManifestCredential(
          prepared,
          manifestPrivateKey,
        ),
        now: NOW,
      }),
    ).rejects.toThrow("requires an injected Manifest VC signature verifier");
  });

  it("rejects a validly signed Manifest VC whose binding does not match", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const wrongBinding = {
      ...prepared.expectedManifestCredentialBinding,
      manifestHash: `sha256:${"0".repeat(64)}`,
    };
    const manifestCredentialJwt = await signManifestCredential(
      prepared,
      manifestPrivateKey,
      wrongBinding,
    );

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        manifestCredentialJwt,
        verifyManifestCredential: manifestVerifier(manifestPublicKey),
        now: NOW,
      }),
    ).rejects.toThrow("signed binding does not match");
  });

  it("rejects stale active-status evidence instead of replaying it", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const manifestCredentialJwt = await signManifestCredential(
      prepared,
      manifestPrivateKey,
    );
    const verify = manifestVerifier(manifestPublicKey);
    const staleVerifier: ManifestCredentialVerifier = async (jwt) => {
      const result = await verify(jwt);
      return result.verified
        ? {
            ...result,
            verifiedAt: new Date(NOW.getTime() - 10 * 60 * 1_000).toISOString(),
          }
        : result;
    };

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        manifestCredentialJwt,
        verifyManifestCredential: staleVerifier,
        now: NOW,
      }),
    ).rejects.toThrow("verification evidence time is invalid");
  });
});

async function prepare(
  documents: readonly WalletDocumentRecordV2[],
  identity: GeneratedHolderIdentity,
) {
  return prepareCertifiedShl({
    identity,
    portalOrigin: PORTAL_ORIGIN,
    publicationId: "publication-001",
    manifestUrl: "https://share.example/shl/publication-001/manifest",
    fileBaseUrl: "https://share.example/shl/publication-001/files/",
    documents,
    purpose: "OPD registration",
    recipient: "TrustCare TCC registration desk",
    audience: `${PORTAL_ORIGIN}/api/wallet/v2/submissions`,
    context: "opd_visit",
    consentRef: "consent:receipt:1",
    now: NOW,
    expiresAt: EXPIRES_AT,
    passcodeRequired: true,
    maxAccessCount: 3,
  });
}

async function documentRecord(
  id: string,
  credentialId: string,
  holderDid: string,
  privateKey: CryptoKey,
  issuerDid = TCC_ISSUER,
): Promise<WalletDocumentRecordV2> {
  const jwt = await new SignJWT({
    vc: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      credentialSubject: { id: holderDid, givenName: "Test" },
    },
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: `${issuerDid}#vc-signing-current`,
    })
    .setIssuer(issuerDid)
    .setSubject(holderDid)
    .setIssuedAt(Math.floor(NOW.getTime() / 1_000))
    .setExpirationTime(Math.floor(EXPIRES_AT.getTime() / 1_000) + 3_600)
    .sign(privateKey);
  const checkedAt = NOW.toISOString();
  return {
    schemaVersion: "2.0",
    id,
    owner: { id: holderDid, holderDid },
    documentType: "patient_identity",
    category: "identity_and_access",
    title: { th: "บัตรประจำตัวผู้ป่วย", en: "Patient identity" },
    clinicalContext: {},
    lifecycle: {
      status: "final",
      versionId: "1",
      issuedAt: checkedAt,
      expiresAt: new Date(EXPIRES_AT.getTime() + 3_600_000).toISOString(),
    },
    provenance: {
      sourceKind: "trustcare_portal",
      issuerDid,
      receivedAt: checkedAt,
    },
    content: {
      documentReference: {
        resourceType: "DocumentReference",
        id: `${id}-reference`,
        status: "current",
        content: [],
      },
      originalAttachments: [],
    },
    credential: {
      credentialType: "PatientIdentityCredential",
      format: "vc+jwt",
      credentialId,
      jwt,
      credentialStatus: { status: "active" },
    },
    trust: {
      state: "verified",
      verifiedAt: checkedAt,
      checks: ["proof", "issuer", "status", "expiry", "holder", "policy"].map(
        (key) => ({ key, status: "passed", checkedAt }),
      ),
    },
    privacy: {
      defaultDisclosure: "ask",
      selectivelyDisclosableFields: [],
    },
    local: { pinned: false, availableOffline: true },
  };
}

async function signManifestCredential(
  prepared: PreparedCertifiedShl,
  privateKey: CryptoKey,
  binding: unknown = prepared.expectedManifestCredentialBinding,
): Promise<string> {
  return new SignJWT({
    vc: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "TrustCareShlManifestCredential"],
      credentialSubject: binding,
    },
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: `${MANIFEST_ISSUER}#manifest-signing-current`,
    })
    .setIssuer(MANIFEST_ISSUER)
    .setSubject(prepared.manifest.holderDid)
    .setIssuedAt(Math.floor(NOW.getTime() / 1_000))
    .setNotBefore(Math.floor(NOW.getTime() / 1_000))
    .setExpirationTime(Math.floor(EXPIRES_AT.getTime() / 1_000))
    .sign(privateKey);
}

function manifestVerifier(publicKey: CryptoKey): ManifestCredentialVerifier {
  return async (jwt) => {
    const result = await jwtVerify(jwt, publicKey, {
      issuer: MANIFEST_ISSUER,
      clockTolerance: 60,
      currentDate: NOW,
    });
    return {
      verified: true,
      issuerDid: MANIFEST_ISSUER,
      verificationMethod: String(result.protectedHeader.kid),
      algorithm: String(result.protectedHeader.alg),
      verifiedAt: NOW.toISOString(),
      issuerStatus: "active",
      credentialStatus: "active",
      claims: result.payload,
    };
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, encoded] = jwt.split(".");
  const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
  return JSON.parse(
    atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + padding),
  ) as Record<string, unknown>;
}
