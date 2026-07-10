import {
  resolveRuntimeEnvironment,
  runtimeEnvironmentDescriptor,
  runtimeAllowsSyntheticData,
} from "@trustcare/wallet-core";

export const runtimeEnvironment = resolveRuntimeEnvironment({
  runtimeEnvironment: process.env.EXPO_PUBLIC_TRUSTCARE_RUNTIME_ENV,
  legacyDemoMode: process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_DEMO_LOGIN,
});

export const environmentBanner =
  runtimeEnvironmentDescriptor(runtimeEnvironment);

export const env = {
  apiUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  shareGatewayUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_SHARE_GATEWAY_URL ??
    "https://trustcarehealth.live/api/share-gateway",
  runtimeEnvironment,
  environmentBanner,
  demoMode: runtimeAllowsSyntheticData(runtimeEnvironment),
  offlineCache:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
  screenCaptureProtection:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_SCREEN_CAPTURE_PROTECTION !==
    "false",
};
