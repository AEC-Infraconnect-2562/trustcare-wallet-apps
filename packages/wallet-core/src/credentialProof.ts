import type { JWK } from "jose";
import type { WalletCard } from "./models";

type JsonRecord = Record<string, unknown>;
export type CredentialProofJsonRecord = JsonRecord;

export type TrustCareJwtToken = {
  issuerJwt: string;
  disclosures: string[];
};

export type DataIntegrityProofStatus = {
  present: boolean;
  verified: boolean;
  summary: string;
  warnings: string[];
  errors?: string[];
  cryptosuite?: string;
  proofPurpose?: string;
  verificationMethod?: string;
  jwksUrl?: string;
};

export type DataIntegrityProofVerificationOptions = {
  fetcher?: typeof fetch;
  expectedProofPurpose?: string;
};

type SupportedDataIntegrityCryptosuite = "ecdsa-jcs-2019" | "eddsa-jcs-2022";

type DataIntegrityProofInput = {
  cryptosuite?: SupportedDataIntegrityCryptosuite;
  created?: string;
  expires?: string;
  verificationMethod: string;
  proofPurpose?: string;
  domain?: string;
  challenge?: string;
  privateKeyJwk: JWK;
};

export const TRUSTCARE_STANDARD_JWKS_ORIGINS = [
  "https://trustcarehealth.live",
  "https://www.trustcarehealth.live",
];

export const W3C_VC_JWT_MEDIA_TYPE = "application/vc+jwt";
export const W3C_VP_JWT_MEDIA_TYPE = "application/vp+jwt";

type JwtArtifactKind = "vc" | "vp";

export type TrustCareJwksCandidateResult = {
  candidates: string[];
  warnings: string[];
};

export function jsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function splitJwtToken(value: string): TrustCareJwtToken | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("eyJ")) return null;
  const [issuerJwt, ...disclosures] = trimmed.split("~");
  const parts = issuerJwt.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  return {
    issuerJwt,
    disclosures: disclosures.filter(Boolean),
  };
}

export function looksLikeJwt(value: string): boolean {
  return Boolean(splitJwtToken(value));
}

export function securedJwtDataUrl(jwt: string, kind: JwtArtifactKind): string {
  const mediaType =
    kind === "vc" ? W3C_VC_JWT_MEDIA_TYPE : W3C_VP_JWT_MEDIA_TYPE;
  return `data:${mediaType},${encodeURIComponent(jwt)}`;
}

export function envelopedVerifiableCredentialFromJwt(jwt: string): JsonRecord {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: securedJwtDataUrl(jwt, "vc"),
    type: ["VerifiableCredential", "EnvelopedVerifiableCredential"],
  };
}

export function envelopedVerifiablePresentationFromJwt(
  jwt: string,
): JsonRecord {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: securedJwtDataUrl(jwt, "vp"),
    type: ["VerifiablePresentation", "EnvelopedVerifiablePresentation"],
  };
}

export function jwtFromSecuredDataUrl(
  value: string,
  kind?: JwtArtifactKind,
): string | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return null;
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex < 0) return null;
  const metadata = trimmed.slice("data:".length, commaIndex).toLowerCase();
  const encoded = trimmed.slice(commaIndex + 1);
  const [mediaType, ...parameters] = metadata.split(";");
  const allowed =
    kind === "vc"
      ? [W3C_VC_JWT_MEDIA_TYPE]
      : kind === "vp"
        ? [W3C_VP_JWT_MEDIA_TYPE]
        : [W3C_VC_JWT_MEDIA_TYPE, W3C_VP_JWT_MEDIA_TYPE, "application/jwt"];
  if (!allowed.includes(mediaType)) return null;
  try {
    const jwt = parameters.includes("base64")
      ? atob(encoded)
      : decodeURIComponent(encoded);
    return looksLikeJwt(jwt) ? jwt : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseJsonObject(value: string): JsonRecord | null {
  try {
    return jsonRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseJwtPayload(value: string): JsonRecord | null {
  const token = splitJwtToken(jwtFromSecuredDataUrl(value) ?? value);
  if (!token) return null;
  try {
    return parseJsonObject(decodeBase64Url(token.issuerJwt.split(".")[1]));
  } catch {
    return null;
  }
}

export function extractJwtFromJson(
  value: JsonRecord | null,
  keys: string[],
  kind?: JwtArtifactKind,
): string | null {
  if (!value) return null;
  const idJwt =
    typeof value.id === "string" ? jwtFromSecuredDataUrl(value.id, kind) : null;
  if (idJwt) return idJwt;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate !== "string") continue;
    const securedJwt = jwtFromSecuredDataUrl(candidate, kind);
    if (securedJwt) return securedJwt;
    if (looksLikeJwt(candidate)) return candidate;
  }
  const nested =
    jsonRecord(value.payload) ??
    jsonRecord(value.result) ??
    jsonRecord(value.data);
  return nested ? extractJwtFromJson(nested, keys, kind) : null;
}

export function extractPresentationJwt(
  value: JsonRecord | null,
): string | null {
  return extractJwtFromJson(
    value,
    ["jwt", "vpJwt", "presentationJwt", "token"],
    "vp",
  );
}

export function extractCredentialJwt(value: unknown): string | null {
  if (typeof value === "string") {
    return (
      jwtFromSecuredDataUrl(value, "vc") ?? (looksLikeJwt(value) ? value : null)
    );
  }
  const object = jsonRecord(value);
  if (!object) return null;
  return extractJwtFromJson(object, ["jwt", "vcJwt", "sdJwtVc"], "vc");
}

export function unwrapVcPayload(value: unknown): JsonRecord | null {
  if (typeof value === "string") {
    const payload = parseJwtPayload(value);
    return payload ? unwrapVcPayload(payload) : null;
  }
  const object = jsonRecord(value);
  if (!object) return null;
  const securedJwt =
    typeof object.id === "string"
      ? jwtFromSecuredDataUrl(object.id, "vc")
      : null;
  if (securedJwt) {
    const payload = parseJwtPayload(securedJwt);
    return payload ? unwrapVcPayload(payload) : null;
  }
  return isVerifiableCredential(object) ? object : null;
}

export function unwrapVpPayload(value: unknown): JsonRecord | null {
  return unwrapVpPayloadInner(value, new Set<unknown>());
}

function unwrapVpPayloadInner(
  value: unknown,
  seen: Set<unknown>,
): JsonRecord | null {
  if (typeof value === "string") {
    return (
      unwrapVpPayloadInner(parseJsonObject(value), seen) ??
      unwrapVpPayloadInner(parseJwtPayload(value), seen)
    );
  }
  const object = jsonRecord(value);
  if (!object) return null;
  if (seen.has(object)) return null;
  seen.add(object);
  const securedJwt =
    typeof object.id === "string"
      ? jwtFromSecuredDataUrl(object.id, "vp")
      : null;
  if (securedJwt) {
    const payload = parseJwtPayload(securedJwt);
    const vp = unwrapVpPayloadInner(payload, seen);
    if (vp) return vp;
  }
  if (isVerifiablePresentation(object)) return object;

  const nestedKeys = [
    "payload",
    "presentation",
    "verifiablePresentation",
    "data",
    "json",
  ];
  for (const key of nestedKeys) {
    const nested = object[key];
    if (typeof nested === "string") {
      const fromJson = unwrapVpPayloadInner(parseJsonObject(nested), seen);
      if (fromJson) return fromJson;
      const fromJwt = unwrapVpPayloadInner(parseJwtPayload(nested), seen);
      if (fromJwt) return fromJwt;
      continue;
    }
    const vp = unwrapVpPayloadInner(nested, seen);
    if (vp) return vp;
  }

  const result = jsonRecord(object.result);
  if (result) {
    const vp = unwrapVpPayloadInner(result.data, seen);
    if (vp) return vp;
  }
  return null;
}

export function isVerifiableCredential(value: JsonRecord): boolean {
  const type = value.type;
  return Array.isArray(type)
    ? type.map(String).includes("VerifiableCredential")
    : type === "VerifiableCredential";
}

export function isVerifiablePresentation(value: JsonRecord): boolean {
  const type = value.type;
  return Array.isArray(type)
    ? type.map(String).includes("VerifiablePresentation")
    : type === "VerifiablePresentation";
}

export function firstCredentialIssuer(
  credentials: unknown[],
): string | undefined {
  for (const credential of credentials) {
    const vc = unwrapVcPayload(credential) ?? jsonRecord(credential);
    const issuer = credentialIssuerName(vc);
    if (issuer) return issuer;
  }
  return undefined;
}

export function credentialIssuerName(
  value: JsonRecord | null,
): string | undefined {
  if (!value) return undefined;
  const issuer = value.issuer;
  if (typeof issuer === "string") return issuer;
  const issuerObject = jsonRecord(issuer);
  return (
    stringOrUndefined(issuerObject?.name) ?? stringOrUndefined(issuerObject?.id)
  );
}

export function documentTypesFromCredentials(credentials: unknown[]): string[] {
  const values = credentials
    .map((credential) =>
      lastCredentialType(unwrapVcPayload(credential) ?? jsonRecord(credential)),
    )
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(values));
}

export function lastCredentialType(
  credential: JsonRecord | null,
): string | undefined {
  if (!credential) return undefined;
  const type = credential.type;
  if (Array.isArray(type)) {
    const values = type
      .map(String)
      .filter(
        (item) =>
          item !== "VerifiableCredential" && item !== "VerifiablePresentation",
      );
    return values[values.length - 1];
  }
  return typeof type === "string" ? type : undefined;
}

export function audienceSummary(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return undefined;
}

export function proofLooksUsable(proof: unknown): boolean {
  if (!proof) return false;
  const proofs = Array.isArray(proof) ? proof : [proof];
  return proofs.some((entry) => {
    const object = jsonRecord(entry);
    if (!object) return false;
    const type = String(object.type ?? object.proofPurpose ?? "").toLowerCase();
    const value = String(
      object.proofValue ?? object.jws ?? object.signature ?? "",
    ).toLowerCase();
    if (!type && !value) return false;
    const joined = `${type} ${value}`;
    return (
      !joined.includes("placeholder") &&
      !joined.includes("test_proof_value_only")
    );
  });
}

export function hasVerifiableProof(value: JsonRecord): boolean {
  return proofLooksUsable(value.proof);
}

export function assessDataIntegrityProof(
  value: JsonRecord,
): DataIntegrityProofStatus {
  const present = proofLooksUsable(value.proof);
  return {
    present,
    verified: false,
    summary: present ? proofSummary(value) : "not present",
    warnings: present
      ? [
          "Data Integrity proof is present, but TrustCare has not performed cryptosuite/key-material verification for this artifact.",
        ]
      : [],
  };
}

export async function verifyDataIntegrityProof(
  value: JsonRecord,
  options: DataIntegrityProofVerificationOptions = {},
): Promise<DataIntegrityProofStatus> {
  const proofs = dataIntegrityProofEntries(value.proof);
  if (!proofs.length) {
    return {
      present: false,
      verified: false,
      summary: "not present",
      warnings: [],
      errors: [],
    };
  }

  const attempts: DataIntegrityProofStatus[] = [];
  for (const proof of proofs) {
    attempts.push(await verifySingleDataIntegrityProof(value, proof, options));
  }
  const verified = attempts.find((attempt) => attempt.verified);
  if (verified) return verified;

  return {
    present: true,
    verified: false,
    summary:
      attempts.map((attempt) => attempt.summary).filter(Boolean)[0] ??
      "DataIntegrityProof",
    cryptosuite: attempts.find((attempt) => attempt.cryptosuite)?.cryptosuite,
    proofPurpose: attempts.find((attempt) => attempt.proofPurpose)
      ?.proofPurpose,
    verificationMethod: attempts.find((attempt) => attempt.verificationMethod)
      ?.verificationMethod,
    warnings: uniqueStrings(attempts.flatMap((attempt) => attempt.warnings)),
    errors: uniqueStrings(attempts.flatMap((attempt) => attempt.errors ?? [])),
  };
}

export async function createDataIntegrityProof(
  document: JsonRecord,
  input: DataIntegrityProofInput,
): Promise<JsonRecord> {
  const cryptosuite = input.cryptosuite ?? "ecdsa-jcs-2019";
  const proof = stripUndefinedRecord({
    type: "DataIntegrityProof",
    cryptosuite,
    created: input.created ?? new Date().toISOString(),
    expires: input.expires,
    verificationMethod: input.verificationMethod,
    proofPurpose: input.proofPurpose ?? "assertionMethod",
    domain: input.domain,
    challenge: input.challenge,
    "@context": document["@context"],
  });
  const signingData = await buildJcsDataIntegritySigningData(document, proof);
  const signature = await signDataIntegrityBytes(
    signingData,
    input.privateKeyJwk,
    cryptosuite,
  );
  return {
    ...proof,
    proofValue: `z${base58Encode(signature)}`,
  };
}

async function verifySingleDataIntegrityProof(
  document: JsonRecord,
  proof: JsonRecord,
  options: DataIntegrityProofVerificationOptions,
): Promise<DataIntegrityProofStatus> {
  const cryptosuite = stringOrUndefined(proof.cryptosuite);
  const proofPurpose = stringOrUndefined(proof.proofPurpose);
  const verificationMethod = stringOrUndefined(proof.verificationMethod);
  const summary = `${stringOrUndefined(proof.type) ?? "DataIntegrityProof"} / ${cryptosuite ?? "unknown cryptosuite"}`;
  const warnings: string[] = [];
  const errors: string[] = [];
  const supportedCryptosuite = isSupportedDataIntegrityCryptosuite(cryptosuite)
    ? cryptosuite
    : undefined;

  if (proof.type !== "DataIntegrityProof") {
    errors.push("Proof type is not DataIntegrityProof.");
  }
  if (!supportedCryptosuite) {
    errors.push(
      cryptosuite
        ? `Unsupported Data Integrity cryptosuite ${cryptosuite}. TrustCare currently verifies ecdsa-jcs-2019 and eddsa-jcs-2022.`
        : "Data Integrity proof is missing cryptosuite.",
    );
  }
  if (
    options.expectedProofPurpose &&
    proofPurpose !== options.expectedProofPurpose
  ) {
    errors.push(
      `Data Integrity proofPurpose ${proofPurpose ?? "-"} does not match ${options.expectedProofPurpose}.`,
    );
  }
  const proofValue = stringOrUndefined(proof.proofValue);
  if (!proofValue) errors.push("Data Integrity proof is missing proofValue.");
  if (!verificationMethod) {
    errors.push("Data Integrity proof is missing verificationMethod.");
  }
  if (
    errors.length ||
    !supportedCryptosuite ||
    !proofValue ||
    !verificationMethod
  ) {
    return {
      present: true,
      verified: false,
      summary,
      cryptosuite,
      proofPurpose,
      verificationMethod,
      warnings,
      errors,
    };
  }

  try {
    const signature = decodeMultibaseBase58Btc(proofValue);
    const signingData = await buildJcsDataIntegritySigningData(document, proof);
    const resolved = await resolveDataIntegrityVerificationMethod(
      verificationMethod,
      options,
    );
    if (!resolved) {
      return {
        present: true,
        verified: false,
        summary,
        cryptosuite,
        proofPurpose,
        verificationMethod,
        warnings,
        errors: [
          `Could not resolve Data Integrity verificationMethod ${verificationMethod}.`,
        ],
      };
    }
    const verified = await verifyDataIntegrityBytes(
      signingData,
      signature,
      resolved.jwk,
      supportedCryptosuite,
    );
    return {
      present: true,
      verified,
      summary,
      cryptosuite,
      proofPurpose,
      verificationMethod,
      jwksUrl: resolved.sourceUrl,
      warnings,
      errors: verified
        ? []
        : ["Data Integrity signature did not verify against the resolved key."],
    };
  } catch (error) {
    return {
      present: true,
      verified: false,
      summary,
      cryptosuite,
      proofPurpose,
      verificationMethod,
      warnings,
      errors: [
        error instanceof Error
          ? error.message
          : "Data Integrity verification failed.",
      ],
    };
  }
}

async function buildJcsDataIntegritySigningData(
  document: JsonRecord,
  proof: JsonRecord,
): Promise<Uint8Array> {
  const unsecuredDocument = stripProofForDataIntegrity(document);
  const proofConfig = stripUndefinedRecord({ ...proof });
  delete proofConfig.proofValue;
  delete proofConfig.jws;
  if (proofConfig["@context"]) {
    unsecuredDocument["@context"] = proofConfig["@context"];
  }
  const proofConfigHash = await sha256Bytes(
    new TextEncoder().encode(jcsCanonicalize(proofConfig)),
  );
  const documentHash = await sha256Bytes(
    new TextEncoder().encode(jcsCanonicalize(unsecuredDocument)),
  );
  return concatBytes(proofConfigHash, documentHash);
}

async function resolveDataIntegrityVerificationMethod(
  verificationMethod: string,
  options: DataIntegrityProofVerificationOptions,
): Promise<{ jwk: JWK; sourceUrl?: string } | null> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") return null;

  const parsedUrl = parseUrl(verificationMethod);
  const directUrl =
    parsedUrl?.protocol === "https:" || parsedUrl?.protocol === "http:"
      ? parsedUrl
      : null;
  const candidates = directUrl
    ? [removeUrlHash(directUrl)]
    : didWebDocumentCandidates(verificationMethod);
  for (const url of candidates) {
    const payload = await fetchJsonObject(url, fetcher);
    if (!payload) continue;
    const jwk = jwkFromVerificationDocument(payload, verificationMethod);
    if (jwk) return { jwk, sourceUrl: url };
  }

  for (const url of didWebJwksCandidates(didFromVerificationMethodId(verificationMethod))) {
    const payload = await fetchJsonObject(url, fetcher);
    if (!payload) continue;
    const jwk = jwksToKeys(payload).find((key) =>
      keyMatchesKid(key, verificationMethod),
    );
    if (jwk) return { jwk, sourceUrl: url };
  }
  return null;
}

function jwkFromVerificationDocument(
  payload: JsonRecord,
  verificationMethod: string,
): JWK | null {
  const directJwk = payload.kty ? (payload as JWK) : null;
  if (directJwk) {
    return {
      ...directJwk,
      kid: stringOrUndefined(directJwk.kid) ?? verificationMethod,
    };
  }
  const keys = jwksToKeys(payload);
  return (
    keys.find((key) => keyMatchesKid(key, verificationMethod)) ??
    jwkFromDidVerificationMethod(payload, verificationMethod)
  );
}

function jwkFromDidVerificationMethod(
  payload: JsonRecord,
  verificationMethod: string,
): JWK | null {
  const methods = Array.isArray(payload.verificationMethod)
    ? payload.verificationMethod
    : [];
  for (const method of methods) {
    const object = jsonRecord(method);
    if (!object) continue;
    const id = stringOrUndefined(object.id);
    if (!id || !keyMatchesKid({ kid: id }, verificationMethod)) continue;
    const jwk = jsonRecord(object.publicKeyJwk);
    if (!jwk) continue;
    return {
      ...(jwk as JWK),
      kid: stringOrUndefined(jwk.kid) ?? id,
    };
  }
  return null;
}

async function fetchJsonObject(
  url: string,
  fetcher: typeof fetch,
): Promise<JsonRecord | null> {
  try {
    const response = await fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    return jsonRecord(await response.json());
  } catch {
    return null;
  }
}

function didWebDocumentCandidates(verificationMethod: string): string[] {
  const did = didFromVerificationMethodId(verificationMethod);
  if (!did?.startsWith("did:web:")) return [];
  const parts = did
    .slice("did:web:".length)
    .split(":")
    .map(decodeURIComponent);
  const host = parts[0];
  if (!host) return [];
  const pathParts = parts.slice(1).filter(Boolean);
  if (!pathParts.length) return [`https://${host}/.well-known/did.json`];
  return [`https://${host}/${pathParts.join("/")}/did.json`];
}

function didFromVerificationMethodId(id: string): string | undefined {
  if (!id.startsWith("did:")) return undefined;
  return id.split("#")[0];
}

function removeUrlHash(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  return copy.href;
}

async function signDataIntegrityBytes(
  data: Uint8Array,
  privateKeyJwk: JWK,
  cryptosuite: SupportedDataIntegrityCryptosuite,
): Promise<Uint8Array> {
  const key = await importDataIntegrityKey(privateKeyJwk, cryptosuite, [
    "sign",
  ]);
  const signature = await globalThis.crypto.subtle.sign(
    dataIntegrityAlgorithm(cryptosuite),
    key,
    strictUint8Array(data),
  );
  return new Uint8Array(signature);
}

async function verifyDataIntegrityBytes(
  data: Uint8Array,
  signature: Uint8Array,
  publicKeyJwk: JWK,
  cryptosuite: SupportedDataIntegrityCryptosuite,
): Promise<boolean> {
  const key = await importDataIntegrityKey(publicKeyJwk, cryptosuite, [
    "verify",
  ]);
  return globalThis.crypto.subtle.verify(
    dataIntegrityAlgorithm(cryptosuite),
    key,
    strictUint8Array(signature),
    strictUint8Array(data),
  );
}

async function importDataIntegrityKey(
  jwk: JWK,
  cryptosuite: SupportedDataIntegrityCryptosuite,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  if (cryptosuite === "ecdsa-jcs-2019") {
    return globalThis.crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      usages,
    );
  }
  return globalThis.crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "Ed25519" },
    false,
    usages,
  );
}

function dataIntegrityAlgorithm(
  cryptosuite: SupportedDataIntegrityCryptosuite,
): AlgorithmIdentifier | EcdsaParams {
  return cryptosuite === "ecdsa-jcs-2019"
    ? { name: "ECDSA", hash: "SHA-256" }
    : { name: "Ed25519" };
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    strictUint8Array(bytes),
  );
  return new Uint8Array(digest);
}

function strictUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

function stripProofForDataIntegrity(value: JsonRecord): JsonRecord {
  const copy = deepJsonClone(value);
  delete copy.proof;
  return copy;
}

function deepJsonClone(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function stripUndefinedRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function jcsCanonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JCS cannot canonicalize non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcsCanonicalize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonRecord)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${jcsCanonicalize(item)}`)
      .join(",")}}`;
  }
  throw new Error(`JCS cannot canonicalize ${typeof value}.`);
}

function dataIntegrityProofEntries(proof: unknown): JsonRecord[] {
  const proofs = Array.isArray(proof) ? proof : proof ? [proof] : [];
  return proofs
    .map(jsonRecord)
    .filter((entry): entry is JsonRecord =>
      Boolean(entry && proofLooksUsable(entry)),
    );
}

function isSupportedDataIntegrityCryptosuite(
  cryptosuite: string | undefined,
): cryptosuite is SupportedDataIntegrityCryptosuite {
  return cryptosuite === "ecdsa-jcs-2019" || cryptosuite === "eddsa-jcs-2022";
}

function decodeMultibaseBase58Btc(value: string): Uint8Array {
  if (!value.startsWith("z")) {
    throw new Error("Data Integrity proofValue must use base58btc multibase.");
  }
  return base58Decode(value.slice(1));
}

const BASE58_BTC_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits
    .reverse()
    .map((digit) => BASE58_BTC_ALPHABET[digit])
    .join("");
}

function base58Decode(value: string): Uint8Array {
  if (!value.length) return new Uint8Array();
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58_BTC_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("Invalid base58btc proofValue.");
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const item = bytes[index] * 58 + carry;
      bytes[index] = item & 0xff;
      carry = item >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function proofSummary(value: JsonRecord): string {
  const proof = Array.isArray(value.proof) ? value.proof[0] : value.proof;
  const proofObject = jsonRecord(proof);
  const trustcare = jsonRecord(value.trustcare);
  return String(
    proofObject?.type ??
      trustcare?.signatureStatus ??
      trustcare?.signingStatus ??
      "proof present",
  );
}

export function walletCardHasCryptographicProof(
  card: Pick<
    WalletCard,
    | "credentialProof"
    | "credentialJwt"
    | "credentialData"
    | "portalVerification"
  >,
): boolean {
  const credentialData = jsonRecord(card.credentialData);
  const hasProofMaterial = Boolean(
    card.credentialProof?.jwt ??
    card.credentialJwt ??
    (credentialData ? hasVerifiableProof(credentialData) : false),
  );
  return hasProofMaterial && card.portalVerification?.verified === true;
}

export function buildTrustCareJwksCandidates(input: {
  header: JsonRecord;
  payload: JsonRecord;
  sourceUrl: string;
  trustcareOrigins?: string[];
}): string[] {
  return buildTrustCareJwksCandidateResult(input).candidates;
}

export function buildTrustCareJwksCandidateResult(input: {
  header: JsonRecord;
  payload: JsonRecord;
  sourceUrl: string;
  trustcareOrigins?: string[];
}): TrustCareJwksCandidateResult {
  const candidates = new Set<string>();
  const warnings: string[] = [];
  const trustcareOrigins =
    input.trustcareOrigins ?? TRUSTCARE_STANDARD_JWKS_ORIGINS;
  const trustedOrigins = trustcareOrigins.map(normalizeOrigin);
  const source = parseUrl(input.sourceUrl);
  const sourceOrigin = source?.origin;
  const issuerOrigin = didWebIssuerOrigin(stringOrUndefined(input.payload.iss));
  const allowedJkuOrigins = new Set(
    [sourceOrigin, issuerOrigin, ...trustedOrigins].filter(
      (origin): origin is string => Boolean(origin),
    ),
  );
  const allowPrivateJwks =
    source !== null && isPrivateOrLoopbackHost(source.hostname);
  const jku = stringOrUndefined(input.header.jku);
  if (jku) {
    const decision = trustCareJkuDecision({
      jku,
      allowedOrigins: allowedJkuOrigins,
      allowPrivateJwks,
    });
    if (decision.ok) {
      candidates.add(decision.url);
    } else {
      warnings.push(`JWT header jku ${jku} was rejected: ${decision.reason}.`);
    }
  }
  if (source) {
    candidates.add(`${source.origin}/api/share-gateway/.well-known/jwks.json`);
    candidates.add(`${source.origin}/.well-known/jwks.json`);
  }
  for (const url of didWebJwksCandidates(
    stringOrUndefined(input.payload.iss),
    trustcareOrigins,
  )) {
    candidates.add(url);
  }
  for (const origin of trustcareOrigins) {
    candidates.add(`${normalizeOrigin(origin)}/.well-known/jwks.json`);
  }
  return {
    candidates: Array.from(candidates),
    warnings,
  };
}

export function didWebJwksCandidates(
  issuer: string | undefined,
  trustcareOrigins = TRUSTCARE_STANDARD_JWKS_ORIGINS,
): string[] {
  if (!issuer?.startsWith("did:web:")) return [];
  const parts = issuer
    .slice("did:web:".length)
    .split(":")
    .map(decodeURIComponent);
  const host = parts[0];
  if (!host) return [];
  const pathParts = parts.slice(1).filter(Boolean);
  const candidates = new Set<string>();
  candidates.add(`https://${host}/.well-known/jwks.json`);
  if (pathParts.length) {
    const didPath = pathParts.join("/");
    candidates.add(`https://${host}/${didPath}/did/jwks.json`);
    candidates.add(`https://${host}/${didPath}/jwks.json`);
    candidates.add(`https://${host}/${didPath}/did.json`);
  }
  const hospitalIndex = pathParts.findIndex(
    (part) => part.toLowerCase() === "hospital",
  );
  const hospitalCode =
    hospitalIndex >= 0 ? pathParts[hospitalIndex + 1] : undefined;
  if (hospitalCode) {
    const code = encodeURIComponent(hospitalCode.toLowerCase());
    for (const portalOrigin of trustcareOrigins) {
      const origin = normalizeOrigin(portalOrigin);
      candidates.add(`${origin}/hospital/${code}/did/jwks.json`);
      candidates.add(`${origin}/hospital/${code}/did.json`);
    }
  }
  return Array.from(candidates);
}

export function jwksToKeys(payload: JsonRecord): JWK[] {
  if (Array.isArray(payload.keys)) return payload.keys as JWK[];
  if (payload.kty) return [payload as JWK];
  const methods = Array.isArray(payload.verificationMethod)
    ? payload.verificationMethod
    : [];
  return methods
    .map((method) => {
      const object = jsonRecord(method);
      const jwk = jsonRecord(object?.publicKeyJwk);
      if (!jwk) return null;
      return {
        ...jwk,
        kid:
          stringOrUndefined(jwk.kid) ??
          stringOrUndefined(object?.id) ??
          stringOrUndefined(payload.id),
      } as JWK;
    })
    .filter((value): value is JWK => Boolean(value));
}

export function keyMatchesKid(key: JWK, kid: string): boolean {
  const keyKid = stringOrUndefined(key.kid);
  if (!keyKid) return false;
  if (keyKid === kid) return true;
  const keyFragment = keyKid.split("#").at(-1);
  const requestedFragment = kid.split("#").at(-1);
  return Boolean(
    keyFragment &&
    requestedFragment &&
    (keyFragment === requestedFragment ||
      keyKid.endsWith(`#${requestedFragment}`) ||
      kid.endsWith(`#${keyFragment}`)),
  );
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function didWebIssuerOrigin(issuer: string | undefined): string | undefined {
  if (!issuer?.startsWith("did:web:")) return undefined;
  const host = issuer
    .slice("did:web:".length)
    .split(":")
    .map(decodeURIComponent)[0];
  if (!host) return undefined;
  const parsed = parseUrl(`https://${host}`);
  return parsed?.origin;
}

function trustCareJkuDecision(input: {
  jku: string;
  allowedOrigins: Set<string>;
  allowPrivateJwks: boolean;
}): { ok: true; url: string } | { ok: false; reason: string } {
  const parsed = parseUrl(input.jku);
  if (!parsed) return { ok: false, reason: "not an absolute URL" };
  const origin = normalizeOrigin(parsed.origin);
  const privateOrLoopback = isPrivateOrLoopbackHost(parsed.hostname);
  if (privateOrLoopback && !input.allowPrivateJwks) {
    return {
      ok: false,
      reason: "private or loopback JWKS origins are not allowed here",
    };
  }
  if (parsed.protocol !== "https:") {
    if (!(parsed.protocol === "http:" && privateOrLoopback)) {
      return { ok: false, reason: "JWKS URLs must use HTTPS" };
    }
  }
  if (!input.allowedOrigins.has(origin)) {
    return {
      ok: false,
      reason:
        "origin is not the VP source, issuer DID, or trusted TrustCare origin",
    };
  }
  return { ok: true, url: parsed.href };
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const ipv4 = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [first, second] = ipv4.slice(1, 3).map(Number);
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
