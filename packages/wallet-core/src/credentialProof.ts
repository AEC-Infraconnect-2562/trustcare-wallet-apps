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
    "credentialProof" | "credentialJwt" | "credentialData"
  >,
): boolean {
  const credentialData = jsonRecord(card.credentialData);
  return Boolean(
    card.credentialProof?.jwt ??
    card.credentialJwt ??
    (credentialData
      ? assessDataIntegrityProof(credentialData).verified
      : false),
  );
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
