import { createDemoResolverReferenceUrl } from "./demoResolvers";

export function isExpired(isoDate?: string | null, now = new Date()): boolean {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() <= now.getTime();
}

export const presentationQrInlineMaxLength = 1800;

export function createPresentationQrPayload(input: {
  origin: string;
  presentationId: string;
  qrData: string;
  expiresAt?: string;
  maxInlineLength?: number;
  selectedFields?: string[];
}): string {
  const raw = input.qrData.trim();
  if (!raw) return raw;
  const normalizedDemoResolver = normalizeDemoPresentationResolverUrl(input);
  if (normalizedDemoResolver) return normalizedDemoResolver;
  if (isPresentationResolverUrl(raw)) return raw;
  const maxInlineLength =
    input.maxInlineLength ?? presentationQrInlineMaxLength;
  if (raw.length <= maxInlineLength) return raw;
  return demoPresentationUrl(input.origin, input.presentationId);
}

export function parseTrustCareQr(raw: string): {
  raw: string;
  presentationId?: string;
  token?: string;
  kind: "vp-url" | "presentation-id" | "jwt" | "json" | "shlink" | "unknown";
} {
  const value = raw.trim();
  if (!value) return { raw, kind: "unknown" };
  if (value.startsWith("shlink:/"))
    return { raw: value, kind: "shlink", token: value };
  if (value.startsWith("{")) return { raw: value, kind: "json", token: value };
  if (value.startsWith("eyJ")) return { raw: value, kind: "jwt", token: value };
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value);
      const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
      if (hashPayload.startsWith("shlink:/"))
        return { raw: value, kind: "shlink", token: hashPayload };
      const scanPayload = url.searchParams.get("scan");
      if (scanPayload?.startsWith("shlink:/"))
        return { raw: value, kind: "shlink", token: scanPayload };
      const demoResolverKind = url.searchParams.get("tc_resolver");
      const demoResolverId = url.searchParams.get("tc_id");
      if (demoResolverKind === "vp" && demoResolverId) {
        return {
          raw: value,
          kind: "vp-url",
          presentationId: demoResolverId,
          token: value,
        };
      }
      const presentationId =
        url.searchParams.get("vp") ??
        url.searchParams.get("presentationId") ??
        undefined;
      const token =
        url.searchParams.get("token") ??
        url.searchParams.get("vc") ??
        undefined;
      return {
        raw: value,
        kind: presentationId ? "vp-url" : "unknown",
        presentationId,
        token,
      };
    } catch {
      return { raw: value, kind: "unknown" };
    }
  }
  if (value.length < 300 && /^[a-zA-Z0-9:_-]+$/.test(value)) {
    return { raw: value, kind: "presentation-id", presentationId: value };
  }
  return { raw: value, kind: "unknown" };
}

export function demoPresentationUrl(
  origin: string,
  presentationId: string,
): string {
  return `${origin.replace(/\/$/, "")}/verifier?vp=${encodeURIComponent(presentationId)}`;
}

function isPresentationResolverUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return Boolean(
      url.searchParams.get("tc_resolver") === "vp" ||
      url.searchParams.get("vp") ||
      url.searchParams.get("presentationId") ||
      url.pathname.includes("/presentations/"),
    );
  } catch {
    return false;
  }
}

function normalizeDemoPresentationResolverUrl(input: {
  origin: string;
  presentationId: string;
  qrData: string;
  expiresAt?: string;
  selectedFields?: string[];
}): string | null {
  const raw = input.qrData.trim();
  const unwrappedPayload = unwrapScannablePayload(raw);
  if (unwrappedPayload && unwrappedPayload !== raw) {
    return normalizeDemoPresentationResolverUrl({
      ...input,
      qrData: unwrappedPayload,
    });
  }

  const parsed = parseUrl(raw);
  if (!parsed) return null;
  const currentResolver = parsed.searchParams.get("tc_resolver");
  const currentId = parsed.searchParams.get("tc_id");
  if (currentResolver === "vp" && currentId?.startsWith("vp_demo_")) {
    return raw;
  }

  const legacyId =
    parsed.searchParams.get("vp") ??
    parsed.searchParams.get("presentationId") ??
    input.presentationId;
  if (!legacyId.startsWith("vp_demo_")) return null;
  if (
    !parsed.searchParams.has("vp") &&
    !parsed.searchParams.has("presentationId")
  ) {
    return null;
  }

  const resolver = new URL(
    createDemoResolverReferenceUrl(input.origin, "vp", legacyId),
  );
  if (input.expiresAt) resolver.searchParams.set("tc_exp", input.expiresAt);
  const selectedFields = (input.selectedFields ?? [])
    .map((field) => field.trim())
    .filter(Boolean);
  if (selectedFields.length) {
    resolver.searchParams.set("tc_fields", selectedFields.join(","));
  }
  return resolver.toString();
}

function unwrapScannablePayload(value: string): string | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;
  const scanParam = parsed.searchParams.get("scan");
  if (scanParam) return scanParam;
  const hash = parsed.hash.replace(/^#/, "");
  if (!hash) return null;
  try {
    const params = new URLSearchParams(hash.replace(/^\?/, ""));
    return params.get("scan");
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
