import { env } from "./env";
import { readStringStorage } from "./utils/storage";
import { currentShareGatewayBaseUrl } from "./utils/runtimeUrls";

export const walletSessionKey =
  `trustcare-wallet-active-user:${env.runtimeEnvironment}:v1`;
export const legacyWalletSessionKey = "trustcare-wallet-active-user";
export const sidebarCollapsedKey = "trustcare-wallet-sidebar-collapsed:v1";
export const defaultLoginUserId = "demo-patient-001";
export const walletRuntimeRelease = "premium-clinical-home-inspector";

export const baseApiOptions = {
  url: env.apiUrl,
  runtimeEnvironment: env.runtimeEnvironment,
  demoOrigin:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://trustcare.example.com",
  shlGatewayUrl: env.shlGatewayUrl,
  shlViewerUrl: env.shlViewerUrl,
  shareGatewayUrl:
    typeof window !== "undefined"
      ? (currentShareGatewayBaseUrl() ?? undefined)
      : env.shareGatewayUrl,
};

export function preserveDesktopScrollPosition(): void {
  if (
    typeof window === "undefined" ||
    !window.matchMedia("(min-width: 941px)").matches
  ) {
    return;
  }
  const left = window.scrollX;
  const top = window.scrollY;
  const restore = () => window.scrollTo({ left, top, behavior: "auto" });
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

export function readWalletSessionUserId(): string | null {
  return readStringStorage(
    walletSessionKey,
    env.runtimeEnvironment === "demo" ? [legacyWalletSessionKey] : [],
  );
}
