export function isExpired(isoDate?: string | null, now = new Date()): boolean {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() <= now.getTime();
}

export function parseTrustCareQr(raw: string): {
  raw: string;
  presentationId?: string;
  token?: string;
  kind: "vp-url" | "presentation-id" | "jwt" | "json" | "shlink" | "unknown";
} {
  const value = raw.trim();
  if (!value) return { raw, kind: "unknown" };
  if (value.startsWith("shlink:/")) return { raw: value, kind: "shlink", token: value };
  if (value.startsWith("{")) return { raw: value, kind: "json", token: value };
  if (value.startsWith("eyJ")) return { raw: value, kind: "jwt", token: value };
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value);
      const presentationId = url.searchParams.get("vp") ?? url.searchParams.get("presentationId") ?? undefined;
      const token = url.searchParams.get("token") ?? url.searchParams.get("vc") ?? undefined;
      return { raw: value, kind: presentationId ? "vp-url" : "unknown", presentationId, token };
    } catch {
      return { raw: value, kind: "unknown" };
    }
  }
  if (value.length < 300 && /^[a-zA-Z0-9:_-]+$/.test(value)) {
    return { raw: value, kind: "presentation-id", presentationId: value };
  }
  return { raw: value, kind: "unknown" };
}

export function demoPresentationUrl(origin: string, presentationId: string): string {
  return `${origin.replace(/\/$/, "")}/verifier?vp=${encodeURIComponent(presentationId)}`;
}

