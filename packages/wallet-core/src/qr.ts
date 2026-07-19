export function isExpired(isoDate?: string | null, now = new Date()): boolean {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() <= now.getTime();
}

export const presentationQrInlineMaxLength = 1800;

/**
 * Direct Holder VP QR is a reference transport. The Wallet must publish the
 * exact signed bytes first and use the immutable HTTPS resolver returned by
 * the Share Gateway; this helper never falls back to an inline JWT or query
 * parameter URL.
 */
export function createPresentationQrPayload(input: {
  origin: string;
  presentationId: string;
  qrData: string;
  expiresAt?: string;
  maxInlineLength?: number;
  selectedFields?: string[];
}): string {
  const raw = input.qrData.trim();
  const resolver = presentationResolver(raw);
  if (!resolver) {
    throw new Error(
      "Holder VP QR requires an immutable HTTPS Share Gateway resolver URL.",
    );
  }
  const expectedOrigin = new URL(input.origin).origin;
  if (
    resolver.url.origin !== expectedOrigin ||
    resolver.artifactId !== input.presentationId
  ) {
    throw new Error(
      "Holder VP QR resolver does not match its publication origin or artifact ID.",
    );
  }
  return resolver.url.toString();
}

export function parseTrustCareQr(raw: string): {
  raw: string;
  presentationId?: string;
  token?: string;
  kind: "vp-url" | "presentation-id" | "jwt" | "json" | "shlink" | "unknown";
} {
  const value = raw.trim();
  if (!value) return { raw, kind: "unknown" };
  if (value.startsWith("shlink:/")) {
    return { raw: value, kind: "shlink", token: value };
  }
  const resolver = presentationResolver(value);
  if (resolver) {
    return {
      raw: value,
      kind: "vp-url",
      presentationId: resolver.artifactId,
      token: value,
    };
  }
  try {
    const url = new URL(value);
    const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
    if (hashPayload.startsWith("shlink:/")) {
      return { raw: value, kind: "shlink", token: hashPayload };
    }
  } catch {
    // Fall through to an explicit unknown result. Raw JWT/JSON and standalone
    // identifiers are intentionally not accepted as public QR artifacts.
  }
  return { raw: value, kind: "unknown" };
}

function presentationResolver(value: string): {
  url: URL;
  artifactId: string;
} | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const match = url.pathname.match(
      /^\/api\/share-gateway\/presentations\/([A-Za-z0-9._:-]{1,100})\.jwt$/,
    );
    return match ? { url, artifactId: match[1] } : null;
  } catch {
    return null;
  }
}
