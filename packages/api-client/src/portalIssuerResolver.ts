import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
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
  trustcare: {
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
  const issuerDid = portalHospitalDid(portalOrigin, hospitalCode);
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

  if (
    didDocument.id !== issuerDid ||
    didDocument.trustcare?.hospitalCode !== hospitalCode ||
    didDocument.trustcare?.syntheticTestData === true ||
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
    didDocument.assertionMethod.length !== 1 ||
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
  now?: Date;
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
    const jwk = input.issuer.jwks.keys.find(
      (candidate) => candidate.kid === kid,
    );
    if (
      !kid ||
      !jwk ||
      kid !== input.issuer.activeAssertionMethod.id ||
      !input.issuer.didDocument.assertionMethod.includes(kid) ||
      !kid.startsWith(`${input.issuer.issuerDid}#`) ||
      alg !== "ES256" ||
      jwk.alg !== "ES256" ||
      typ.toLowerCase() !== "vc+jwt"
    ) {
      throw issuerError(
        "Credential kid is not governed by the Portal hospital DID.",
      );
    }
    const key = await importJWK(jwk, String(jwk.alg ?? "ES256"));
    const verified = await jwtVerify(input.jwt, key, {
      issuer: input.issuer.issuerDid,
      currentDate: input.now,
      algorithms: ["ES256"],
    });
    const payload = verified.payload as Record<string, unknown>;
    const credential = credentialPayload(payload);
    const declaredDigest = stringValue(payload.trustcare_claim_digest);
    const actualDigest = await sha256Canonical(credential);
    if (!declaredDigest || declaredDigest !== actualDigest) {
      errors.push("credential_claim_digest_mismatch");
    }
    if (
      input.expectedCredentialData &&
      canonicalJson(input.expectedCredentialData) !== canonicalJson(credential)
    ) {
      errors.push("credential_payload_mismatch");
    }
    const subject = objectRecord(credential.credentialSubject);
    if (
      input.expectedHolderDid &&
      (subject.id !== input.expectedHolderDid ||
        payload.sub !== input.expectedHolderDid)
    ) {
      errors.push("credential_holder_mismatch");
    }
    const status = credentialLifecycleStatus(credential, payload, input.now);
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

export function portalHospitalDid(
  portalBaseUrl: string,
  hospitalCode: TrustCarePortalHospitalCode,
): string {
  const origin = new URL(normalizePortalOrigin(portalBaseUrl));
  const methodHost = origin.host.replace(/:/g, "%3A");
  return `did:web:${methodHost}:hospital:${hospitalCode.toLowerCase()}`;
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

function credentialPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const vc = objectRecord(payload.vc);
  return Object.keys(vc).length ? vc : payload;
}

function credentialLifecycleStatus(
  credential: Record<string, unknown>,
  payload: Record<string, unknown>,
  now = new Date(),
): PortalCredentialJwtVerification["status"] {
  const expires =
    stringValue(credential.validUntil) ??
    stringValue(credential.expirationDate) ??
    (typeof payload.exp === "number"
      ? new Date(payload.exp * 1000).toISOString()
      : undefined);
  if (expires && Date.parse(expires) <= now.getTime()) return "expired";
  const statusRecord = objectRecord(credential.credentialStatus);
  const raw = (
    stringValue(statusRecord.status) ??
    stringValue(statusRecord.state) ??
    stringValue(credential.credentialStatus) ??
    stringValue(objectRecord(credential.trustcare).status) ??
    ""
  ).toLowerCase();
  if (["active", "valid", "current"].includes(raw)) return "active";
  if (raw === "revoked") return "revoked";
  if (raw === "suspended") return "suspended";
  if (raw === "expired") return "expired";
  return "unknown";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
