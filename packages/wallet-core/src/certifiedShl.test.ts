import {
  SignJWT,
  compactVerify,
  decodeJwt,
  generateKeyPair,
  type CryptoKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createShlPackageId,
  decryptCertifiedShlFile,
  durableShlCertificationBinding,
  finalizeCertifiedShl,
  finalizeShlCertificationAssociation,
  prepareHolderAttestedShl,
  type ManifestCredentialVerifier,
  type PreparedHolderAttestedShl,
} from "./certifiedShl";
import {
  generateHolderIdentity,
  type GeneratedHolderIdentity,
} from "./holderIdentity";
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";

const PORTAL_ORIGIN =
  "https://trustcare-hospital-network-production.up.railway.app";
const TCC_ISSUER = "did:web:issuer-authority.example:hospital:tcc";
const MANIFEST_ISSUER = TCC_ISSUER;
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

  it("creates opaque 256-bit package identifiers for Portal certification", () => {
    const first = createShlPackageId();
    const second = createShlPackageId();

    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{42}$/);
    expect(second).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{42}$/);
    expect(second).not.toBe(first);
  });

  it("preserves a canonical Portal origin audience without adding a trailing slash", async () => {
    const document = await documentRecord(
      "document-origin-audience",
      "credential-origin-audience",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder, {
      audience: PORTAL_ORIGIN,
    });
    const presentation = decodeJwt(prepared.holderPresentationJwt);

    expect(prepared.packageBinding.accessPolicy.audience).toBe(PORTAL_ORIGIN);
    expect((presentation.trustcare as Record<string, unknown>).audience).toBe(
      PORTAL_ORIGIN,
    );
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
    expect(prepared.packageBinding.documents[0].encryption).toEqual({
      alg: "dir",
      enc: "A256GCM",
    });
    expect(Object.isFrozen(prepared.packageBinding.documents)).toBe(true);
    expect(prepared.manifestJson).not.toContain(prepared.shlContentKey);
    expect(prepared.manifestJson).not.toContain(documents[0].credential.jwt);
    expect(prepared.trustMode).toBe("holder_attested");
    const holderClaims = decodeJwtPayload(prepared.holderPresentationJwt);
    expect(holderClaims).toMatchObject({
      id: prepared.holderPresentationId,
      holder: holder.did,
      type: [
        "VerifiablePresentation",
        "TrustCareHolderAttestedShlPresentation",
      ],
    });
    expect(
      (
        (holderClaims.trustcare as Record<string, unknown>).shl as Record<
          string,
          unknown
        >
      ).manifestHash,
    ).toBe(prepared.manifestHash);
    expect(holderClaims).not.toHaveProperty("vp");
    expect(holderClaims.verifiableCredential).toHaveLength(2);
    expect(prepared.certificationRequest).toMatchObject({
      targetHospitalCode: "TCC",
      shlPackageId: prepared.packageBinding.publicationId,
      holderAuthorizationVpJwt: prepared.holderPresentationJwt,
      manifestHash: prepared.manifestHash,
      sourceBundleHash: prepared.sourceBundleHash,
    });

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

  it("associates the external Manifest VC with the original holder-signed VP", async () => {
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

    expect(publication.trustMode).toBe("hospital_certified");
    expect(publication.manifestCredentialJwt).toBe(manifestCredentialJwt);
    expect(publication.holderPresentationJwt).toBe(
      prepared.holderPresentationJwt,
    );
    expect(publication.holderPresentationId).toBe(
      prepared.holderPresentationId,
    );
    const vpClaims = decodeJwtPayload(publication.holderPresentationJwt);
    expect(vpClaims.holder).toBe(holder.did);
    expect(vpClaims.verifiableCredential).toHaveLength(2);
    expect(
      (
        (vpClaims.trustcare as Record<string, unknown>).shl as Record<
          string,
          unknown
        >
      ).manifestHash,
    ).toBe(prepared.manifestHash);
    expect(publication.objectLinks).toMatchObject({
      shlPackageId: prepared.packageBinding.publicationId,
      manifestHash: prepared.manifestHash,
      manifestCredentialJwt,
      holderPresentationId: prepared.holderPresentationId,
      holderPresentationJwt: prepared.holderPresentationJwt,
    });
  });

  it("reconciles a synced Manifest VC from a durable non-secret binding", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const binding = durableShlCertificationBinding(prepared);
    const serialized = JSON.stringify(binding);
    expect(serialized).not.toContain(prepared.shlContentKey);
    expect(serialized).not.toContain(prepared.files[0].jwe);

    const manifestCredentialJwt = await signManifestCredential(
      prepared,
      manifestPrivateKey,
    );
    const association = await finalizeShlCertificationAssociation({
      identity: holder,
      binding: structuredClone(binding),
      manifestCredentialJwt,
      verifyManifestCredential: manifestVerifier(manifestPublicKey),
      now: NOW,
    });

    expect(association.objectLinks).toMatchObject({
      shlPackageId: prepared.packageBinding.publicationId,
      manifestHash: prepared.manifestHash,
      holderPresentationId: prepared.holderPresentationId,
      sourceCredentials: [
        {
          documentId: document.id,
          credentialId: document.credential.credentialId,
        },
      ],
    });
  });

  it("accepts a Portal certification completed after the bounded request VP expired", async () => {
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
    const completedAt = new Date(NOW.getTime() + 20 * 60_000);

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        manifestCredentialJwt,
        verifyManifestCredential: manifestVerifier(
          manifestPublicKey,
          completedAt,
        ),
        now: completedAt,
      }),
    ).resolves.toMatchObject({ trustMode: "hospital_certified" });
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
    } as PreparedHolderAttestedShl;
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

  it("rejects a replaced holder VP instead of re-signing it during certification", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const tamperedPrepared = {
      ...prepared,
      holderPresentationJwt: `${prepared.holderPresentationJwt.slice(0, -1)}${
        prepared.holderPresentationJwt.endsWith("A") ? "B" : "A"
      }`,
    } as PreparedHolderAttestedShl;

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
    ).rejects.toThrow("Holder-attested SHL VP signature");
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
      "did:web:issuer-registry.example:hospital:tcc",
    );
    await expect(prepare([document], holder)).rejects.toThrow(
      "was not resolved from the live Portal trust registry",
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

  it("rejects copied issuer claims, unsigned JSON, and wrapped Manifest credentials", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const verify = manifestVerifier(manifestPublicKey);

    for (const unsigned of [
      JSON.stringify({ issuer: MANIFEST_ISSUER }),
      JSON.stringify({
        issuer: document.provenance.issuerDid,
        credentialSubject: prepared.expectedManifestCredentialBinding,
      }),
    ]) {
      await expect(
        finalizeCertifiedShl({
          identity: holder,
          prepared,
          manifestCredentialJwt: unsigned,
          verifyManifestCredential: verify,
          now: NOW,
        }),
      ).rejects.toThrow("signed compact JWT");
    }

    await expect(
      finalizeCertifiedShl({
        identity: holder,
        prepared,
        manifestCredentialJwt: await signManifestCredential(
          prepared,
          manifestPrivateKey,
          prepared.expectedManifestCredentialBinding,
          { useVcWrapper: true },
        ),
        verifyManifestCredential: verify,
        now: NOW,
      }),
    ).rejects.toThrow("must not contain vc or vp wrapper claims");
  });

  it("rejects wrong issuer, kid, signature, audience, expiry, and status", async () => {
    const document = await documentRecord(
      "document-1",
      "credential-1",
      holder.did,
      hospitalPrivateKey,
    );
    const prepared = await prepare([document], holder);
    const verify = manifestVerifier(manifestPublicKey);
    const cases: Array<{
      name: string;
      jwt: Promise<string>;
      verifier?: ManifestCredentialVerifier;
    }> = [
      {
        name: "issuer",
        jwt: signManifestCredential(
          prepared,
          manifestPrivateKey,
          prepared.expectedManifestCredentialBinding,
          { issuer: "did:web:wrong-issuer.example:hospital:tcc" },
        ),
      },
      {
        name: "kid",
        jwt: signManifestCredential(
          prepared,
          manifestPrivateKey,
          prepared.expectedManifestCredentialBinding,
          { kid: "did:web:wrong-issuer.example#key" },
        ),
      },
      {
        name: "signature",
        jwt: signManifestCredential(prepared, hospitalPrivateKey),
      },
      {
        name: "audience",
        jwt: signManifestCredential(
          prepared,
          manifestPrivateKey,
          prepared.expectedManifestCredentialBinding,
          { audience: "https://wrong-audience.example/intake" },
        ),
      },
      {
        name: "expiry",
        jwt: signManifestCredential(
          prepared,
          manifestPrivateKey,
          prepared.expectedManifestCredentialBinding,
          { expiresAt: new Date(NOW.getTime() - 1_000) },
        ),
      },
      {
        name: "status",
        jwt: signManifestCredential(prepared, manifestPrivateKey),
        verifier: async (jwt) => {
          const evidence = await verify(jwt);
          return evidence.verified
            ? { ...evidence, credentialStatus: "suspended" as never }
            : evidence;
        },
      },
    ];

    for (const negative of cases) {
      await expect(
        finalizeCertifiedShl({
          identity: holder,
          prepared,
          manifestCredentialJwt: await negative.jwt,
          verifyManifestCredential: negative.verifier ?? verify,
          now: NOW,
        }),
        negative.name,
      ).rejects.toThrow();
    }
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

  it("evaluates a pending sharing policy in the holder-signed SHL event", async () => {
    const verified = await documentRecord(
      "document-policy-pending",
      "credential-policy-pending",
      holder.did,
      hospitalPrivateKey,
    );
    const policyPending: WalletDocumentRecordV2 = {
      ...verified,
      trust: {
        state: "issuer_signed_untrusted",
        checks: verified.trust.checks.map((check) =>
          check.key === "policy"
            ? {
                ...check,
                status: "pending",
                detail: "Evaluate against the concrete sharing event.",
              }
            : check,
        ),
      },
    };

    await expect(prepare([policyPending], holder)).resolves.toMatchObject({
      trustMode: "holder_attested",
      packageBinding: {
        accessPolicy: {
          purpose: "OPD registration",
          consentRef: "consent:receipt:1",
        },
      },
    });
  });

  it("keeps a failed sharing policy fail-closed", async () => {
    const verified = await documentRecord(
      "document-policy-failed",
      "credential-policy-failed",
      holder.did,
      hospitalPrivateKey,
    );
    const policyFailed: WalletDocumentRecordV2 = {
      ...verified,
      trust: {
        state: "issuer_signed_untrusted",
        checks: verified.trust.checks.map((check) =>
          check.key === "policy"
            ? { ...check, status: "failed", detail: "Recipient denied." }
            : check,
        ),
      },
    };

    await expect(prepare([policyFailed], holder)).rejects.toThrow(
      "has not passed proof, issuer, status, expiry, and holder verification",
    );
  });
});

async function prepare(
  documents: readonly WalletDocumentRecordV2[],
  identity: GeneratedHolderIdentity,
  options: { audience?: string } = {},
) {
  const publicationId = "A".repeat(43);
  return prepareHolderAttestedShl({
    identity,
    portalOrigin: PORTAL_ORIGIN,
    publicationId,
    manifestUrl: `${PORTAL_ORIGIN}/s/${publicationId}`,
    fileBaseUrl: `https://share.example/shl/${publicationId}/files/`,
    documents,
    trustedIssuerDids: [TCC_ISSUER],
    purpose: "OPD registration",
    recipient: "TrustCare TCC registration desk",
    audience: options.audience ?? `${PORTAL_ORIGIN}/api/wallet/v2/submissions`,
    context: "opd_visit",
    consentRef: "consent:receipt:1",
    targetHospitalCode: "TCC",
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
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: credentialId,
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: issuerDid,
    validFrom: NOW.toISOString(),
    validUntil: new Date(EXPIRES_AT.getTime() + 3_600_000).toISOString(),
    credentialSubject: { id: holderDid, data: { givenName: "Test" } },
    credentialStatus: [
      {
        id: `https://issuer-authority.example/status/revocation#1`,
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "1",
        statusListCredential:
          "https://issuer-authority.example/status/revocation",
      },
    ],
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      cty: "vc",
      kid: `${issuerDid}#vc-signing-current`,
    })
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
  prepared: PreparedHolderAttestedShl,
  privateKey: CryptoKey,
  binding: unknown = prepared.expectedManifestCredentialBinding,
  options: {
    issuer?: string;
    kid?: string;
    audience?: string;
    expiresAt?: Date;
    useVcWrapper?: boolean;
  } = {},
): Promise<string> {
  const issuer = options.issuer ?? MANIFEST_ISSUER;
  const expected = binding as Record<string, unknown>;
  const directClaims = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: `urn:trustcare:vc:shl-manifest:${prepared.packageBinding.publicationId}`,
    type: ["VerifiableCredential", "ShlManifestCredential"],
    issuer,
    validFrom: NOW.toISOString(),
    validUntil: (options.expiresAt ?? EXPIRES_AT).toISOString(),
    credentialSubject: {
      id: expected.holderDid,
      data: {
        shlPackageId: expected.shlPackageId,
        manifestUrl: expected.manifestUrl,
        manifestHash: expected.manifestHash,
        sourceBundleHash: expected.sourceBundleHash,
        fileHashes: expected.fileHashes,
        purpose: expected.purpose,
        context: expected.context,
        consentRef: expected.consentRef,
        holderAuthorizationPresentationId:
          expected.holderAuthorizationPresentationId,
        limits: { expiresAt: expected.expiresAt },
        transport: { scheme: "shlink", encrypted: true },
      },
    },
    credentialStatus: [
      {
        id: `https://issuer-authority.example/status/shl#1`,
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "1",
        statusListCredential: "https://issuer-authority.example/status/shl",
      },
    ],
    trustcare: {
      intendedAudience: options.audience ?? prepared.packageBinding.manifestUrl,
    },
  };
  return new SignJWT(options.useVcWrapper ? { vc: directClaims } : directClaims)
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      cty: "vc",
      kid: options.kid ?? `${issuer}#manifest-signing-current`,
    })
    .sign(privateKey);
}

function manifestVerifier(
  publicKey: CryptoKey,
  verifiedAt: Date = NOW,
): ManifestCredentialVerifier {
  return async (jwt) => {
    const result = await compactVerify(jwt, publicKey, {
      algorithms: ["ES256"],
    });
    return {
      verified: true,
      issuerDid: MANIFEST_ISSUER,
      verificationMethod: String(result.protectedHeader.kid),
      algorithm: String(result.protectedHeader.alg),
      verifiedAt: verifiedAt.toISOString(),
      issuerStatus: "active",
      credentialStatus: "active",
      claims: decodeJwt(jwt),
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
