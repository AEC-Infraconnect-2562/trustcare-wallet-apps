export type DemoResolverKind = "vp" | "shl-manifest" | "manifest-vp" | "holder-vc";

export type DemoResolvedPayload = {
  kind: DemoResolverKind;
  id: string;
  payload: Record<string, unknown>;
};

export function createDemoResolverUrl(origin: string, kind: DemoResolverKind, id: string, payload: Record<string, unknown>): string {
  const url = new URL(normalizeOrigin(origin));
  url.searchParams.set("tc_resolver", kind);
  url.searchParams.set("tc_id", id);
  url.searchParams.set("tc_payload", base64UrlEncode(JSON.stringify(payload)));
  return url.toString();
}

export function createDemoManifestUrl(origin: string, id: string, manifest: Record<string, unknown>): string {
  return createDemoResolverUrl(origin, "shl-manifest", id, manifest);
}

export function resolveDemoResolverPayload(value: string): DemoResolvedPayload | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;
  const kind = parsed.searchParams.get("tc_resolver") as DemoResolverKind | null;
  const id = parsed.searchParams.get("tc_id");
  const encoded = parsed.searchParams.get("tc_payload");
  if (!kind || !id || !encoded) return null;
  if (!["vp", "shl-manifest", "manifest-vp", "holder-vc"].includes(kind)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return { kind, id, payload };
  } catch {
    return null;
  }
}

export function resolveDemoShlManifestFromUrl(value: string): Record<string, unknown> | null {
  const resolved = resolveDemoResolverPayload(value);
  return resolved?.kind === "shl-manifest" ? resolved.payload : null;
}

export function hashJson(value: unknown): string {
  return `sha256:${stableHash(JSON.stringify(canonicalize(value)))}`;
}

export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeOrigin(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value.replace(/#.*$/, "");
  return `https://trustcare.example.com/${value.replace(/^\/+/, "")}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex.repeat(8).slice(0, 64);
}
