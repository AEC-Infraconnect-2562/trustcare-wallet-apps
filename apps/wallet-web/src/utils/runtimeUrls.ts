import { defaultPublicShareGatewayUrl, env } from "../env";

export function currentShareGatewayBaseUrl(): string | null {
  const configured = env.shareGatewayUrl;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") {
    return defaultPublicShareGatewayUrl.replace(/\/$/, "");
  }
  const { hostname, origin } = window.location;
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return `${window.location.origin}/api/share-gateway`;
  }
  if (hostname.endsWith("github.io")) {
    return defaultPublicShareGatewayUrl.replace(/\/$/, "");
  }
  return `${origin}/api/share-gateway`;
}

export function currentAppBaseUrl(): string {
  return currentAppShareRootUrl().replace(/\/$/, "");
}

export function currentAppShareRootUrl(): string {
  if (typeof window === "undefined") return "https://trustcare.example.com/";
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin)
    .toString()
    .replace(/#.*$/, "");
}
