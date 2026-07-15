import {
  compactVerify,
  decodeProtectedHeader,
  importJWK,
  type JWK,
} from "jose";
import { gunzipSync } from "fflate";
import {
  assertTrustCareDirectCredential,
  credentialStatusEntries,
  trustCareCredentialIssuerDid,
} from "@trustcare/wallet-core";
import { TrustCareApiError } from "./errors";
import { normalizePortalOrigin } from "./walletContractLoader";

export const TRUSTCARE_PORTAL_HOSPITAL_CODES = ["TCC", "TCP", "TCM"] as const;
export type TrustCarePortalHospitalCode =
  (typeof TRUSTCARE_PORTAL_HOSPITAL_CODES)[number];

export type PortalDidVerificationMethod = {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk: JWK;
};

export type PortalHospitalDidDocument = {
  id: string;
  verificationMethod: PortalDidVerificationMethod[];
  assertionMethod: string[];
  authentication?: string[];
  trustcare?: {
    hospitalCode: string;
    name?: string;
    nameEn?: string;
    syntheticTestData?: boolean;
  };
};

export type PortalHospitalJwks = {
  keys: JWK[];
  issuer: string;
  hospitalCode: string;
};

export type ResolvedPortalHospitalIssuer = {
  portalOrigin: string;
  hospitalCode: TrustCarePortalHospitalCode;
  issuerDid: string;
  didUrl: string;
  jwksUrl: string;
  didDocument: PortalHospitalDidDocument;
  jwks: PortalHospitalJwks;
  activeAssertionMethod: PortalDidVerificationMethod;
};

export type PortalCredentialJwtVerification = {
  verified: boolean;
  issuerDid?: string;
  kid?: string;
  alg?: string;
  status: "active" | "revoked" | "suspended" | "expired" | "unknown";
  payload?: Record<string, unknown>;
  errors: string[];
};

export async function resolvePortalHospitalIssuer(input: {
  portalBaseUrl: string;
  hospitalCode: string;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedPortalHospitalIssuer> {
  const portalOrigin = normalizePortalOrigin(input.portalBaseUrl);
  const hospitalCode = normalizeHospitalCode(input.hospitalCode);
  const code = hospitalCode.toLowerCase();
  const didUrl = `${portalOrigin}/hospital/${code}/did.json`;
  const jwksUrl = `${portalOrigin}/hospital/${code}/did/jwks.json`;
  const fetcher = input.fetchImpl ?? fetch;
  const [didResponse, jwksResponse] = await Promise.all([
    fetcher(didUrl, {
      headers: { accept: "application/did+json, application/json" },
    }),
    fetcher(jwksUrl, { headers: { accept: "application/json" } }),
  ]);
  const didDocument = await strictJson<PortalHospitalDidDocument>(
    didResponse,
    `Portal DID document ${hospitalCode}`,
  );
  const jwks = await strictJson<PortalHospitalJwks>(
    jwksResponse,
    `Portal JWKS ${hospitalCode}`,
  );
  const issuerDid = requireDiscoveredIssuerDid(didDocument.id);

  if (
    (didDocument.trustcare !== undefined &&
      (didDocument.trustcare.hospitalCode !== hospitalCode ||
        didDocument.trustcare.syntheticTestData === true)) ||
    jwks.issuer !== issuerDid ||
    jwks.hospitalCode !== hospitalCode
  ) {
    throw issuerError(
      "Portal hospital issuer identity does not match its origin.",
    );
  }
  if (
    !Array.isArray(didDocument.verificationMethod) ||
    !Array.isArray(didDocument.assertionMethod) ||
    didDocument.assertionMethod.length < 1 ||
    !Array.isArray(jwks.keys)
  ) {
    throw issuerError("Portal hospital DID/JWKS shape is incomplete.");
  }
  const activeId = didDocument.assertionMethod[0];
  const activeAssertionMethod = didDocument.verificationMethod.find(
    (method) => method.id === activeId,
  );
  if (!activeAssertionMethod) {
    throw issuerError("Portal active assertion method is missing.");
  }
  if (
    activeAssertionMethod.publicKeyJwk.kty !== "EC" ||
    activeAssertionMethod.publicKeyJwk.crv !== "P-256" ||
    activeAssertionMethod.publicKeyJwk.alg !== "ES256" ||
    activeAssertionMethod.publicKeyJwk.use !== "sig"
  ) {
    throw issuerError(
      "Portal active assertion key is not the required ES256 signing key.",
    );
  }
  for (const method of didDocument.verificationMethod) {
    if (
      method.controller !== issuerDid ||
      method.publicKeyJwk?.kid !== method.id
    ) {
      throw issuerError("Portal verification method controller is invalid.");
    }
    const matchingKey = jwks.keys.find((key) => key.kid === method.id);
    if (!matchingKey || !samePublicJwk(matchingKey, method.publicKeyJwk)) {
      throw issuerError("Portal DID document and JWKS do not match.");
    }
  }

  return {
    portalOrigin,
    hospitalCode,
    issuerDid,
    didUrl,
    jwksUrl,
    didDocument,
    jwks,
    activeAssertionMethod,
  };
}

export async function resolveAllPortalHospitalIssuers(input: {
  portalBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedPortalHospitalIssuer[]> {
  return Promise.all(
    TRUSTCARE_PORTAL_HOSPITAL_CODES.map((hospitalCode) =>
      resolvePortalHospitalIssuer({ ...input, hospitalCode }),
    ),
  );
}

export async function verifyPortalHospitalCredentialJwt(input: {
  jwt: string;
  issuer: ResolvedPortalHospitalIssuer;
  expectedHolderDid?: string;
  expectedCredentialData?: Record<string, unknown>;
  profile?: "portal_credential" | "shl_manifest_credential";
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PortalCredentialJwtVerification> {
  const errors: string[] = [];
  try {
    const protectedHeader = decodeProtectedHeader(input.jwt);
    const kid =
      typeof protectedHeader.kid === "string" ? protectedHeader.kid : "";
    const alg =
      typeof protectedHeader.alg === "string" ? protectedHeader.alg : "";
    const typ =
      typeof protectedHeader.typ === "string" ? protectedHeader.typ : "";
    const cty =
      typeof protectedHeader.cty === "string" ? protectedHeader.cty : "";
    const jwk = input.issuer.jwks.keys.find(
      (candidate) => candidate.kid === kid,
    );
    if (
      !kid ||
      !jwk ||
      !kid.startsWith(`${input.issuer.issuerDid}#`) ||
      alg !== "ES256" ||
      jwk.alg !== "ES256" ||
      typ.toLowerCase() !== "vc+jwt" ||
      cty !== "vc"
    ) {
      throw issuerError(
        "Credential kid is not governed by the Portal hospital DID.",
      );
    }
    const method = input.issuer.didDocument.verificationMethod.find(
      (candidate) => candidate.id === kid,
    );
    if (!method || method.controller !== input.issuer.issuerDid) {
      throw issuerError("Credential signing key controller is not the signed issuer.");
    }
    const key = await importJWK(jwk, String(jwk.alg ?? "ES256"));
    const verified = await compactVerify(input.jwt, key, {
      algorithms: ["ES256"],
    });
    const payload = JSON.parse(
      new TextDecoder().decode(verified.payload),
    ) as Record<string, unknown>;
    const direct = assertTrustCareDirectCredential({
      payload,
      expectedIssuerDid: input.issuer.issuerDid,
      expectedHolderDid: input.expectedHolderDid,
      now: input.now,
    });
    const credential = direct.document;
    if (!hasValidIssuanceAuthorityBinding(credential)) {
      errors.push("credential_issuance_authority_invalid");
    }
    if (input.profile !== "shl_manifest_credential") {
      const declaredDigest = stringValue(payload.trustcare_claim_digest);
      const actualDigest = await sha256Canonical(credential);
      if (declaredDigest && declaredDigest !== actualDigest) {
        errors.push("credential_claim_digest_mismatch");
      }
    }
    if (
      input.expectedCredentialData &&
      canonicalJson(input.expectedCredentialData) !== canonicalJson(credential)
    ) {
      errors.push("credential_payload_mismatch");
    }
    if (
      input.expectedHolderDid &&
      typeof payload.sub === "string" &&
      payload.sub !== input.expectedHolderDid
    ) {
      errors.push("credential_holder_mismatch");
    }
    const status = await credentialLifecycleStatus({
      credential,
      payload,
      issuer: input.issuer,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    if (status !== "active") errors.push(`credential_status_${status}`);
    return {
      verified: errors.length === 0,
      issuerDid: input.issuer.issuerDid,
      kid,
      alg,
      status,
      payload,
      errors,
    };
  } catch (error) {
    return {
      verified: false,
      issuerDid: input.issuer.issuerDid,
      status: "unknown",
      errors: [
        error instanceof Error ? error.message : "credential_verify_failed",
      ],
    };
  }
}

function normalizeHospitalCode(value: string): TrustCarePortalHospitalCode {
  const normalized = value.trim().toUpperCase();
  if (
    !TRUSTCARE_PORTAL_HOSPITAL_CODES.includes(
      normalized as TrustCarePortalHospitalCode,
    )
  ) {
    throw issuerError(`Unsupported TrustCare hospital code: ${value}`);
  }
  return normalized as TrustCarePortalHospitalCode;
}

function requireDiscoveredIssuerDid(value: string): string {
  if (typeof value !== "string" || !value.startsWith("did:web:")) {
    throw issuerError(
      "Portal hospital issuer DID is missing or invalid.",
    );
  }
  return value;
}

async function strictJson<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = await response.json().catch(() => null);
  if (
    !response.ok ||
    !/^[a-z0-9!#$&^_.+-]+\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(
      contentType,
    ) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new TrustCareApiError(`${label} is unavailable or invalid.`, {
      status: response.status,
      code: "portal_issuer_resolution_failed",
    });
  }
  return payload as T;
}

function samePublicJwk(left: JWK, right: JWK): boolean {
  return (
    left.kty === right.kty &&
    left.crv === right.crv &&
    left.x === right.x &&
    left.y === right.y &&
    left.alg === right.alg
  );
}

async function credentialLifecycleStatus(input: {
  credential: Record<string, unknown>;
  payload: Record<string, unknown>;
  issuer: ResolvedPortalHospitalIssuer;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<PortalCredentialJwtVerification["status"]> {
  const now = input.now ?? new Date();
  const credential = input.credential;
  const payload = input.payload;
  const expires =
    stringValue(credential.validUntil) ??
    stringValue(credential.expirationDate) ??
    (typeof payload.exp === "number"
      ? new Date(payload.exp * 1000).toISOString()
      : undefined);
  if (expires && Date.parse(expires) <= now.getTime()) return "expired";
  try {
    const results = await Promise.all(
      credentialStatusEntries(credential.credentialStatus).map((entry) =>
        verifyStatusEntry({
          entry,
          issuer: input.issuer,
          fetchImpl: input.fetchImpl,
          now,
        }),
      ),
    );
    if (results.some((result) => result === "revoked")) return "revoked";
    if (results.some((result) => result === "suspended")) return "suspended";
    return "active";
  } catch {
    return "unknown";
  }
}

async function verifyStatusEntry(input: {
  entry: ReturnType<typeof credentialStatusEntries>[number];
  issuer: ResolvedPortalHospitalIssuer;
  fetchImpl?: typeof fetch;
  now: Date;
}): Promise<"active" | "revoked" | "suspended"> {
  const url = new URL(input.entry.statusListCredential);
  if (
    url.origin !== input.issuer.portalOrigin ||
    !url.pathname.startsWith("/api/credentials/status-lists/") ||
    url.username ||
    url.password
  ) {
    throw issuerError("Credential status-list URL is outside the Portal trust boundary.");
  }
  const response = await (input.fetchImpl ?? fetch)(url, {
    headers: { accept: "application/vc+jwt" },
    redirect: "error",
    cache: "no-store",
  });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!response.ok || !contentType.startsWith("application/vc+jwt")) {
    throw issuerError("Credential status list is unavailable or has the wrong media type.");
  }
  const jwt = await response.text();
  const header = decodeProtectedHeader(jwt);
  if (
    header.alg !== "ES256" ||
    header.typ !== "vc+jwt" ||
    header.cty !== "vc" ||
    typeof header.kid !== "string" ||
    !input.issuer.didDocument.verificationMethod.some(
      (candidate) => candidate.id === header.kid,
    )
  ) {
    throw issuerError("Status-list VC protected header is invalid.");
  }
  const method = input.issuer.didDocument.verificationMethod.find(
    (candidate) => candidate.id === header.kid,
  );
  const jwk = input.issuer.jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!method || method.controller !== input.issuer.issuerDid || !jwk) {
    throw issuerError("Status-list signing key is not controlled by the issuer.");
  }
  const verified = await compactVerify(
    jwt,
    await importJWK(jwk, "ES256"),
    { algorithms: ["ES256"] },
  );
  const payload = JSON.parse(new TextDecoder().decode(verified.payload)) as Record<
    string,
    unknown
  >;
  if (
    Object.prototype.hasOwnProperty.call(payload, "vc") ||
    Object.prototype.hasOwnProperty.call(payload, "vp")
  ) {
    throw issuerError("Status-list VC must use direct W3C VC JOSE claims.");
  }
  const issuerDid = trustCareCredentialIssuerDid(payload.issuer);
  if (
    issuerDid !== input.issuer.issuerDid ||
    (typeof payload.iss === "string" && payload.iss !== issuerDid) ||
    payload.id !== input.entry.statusListCredential
  ) {
    throw issuerError("Status-list VC issuer or id binding is invalid.");
  }
  const types = Array.isArray(payload.type) ? payload.type : [payload.type];
  const contexts = Array.isArray(payload["@context"])
    ? payload["@context"]
    : [payload["@context"]];
  const subject = objectRecord(payload.credentialSubject);
  const validFrom = Date.parse(String(payload.validFrom ?? ""));
  const validUntil = Date.parse(String(payload.validUntil ?? ""));
  if (
    contexts[0] !== "https://www.w3.org/ns/credentials/v2" ||
    !types.includes("VerifiableCredential") ||
    !types.includes("BitstringStatusListCredential") ||
    subject.type !== "BitstringStatusList" ||
    subject.statusPurpose !== input.entry.statusPurpose ||
    typeof subject.encodedList !== "string" ||
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil) ||
    validFrom > input.now.getTime() + 60_000 ||
    validUntil <= input.now.getTime() - 60_000
  ) {
    throw issuerError("Status-list VC profile or validity is invalid.");
  }
  const compressed = base64UrlBytes(subject.encodedList.slice(1));
  if (!subject.encodedList.startsWith("u")) {
    throw issuerError("Status-list encodedList is not multibase base64url.");
  }
  const bitstring = gunzipSync(compressed);
  if (bitstring.length < 16_384) {
    throw issuerError("Status list has fewer than 131072 entries.");
  }
  const active = Boolean(
    bitstring[Math.floor(input.entry.statusListIndex / 8)] &
      (1 << (7 - (input.entry.statusListIndex % 8))),
  );
  return active ? input.entry.statusPurpose === "revocation" ? "revoked" : "suspended" : "active";
}

function base64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasValidIssuanceAuthorityBinding(
  credential: Record<string, unknown>,
): boolean {
  const subject = objectRecord(credential.credentialSubject);
  const data = objectRecord(subject.data);
  const authority = objectRecord(data.issuanceAuthority);
  const snapshotDigest = stringValue(authority.snapshotDigest);
  const sourcePayloadDigest = stringValue(authority.sourcePayloadDigest);
  const authorityKind = stringValue(authority.authority);
  if (
    authority.version !== "trustcare-issuance-authority-v1" ||
    !authorityKind ||
    !/^[a-f0-9]{64}$/.test(snapshotDigest ?? "") ||
    !/^[a-f0-9]{64}$/.test(sourcePayloadDigest ?? "")
  ) {
    return false;
  }
  if (
    authorityKind === "sandbox_workforce_registry" ||
    (authorityKind.startsWith("sandbox_") &&
      !stringValue(authority.identityCatalogVersion))
  ) {
    return false;
  }
  const evidence = Array.isArray(credential.evidence)
    ? credential.evidence
    : [credential.evidence];
  return evidence.some((entry) => {
    const evidenceData = objectRecord(objectRecord(entry).evidenceData);
    return (
      evidenceData.type === "IssuanceAuthoritySnapshot" &&
      evidenceData.digest === snapshotDigest &&
      Boolean(stringValue(evidenceData.resourceId))
    );
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function issuerError(message: string): TrustCareApiError {
  return new TrustCareApiError(message, {
    code: "portal_issuer_resolution_failed",
  });
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
