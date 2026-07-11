import {
  resolveRuntimeEnvironment,
  runtimeEnvironmentDescriptor,
  runtimeAllowsSyntheticData,
} from "@trustcare/wallet-core";
import { resolvePortalBaseUrl } from "@trustcare/api-client";

export const defaultPublicShareGatewayUrl =
  import.meta.env.VITE_TRUSTCARE_PUBLIC_SHARE_GATEWAY_URL ??
  "https://wallet-web-production-6a00.up.railway.app/api/share-gateway";

export const configuredShareGatewayUrl = import.meta.env
  .VITE_TRUSTCARE_SHARE_GATEWAY_URL;

export const runtimeEnvironment = resolveRuntimeEnvironment({
  runtimeEnvironment: import.meta.env.VITE_TRUSTCARE_RUNTIME_ENV,
  legacyDemoMode: import.meta.env.VITE_TRUSTCARE_ENABLE_DEMO_LOGIN,
});

export const environmentBanner =
  runtimeEnvironmentDescriptor(runtimeEnvironment);

export const portalBaseUrl = resolvePortalBaseUrl({
  configuredUrl: import.meta.env.VITE_TRUSTCARE_PORTAL_BASE_URL,
  runtimeEnvironment,
});

export const env = {
  apiUrl:
    import.meta.env.VITE_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  portalBaseUrl,
  walletExchangeAppId:
    import.meta.env.VITE_TRUSTCARE_WALLET_EXCHANGE_APP_ID ??
    "trustcare-wallet-production",
  shareGatewayUrl: configuredShareGatewayUrl,
  shlGatewayUrl: import.meta.env.VITE_TRUSTCARE_SHL_GATEWAY_URL,
  shlViewerUrl: import.meta.env.VITE_TRUSTCARE_SHL_VIEWER_URL,
  runtimeEnvironment,
  environmentBanner,
  demoMode: runtimeAllowsSyntheticData(runtimeEnvironment),
  offlineCache: import.meta.env.VITE_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
};
