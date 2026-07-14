import {
  WALLET_EXCHANGE_V2_CONTEXTS,
  type WalletExchangeServiceContext,
} from "@trustcare/contracts";
import {
  CompactEncrypt,
  base64url,
  compactDecrypt,
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
} from "jose";
import {
  holderJwsProtectedHeader,
  signHolderCompactJws,
  type HolderSigningIdentity,
} from "./holderIdentity";
import {
  assertTrustCareDirectCredential,
  envelopCredentialJwt,
  extractEnvelopedCredentialJwt,
  trustCareCredentialIssuerDid,
  type JsonDocument,
} from "./directDocumentProfile";
import {
  isWalletDocumentTrustVerified,
  type WalletDocumentRecordV2,
} from "./walletDocumentV2";

const CERTIFIED_SHL_MANIFEST_SCHEMA =
  "trustcare.certified-shl.manifest.v1" as const;
const CERTIFIED_SHL_BINDING_TYPE =
  "TrustCareCertifiedShlManifestBinding" as const;
const HOLDER_ATTESTED_VP_TYPE =
  "TrustCareHolderAttestedShlPresentation" as const;
const A256GCM_KEY_BYTES = 32;
const A256GCM_IV_BYTES = 12;
const MAX_CLOCK_SKEW_SECONDS = 60;
const MAX_VERIFICATION_EVIDENCE_AGE_SECONDS = 5 * 60;

export type CertifiedShlAccessPolicy = Readonly<{
  purpose: string;
  recipient: string;
  audience: string;
  context: WalletExchangeServiceContext;
  consentRef: string;
  issuedAt: string;
  expiresAt: string;
  passcodeRequired: boolean;
  maxAccessCount: number;
}>;

export type CertifiedShlManifestFile = Readonly<{
  id: string;
  documentId: string;
  credentialId: string;
  credentialType: string;
  documentType: string;
  issuerDid: string;
  holderDid: string;
  contentType: "application/vc+jwt";
  encryption: Readonly<{ alg: "dir"; enc: "A256GCM" }>;
  location: string;
  plaintextSha256: string;
  jweSha256: string;
}>;

export type CertifiedShlManifest = Readonly<{
  schema: typeof CERTIFIED_SHL_MANIFEST_SCHEMA;
  publicationId: string;
  holderDid: string;
  manifestUrl: string;
  createdAt: string;
  expiresAt: string;
  accessPolicy: CertifiedShlAccessPolicy;
  documents: readonly CertifiedShlManifestFile[];
}>;

export type CertifiedShlEncryptedFile = Readonly<{
  id: string;
  documentId: string;
  location: string;
  contentType: "application/jose";
  jwe: string;
  plaintextSha256: string;
  jweSha256: string;
}>;

export type CertifiedShlFileHashBinding = Readonly<{
  fileId: string;
  documentId: string;
  plaintextSha256: string;
  jweSha256: string;
}>;

export type CertifiedShlManifestCredentialBinding = Readonly<{
  type: typeof CERTIFIED_SHL_BINDING_TYPE;
  shlPackageId: string;
  holderDid: string;
  manifestUrl: string;
  manifestHash: string;
  sourceBundleHash: string;
  fileHashes: readonly string[];
  purpose: string;
  context: WalletExchangeServiceContext;
  consentRef: string;
  expiresAt: string;
  holderAuthorizationPresentationId: string;
}>;

export type ShlCertificationRequest = Readonly<{
  clientRequestId: string;
  shlPackageId: string;
  targetHospitalCode: "TCC" | "TCP" | "TCM";
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  manifestUrl: string;
  manifestHash: string;
  sourceBundleHash: string;
  fileHashes: readonly string[];
  expiresAt: string;
  holderAuthorizationVpJwt: string;
}>;

export type PreparedHolderAttestedShl = Readonly<{
  trustMode: "holder_attested";
  manifest: CertifiedShlManifest;
  manifestJson: string;
  manifestHash: string;
  accessPolicyHash: string;
  expectedManifestCredentialBinding: CertifiedShlManifestCredentialBinding;
  files: readonly CertifiedShlEncryptedFile[];
  /**
   * Random 256-bit SHL content key. The caller encodes this value into the
   * SHL URL fragment and must never publish it in the manifest or file body.
   */
  shlContentKey: string;
  holderPresentationId: string;
  holderPresentationJwt: string;
  sourceBundleHash: string;
  certificationRequest: ShlCertificationRequest;
}>;

export type ManifestCredentialVerificationEvidence = Readonly<{
  verified: true;
  issuerDid: string;
  verificationMethod: string;
  algorithm: string;
  verifiedAt: string;
  issuerStatus: "active";
  credentialStatus: "active";
  claims: JsonDocument;
}>;

export type ManifestCredentialVerificationFailure = Readonly<{
  verified: false;
  reason: string;
}>;

export type ManifestCredentialVerifier = (
  manifestCredentialJwt: string,
) => Promise<
  ManifestCredentialVerificationEvidence | ManifestCredentialVerificationFailure
>;

export type CertifiedShlPublication = Readonly<{
  trustMode: "hospital_certified";
  manifest: CertifiedShlManifest;
  manifestJson: string;
  manifestHash: string;
  files: readonly CertifiedShlEncryptedFile[];
  shlContentKey: string;
  hashes: Readonly<{
    manifestSha256: string;
    accessPolicySha256: string;
    files: readonly CertifiedShlFileHashBinding[];
  }>;
  manifestCredentialJwt: string;
  manifestCredentialEvidence: ManifestCredentialVerificationEvidence;
  holderPresentationId: string;
  holderPresentationJwt: string;
  objectLinks: Readonly<{
    shlPackageId: string;
    manifestHash: string;
    manifestCredentialId: string;
    manifestCredentialJwt: string;
    holderPresentationId: string;
    holderPresentationJwt: string;
    sourceCredentials: readonly Readonly<{
      documentId: string;
      credentialId: string;
      plaintextSha256: string;
    }>[];
  }>;
}>;

export type PrepareHolderAttestedShlInput = {
  identity: HolderSigningIdentity;
  portalOrigin: string;
  publicationId: string;
  manifestUrl: string;
  fileBaseUrl: string;
  documents: readonly WalletDocumentRecordV2[];
  trustedIssuerDids: readonly string[];
  purpose: string;
  recipient: string;
  audience: string;
  context: WalletExchangeServiceContext;
  consentRef: string;
  targetHospitalCode: string;
  now?: Date;
  expiresAt: Date | string;
  passcodeRequired?: boolean;
  maxAccessCount?: number;
};

export type FinalizeCertifiedShlInput = {
  identity: HolderSigningIdentity;
  prepared: PreparedHolderAttestedShl;
  manifestCredentialJwt?: string;
  verifyManifestCredential?: ManifestCredentialVerifier;
  now?: Date;
};

export type DurableShlCertificationBinding = Readonly<{
  schema: "trustcare.wallet.shl-certification-binding.v1";
  shlPackageId: string;
  holderDid: string;
  manifestUrl: string;
  manifestHash: string;
  sourceBundleHash: string;
  fileHashes: readonly string[];
  purpose: string;
  recipient: string;
  audience: string;
  context: WalletExchangeServiceContext;
  consentRef: string;
  issuedAt: string;
  expiresAt: string;
  holderPresentationId: string;
  holderPresentationJwt: string;
  sourceCredentials: readonly Readonly<{
    documentId: string;
    credentialId: string;
    plaintextSha256: string;
  }>[];
}>;

export type CertifiedShlAssociation = Readonly<{
  manifestCredentialJwt: string;
  manifestCredentialEvidence: ManifestCredentialVerificationEvidence;
  objectLinks: CertifiedShlPublication["objectLinks"];
}>;

/** Creates the opaque 256-bit identifier used in a public SHL manifest path. */
export function createShlPackageId(): string {
  return base64UrlEncode(randomBytes(32));
}

/**
 * Removes encryption material from a prepared SHL before durable workflow
 * tracking. The content key and encrypted file bodies stay with the platform's
 * active-share store and never enter generic request-link persistence.
 */
export function durableShlCertificationBinding(
  prepared: PreparedHolderAttestedShl,
): DurableShlCertificationBinding {
  return deepFreeze({
    schema: "trustcare.wallet.shl-certification-binding.v1" as const,
    shlPackageId: prepared.manifest.publicationId,
    holderDid: prepared.manifest.holderDid,
    manifestUrl: prepared.manifest.manifestUrl,
    manifestHash: prepared.manifestHash,
    sourceBundleHash: prepared.sourceBundleHash,
    fileHashes: prepared.files.map((file) => file.jweSha256),
    purpose: prepared.manifest.accessPolicy.purpose,
    recipient: prepared.manifest.accessPolicy.recipient,
    audience: prepared.manifest.accessPolicy.audience,
    context: prepared.manifest.accessPolicy.context,
    consentRef: prepared.manifest.accessPolicy.consentRef,
    issuedAt: prepared.manifest.accessPolicy.issuedAt,
    expiresAt: prepared.manifest.accessPolicy.expiresAt,
    holderPresentationId: prepared.holderPresentationId,
    holderPresentationJwt: prepared.holderPresentationJwt,
    sourceCredentials: prepared.manifest.documents.map((document) => ({
      documentId: document.documentId,
      credentialId: document.credentialId,
      plaintextSha256: document.plaintextSha256,
    })),
  });
}

/**
 * Encrypts presentable Portal-issued VC JWTs for Standard SHL transport and
 * produces the exact binding an external integration issuer must sign.
 *
 * This phase does not create any trust badge or Manifest VC. It intentionally
 * performs no network I/O and returns the random SHL key only to its caller.
 */
export async function prepareHolderAttestedShl(
  input: PrepareHolderAttestedShlInput,
): Promise<PreparedHolderAttestedShl> {
  assertNoPatientId(input);
  assertHolderIdentity(input.identity);
  normalizeHttpsUrl(input.portalOrigin, "Portal origin");
  const trustedIssuerDids = new Set(
    input.trustedIssuerDids.map((issuerDid) =>
      requireDidWeb(issuerDid, "trusted issuer DID"),
    ),
  );
  if (!trustedIssuerDids.size) {
    throw new Error(
      "Certified SHL requires issuer DIDs resolved from the live Portal trust registry.",
    );
  }
  const publicationId = requireOpaqueShlPackageId(
    input.publicationId,
    "publication ID",
  );
  const manifestUrl = normalizeHttpsUrl(input.manifestUrl, "manifest URL");
  const fileBaseUrl = normalizeHttpsUrl(input.fileBaseUrl, "file base URL");
  const now = input.now ?? new Date();
  const issuedAt = isoDate(now, "SHL issued-at time");
  const expiresAt = isoDate(
    typeof input.expiresAt === "string"
      ? new Date(input.expiresAt)
      : input.expiresAt,
    "SHL expiry",
  );
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new Error("Certified SHL expiry must be in the future.");
  }
  if (!WALLET_EXCHANGE_V2_CONTEXTS.includes(input.context)) {
    throw new Error("Certified SHL service context is not supported.");
  }
  if (!Array.isArray(input.documents) || input.documents.length === 0) {
    throw new Error("Certified SHL requires at least one Wallet document.");
  }

  const accessPolicy = deepFreeze({
    purpose: requireText(input.purpose, "SHL purpose", 256),
    recipient: requireText(input.recipient, "SHL recipient", 700),
    audience: normalizeHttpsUrl(input.audience, "SHL audience"),
    context: input.context,
    consentRef: requireText(input.consentRef, "SHL consent reference", 255),
    issuedAt,
    expiresAt,
    passcodeRequired: input.passcodeRequired ?? true,
    maxAccessCount: positiveInteger(
      input.maxAccessCount ?? 5,
      "max access count",
    ),
  }) satisfies CertifiedShlAccessPolicy;

  const shlContentKeyBytes = randomBytes(A256GCM_KEY_BYTES);
  const shlContentKey = base64UrlEncode(shlContentKeyBytes);
  const files: CertifiedShlEncryptedFile[] = [];
  const manifestFiles: CertifiedShlManifestFile[] = [];
  const seenDocumentIds = new Set<string>();
  const seenCredentialIds = new Set<string>();
  const seenIvs = new Set<string>();

  for (const [index, record] of input.documents.entries()) {
    assertNoPatientId(record);
    const credential = assertPresentablePortalCredential({
      record,
      holderDid: input.identity.did,
      trustedIssuerDids,
      now,
      shareExpiresAt: new Date(expiresAt),
    });
    if (seenDocumentIds.has(record.id)) {
      throw new Error(`Certified SHL document ${record.id} is duplicated.`);
    }
    if (seenCredentialIds.has(credential.credentialId)) {
      throw new Error(
        `Certified SHL credential ${credential.credentialId} is duplicated.`,
      );
    }
    seenDocumentIds.add(record.id);
    seenCredentialIds.add(credential.credentialId);

    const fileId = `${publicationId}:file:${index + 1}`;
    const location = new URL(
      `${encodeURIComponent(fileId)}.jwe`,
      ensureTrailingSlash(fileBaseUrl),
    ).toString();
    const plaintext = new TextEncoder().encode(credential.jwt);
    const iv = freshUniqueIv(seenIvs);
    const jwe = await new CompactEncrypt(plaintext)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setInitializationVector(iv)
      .encrypt(shlContentKeyBytes);
    const plaintextSha256 = await sha256Urn(plaintext);
    const jweSha256 = await sha256Urn(new TextEncoder().encode(jwe));
    files.push(
      deepFreeze({
        id: fileId,
        documentId: record.id,
        location,
        contentType: "application/jose" as const,
        jwe,
        plaintextSha256,
        jweSha256,
      }),
    );
    manifestFiles.push(
      deepFreeze({
        id: fileId,
        documentId: record.id,
        credentialId: credential.credentialId,
        credentialType: credential.credentialType,
        documentType: record.documentType,
        issuerDid: credential.issuerDid,
        holderDid: input.identity.did,
        contentType: "application/vc+jwt" as const,
        encryption: deepFreeze({
          alg: "dir" as const,
          enc: "A256GCM" as const,
        }),
        location,
        plaintextSha256,
        jweSha256,
      }),
    );
  }

  const immutableManifestFiles = deepFreeze([...manifestFiles]);
  const manifest = deepFreeze({
    schema: CERTIFIED_SHL_MANIFEST_SCHEMA,
    publicationId,
    holderDid: input.identity.did,
    manifestUrl,
    createdAt: issuedAt,
    expiresAt,
    accessPolicy,
    documents: immutableManifestFiles,
  }) satisfies CertifiedShlManifest;
  const manifestJson = canonicalJson(manifest);
  const manifestHash = await sha256Urn(new TextEncoder().encode(manifestJson));
  const accessPolicyHash = await sha256Urn(
    new TextEncoder().encode(canonicalJson(accessPolicy)),
  );
  const holderPresentationId = `urn:uuid:${freshUuid()}`;
  const sourceCredentials = deepFreeze(
    immutableManifestFiles.map((file) =>
      deepFreeze({
        documentId: file.documentId,
        credentialId: file.credentialId,
        issuerDid: file.issuerDid,
        plaintextSha256: file.plaintextSha256,
      }),
    ),
  );
  const sourceBundleHash = await sha256Urn(
    new TextEncoder().encode(
      canonicalJson(
        sourceCredentials.map((credential) => ({
          credentialId: credential.credentialId,
          plaintextSha256: credential.plaintextSha256,
        })),
      ),
    ),
  );
  const encryptedFileHashes = deepFreeze(
    files.map((file) => file.jweSha256),
  );
  const expectedManifestCredentialBinding = deepFreeze({
    type: CERTIFIED_SHL_BINDING_TYPE,
    shlPackageId: publicationId,
    holderDid: input.identity.did,
    manifestUrl,
    manifestHash,
    sourceBundleHash,
    fileHashes: encryptedFileHashes,
    purpose: accessPolicy.purpose,
    context: accessPolicy.context,
    consentRef: accessPolicy.consentRef,
    expiresAt: accessPolicy.expiresAt,
    holderAuthorizationPresentationId: holderPresentationId,
  }) satisfies CertifiedShlManifestCredentialBinding;
  const holderPresentationExpiresAt = new Date(
    Math.min(
      Date.parse(accessPolicy.expiresAt),
      Date.parse(accessPolicy.issuedAt) + 10 * 60_000,
    ),
  ).toISOString();
  const holderPresentationPayload = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      `${new URL(input.portalOrigin).origin}/contexts/trustcare-credentials-v1.jsonld`,
    ],
    id: holderPresentationId,
    type: ["VerifiablePresentation", HOLDER_ATTESTED_VP_TYPE],
    holder: input.identity.did,
    purpose: accessPolicy.purpose,
    trustcare: {
      trustMode: "holder_attested",
      recipient: accessPolicy.recipient,
      audience: accessPolicy.audience,
      context: accessPolicy.context,
      consentRef: accessPolicy.consentRef,
      issuedAt: accessPolicy.issuedAt,
      expiresAt: holderPresentationExpiresAt,
      shl: {
        packageId: publicationId,
        manifestUrl,
        manifestHash,
        sourceBundleHash,
        fileHashes: encryptedFileHashes,
        expiresAt: accessPolicy.expiresAt,
      },
    },
    verifiableCredential: immutableManifestFiles.map((file) =>
      envelopCredentialJwt(
        requireCompactJwt(
          input.documents.find((record) => record.id === file.documentId)
            ?.credential.jwt,
          `Certified SHL document ${file.documentId} original issuer VC`,
        ),
      ),
    ),
  };
  const holderPresentationJwt = await signHolderCompactJws({
    identity: input.identity,
    protectedHeader: holderJwsProtectedHeader(input.identity, "vp"),
    payload: JSON.stringify(holderPresentationPayload),
  });
  const targetHospitalCode = requireText(
    input.targetHospitalCode,
    "target hospital code",
    32,
  ).toUpperCase();
  if (!(["TCC", "TCP", "TCM"] as const).includes(targetHospitalCode as never)) {
    throw new Error("Target hospital code is not in the live Portal trust registry.");
  }
  const certificationRequest = deepFreeze({
    clientRequestId: `wallet-shl-certification-${freshUuid()}`,
    shlPackageId: publicationId,
    targetHospitalCode: targetHospitalCode as "TCC" | "TCP" | "TCM",
    context: accessPolicy.context,
    purpose: accessPolicy.purpose,
    consentRef: accessPolicy.consentRef,
    manifestUrl,
    manifestHash,
    sourceBundleHash,
    fileHashes: encryptedFileHashes,
    expiresAt: accessPolicy.expiresAt,
    holderAuthorizationVpJwt: holderPresentationJwt,
  }) satisfies ShlCertificationRequest;

  return deepFreeze({
    trustMode: "holder_attested" as const,
    manifest,
    manifestJson,
    manifestHash,
    accessPolicyHash,
    expectedManifestCredentialBinding,
    files: deepFreeze([...files]),
    shlContentKey,
    holderPresentationId,
    holderPresentationJwt,
    sourceBundleHash,
    certificationRequest,
  });
}

/**
 * Verifies the externally issued Manifest VC and associates it with the exact
 * holder-signed VP created during preparation. Certification never causes the
 * Wallet to mint another credential or replace the original holder proof.
 */
export async function finalizeCertifiedShl(
  input: FinalizeCertifiedShlInput,
): Promise<CertifiedShlPublication> {
  assertNoPatientId(input);
  assertHolderIdentity(input.identity);
  if (input.identity.did !== input.prepared.manifest.holderDid) {
    throw new Error(
      "Certified SHL holder signer does not match the prepared holder.",
    );
  }
  await assertPreparedIntegrity(input.prepared);
  const now = input.now ?? new Date();
  const association = await finalizeShlCertificationAssociation({
    identity: input.identity,
    binding: durableShlCertificationBinding(input.prepared),
    manifestCredentialJwt: input.manifestCredentialJwt,
    verifyManifestCredential: input.verifyManifestCredential,
    now,
  });

  return deepFreeze({
    trustMode: "hospital_certified" as const,
    manifest: input.prepared.manifest,
    manifestJson: input.prepared.manifestJson,
    manifestHash: input.prepared.manifestHash,
    files: input.prepared.files,
    shlContentKey: input.prepared.shlContentKey,
    hashes: deepFreeze({
      manifestSha256: input.prepared.manifestHash,
      accessPolicySha256: input.prepared.accessPolicyHash,
      files: immutableFileHashBindings(input.prepared.files),
    }),
    manifestCredentialJwt: association.manifestCredentialJwt,
    manifestCredentialEvidence: association.manifestCredentialEvidence,
    holderPresentationId: input.prepared.holderPresentationId,
    holderPresentationJwt: input.prepared.holderPresentationJwt,
    objectLinks: association.objectLinks,
  });
}

/** Verifies and durably links a synced Portal Manifest VC after restart. */
export async function finalizeShlCertificationAssociation(input: {
  identity: HolderSigningIdentity;
  binding: DurableShlCertificationBinding;
  manifestCredentialJwt?: string;
  verifyManifestCredential?: ManifestCredentialVerifier;
  now?: Date;
}): Promise<CertifiedShlAssociation> {
  assertNoPatientId(input);
  assertHolderIdentity(input.identity);
  if (input.identity.did !== input.binding.holderDid) {
    throw new Error(
      "Certified SHL holder signer does not match the durable binding.",
    );
  }
  const now = input.now ?? new Date();
  await assertHolderPresentationIntegrity(
    holderPresentationIntegrityView(input.binding),
    input.identity,
    now,
  );
  const manifestCredentialJwt = requireCompactJwt(
    input.manifestCredentialJwt,
    "Externally issuer-signed Manifest VC",
  );
  if (typeof input.verifyManifestCredential !== "function") {
    throw new Error(
      "Certified SHL requires an injected Manifest VC signature verifier.",
    );
  }
  let verification;
  try {
    verification = await input.verifyManifestCredential(manifestCredentialJwt);
  } catch (error) {
    throw new Error(
      `Manifest VC signature verification failed: ${errorMessage(error)}.`,
    );
  }
  if (!verification.verified) {
    throw new Error(
      `Manifest VC signature verification failed: ${verification.reason}.`,
    );
  }
  const evidence = verification;
  const expectedBinding: CertifiedShlManifestCredentialBinding = {
    type: CERTIFIED_SHL_BINDING_TYPE,
    shlPackageId: input.binding.shlPackageId,
    holderDid: input.binding.holderDid,
    manifestUrl: input.binding.manifestUrl,
    manifestHash: input.binding.manifestHash,
    sourceBundleHash: input.binding.sourceBundleHash,
    fileHashes: input.binding.fileHashes,
    purpose: input.binding.purpose,
    context: input.binding.context,
    consentRef: input.binding.consentRef,
    expiresAt: input.binding.expiresAt,
    holderAuthorizationPresentationId: input.binding.holderPresentationId,
  };
  assertManifestCredentialEvidence({
    jwt: manifestCredentialJwt,
    evidence,
    expectedBinding,
    now,
  });
  return deepFreeze({
    manifestCredentialJwt,
    manifestCredentialEvidence: evidence,
    objectLinks: {
      shlPackageId: input.binding.shlPackageId,
      manifestHash: input.binding.manifestHash,
      manifestCredentialId: requireText(
        String(evidence.claims.id ?? ""),
        "Manifest VC credential ID",
        700,
      ),
      manifestCredentialJwt,
      holderPresentationId: input.binding.holderPresentationId,
      holderPresentationJwt: input.binding.holderPresentationJwt,
      sourceCredentials: input.binding.sourceCredentials,
    },
  });
}

/** Decrypts one publication file and verifies both exact JWE and plaintext hashes. */
export async function decryptCertifiedShlFile(input: {
  file: CertifiedShlEncryptedFile;
  shlContentKey: string;
}): Promise<string> {
  const jweHash = await sha256Urn(new TextEncoder().encode(input.file.jwe));
  if (jweHash !== input.file.jweSha256) {
    throw new Error(
      "Certified SHL JWE hash does not match the encrypted file.",
    );
  }
  const key = base64UrlDecode(input.shlContentKey);
  if (key.length !== A256GCM_KEY_BYTES) {
    throw new Error("Certified SHL A256GCM content key must be 256 bits.");
  }
  let decrypted;
  try {
    decrypted = await compactDecrypt(input.file.jwe, key);
  } catch {
    throw new Error("Certified SHL JWE authentication failed.");
  }
  if (
    decrypted.protectedHeader.alg !== "dir" ||
    decrypted.protectedHeader.enc !== "A256GCM"
  ) {
    throw new Error("Certified SHL JWE must use alg=dir and enc=A256GCM.");
  }
  const plaintextHash = await sha256Urn(decrypted.plaintext);
  if (plaintextHash !== input.file.plaintextSha256) {
    throw new Error(
      "Certified SHL plaintext hash does not match the file binding.",
    );
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(decrypted.plaintext);
}

function assertPresentablePortalCredential(input: {
  record: WalletDocumentRecordV2;
  holderDid: string;
  trustedIssuerDids: ReadonlySet<string>;
  now: Date;
  shareExpiresAt: Date;
}): {
  jwt: string;
  credentialId: string;
  credentialType: string;
  issuerDid: string;
} {
  const { record, holderDid, trustedIssuerDids, now, shareExpiresAt } = input;
  if (record.owner.holderDid !== holderDid) {
    throw new Error(
      `Certified SHL document ${record.id} does not belong to the signing holder did:key.`,
    );
  }
  if (!isWalletDocumentTrustVerified(record, now)) {
    throw new Error(
      `Certified SHL document ${record.id} is not active and fully verified for presentation.`,
    );
  }
  if (record.provenance.sourceKind !== "trustcare_portal") {
    throw new Error(
      `Certified SHL document ${record.id} is not an original TrustCare Portal credential.`,
    );
  }
  if (
    record.lifecycle.status !== "final" &&
    record.lifecycle.status !== "amended" &&
    record.lifecycle.status !== "corrected"
  ) {
    throw new Error(
      `Certified SHL document ${record.id} lifecycle is not presentable.`,
    );
  }
  if (record.credential.format !== "vc+jwt") {
    throw new Error(
      `Certified SHL document ${record.id} must preserve its original vc+jwt.`,
    );
  }
  const issuerDid = requirePortalHospitalIssuerDid(
    record.provenance.issuerDid,
    trustedIssuerDids,
  );
  const jwt = requireCompactJwt(
    record.credential.jwt,
    `Certified SHL document ${record.id} original issuer VC`,
  );
  const credentialId = requireIdentifier(
    record.credential.credentialId,
    `Certified SHL document ${record.id} credential ID`,
  );
  const credentialType = requireText(
    record.credential.credentialType ?? record.documentType,
    `Certified SHL document ${record.id} credential type`,
    255,
  );

  const header = decodeProtectedHeader(jwt);
  const payload = decodeJwt(jwt);
  assertNoPatientId(header);
  assertNoPatientId(payload);
  if (
    typeof header.alg !== "string" ||
    !header.alg ||
    header.alg.toLowerCase() === "none" ||
    header.typ !== "vc+jwt" ||
    header.cty !== "vc" ||
    typeof header.kid !== "string" ||
    !header.kid.startsWith(`${issuerDid}#`)
  ) {
    throw new Error(
      `Certified SHL document ${record.id} has no accountable Portal issuer signature header.`,
    );
  }
  const signedIssuerDid = trustCareCredentialIssuerDid(payload.issuer);
  if (signedIssuerDid !== issuerDid) {
    throw new Error(
      `Certified SHL document ${record.id} issuer claim does not match its live Portal issuer DID.`,
    );
  }
  try {
    assertTrustCareDirectCredential({
      payload: payload as JsonDocument,
      expectedIssuerDid: issuerDid,
      expectedHolderDid: holderDid,
      now,
    });
  } catch (error) {
    throw new Error(
      `Certified SHL document ${record.id} is not a direct TrustCare VC: ${errorMessage(error)}.`,
    );
  }
  if (payload.id !== credentialId) {
    throw new Error(
      `Certified SHL document ${record.id} credential ID does not match its signed VC.`,
    );
  }
  const validUntil =
    typeof payload.validUntil === "string"
      ? Date.parse(payload.validUntil)
      : Number.NaN;
  if (!Number.isFinite(validUntil) || validUntil < shareExpiresAt.getTime()) {
    throw new Error(
      `Certified SHL document ${record.id} issuer VC does not remain valid for the SHL access period.`,
    );
  }
  if (
    record.lifecycle.expiresAt &&
    Date.parse(record.lifecycle.expiresAt) < shareExpiresAt.getTime()
  ) {
    throw new Error(
      `Certified SHL document ${record.id} lifecycle expires before the SHL access period ends.`,
    );
  }
  return { jwt, credentialId, credentialType, issuerDid };
}

async function assertPreparedIntegrity(
  prepared: PreparedHolderAttestedShl,
): Promise<void> {
  if (canonicalJson(prepared.manifest) !== prepared.manifestJson) {
    throw new Error("Certified SHL manifest JSON changed after preparation.");
  }
  if (
    (await sha256Urn(new TextEncoder().encode(prepared.manifestJson))) !==
    prepared.manifestHash
  ) {
    throw new Error("Certified SHL manifest hash changed after preparation.");
  }
  if (
    (await sha256Urn(
      new TextEncoder().encode(canonicalJson(prepared.manifest.accessPolicy)),
    )) !== prepared.accessPolicyHash
  ) {
    throw new Error(
      "Certified SHL access policy hash changed after preparation.",
    );
  }
  if (base64UrlDecode(prepared.shlContentKey).length !== A256GCM_KEY_BYTES) {
    throw new Error("Certified SHL A256GCM content key must be 256 bits.");
  }
  if (prepared.files.length !== prepared.manifest.documents.length) {
    throw new Error(
      "Certified SHL manifest and publication file counts differ.",
    );
  }
  const contentKey = base64UrlDecode(prepared.shlContentKey);
  for (const [index, file] of prepared.files.entries()) {
    const manifestFile = prepared.manifest.documents[index];
    if (
      manifestFile.id !== file.id ||
      manifestFile.documentId !== file.documentId ||
      manifestFile.location !== file.location ||
      manifestFile.plaintextSha256 !== file.plaintextSha256 ||
      manifestFile.jweSha256 !== file.jweSha256
    ) {
      throw new Error(
        `Certified SHL file ${file.id} no longer matches the manifest.`,
      );
    }
    if (
      (await sha256Urn(new TextEncoder().encode(file.jwe))) !== file.jweSha256
    ) {
      throw new Error(
        `Certified SHL file ${file.id} JWE hash changed after preparation.`,
      );
    }
    let plaintext: Uint8Array;
    try {
      plaintext = (await compactDecrypt(file.jwe, contentKey)).plaintext;
    } catch {
      throw new Error(
        `Certified SHL file ${file.id} JWE authentication failed after preparation.`,
      );
    }
    if ((await sha256Urn(plaintext)) !== manifestFile.plaintextSha256) {
      throw new Error(
        `Certified SHL file ${file.id} plaintext no longer matches its source credential hash.`,
      );
    }
  }
  const expectedSourceBundleHash = await sha256Urn(
    new TextEncoder().encode(
      canonicalJson(
        prepared.manifest.documents.map((document) => ({
          credentialId: document.credentialId,
          plaintextSha256: document.plaintextSha256,
        })),
      ),
    ),
  );
  if (prepared.sourceBundleHash !== expectedSourceBundleHash) {
    throw new Error("Certified SHL source bundle hash changed after preparation.");
  }
  if (
    canonicalJson(prepared.expectedManifestCredentialBinding) !==
    canonicalJson({
      type: CERTIFIED_SHL_BINDING_TYPE,
      shlPackageId: prepared.manifest.publicationId,
      holderDid: prepared.manifest.holderDid,
      manifestUrl: prepared.manifest.manifestUrl,
      manifestHash: prepared.manifestHash,
      sourceBundleHash: prepared.sourceBundleHash,
      fileHashes: prepared.files.map((file) => file.jweSha256),
      purpose: prepared.manifest.accessPolicy.purpose,
      context: prepared.manifest.accessPolicy.context,
      consentRef: prepared.manifest.accessPolicy.consentRef,
      expiresAt: prepared.manifest.accessPolicy.expiresAt,
      holderAuthorizationPresentationId: prepared.holderPresentationId,
    })
  ) {
    throw new Error(
      "Certified SHL Manifest VC binding changed after preparation.",
    );
  }
}

type HolderPresentationIntegrityView = Readonly<{
  manifest: Readonly<{
    publicationId: string;
    holderDid: string;
    manifestUrl: string;
    accessPolicy: CertifiedShlAccessPolicy;
    documents: readonly Readonly<{
      credentialId: string;
    }>[];
  }>;
  manifestHash: string;
  sourceBundleHash: string;
  files: readonly Readonly<{ jweSha256: string }>[];
  holderPresentationId: string;
  holderPresentationJwt: string;
}>;

function holderPresentationIntegrityView(
  binding: DurableShlCertificationBinding,
): HolderPresentationIntegrityView {
  return {
    manifest: {
      publicationId: binding.shlPackageId,
      holderDid: binding.holderDid,
      manifestUrl: binding.manifestUrl,
      accessPolicy: {
        purpose: binding.purpose,
        recipient: binding.recipient,
        audience: binding.audience,
        context: binding.context,
        consentRef: binding.consentRef,
        issuedAt: binding.issuedAt,
        expiresAt: binding.expiresAt,
        passcodeRequired: true,
        maxAccessCount: 1,
      },
      documents: binding.sourceCredentials.map((credential) => ({
        credentialId: credential.credentialId,
      })),
    },
    manifestHash: binding.manifestHash,
    sourceBundleHash: binding.sourceBundleHash,
    files: binding.fileHashes.map((jweSha256) => ({ jweSha256 })),
    holderPresentationId: binding.holderPresentationId,
    holderPresentationJwt: binding.holderPresentationJwt,
  };
}

async function assertHolderPresentationIntegrity(
  prepared: HolderPresentationIntegrityView,
  identity: HolderSigningIdentity,
  now: Date,
): Promise<void> {
  assertCanonicalCompactJws(prepared.holderPresentationJwt);
  const publicKey = await importJWK(identity.publicJwk, identity.jwsAlgorithm);
  let verifiedPayload: Uint8Array;
  let protectedHeader: Awaited<ReturnType<typeof compactVerify>>["protectedHeader"];
  try {
    const result = await compactVerify(prepared.holderPresentationJwt, publicKey, {
      algorithms: [identity.jwsAlgorithm],
    });
    verifiedPayload = result.payload;
    protectedHeader = result.protectedHeader;
  } catch {
    throw new Error(
      "Holder-attested SHL VP signature is invalid.",
    );
  }
  let payload: JsonDocument;
  try {
    payload = JSON.parse(new TextDecoder().decode(verifiedPayload)) as JsonDocument;
  } catch {
    throw new Error("Holder-attested SHL VP payload is not JSON.");
  }
  if (
    protectedHeader.typ !== "vp+jwt" ||
    protectedHeader.cty !== "vp" ||
    protectedHeader.kid !== identity.kid ||
    protectedHeader.alg !== identity.jwsAlgorithm
  ) {
    throw new Error("Holder-attested SHL VP protected binding is invalid.");
  }
  if ("vp" in payload || "vc" in payload) {
    throw new Error("Holder-attested SHL VP must be a direct W3C VP payload.");
  }
  const trustcare = recordValue(payload.trustcare);
  const types = Array.isArray(payload.type) ? payload.type : [];
  if (
    payload.id !== prepared.holderPresentationId ||
    payload.holder !== identity.did ||
    payload.purpose !== prepared.manifest.accessPolicy.purpose ||
    !types.includes("VerifiablePresentation") ||
    !types.includes(HOLDER_ATTESTED_VP_TYPE)
  ) {
    throw new Error("Holder-attested SHL VP document binding is invalid.");
  }
  const presentationIssuedAt = Date.parse(String(trustcare?.issuedAt ?? ""));
  const presentationExpiresAt = Date.parse(String(trustcare?.expiresAt ?? ""));
  if (
    !Number.isFinite(presentationIssuedAt) ||
    !Number.isFinite(presentationExpiresAt) ||
    presentationIssuedAt > now.getTime() + MAX_CLOCK_SKEW_SECONDS * 1_000 ||
    presentationExpiresAt <= presentationIssuedAt ||
    presentationExpiresAt - presentationIssuedAt > 15 * 60_000
  ) {
    throw new Error("Holder-attested SHL VP validity is invalid.");
  }
  const shl = recordValue(trustcare?.shl);
  const expectedTrustcare = {
    trustMode: "holder_attested",
    recipient: prepared.manifest.accessPolicy.recipient,
    audience: prepared.manifest.accessPolicy.audience,
    context: prepared.manifest.accessPolicy.context,
    consentRef: prepared.manifest.accessPolicy.consentRef,
    issuedAt: prepared.manifest.accessPolicy.issuedAt,
    expiresAt: new Date(
      Math.min(
        Date.parse(prepared.manifest.accessPolicy.expiresAt),
        Date.parse(prepared.manifest.accessPolicy.issuedAt) + 10 * 60_000,
      ),
    ).toISOString(),
    shl: {
      packageId: prepared.manifest.publicationId,
      manifestUrl: prepared.manifest.manifestUrl,
      manifestHash: prepared.manifestHash,
      sourceBundleHash: prepared.sourceBundleHash,
      fileHashes: prepared.files.map((file) => file.jweSha256),
      expiresAt: prepared.manifest.accessPolicy.expiresAt,
    },
  };
  if (canonicalJson(trustcare) !== canonicalJson(expectedTrustcare)) {
    throw new Error(
      "Holder-attested SHL VP does not match the manifest, files, purpose, recipient, consent, or source credentials.",
    );
  }
  if (!shl) {
    throw new Error("Holder-attested SHL VP is missing its SHL binding.");
  }
  const envelopes = Array.isArray(payload.verifiableCredential)
    ? payload.verifiableCredential
    : [];
  const credentialJwts = envelopes.map(extractEnvelopedCredentialJwt);
  if (
    credentialJwts.length !== prepared.manifest.documents.length ||
    credentialJwts.some(
      (jwt, index) => decodeJwt(jwt).id !== prepared.manifest.documents[index].credentialId,
    )
  ) {
    throw new Error("Holder-attested SHL VP source credential envelopes changed after preparation.");
  }
}

function assertCanonicalCompactJws(value: string): void {
  try {
    const segments = value.split(".");
    if (
      segments.length === 3 &&
      segments.every(
        (segment) =>
          Boolean(segment) &&
          base64url.encode(base64url.decode(segment)) === segment,
      )
    ) {
      return;
    }
  } catch {
    // Normalize malformed and non-canonical compact JWS failures below.
  }
  throw new Error(
    "Holder-attested SHL VP signature or registered claims are invalid.",
  );
}

function assertManifestCredentialEvidence(input: {
  jwt: string;
  evidence: ManifestCredentialVerificationEvidence;
  expectedBinding: CertifiedShlManifestCredentialBinding;
  now: Date;
}): void {
  const header = decodeProtectedHeader(input.jwt);
  const decodedClaims = decodeJwt(input.jwt);
  assertNoPatientId(header);
  assertNoPatientId(decodedClaims);
  assertNoPatientId(input.evidence);
  if (canonicalJson(decodedClaims) !== canonicalJson(input.evidence.claims)) {
    throw new Error(
      "Manifest VC verifier evidence claims do not match the signed JWT.",
    );
  }
  let direct;
  try {
    direct = assertTrustCareDirectCredential({
      payload: decodedClaims as JsonDocument,
      expectedIssuerDid: input.evidence.issuerDid,
      expectedHolderDid: input.expectedBinding.holderDid,
      now: input.now,
      clockSkewSeconds: MAX_CLOCK_SKEW_SECONDS,
    });
  } catch (error) {
    throw new Error(`Manifest VC direct profile is invalid: ${errorMessage(error)}.`);
  }
  if (!direct.issuerDid.startsWith("did:web:")) {
    throw new Error("Manifest VC issuer must be a Portal hospital did:web.");
  }
  if (
    typeof header.alg !== "string" ||
    !header.alg ||
    header.alg.toLowerCase() === "none" ||
    header.typ !== "vc+jwt" ||
    header.cty !== "vc" ||
    header.alg !== input.evidence.algorithm ||
    typeof header.kid !== "string" ||
    header.kid !== input.evidence.verificationMethod ||
    !header.kid.startsWith(`${direct.issuerDid}#`)
  ) {
    throw new Error(
      "Manifest VC signature evidence does not match its protected header.",
    );
  }
  if ("vc" in decodedClaims || "vp" in decodedClaims) {
    throw new Error(
      "Manifest VC must use W3C VC 2.0 direct claims without a vc wrapper.",
    );
  }
  const verifiedAt = Date.parse(input.evidence.verifiedAt);
  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt > input.now.getTime() + MAX_CLOCK_SKEW_SECONDS * 1_000 ||
    verifiedAt <
      input.now.getTime() - MAX_VERIFICATION_EVIDENCE_AGE_SECONDS * 1_000
  ) {
    throw new Error("Manifest VC verification evidence time is invalid.");
  }
  if (input.evidence.issuerStatus !== "active") {
    throw new Error("Manifest VC issuer status is not active.");
  }
  if (input.evidence.credentialStatus !== "active") {
    throw new Error("Manifest VC credential status is not active.");
  }
  const requiredExpiry = Date.parse(input.expectedBinding.expiresAt);
  const credentialExpiry =
    typeof decodedClaims.validUntil === "string"
      ? Date.parse(decodedClaims.validUntil)
      : Number.NaN;
  if (
    !Number.isFinite(credentialExpiry) ||
    credentialExpiry < requiredExpiry ||
    credentialExpiry <= input.now.getTime()
  ) {
    throw new Error(
      "Manifest VC does not remain valid for the SHL access period.",
    );
  }
  const types = Array.isArray(decodedClaims.type) ? decodedClaims.type : [];
  if (
    !types.includes("VerifiableCredential") ||
    !types.includes("ShlManifestCredential")
  ) {
    throw new Error("Manifest VC has the wrong credential type.");
  }
  const trustcare = recordValue(decodedClaims.trustcare);
  if (
    trustcare?.intendedAudience !== undefined &&
    trustcare.intendedAudience !== input.expectedBinding.manifestUrl
  ) {
    throw new Error("Manifest VC intended audience does not match the SHL manifest URL.");
  }
  const subject = recordValue(decodedClaims.credentialSubject);
  const data = recordValue(subject?.data);
  const signedBinding = data
    ? {
        shlPackageId: data.shlPackageId,
        manifestUrl: data.manifestUrl,
        manifestHash: data.manifestHash,
        sourceBundleHash: data.sourceBundleHash,
        fileHashes: data.fileHashes,
        purpose: data.purpose,
        context: data.context,
        consentRef: data.consentRef,
        expiresAt: recordValue(data.limits)?.expiresAt,
        holderAuthorizationPresentationId:
          data.holderAuthorizationPresentationId,
      }
    : null;
  const expectedSignedBinding = {
    shlPackageId: input.expectedBinding.shlPackageId,
    manifestUrl: input.expectedBinding.manifestUrl,
    manifestHash: input.expectedBinding.manifestHash,
    sourceBundleHash: input.expectedBinding.sourceBundleHash,
    fileHashes: input.expectedBinding.fileHashes,
    purpose: input.expectedBinding.purpose,
    context: input.expectedBinding.context,
    consentRef: input.expectedBinding.consentRef,
    expiresAt: input.expectedBinding.expiresAt,
    holderAuthorizationPresentationId:
      input.expectedBinding.holderAuthorizationPresentationId,
  };
  if (canonicalJson(signedBinding) !== canonicalJson(expectedSignedBinding)) {
    throw new Error(
      "Manifest VC signed binding does not match the prepared SHL manifest.",
    );
  }
}

function requirePortalHospitalIssuerDid(
  issuerDid: string | undefined,
  trustedIssuerDids: ReadonlySet<string>,
): string {
  if (typeof issuerDid !== "string" || !issuerDid) {
    throw new Error("Certified SHL document is missing its Portal issuer DID.");
  }
  if (!trustedIssuerDids.has(issuerDid)) {
    throw new Error(
      `Certified SHL issuer ${issuerDid} was not resolved from the live Portal trust registry.`,
    );
  }
  return issuerDid;
}

function requireDidWeb(value: string, label: string): string {
  const normalized = requireText(value, label, 700);
  if (!normalized.startsWith("did:web:")) {
    throw new Error(`${label} must be a did:web identifier.`);
  }
  return normalized;
}

function assertHolderIdentity(identity: HolderSigningIdentity): void {
  if (!identity.did.startsWith("did:key:")) {
    throw new Error("Certified SHL holder must use a Wallet-owned did:key.");
  }
}

function requireCompactJwt(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} is required as a compact JWT.`);
  }
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    throw new Error(`${label} must be a signed compact JWT.`);
  }
  try {
    decodeProtectedHeader(value);
    decodeJwt(value);
  } catch {
    throw new Error(`${label} must be a signed compact JWT.`);
  }
  return value;
}

function immutableFileHashBindings(
  files: readonly CertifiedShlEncryptedFile[],
): readonly CertifiedShlFileHashBinding[] {
  return deepFreeze(
    files.map((file) =>
      deepFreeze({
        fileId: file.id,
        documentId: file.documentId,
        plaintextSha256: file.plaintextSha256,
        jweSha256: file.jweSha256,
      }),
    ),
  );
}

function freshUniqueIv(seen: Set<string>): Uint8Array {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const iv = randomBytes(A256GCM_IV_BYTES);
    const encoded = base64UrlEncode(iv);
    if (!seen.has(encoded)) {
      seen.add(encoded);
      return iv;
    }
  }
  throw new Error("WebCrypto failed to produce a unique A256GCM IV.");
}

function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("WebCrypto is required for Certified SHL encryption.");
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

async function sha256Urn(bytes: Uint8Array): Promise<string> {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    copied.buffer,
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Certified SHL content key is not base64url.");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  } catch {
    throw new Error("Certified SHL content key is not base64url.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function assertNoPatientId(value: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
        throw new Error(
          "Portal patientId is forbidden in Certified SHL input.",
        );
      }
      visit(nested);
    }
  };
  visit(value);
}

function normalizeHttpsUrl(value: string, label: string): string {
  const text = requireText(value, label, 1_000);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  return parsed.toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function requireIdentifier(value: unknown, label: string): string {
  const text = requireText(value, label, 255);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return text;
}

function requireOpaqueShlPackageId(value: unknown, label: string): string {
  const text = requireText(value, label, 43);
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) {
    throw new Error(`${label} must be a 256-bit base64url identifier.`);
  }
  return text;
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not contain surrounding whitespace.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Certified SHL ${label} must be a positive integer.`);
  }
  return value;
}

function isoDate(value: Date, label: string): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return value.toISOString();
}

function freshUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
