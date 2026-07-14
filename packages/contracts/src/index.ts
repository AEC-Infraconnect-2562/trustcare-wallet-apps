import {
  TrustCareContractError,
  type TrustCareValidationIssue,
} from "./validation";

export {
  TrustCareContractError,
  type TrustCareValidationIssue,
} from "./validation";

export type ShareGatewayMode =
  "portal_backend" | "local_dev_gateway" | "trustcare_production_gateway";

export type ShareGatewayArtifactKind =
  | "vp"
  | "standard_shl_manifest"
  | "certified_shl_manifest"
  | "manifest_vp"
  | "manifest_credential"
  | "shl_file";

export type ShareGatewayAccessPolicyContract = {
  expiresAt?: string;
  passcodeRequired?: boolean;
  passcodeHint?: string | null;
  maxAccessCount?: number;
  accessCodeDelivery?: string;
};

export type ShareGatewayPublicationRequestContract = {
  artifactId: string;
  kind: ShareGatewayArtifactKind;
  contentType: string;
  payload: unknown;
  ownerUserId?: string | number;
  holderDid?: string;
  context?: string;
  purpose?: string;
  recipient?: string;
  expiresAt?: string;
  accessPolicy?: ShareGatewayAccessPolicyContract;
  trustcare?: Record<string, unknown>;
};

export type ShareGatewayPublicationResponseContract = {
  ok: boolean;
  mode: ShareGatewayMode;
  artifactId: string;
  kind: ShareGatewayArtifactKind;
  publicUrl?: string;
  qrPayload?: string;
  manifestUrl?: string;
  jwksUrl?: string;
  warnings: string[];
  errors: string[];
};

export type WalletSyncResponseContract = {
  credentials: unknown[];
  presentations?: unknown[];
  syncedAt?: string;
  total?: number;
  hasMore?: boolean;
  nextSince?: string | null;
  error?: { message?: string; code?: string } | string;
  message?: string;
};

export type CredentialProofEnvelopeContract = {
  type?: string | null;
  format?: string | null;
  jwt?: string | null;
  alg?: string | null;
  kid?: string | null;
  jku?: string | null;
  issuer?: string | null;
  proof?: unknown;
  warnings?: string[];
  errors?: string[];
};

export type VerifierResultContract = {
  verified: boolean;
  trustLevel: string;
  protocol: string;
  issuer?: string;
  requestSummary?: string;
  warnings: string[];
  errors: string[];
  [key: string]: unknown;
};

export type Oid4vciIssuerMetadataContract = {
  credential_issuer: string;
  credential_endpoint: string;
  token_endpoint: string;
  jwks?: { keys: unknown[] };
  jwks_uri?: string;
  credential_configurations_supported: Record<string, unknown>;
  [key: string]: unknown;
};

export type Oid4vciTokenResponseContract = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  c_nonce?: string;
  c_nonce_expires_in?: number;
  [key: string]: unknown;
};

export function assertShareGatewayPublicationRequest(
  value: unknown,
): ShareGatewayPublicationRequestContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  requireString(object, "artifactId", issues);
  requireOneOf(
    object,
    "kind",
    [
      "vp",
      "standard_shl_manifest",
      "certified_shl_manifest",
      "manifest_vp",
      "manifest_credential",
      "shl_file",
    ],
    issues,
  );
  requireString(object, "contentType", issues);
  if (!("payload" in object)) {
    issues.push({ path: "payload", message: "is required" });
  }
  optionalString(object, "holderDid", issues);
  optionalString(object, "context", issues);
  optionalString(object, "purpose", issues);
  optionalString(object, "recipient", issues);
  optionalString(object, "expiresAt", issues);
  validateStringArrayRecord(object, "trustcare", issues);
  if (
    object.accessPolicy !== undefined &&
    !objectRecordOrNull(object.accessPolicy)
  ) {
    issues.push({ path: "accessPolicy", message: "must be an object" });
  }
  assertNoIssues("ShareGatewayPublicationRequest", issues);
  return object as ShareGatewayPublicationRequestContract;
}

export function assertShareGatewayPublicationResponse(
  value: unknown,
): ShareGatewayPublicationResponseContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  requireBoolean(object, "ok", issues);
  requireOneOf(
    object,
    "mode",
    ["portal_backend", "local_dev_gateway", "trustcare_production_gateway"],
    issues,
  );
  requireString(object, "artifactId", issues);
  requireOneOf(
    object,
    "kind",
    [
      "vp",
      "standard_shl_manifest",
      "certified_shl_manifest",
      "manifest_vp",
      "manifest_credential",
      "shl_file",
    ],
    issues,
  );
  optionalString(object, "publicUrl", issues);
  optionalString(object, "qrPayload", issues);
  optionalString(object, "manifestUrl", issues);
  optionalString(object, "jwksUrl", issues);
  requireStringArray(object, "warnings", issues);
  requireStringArray(object, "errors", issues);
  assertNoIssues("ShareGatewayPublicationResponse", issues);
  return object as ShareGatewayPublicationResponseContract;
}

export function assertWalletSyncResponse(
  value: unknown,
): WalletSyncResponseContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  if (!Array.isArray(object.credentials)) {
    issues.push({ path: "credentials", message: "must be an array" });
  }
  optionalArray(object, "presentations", issues);
  optionalString(object, "syncedAt", issues);
  optionalNumber(object, "total", issues);
  optionalBoolean(object, "hasMore", issues);
  if (
    object.nextSince !== undefined &&
    object.nextSince !== null &&
    typeof object.nextSince !== "string"
  ) {
    issues.push({ path: "nextSince", message: "must be a string or null" });
  }
  assertNoIssues("WalletSyncResponse", issues);
  return {
    ...object,
    credentials: object.credentials as unknown[],
  } as WalletSyncResponseContract;
}

export function assertCredentialProofEnvelope(
  value: unknown,
): CredentialProofEnvelopeContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  for (const key of ["type", "format", "jwt", "alg", "kid", "jku", "issuer"]) {
    optionalNullableString(object, key, issues);
  }
  optionalStringArray(object, "warnings", issues);
  optionalStringArray(object, "errors", issues);
  if (!object.jwt && !object.proof && !object.type) {
    issues.push({
      path: "$",
      message: "must include jwt, proof, or proof type",
    });
  }
  assertNoIssues("CredentialProofEnvelope", issues);
  return object as CredentialProofEnvelopeContract;
}

export function assertVerifierResult(value: unknown): VerifierResultContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  requireBoolean(object, "verified", issues);
  requireString(object, "trustLevel", issues);
  requireString(object, "protocol", issues);
  optionalString(object, "issuer", issues);
  optionalString(object, "requestSummary", issues);
  requireStringArray(object, "warnings", issues);
  requireStringArray(object, "errors", issues);
  assertNoIssues("VerifierResult", issues);
  return object as VerifierResultContract;
}

export function assertOid4vciIssuerMetadata(
  value: unknown,
): Oid4vciIssuerMetadataContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  requireString(object, "credential_issuer", issues);
  requireString(object, "credential_endpoint", issues);
  requireString(object, "token_endpoint", issues);
  optionalString(object, "jwks_uri", issues);
  const jwks = objectRecordOrNull(object.jwks);
  if (!object.jwks_uri && (!jwks || !Array.isArray(jwks.keys))) {
    issues.push({
      path: "jwks",
      message: "must include jwks_uri or jwks.keys",
    });
  }
  if (!objectRecordOrNull(object.credential_configurations_supported)) {
    issues.push({
      path: "credential_configurations_supported",
      message: "must be an object",
    });
  }
  assertNoIssues("Oid4vciIssuerMetadata", issues);
  return object as Oid4vciIssuerMetadataContract;
}

export function assertOid4vciTokenResponse(
  value: unknown,
): Oid4vciTokenResponseContract {
  const issues: TrustCareValidationIssue[] = [];
  const object = objectRecord(value);
  requireString(object, "access_token", issues);
  requireString(object, "token_type", issues);
  optionalNumber(object, "expires_in", issues);
  optionalString(object, "c_nonce", issues);
  optionalNumber(object, "c_nonce_expires_in", issues);
  assertNoIssues("Oid4vciTokenResponse", issues);
  return object as Oid4vciTokenResponseContract;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TrustCareContractError("TrustCareContract", [
      { path: "$", message: "must be an object" },
    ]);
  }
  return value as Record<string, unknown>;
}

function objectRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (typeof object[key] !== "string" || !String(object[key]).trim()) {
    issues.push({ path: key, message: "must be a non-empty string" });
  }
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== undefined && typeof object[key] !== "string") {
    issues.push({ path: key, message: "must be a string" });
  }
}

function optionalNullableString(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (
    object[key] !== undefined &&
    object[key] !== null &&
    typeof object[key] !== "string"
  ) {
    issues.push({ path: key, message: "must be a string or null" });
  }
}

function requireBoolean(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (typeof object[key] !== "boolean") {
    issues.push({ path: key, message: "must be a boolean" });
  }
}

function optionalBoolean(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== undefined && typeof object[key] !== "boolean") {
    issues.push({ path: key, message: "must be a boolean" });
  }
}

function optionalNumber(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== undefined && typeof object[key] !== "number") {
    issues.push({ path: key, message: "must be a number" });
  }
}

function requireStringArray(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (!Array.isArray(object[key])) {
    issues.push({ path: key, message: "must be an array" });
    return;
  }
  if ((object[key] as unknown[]).some((item) => typeof item !== "string")) {
    issues.push({ path: key, message: "must contain only strings" });
  }
}

function optionalStringArray(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] === undefined) return;
  requireStringArray(object, key, issues);
}

function optionalArray(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== undefined && !Array.isArray(object[key])) {
    issues.push({ path: key, message: "must be an array" });
  }
}

function requireOneOf(
  object: Record<string, unknown>,
  key: string,
  allowed: string[],
  issues: TrustCareValidationIssue[],
) {
  if (
    typeof object[key] !== "string" ||
    !allowed.includes(String(object[key]))
  ) {
    issues.push({ path: key, message: `must be one of ${allowed.join(", ")}` });
  }
}

function validateStringArrayRecord(
  object: Record<string, unknown>,
  key: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== undefined && !objectRecordOrNull(object[key])) {
    issues.push({ path: key, message: "must be an object" });
  }
}

function assertNoIssues(
  contractName: string,
  issues: TrustCareValidationIssue[],
) {
  if (issues.length) throw new TrustCareContractError(contractName, issues);
}

export * from "./walletExchangeV2";
export * from "./clinicalDocumentGraphV2";
