export const TRUSTCARE_DIRECT_DOCUMENT_PROFILE_VERSION =
  "2026.07.trustcare-vc-jose-direct.v1" as const;

export const W3C_CREDENTIALS_V2_CONTEXT =
  "https://www.w3.org/ns/credentials/v2" as const;
export const VC_JWT_MEDIA_TYPE = "application/vc+jwt" as const;

export type JsonDocument = Record<string, unknown>;

export type TrustCareCredentialStatusEntry = {
  id: string;
  type: "BitstringStatusListEntry";
  statusPurpose: "revocation" | "suspension";
  statusListIndex: number;
  statusListCredential: string;
};

const OPTIONAL_JOSE_CLAIMS = new Set([
  "iss",
  "sub",
  "aud",
  "jti",
  "iat",
  "exp",
  "nbf",
  "vct",
  "trustcare_claim_digest",
  "trustcare_disclosure_digests",
]);

/**
 * Returns the VC Data Model document carried directly by a VC JOSE payload.
 * Optional JOSE claims are not part of the unsecured VC document and are
 * removed only for exact comparison with Wallet Exchange credentialData.
 */
export function directCredentialDocument(payload: JsonDocument): JsonDocument {
  assertNoLegacyWrapper(payload);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !OPTIONAL_JOSE_CLAIMS.has(key)),
  );
}

export function trustCareCredentialIssuerDid(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  const issuer = recordValue(value);
  return requireText(issuer?.id, "VC issuer.id");
}

export function assertTrustCareDirectCredential(input: {
  payload: JsonDocument;
  expectedIssuerDid?: string;
  expectedHolderDid?: string;
  now?: Date;
  clockSkewSeconds?: number;
}): {
  document: JsonDocument;
  issuerDid: string;
  holderDid: string;
  statusEntries: TrustCareCredentialStatusEntry[];
} {
  const payload = input.payload;
  assertNoLegacyWrapper(payload);
  assertBaseDocument(payload, "VerifiableCredential");
  const issuerDid = trustCareCredentialIssuerDid(payload.issuer);
  const optionalIssuer = optionalText(payload.iss, "VC JWT iss");
  if (optionalIssuer && optionalIssuer !== issuerDid) {
    throw new Error("VC JWT iss conflicts with the signed VC issuer.");
  }
  if (input.expectedIssuerDid && issuerDid !== input.expectedIssuerDid) {
    throw new Error("Signed VC issuer does not match the resolved Portal issuer.");
  }
  const subject = recordValue(payload.credentialSubject);
  const holderDid = requireText(subject?.id, "VC credentialSubject.id");
  if (input.expectedHolderDid && holderDid !== input.expectedHolderDid) {
    throw new Error("VC credentialSubject.id does not match the Wallet holder.");
  }
  if (!recordValue(subject?.data)) {
    throw new Error("VC credentialSubject.data is required by the TrustCare profile.");
  }

  const validFrom = requiredDate(payload.validFrom, "VC validFrom");
  const validUntil = requiredDate(payload.validUntil, "VC validUntil");
  if (validUntil <= validFrom) {
    throw new Error("VC validUntil must be later than VC validFrom.");
  }
  const now = (input.now ?? new Date()).getTime();
  const skew = (input.clockSkewSeconds ?? 60) * 1_000;
  if (validFrom > now + skew) throw new Error("VC is not valid yet.");
  if (validUntil <= now - skew) throw new Error("VC has expired.");

  const statusEntries = credentialStatusEntries(payload.credentialStatus);
  assertCredentialSchema(payload.credentialSchema);
  return {
    document: directCredentialDocument(payload),
    issuerDid,
    holderDid,
    statusEntries,
  };
}

export function assertTrustCareDirectPresentation(input: {
  payload: JsonDocument;
  expectedHolderDid?: string;
  expectedAudience?: string;
  expectedRecipient?: string;
  expectedPurpose?: string;
  expectedConsentRef?: string;
  now?: Date;
  clockSkewSeconds?: number;
}): {
  holderDid: string;
  presentationId: string;
  credentialJwts: string[];
  trustcare: JsonDocument;
} {
  const payload = input.payload;
  assertNoLegacyWrapper(payload);
  assertBaseDocument(payload, "VerifiablePresentation");
  const holderDid = requireText(
    typeof payload.holder === "string"
      ? payload.holder
      : recordValue(payload.holder)?.id,
    "VP holder",
  );
  if (!holderDid.startsWith("did:key:")) {
    throw new Error("TrustCare Holder VP must use a Wallet-controlled did:key.");
  }
  const optionalIssuer = optionalText(payload.iss, "VP JWT iss");
  if (optionalIssuer && optionalIssuer !== holderDid) {
    throw new Error("VP JWT iss conflicts with the signed VP holder.");
  }
  if (input.expectedHolderDid && holderDid !== input.expectedHolderDid) {
    throw new Error("Signed VP holder does not match the expected Wallet holder.");
  }
  const presentationId = requireText(payload.id, "VP id");
  const purpose = requireText(payload.purpose, "VP purpose");
  const trustcare = recordValue(payload.trustcare);
  if (!trustcare) throw new Error("VP trustcare binding is required.");
  const audience = requireAbsoluteUri(trustcare.audience, "VP audience");
  const recipient = requireAbsoluteUri(trustcare.recipient, "VP recipient");
  const consentRef = requireText(trustcare.consentRef, "VP consent reference");
  requireText(trustcare.context, "VP service context");
  if (input.expectedAudience && audience !== input.expectedAudience) {
    throw new Error("VP audience does not match the requested verifier.");
  }
  if (input.expectedRecipient && recipient !== input.expectedRecipient) {
    throw new Error("VP recipient does not match the requested recipient.");
  }
  if (input.expectedPurpose && purpose !== input.expectedPurpose) {
    throw new Error("VP purpose does not match the requested purpose.");
  }
  if (input.expectedConsentRef && consentRef !== input.expectedConsentRef) {
    throw new Error("VP consent reference does not match the active consent.");
  }
  const issuedAt = requiredDate(trustcare.issuedAt, "VP trustcare.issuedAt");
  const expiresAt = requiredDate(trustcare.expiresAt, "VP trustcare.expiresAt");
  if (expiresAt <= issuedAt || expiresAt - issuedAt > 15 * 60_000) {
    throw new Error("TrustCare VP validity must be positive and no longer than 15 minutes.");
  }
  const now = (input.now ?? new Date()).getTime();
  const skew = (input.clockSkewSeconds ?? 60) * 1_000;
  if (issuedAt > now + skew) throw new Error("VP was issued in the future.");
  if (expiresAt <= now - skew) throw new Error("VP has expired.");

  const credentials = Array.isArray(payload.verifiableCredential)
    ? payload.verifiableCredential
    : [];
  if (!credentials.length) {
    throw new Error("VP must contain at least one enveloped VC JWT.");
  }
  return {
    holderDid,
    presentationId,
    credentialJwts: credentials.map(extractEnvelopedCredentialJwt),
    trustcare,
  };
}

export function envelopCredentialJwt(jwt: string): {
  "@context": string;
  id: string;
  type: "EnvelopedVerifiableCredential";
} {
  assertCompactJws(jwt, "VC JWT");
  return {
    "@context": "https://www.w3.org/ns/credentials/v2",
    id: `data:${VC_JWT_MEDIA_TYPE},${jwt}`,
    type: "EnvelopedVerifiableCredential",
  };
}

export function extractEnvelopedCredentialJwt(value: unknown): string {
  const envelope = recordValue(value);
  if (!envelope || envelope.type !== "EnvelopedVerifiableCredential") {
    throw new Error("VP credential must be an EnvelopedVerifiableCredential.");
  }
  const prefix = `data:${VC_JWT_MEDIA_TYPE},`;
  const id = requireText(envelope.id, "Enveloped credential id");
  if (!id.startsWith(prefix)) {
    throw new Error(`Enveloped credential id must use data:${VC_JWT_MEDIA_TYPE}.`);
  }
  const jwt = id.slice(prefix.length);
  assertCompactJws(jwt, "Enveloped VC JWT");
  return jwt;
}

export function credentialStatusEntries(
  value: unknown,
): TrustCareCredentialStatusEntry[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  if (!candidates.length) {
    throw new Error("VC credentialStatus is required by the TrustCare profile.");
  }
  return candidates.map((candidate, index) => {
    const entry = recordValue(candidate);
    const statusListIndex = Number(entry?.statusListIndex);
    const statusPurpose = entry?.statusPurpose;
    if (
      !entry ||
      entry.type !== "BitstringStatusListEntry" ||
      (statusPurpose !== "revocation" && statusPurpose !== "suspension") ||
      !Number.isInteger(statusListIndex) ||
      statusListIndex < 0 ||
      statusListIndex >= 131_072
    ) {
      throw new Error(`VC credentialStatus[${index}] is not a valid BitstringStatusListEntry.`);
    }
    return {
      id: requireAbsoluteUri(entry.id, `VC credentialStatus[${index}].id`),
      type: "BitstringStatusListEntry",
      statusPurpose,
      statusListIndex,
      statusListCredential: requireAbsoluteUri(
        entry.statusListCredential,
        `VC credentialStatus[${index}].statusListCredential`,
      ),
    };
  });
}

function assertBaseDocument(
  payload: JsonDocument,
  requiredType: "VerifiableCredential" | "VerifiablePresentation",
): void {
  const contexts = Array.isArray(payload["@context"])
    ? payload["@context"]
    : [payload["@context"]];
  if (contexts[0] !== W3C_CREDENTIALS_V2_CONTEXT) {
    throw new Error("W3C VC v2 base context must be the first @context value.");
  }
  const types = Array.isArray(payload.type) ? payload.type : [payload.type];
  if (!types.includes(requiredType)) {
    throw new Error(`Signed document type must include ${requiredType}.`);
  }
  requireText(payload.id, `${requiredType} id`);
}

function assertNoLegacyWrapper(payload: JsonDocument): void {
  if (
    Object.prototype.hasOwnProperty.call(payload, "vc") ||
    Object.prototype.hasOwnProperty.call(payload, "vp")
  ) {
    throw new Error("W3C VC JOSE payload must not contain vc or vp wrapper claims.");
  }
}

function assertCredentialSchema(value: unknown): void {
  if (value === undefined) return;
  const schemas = Array.isArray(value) ? value : [value];
  for (const [index, candidate] of schemas.entries()) {
    const schema = recordValue(candidate);
    if (!schema) throw new Error(`VC credentialSchema[${index}] must be an object.`);
    requireAbsoluteUri(schema.id, `VC credentialSchema[${index}].id`);
    requireText(schema.type, `VC credentialSchema[${index}].type`);
  }
}

function assertCompactJws(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.split(".").length !== 3 ||
    value.split(".").some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    throw new Error(`${label} must be a compact JWS.`);
  }
}

function recordValue(value: unknown): JsonDocument | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonDocument)
    : null;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, label);
}

function requireAbsoluteUri(value: unknown, label: string): string {
  const text = requireText(value, label);
  try {
    new URL(text);
  } catch {
    if (!text.startsWith("did:")) throw new Error(`${label} must be an absolute URI.`);
  }
  return text;
}

function requiredDate(value: unknown, label: string): number {
  const text = requireText(value, label);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || !text.includes("T")) {
    throw new Error(`${label} must be an XML Schema dateTime value.`);
  }
  return parsed;
}
