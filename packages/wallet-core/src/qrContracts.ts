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
  if (value.startsWith("openid-credential-offer://") || value.includes("credential_offer")) {
    return result("oid4vci", true, true, "OID4VCI credential offer");
  }
  if (value.startsWith("openid4vp://") || value.includes("presentation_definition")) {
    return result("oid4vp", true, true, "OID4VP presentation request");
  }
  if (value.startsWith("shlink:/") || value.includes("#shlink:/")) {
    return result(value.includes("certified_manifest_vp") ? "certified_shl" : "standard_shl", true, true, "SMART Health Link payload");
  }
  if (looksLikeJwt(value)) {
    const payload = decodeJwtPayload(value);
    const types = typeList(payload?.vp ?? payload);
    if (types.includes("VerifiablePresentation")) return result("vp_jwt", true, true, "W3C VP JWT");
    if (types.includes("VerifiableCredential")) return result("vc_jwt", true, true, "W3C VC JWT");
    return result("json", true, false, "JWT-shaped payload without VC/VP type");
  }
  const json = parseJson(value);
  if (json) {
    if (isServiceBundleEnvelope(json)) return result("service_bundle_envelope", false, false, "ServiceBundleEnvelope is not a primary verifier QR payload");
    const types = typeList(json);
    if (types.includes("VerifiablePresentation")) return result("vp_resolver", true, false, "inline JSON VP is demo-resolvable only");
    if (types.includes("VerifiableCredential")) return result("json", true, false, "inline JSON VC is demo-resolvable only");
    return result("json", false, false, "JSON payload is not a recognized verifier object");
  }
  const url = parseUrl(value);
  if (url) {
    if (url.searchParams.get("vp") || url.searchParams.get("presentationId") || url.pathname.includes("/presentations/")) {
      return result("vp_resolver", true, true, "VP resolver URL");
    }
    if (url.hash.startsWith("#shlink:/")) return result("standard_shl", true, true, "SHL wrapped in web viewer URL");
  }
  return result("unknown", false, false, "unknown QR payload");
}

export function assertPrimaryVerifierQrPayload(raw: string): void {
  const classification = classifyQrPayload(raw);
  if (!classification.verifierResolvable || classification.kind === "service_bundle_envelope") {
    throw new Error(`QR payload is not a verifier-resolvable primary payload: ${classification.reason}`);
  }
}

export function isServiceBundleEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Boolean(
    typeof object.bundleId === "string" &&
      typeof object.contractId === "string" &&
      typeof object.bundleType === "string" &&
      Array.isArray(object.items)
  );
}

function result(kind: QrPayloadKind, verifierResolvable: boolean, productionResolvable: boolean, reason: string): QrPayloadClassification {
  return { kind, verifierResolvable, productionResolvable, reason };
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
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

function looksLikeJwt(value: string): boolean {
  return value.split(".").length >= 3 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function typeList(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const type = (value as Record<string, unknown>).type;
  return Array.isArray(type) ? type.map(String) : typeof type === "string" ? [type] : [];
}
