export type QrPayloadKind =
  | "vc_jwt"
  | "vp_jwt"
  | "vp_resolver"
  | "standard_shl"
  | "certified_shl"
  | "oid4vci"
  | "oid4vp"
  | "service_bundle_envelope"
  | "json"
  | "unknown";

export type QrPayloadClassification = {
  kind: QrPayloadKind;
  verifierResolvable: boolean;
  productionResolvable: boolean;
  reason: string;
};

export function classifyQrPayload(raw: string): QrPayloadClassification {
  const value = raw.trim();
  if (!value) {
    return result("unknown", false, false, "empty QR payload");
  }
  if (
    value.startsWith("openid-credential-offer://") ||
    value.includes("credential_offer")
  ) {
    return result("oid4vci", true, true, "OID4VCI credential offer");
  }
  if (
    value.startsWith("openid4vp://") ||
    value.includes("presentation_definition")
  ) {
    return result("oid4vp", true, true, "OID4VP presentation request");
  }
  if (value.startsWith("shlink:/") || value.includes("#shlink:/")) {
    return result(
      value.includes("hospital_certified")
        ? "certified_shl"
        : "standard_shl",
      true,
      true,
      "SMART Health Link payload",
    );
  }
  if (looksLikeJwt(value)) {
    const payload = decodeJwtPayload(value);
    const types = typeList(payload);
    return result(
      types.includes("VerifiablePresentation") ? "vp_jwt" : "vc_jwt",
      false,
      false,
      "raw compact JWT is prohibited as a public QR payload",
    );
  }
  const json = parseJson(value);
  if (json) {
    if (isServiceBundleEnvelope(json))
      return result(
        "service_bundle_envelope",
        false,
        false,
        "ServiceBundleEnvelope is not a primary verifier QR payload",
      );
    const types = typeList(json);
    if (types.includes("VerifiablePresentation"))
      return result(
        "vp_resolver",
        true,
        false,
        "inline JSON VP is demo-resolvable only",
      );
    if (types.includes("VerifiableCredential"))
      return result(
        "json",
        true,
        false,
        "inline JSON VC is demo-resolvable only",
      );
    return result(
      "json",
      false,
      false,
      "JSON payload is not a recognized verifier object",
    );
  }
  const url = parseUrl(value);
  if (url) {
    if (isImmutablePresentationResolver(url)) {
      return result(
        "vp_resolver",
        true,
        true,
        "immutable Share Gateway VP resolver URL",
      );
    }
    if (
      url.searchParams.has("vp") ||
      url.searchParams.has("vc") ||
      url.searchParams.has("token") ||
      url.searchParams.has("presentationId") ||
      url.searchParams.has("scan") ||
      url.searchParams.has("tc_resolver") ||
      scanPayloadFromFragment(url.hash)
    ) {
      return result(
        "unknown",
        false,
        false,
        "legacy query/fragment QR resolver is prohibited",
      );
    }
    if (url.hash.startsWith("#shlink:/"))
      return result(
        "standard_shl",
        true,
        true,
        "SHL wrapped in web viewer URL",
      );
  }
  return result("unknown", false, false, "unknown QR payload");
}

/**
 * Production cross-device QR values are short HTTPS entry points. The signed
 * VP/VC remains behind a resolver; SHL secrets remain in a URL fragment so a
 * normal camera can open the web receiver without sending them to the server.
 */
export function assertProductionCrossDeviceQrPayload(raw: string): void {
  const value = raw.trim();
  const url = parseUrl(value);
  const classification = classifyQrPayload(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    !classification.verifierResolvable ||
    !classification.productionResolvable
  ) {
    throw new Error(
      `Production cross-device QR must use a verifier-resolvable HTTPS URL: ${classification.reason}`,
    );
  }
}

export function assertImmutablePresentationResolverQrPayload(
  raw: string,
  expected?: { origin?: string; artifactId?: string },
): void {
  const url = parseUrl(raw.trim());
  if (!url || !isImmutablePresentationResolver(url)) {
    throw new Error(
      "Direct Holder VP QR must be an immutable HTTPS Share Gateway resolver URL without query or fragment.",
    );
  }
  if (expected?.origin && url.origin !== new URL(expected.origin).origin) {
    throw new Error("Direct Holder VP QR resolver origin is not trusted.");
  }
  const artifactId = presentationArtifactId(url);
  if (expected?.artifactId && artifactId !== expected.artifactId) {
    throw new Error("Direct Holder VP QR resolver artifact ID does not match.");
  }
}

export function assertPrimaryVerifierQrPayload(raw: string): void {
  const classification = classifyQrPayload(raw);
  if (
    !classification.verifierResolvable ||
    classification.kind === "service_bundle_envelope"
  ) {
    throw new Error(
      `QR payload is not a verifier-resolvable primary payload: ${classification.reason}`,
    );
  }
}

export function isServiceBundleEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Boolean(
    typeof object.bundleId === "string" &&
    typeof object.contractId === "string" &&
    typeof object.bundleType === "string" &&
    Array.isArray(object.items),
  );
}

function result(
  kind: QrPayloadKind,
  verifierResolvable: boolean,
  productionResolvable: boolean,
  reason: string,
): QrPayloadClassification {
  return { kind, verifierResolvable, productionResolvable, reason };
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function scanPayloadFromFragment(hash: string): string | null {
  const marker = "#scan=";
  if (!hash.startsWith(marker)) return null;
  try {
    const decoded = decodeURIComponent(hash.slice(marker.length));
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

function isImmutablePresentationResolver(url: URL): boolean {
  return Boolean(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      presentationArtifactId(url),
  );
}

function presentationArtifactId(url: URL): string | null {
  return (
    url.pathname.match(
      /^\/api\/share-gateway\/presentations\/([A-Za-z0-9._:-]{1,100})\.jwt$/,
    )?.[1] ?? null
  );
}

function looksLikeJwt(value: string): boolean {
  return (
    value.split(".").length >= 3 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)
  );
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function typeList(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const type = (value as Record<string, unknown>).type;
  return Array.isArray(type)
    ? type.map(String)
    : typeof type === "string"
      ? [type]
      : [];
}
