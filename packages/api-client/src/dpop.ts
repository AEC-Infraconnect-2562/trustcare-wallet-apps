import {
  holderJwsProtectedHeader,
  signHolderCompactJws,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import { base64url } from "jose";

export type DpopProofClaims = {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  ath: string;
};

export type CreateDpopProofInput = {
  identity: HolderSigningIdentity;
  accessToken: string;
  method: string;
  url: string | URL;
  /** Wall-clock source used before applying clockOffsetSeconds. */
  now?: () => Date;
  /** Server clock adjustment learned by the session/transport layer. */
  clockOffsetSeconds?: number;
};

/**
 * RFC 9449 htu contains the target HTTP URI without query or fragment.
 * URL serialization also normalizes the scheme/host case and default port.
 */
export function canonicalizeDpopHtu(value: string | URL): string {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    throw new Error("DPoP target URL is required.");
  }

  let url: URL;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error("DPoP target URL must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DPoP target URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("DPoP target URL must not contain user credentials.");
  }

  url.search = "";
  url.hash = "";
  return url.href;
}

/** Base64url-encoded SHA-256 hash of the exact access-token bytes. */
export async function calculateDpopAccessTokenHash(
  accessToken: string,
): Promise<string> {
  requireAccessToken(accessToken);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessToken),
  );
  return base64url.encode(new Uint8Array(digest));
}

export async function createDpopProof(
  input: CreateDpopProofInput,
): Promise<string> {
  requireAccessToken(input.accessToken);
  const htm = normalizeHttpMethod(input.method);
  const htu = canonicalizeDpopHtu(input.url);
  const iat = adjustedIssuedAt(input.now, input.clockOffsetSeconds);
  const claims: DpopProofClaims = {
    jti: createProofIdentifier(),
    htm,
    htu,
    iat,
    ath: await calculateDpopAccessTokenHash(input.accessToken),
  };

  return signHolderCompactJws({
    identity: input.identity,
    protectedHeader: holderJwsProtectedHeader(input.identity, "dpop"),
    payload: JSON.stringify(claims),
  });
}

function requireAccessToken(accessToken: string): void {
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new Error("DPoP access token is required.");
  }
}

function normalizeHttpMethod(method: string): string {
  if (typeof method !== "string" || method.trim().length === 0) {
    throw new Error("DPoP HTTP method is required.");
  }
  const normalized = method.trim().toUpperCase();
  if (!/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(normalized)) {
    throw new Error("DPoP HTTP method is not a valid HTTP token.");
  }
  return normalized;
}

function adjustedIssuedAt(
  now: (() => Date) | undefined,
  clockOffsetSeconds: number | undefined,
): number {
  const instant = (now ?? (() => new Date()))();
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new Error("DPoP clock returned an invalid time.");
  }
  const offset = clockOffsetSeconds ?? 0;
  if (!Number.isFinite(offset)) {
    throw new Error("DPoP clock offset must be finite.");
  }
  return Math.floor(instant.getTime() / 1_000 + offset);
}

function createProofIdentifier(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Web Crypto randomUUID is required for DPoP proof jti.");
  }
  return globalThis.crypto.randomUUID();
}
