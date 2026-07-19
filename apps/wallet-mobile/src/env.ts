import {
  resolveRuntimeEnvironment,
  runtimeEnvironmentDescriptor,
  runtimeAllowsSyntheticData,
} from "@trustcare/wallet-core";
import { resolvePortalBaseUrl } from "@trustcare/api-client/portalBaseUrl";

export const runtimeEnvironment = resolveRuntimeEnvironment({
  runtimeEnvironment: process.env.EXPO_PUBLIC_TRUSTCARE_RUNTIME_ENV,
  legacyDemoMode: process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_DEMO_LOGIN,
});

export const environmentBanner =
  runtimeEnvironmentDescriptor(runtimeEnvironment);

export const portalBaseUrl = resolvePortalBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_TRUSTCARE_PORTAL_BASE_URL,
  runtimeEnvironment,
});

export const env = {
  apiUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  portalBaseUrl,
  walletExchangeAppId:
    process.env.EXPO_PUBLIC_TRUSTCARE_WALLET_EXCHANGE_APP_ID ??
    "trustcare-wallet-production",
  shareGatewayUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_SHARE_GATEWAY_URL ??
    `${portalBaseUrl}/api/share-gateway`,
  runtimeEnvironment,
  environmentBanner,
  demoMode: runtimeAllowsSyntheticData(runtimeEnvironment),
  offlineCache:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
  screenCaptureProtection:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_SCREEN_CAPTURE_PROTECTION !==
    "false",
};
