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

export type HolderSignedDirectVpInput = {
  identity: HolderSigningIdentity;
  /** Optional caller assertion. It must identify the supplied signing key. */
  holderDid?: string;
  audience: string;
  recipient: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  /** Issuer-signed compact VC JWTs. Their exact bytes and order are retained. */
  credentialJwts: readonly string[];
  now?: Date;
  expiresAt?: Date | string;
};

export type HolderSignedDirectVpPayload = {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  vp: {
    type: ["VerifiablePresentation"];
    holder: string;
    purpose: string;
    trustcare: {
      context: WalletExchangeServiceContext;
      consentRef: string;
      recipient: string;
      audience: string;
    };
    verifiableCredential: string[];
  };
};

export type HolderSignedDirectVp = {
  vpJwt: string;
  payload: HolderSignedDirectVpPayload;
  transport: WalletDirectVpTransport;
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
  const purpose = requireText(input.purpose, "VP purpose", 128);
  const consentRef = requireText(input.consentRef, "VP consent reference", 255);
  if (!WALLET_EXCHANGE_V2_CONTEXTS.includes(input.context)) {
    throw new Error("Holder VP service context is not supported.");
  }

  if (!Array.isArray(input.credentialJwts) || !input.credentialJwts.length) {
    throw new Error("Holder VP requires at least one issuer-signed VC JWT.");
  }
  const credentialJwts = input.credentialJwts.map((credentialJwt, index) => {
    assertIssuerSignedCredentialJwt(credentialJwt, input.identity.did, index);
    return credentialJwt;
  });

  const payload: HolderSignedDirectVpPayload = {
    iss: input.identity.did,
    sub: input.identity.did,
    aud: audience,
    iat: issuedAt,
    exp: expirationTime,
    jti: `urn:uuid:${freshUuid()}`,
    vp: {
      type: ["VerifiablePresentation"],
      holder: input.identity.did,
      purpose,
      trustcare: {
        context: input.context,
        consentRef,
        recipient,
        audience,
      },
      // Deliberately copy without parsing/re-encoding. The issuer signature is
      // over these exact bytes and the Wallet must not replace it.
      verifiableCredential: credentialJwts,
    },
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

function assertIssuerSignedCredentialJwt(
  value: unknown,
  holderDid: string,
  index: number,
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
  if (typeof payload.iss !== "string" || !payload.iss) {
    throw new Error(`${label} has no issuer claim.`);
  }

  const credential = recordValue(payload.vc) ?? payload;
  const credentialSubject = recordValue(credential.credentialSubject);
  if (credentialSubject?.id !== holderDid) {
    throw new Error(
      `${label} credentialSubject.id does not match the holder did:key.`,
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

function requireText(value: string, label: string, maxLength: number): string {
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
