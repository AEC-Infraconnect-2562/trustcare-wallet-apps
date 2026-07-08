import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
} from "jose";
import {
  envelopedVerifiableCredentialFromJwt,
  extractCredentialJwt,
} from "./credentialProof";

export type JsonRecord = Record<string, unknown>;

export type TrustCareSigningKey = {
  alg: "ES256";
  issuerDid: string;
  kid: string;
  jku?: string;
  privateJwk: JsonRecord;
  publicJwk: JsonRecord;
};

export type SignedCredentialJwt = {
  credential: JsonRecord;
  credentialId: string;
  credentialType: string;
  jwt: string;
  digest: string;
};

export type SignedPresentationJwt = {
  vp: JsonRecord;
  jwt: string;
  credentialJwts: string[];
  warnings: string[];
};

export const TRUSTCARE_DEFAULT_AUDIENCE = "https://trustcare.network/verifier";

export async function createEphemeralEs256SigningKey(
  input: {
    issuerDid?: string;
    kidPrefix?: string;
    jku?: string;
  } = {},
): Promise<TrustCareSigningKey> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = (await exportJWK(publicKey)) as JsonRecord;
  const privateJwk = (await exportJWK(privateKey)) as JsonRecord;
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const issuerDid = input.issuerDid ?? "did:web:wallet.trustcare.local";
  const kid = `${input.kidPrefix ?? issuerDid}#vc-signing-key-${thumbprint.slice(0, 12)}`;
  return normalizeSigningKey({
    alg: "ES256",
    issuerDid,
    kid,
    jku: input.jku,
    privateJwk,
    publicJwk,
  });
}

export function normalizeSigningKey(
  input: TrustCareSigningKey,
): TrustCareSigningKey {
  const publicJwk = sanitizePublicJwk({
    ...input.publicJwk,
    alg: input.alg,
    kid: input.kid,
    use: input.publicJwk.use ?? "sig",
  });
  const privateJwk = {
    ...input.privateJwk,
    alg: input.alg,
    kid: input.kid,
    use: input.privateJwk.use ?? "sig",
  };
  return {
    ...input,
    privateJwk,
    publicJwk,
  };
}

export function publicJwksForSigningKey(key: TrustCareSigningKey): JsonRecord {
  return {
    keys: [key.publicJwk],
    issuer: key.issuerDid,
    updated: new Date().toISOString(),
  };
}

export async function signTrustCareCredentialJwt(input: {
  credential: JsonRecord;
  signingKey: TrustCareSigningKey;
  credentialType?: string;
  subject?: string;
  audience?: string;
  now?: Date;
  expiresAt?: string;
}): Promise<SignedCredentialJwt> {
  const signingKey = normalizeSigningKey(input.signingKey);
  const now = input.now ?? new Date();
  const credential = sanitizeCredentialForJwt(
    input.credential,
    signingKey,
    input.expiresAt,
  );
  const credentialId = stringValue(
    credential.id,
    `urn:uuid:wallet-vc-${now.getTime().toString(36)}`,
  );
  const credentialType =
    input.credentialType ??
    lastType(credential.type) ??
    "WalletDocumentCredential";
  const subject =
    input.subject ?? subjectFromCredential(credential) ?? credentialId;
  const expiresAt = stringValue(
    credential.validUntil,
    input.expiresAt ??
      new Date(now.getTime() + 365 * 24 * 60 * 60_000).toISOString(),
  );
  const digest = await sha256Hex(credential);
  const disclosureDigests = await buildDisclosureDigests(
    objectValue(credential.credentialSubject),
  );
  const jwtCredential = stripUndefined<JsonRecord>({
    ...credential,
    id: credentialId,
    trustcare: {
      ...objectValue(credential.trustcare),
      jwtProfile: "w3c-vc-jose-cose",
      credentialType,
      claimDigest: digest,
      disclosureDigests,
    },
  });
  const key = await importJWK(signingKey.privateJwk, signingKey.alg);
  const jwt = await new SignJWT(jwtCredential)
    .setProtectedHeader(
      stripUndefined({
        alg: signingKey.alg,
        typ: "vc+jwt",
        kid: signingKey.kid,
        jku: signingKey.jku,
      }),
    )
    .setIssuer(signingKey.issuerDid)
    .setSubject(subject)
    .setAudience(input.audience ?? TRUSTCARE_DEFAULT_AUDIENCE)
    .setJti(credentialId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(new Date(expiresAt).getTime() / 1000))
    .sign(key);
  return {
    credential: jwtCredential,
    credentialId,
    credentialType,
    jwt,
    digest,
  };
}

export async function signTrustCarePresentationJwt(input: {
  vp: JsonRecord;
  signingKey: TrustCareSigningKey;
  purpose?: string;
  audience?: string;
  now?: Date;
  expiresAt?: string;
  signUnsignedCredentials?: boolean;
}): Promise<SignedPresentationJwt> {
  const signingKey = normalizeSigningKey(input.signingKey);
  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresAt ??
    stringValue(
      input.vp.validUntil,
      new Date(now.getTime() + 10 * 60_000).toISOString(),
    );
  const rawCredentials = Array.isArray(input.vp.verifiableCredential)
    ? input.vp.verifiableCredential
    : [];
  const credentialJwts: string[] = [];
  const warnings: string[] = [];

  for (const credential of rawCredentials) {
    const existingJwt = extractCredentialJwt(credential);
    if (existingJwt) {
      credentialJwts.push(existingJwt);
      continue;
    }
    if (!input.signUnsignedCredentials || !isRecord(credential)) {
      warnings.push(
        "Skipped unsigned credential because no trusted issuer JWT was available.",
      );
      continue;
    }
    const signed = await signTrustCareCredentialJwt({
      credential: buildWalletIssuedCredentialAttestation(
        credential,
        signingKey,
      ),
      signingKey,
      credentialType:
        lastType((credential as JsonRecord).type) ?? "WalletDocumentCredential",
      subject: subjectFromCredential(credential),
      audience: input.audience,
      now,
      expiresAt: stringValue((credential as JsonRecord).validUntil, expiresAt),
    });
    credentialJwts.push(signed.jwt);
    warnings.push(
      "Unsigned wallet credential was converted to a Wallet-issued ES256 VC JWT attestation.",
    );
  }

  const credentialJwtDigests = await Promise.all(
    credentialJwts.map((jwtValue) => sha256Hex(jwtValue)),
  );
  const envelopedCredentials = credentialJwts.map((jwtValue) =>
    envelopedVerifiableCredentialFromJwt(jwtValue),
  );
  const vp = stripUndefined<JsonRecord>({
    ...input.vp,
    type: ensureArray(input.vp.type, "VerifiablePresentation"),
    holder: stringValue(
      input.vp.holder,
      stringValue(input.vp.holderDid, signingKey.issuerDid),
    ),
    purpose: input.purpose ?? input.vp.purpose,
    validUntil: expiresAt,
    verifiableCredential: envelopedCredentials,
    trustcare: {
      ...objectValue(input.vp.trustcare),
      jwtProfile: "w3c-vc-jose-cose",
      signingStatus: "jwt_signed",
      signingAlgorithm: signingKey.alg,
      signingKid: signingKey.kid,
      signingJwksUrl: signingKey.jku,
      credentialJwtCount: credentialJwts.length,
      credentialJwtDigests,
    },
  });
  const presentationHash = await sha256Hex({
    holder: vp.holder,
    credentialJwts,
    expiresAt,
  });
  const presentationId = stringValue(
    vp.id,
    `vp_${presentationHash.slice(0, 16)}`,
  );
  const jwtPresentation = stripUndefined<JsonRecord>({
    ...vp,
    id: presentationId,
  });
  const key = await importJWK(signingKey.privateJwk, signingKey.alg);
  const jwt = await new SignJWT(jwtPresentation)
    .setProtectedHeader(
      stripUndefined({
        alg: signingKey.alg,
        typ: "vp+jwt",
        kid: signingKey.kid,
        jku: signingKey.jku,
      }),
    )
    .setIssuer(signingKey.issuerDid)
    .setSubject(stringValue(vp.holder, signingKey.issuerDid))
    .setAudience(input.audience ?? TRUSTCARE_DEFAULT_AUDIENCE)
    .setJti(presentationId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(new Date(expiresAt).getTime() / 1000))
    .sign(key);

  return {
    vp: jwtPresentation,
    jwt,
    credentialJwts,
    warnings,
  };
}

export async function sha256Hex(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "WebCrypto subtle digest is required for TrustCare JWT digests.",
    );
  }
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : stableStringify(value),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function buildWalletIssuedCredentialAttestation(
  credential: JsonRecord,
  signingKey: TrustCareSigningKey,
): JsonRecord {
  const originalIssuer = credential.issuer;
  const originalHashClaim = {
    type: "SourceCredentialHash",
    sourceIssuer: originalIssuer,
  };
  return stripUndefined({
    ...credential,
    issuer: {
      id: signingKey.issuerDid,
      name: "TrustCare Wallet",
      trustDomain: "external-wallet",
      country: "TH",
    },
    evidence: [...arrayValue(credential.evidence), originalHashClaim],
    trustcare: {
      ...objectValue(credential.trustcare),
      walletIssuedAttestation: true,
      originalIssuer,
    },
  });
}

function sanitizeCredentialForJwt(
  credential: JsonRecord,
  signingKey: TrustCareSigningKey,
  expiresAt?: string,
): JsonRecord {
  const cleaned = stripProofLikeFields(credential);
  return stripUndefined({
    ...cleaned,
    "@context": cleaned["@context"] ?? [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/health/v1",
    ],
    type: ensureArray(cleaned.type, "VerifiableCredential"),
    issuer: cleaned.issuer ?? {
      id: signingKey.issuerDid,
      name: "TrustCare Wallet",
    },
    validFrom:
      cleaned.validFrom ?? cleaned.issuedAt ?? new Date().toISOString(),
    validUntil: cleaned.validUntil ?? expiresAt,
  });
}

function stripProofLikeFields(value: JsonRecord): JsonRecord {
  const copy = { ...value };
  delete copy.proof;
  delete copy.jwt;
  delete copy.sdJwtVc;
  return copy;
}

async function buildDisclosureDigests(
  claims: JsonRecord | null,
): Promise<Record<string, string>> {
  const digests: Record<string, string> = {};
  if (!claims) return digests;
  for (const [key, value] of Object.entries(claims)) {
    digests[key] = await sha256Hex(value);
  }
  return digests;
}

function sanitizePublicJwk(jwk: JsonRecord): JsonRecord {
  const publicJwk = { ...jwk };
  for (const field of ["d", "p", "q", "dp", "dq", "qi", "oth", "k"])
    delete publicJwk[field];
  return publicJwk;
}

function subjectFromCredential(credential: unknown): string | undefined {
  if (!isRecord(credential)) return undefined;
  const subject = objectValue(credential.credentialSubject);
  return (
    stringValue(
      subject?.id,
      stringValue(subject?.trustcareSubjectId, stringValue(credential.id, "")),
    ) || undefined
  );
}

function lastType(type: unknown): string | undefined {
  if (Array.isArray(type)) {
    const values = type
      .map(String)
      .filter(
        (item) =>
          item !== "VerifiableCredential" && item !== "VerifiablePresentation",
      );
    return values[values.length - 1];
  }
  return typeof type === "string" &&
    type !== "VerifiableCredential" &&
    type !== "VerifiablePresentation"
    ? type
    : undefined;
}

function ensureArray(value: unknown, requiredType: string): string[] {
  const items = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? [value]
      : [];
  return Array.from(new Set([requiredType, ...items]));
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value))
    return value.map(stripUndefined).filter((item) => item !== undefined) as T;
  if (!value || typeof value !== "object") return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue;
    cleaned[key] = stripUndefined(item);
  }
  return cleaned as T;
}

function objectValue(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
