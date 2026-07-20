/** Wallet Exchange V2 holder-owned direct presentation. */
import {
  WALLET_EXCHANGE_V2_CONTEXTS,
  type WalletDirectVpTransport,
  type WalletExchangeServiceContext,
} from "@trustcare/contracts";
import { decodeJwt, decodeProtectedHeader } from "jose";
import {
  holderJwsProtectedHeader,
  signHolderCompactJws,
  type HolderSigningIdentity,
} from "./holderIdentity";
import {
  assertTrustCareDirectCredential,
  envelopCredentialJwt,
  trustCareCredentialIssuerDid,
} from "./directDocumentProfile";

export type HolderSignedDirectVpInput = {
  identity: HolderSigningIdentity;
  /** Optional caller assertion. It must identify the supplied signing key. */
  holderDid?: string;
  audience: string;
  recipient: string;
  /** Live versioned TrustCare JSON-LD context from validated Portal discovery. */
  credentialContext?: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  /** OID4VP authorization request nonce. It is signed into the VP binding. */
  nonce?: string;
  presentationId?: string;
  /** Issuer-signed compact VC JWTs. Their exact bytes and order are retained. */
  credentialJwts: readonly string[];
  now?: Date;
  expiresAt?: Date | string;
};

export type HolderSignedDirectVpPayload = {
  "@context": ["https://www.w3.org/ns/credentials/v2", string];
  id: string;
  type: ["VerifiablePresentation", "TrustcarePatientPresentation"];
  holder: string;
  purpose: string;
  trustcare: {
    context: WalletExchangeServiceContext;
    consentRef: string;
    recipient: string;
    audience: string;
    nonce?: string;
    issuedAt: string;
    expiresAt: string;
  };
  verifiableCredential: ReturnType<typeof envelopCredentialJwt>[];
};

export type HolderSignedDirectVp = {
  vpJwt: string;
  payload: HolderSignedDirectVpPayload;
  transport: WalletDirectVpTransport;
};

export type HolderSignedShlAssociationVpInput = {
  identity: HolderSigningIdentity;
  audience: string;
  recipient: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  shlId: number;
  manifestHash: `sha256:${string}`;
  sourceBundleHash: `sha256:${string}`;
  manifestCredentialId: string;
  /** Exact Portal-signed Manifest VC compact JWS bytes. */
  manifestCredentialJwt: string;
  presentationId?: string;
  now?: Date;
  expiresAt?: Date | string;
};

export type HolderSignedShlAssociationVpPayload = {
  "@context": ["https://www.w3.org/ns/credentials/v2", string];
  id: string;
  type: ["VerifiablePresentation", "TrustcareShlAssociationPresentation"];
  holder: string;
  purpose: string;
  trustcare: {
    context: WalletExchangeServiceContext;
    consentRef: string;
    recipient: string;
    audience: string;
    issuedAt: string;
    expiresAt: string;
    shl: {
      packageId: string;
      manifestHash: `sha256:${string}`;
      sourceBundleHash: `sha256:${string}`;
      manifestCredentialId: string;
    };
  };
  verifiableCredential: [ReturnType<typeof envelopCredentialJwt>];
};

export type HolderSignedShlAssociationVp = {
  vpJwt: string;
  payload: HolderSignedShlAssociationVpPayload;
};

const DIRECT_VP_DEFAULT_LIFETIME_SECONDS = 10 * 60;
const DIRECT_VP_MAX_LIFETIME_SECONDS = 15 * 60;

/**
 * Creates the Wallet-owned outer presentation used by Wallet Exchange v2.
 * Hospital issuer keys never enter this path: every nested VC is retained as
 * its original compact JWT and only the holder's outer VP is newly signed.
 */
export async function createHolderSignedDirectVp(
  input: HolderSignedDirectVpInput,
): Promise<HolderSignedDirectVp> {
  assertNoPortalPatientId(input);
  assertHolderIdentity(input.identity, input.holderDid);

  const now = input.now ?? new Date();
  const issuedAt = numericDateSeconds(now, "VP issued-at time");
  const expirationTime = input.expiresAt
    ? numericDateSeconds(
        typeof input.expiresAt === "string"
          ? new Date(input.expiresAt)
          : input.expiresAt,
        "VP expiry",
      )
    : issuedAt + DIRECT_VP_DEFAULT_LIFETIME_SECONDS;
  if (expirationTime <= issuedAt) {
    throw new Error("Holder VP expiry must be later than its issued-at time.");
  }
  if (expirationTime - issuedAt > DIRECT_VP_MAX_LIFETIME_SECONDS) {
    throw new Error("Holder VP lifetime must not exceed 15 minutes.");
  }

  const audience = requireAudience(input.audience);
  const recipient = requireText(input.recipient, "VP recipient", 500);
  const credentialContext = requireCredentialContext(
    input.credentialContext ??
      `${new URL(audience).origin}/contexts/trustcare-credentials-v1.jsonld`,
  );
  const purpose = requireText(input.purpose, "VP purpose", 128);
  const consentRef = requireText(input.consentRef, "VP consent reference", 255);
  const nonce = input.nonce
    ? requireText(input.nonce, "VP authorization nonce", 255)
    : undefined;
  if (!WALLET_EXCHANGE_V2_CONTEXTS.includes(input.context)) {
    throw new Error("Holder VP service context is not supported.");
  }

  if (!Array.isArray(input.credentialJwts) || !input.credentialJwts.length) {
    throw new Error("Holder VP requires at least one issuer-signed VC JWT.");
  }
  const credentialJwts = input.credentialJwts.map((credentialJwt, index) => {
    assertIssuerSignedCredentialJwt(
      credentialJwt,
      input.identity.did,
      index,
      now,
    );
    return credentialJwt;
  });

  const presentationId = input.presentationId
    ? requireText(input.presentationId, "VP presentation ID", 255)
    : `urn:uuid:${freshUuid()}`;
  const issuedAtIso = new Date(issuedAt * 1_000).toISOString();
  const expiresAtIso = new Date(expirationTime * 1_000).toISOString();
  const payload: HolderSignedDirectVpPayload = {
    "@context": ["https://www.w3.org/ns/credentials/v2", credentialContext],
    id: presentationId,
    type: ["VerifiablePresentation", "TrustcarePatientPresentation"],
    holder: input.identity.did,
    purpose,
    trustcare: {
      context: input.context,
      consentRef,
      recipient,
      audience,
      ...(nonce ? { nonce } : {}),
      issuedAt: issuedAtIso,
      expiresAt: expiresAtIso,
    },
    // Retain each issuer-signed VC byte-for-byte in a standard VC envelope.
    verifiableCredential: credentialJwts.map(envelopCredentialJwt),
  };
  const vpJwt = await signHolderCompactJws({
    identity: input.identity,
    protectedHeader: holderJwsProtectedHeader(input.identity, "vp"),
    payload: JSON.stringify(payload),
  });
  return {
    vpJwt,
    payload,
    transport: { mode: "direct_vp", vpJwt },
  };
}

/**
 * Creates the Wallet-owned final VP for a Portal-created SHL. The Wallet signs
 * only the outer presentation and envelopes the exact hospital-signed
 * Manifest VC; it never manufactures or re-signs hospital claims.
 */
export async function createHolderSignedShlAssociationVp(
  input: HolderSignedShlAssociationVpInput,
): Promise<HolderSignedShlAssociationVp> {
  assertNoPortalPatientId(input);
  assertHolderIdentity(input.identity, undefined);
  if (!Number.isInteger(input.shlId) || input.shlId < 1) {
    throw new Error("SHL association package ID must be a positive integer.");
  }
  if (!WALLET_EXCHANGE_V2_CONTEXTS.includes(input.context)) {
    throw new Error("SHL association service context is not supported.");
  }

  const now = input.now ?? new Date();
  const issuedAt = numericDateSeconds(now, "SHL association VP issued-at time");
  const expirationTime = input.expiresAt
    ? numericDateSeconds(
        typeof input.expiresAt === "string"
          ? new Date(input.expiresAt)
          : input.expiresAt,
        "SHL association VP expiry",
      )
    : issuedAt + DIRECT_VP_DEFAULT_LIFETIME_SECONDS;
  if (expirationTime <= issuedAt) {
    throw new Error(
      "SHL association VP expiry must be later than its issued-at time.",
    );
  }
  if (expirationTime - issuedAt > DIRECT_VP_MAX_LIFETIME_SECONDS) {
    throw new Error("SHL association VP lifetime must not exceed 15 minutes.");
  }

  const audience = requireAudience(input.audience);
  const recipient = requireText(
    input.recipient,
    "SHL association recipient",
    700,
  );
  const purpose = requireText(input.purpose, "SHL association purpose", 128);
  const consentRef = requireText(
    input.consentRef,
    "SHL association consent reference",
    255,
  );
  const manifestCredentialId = requireText(
    input.manifestCredentialId,
    "Manifest Credential ID",
    500,
  );
  const manifestHash = requireSha256Digest(input.manifestHash, "manifest hash");
  const sourceBundleHash = requireSha256Digest(
    input.sourceBundleHash,
    "source bundle hash",
  );

  assertIssuerSignedCredentialJwt(
    input.manifestCredentialJwt,
    input.identity.did,
    0,
    now,
  );
  assertManifestCredentialBinding({
    jwt: input.manifestCredentialJwt,
    holderDid: input.identity.did,
    recipient,
    context: input.context,
    purpose,
    consentRef,
    shlId: input.shlId,
    manifestHash,
    sourceBundleHash,
    manifestCredentialId,
  });

  const presentationId = input.presentationId
    ? requireText(input.presentationId, "SHL association presentation ID", 255)
    : `urn:uuid:${freshUuid()}`;
  const payload: HolderSignedShlAssociationVpPayload = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      `${new URL(audience).origin}/contexts/trustcare-credentials-v1.jsonld`,
    ],
    id: presentationId,
    type: ["VerifiablePresentation", "TrustcareShlAssociationPresentation"],
    holder: input.identity.did,
    purpose,
    trustcare: {
      context: input.context,
      consentRef,
      recipient,
      audience,
      issuedAt: new Date(issuedAt * 1_000).toISOString(),
      expiresAt: new Date(expirationTime * 1_000).toISOString(),
      shl: {
        packageId: String(input.shlId),
        manifestHash,
        sourceBundleHash,
        manifestCredentialId,
      },
    },
    verifiableCredential: [envelopCredentialJwt(input.manifestCredentialJwt)],
  };
  return {
    payload,
    vpJwt: await signHolderCompactJws({
      identity: input.identity,
      protectedHeader: holderJwsProtectedHeader(input.identity, "vp"),
      payload: JSON.stringify(payload),
    }),
  };
}
function assertHolderIdentity(
  identity: HolderSigningIdentity,
  assertedHolderDid: string | undefined,
): void {
  if (!identity.did.startsWith("did:key:")) {
    throw new Error("Holder VP signer must use a Wallet-owned did:key.");
  }
  if (assertedHolderDid !== undefined && assertedHolderDid !== identity.did) {
    throw new Error("Holder VP signer does not match the asserted holder DID.");
  }
}

function requireCredentialContext(value: string): string {
  const context = requireText(value, "TrustCare credential context", 500);
  const parsed = new URL(context);
  if (
    (parsed.protocol !== "https:" && !isLoopbackHost(parsed.hostname)) ||
    !parsed.pathname.endsWith("/contexts/trustcare-credentials-v1.jsonld")
  ) {
    throw new Error(
      "Holder VP requires the versioned HTTPS TrustCare credential context.",
    );
  }
  return parsed.toString();
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}
function assertIssuerSignedCredentialJwt(
  value: unknown,
  holderDid: string,
  index: number,
  now: Date,
): asserts value is string {
  const label = `Nested credential ${index + 1}`;
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be an issuer-signed compact VC JWT string.`);
  }
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    throw new Error(`${label} must be an issuer-signed compact VC JWT string.`);
  }

  let header: ReturnType<typeof decodeProtectedHeader>;
  let payload: ReturnType<typeof decodeJwt>;
  try {
    header = decodeProtectedHeader(value);
    payload = decodeJwt(value);
  } catch {
    throw new Error(`${label} is not a valid compact VC JWT envelope.`);
  }
  assertNoPortalPatientId(header);
  assertNoPortalPatientId(payload);
  if (
    typeof header.alg !== "string" ||
    !header.alg ||
    header.alg.toLowerCase() === "none" ||
    typeof header.kid !== "string" ||
    !header.kid
  ) {
    throw new Error(`${label} has no accountable issuer signature header.`);
  }
  if (
    header.typ !== "vc+jwt" ||
    header.cty !== "vc" ||
    Object.prototype.hasOwnProperty.call(payload, "vc")
  ) {
    throw new Error(`${label} is not a direct W3C VC-JWT payload.`);
  }
  const issuerDid = trustCareCredentialIssuerDid(payload.issuer);
  if (!header.kid.startsWith(`${issuerDid}#`)) {
    throw new Error(`${label} kid is not controlled by its signed VC issuer.`);
  }
  try {
    assertTrustCareDirectCredential({
      payload: payload as Record<string, unknown>,
      expectedIssuerDid: issuerDid,
      expectedHolderDid: holderDid,
      now,
    });
  } catch (error) {
    throw new Error(
      `${label} ${error instanceof Error ? error.message : "is not a valid TrustCare VC."}`,
    );
  }
}

function assertManifestCredentialBinding(input: {
  jwt: string;
  holderDid: string;
  recipient: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  shlId: number;
  manifestHash: `sha256:${string}`;
  sourceBundleHash: `sha256:${string}`;
  manifestCredentialId: string;
}): void {
  const payload = decodeJwt(input.jwt);
  const types = Array.isArray(payload.type) ? payload.type : [payload.type];
  if (!types.includes("ShlManifestCredential")) {
    throw new Error("Manifest VC type must include ShlManifestCredential.");
  }
  if (payload.id !== input.manifestCredentialId) {
    throw new Error("Manifest VC id does not match the SHL association.");
  }
  if (trustCareCredentialIssuerDid(payload.issuer) !== input.recipient) {
    throw new Error("Manifest VC issuer does not match the SHL recipient.");
  }
  const subject = recordValue(payload.credentialSubject);
  if (subject?.id !== input.holderDid) {
    throw new Error(
      "Manifest VC holder does not match the SHL association signer.",
    );
  }
  const claims = recordValue(subject?.data);
  if (!claims) {
    throw new Error("Manifest VC credentialSubject.data is required.");
  }
  if (String(claims.smartHealthLinkId) !== String(input.shlId)) {
    throw new Error(
      "Manifest VC smartHealthLinkId does not match the SHL package.",
    );
  }
  if (claims.manifestHash !== input.manifestHash) {
    throw new Error("Manifest VC manifestHash does not match the SHL package.");
  }
  if (claims.sourceBundleHash !== input.sourceBundleHash) {
    throw new Error(
      "Manifest VC sourceBundleHash does not match the SHL package.",
    );
  }
  if (claims.context !== input.context || claims.purpose !== input.purpose) {
    throw new Error(
      "Manifest VC context or purpose does not match the SHL association.",
    );
  }
  if (claims.consentRef !== input.consentRef) {
    throw new Error("Manifest VC consent does not match the SHL association.");
  }
  const hospital = recordValue(claims.hospital);
  if (hospital?.did !== input.recipient) {
    throw new Error(
      "Manifest VC hospital DID does not match the SHL recipient.",
    );
  }
  const manifestUrl = requireAudience(
    requireText(claims.manifestUrl, "Manifest VC manifest URL", 1_000),
  );
  const trustcare = recordValue(payload.trustcare);
  if (trustcare?.intendedAudience !== manifestUrl) {
    throw new Error(
      "Manifest VC audience does not match its signed manifest URL.",
    );
  }
}

function assertNoPortalPatientId(value: unknown): void {
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
        throw new Error("Portal patientId is forbidden in Wallet VP input.");
      }
      visit(nested);
    }
  };
  visit(value);
}

function requireAudience(value: string): string {
  const audience = requireText(value, "VP audience", 700);
  let parsed: URL;
  try {
    parsed = new URL(audience);
  } catch {
    throw new Error("VP audience must be an absolute HTTPS URL.");
  }
  const localHostname =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && localHostname)
  ) {
    throw new Error("VP audience must be an absolute HTTPS URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("VP audience must not contain user credentials.");
  }
  return audience;
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

function requireSha256Digest(value: string, label: string): `sha256:${string}` {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`SHL association ${label} must be a SHA-256 digest.`);
  }
  return value as `sha256:${string}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericDateSeconds(value: Date, label: string): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be a valid date.`);
  }
  return Math.floor(milliseconds / 1_000);
}

function freshUuid(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("WebCrypto is required to create a fresh holder VP ID.");
  }
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
