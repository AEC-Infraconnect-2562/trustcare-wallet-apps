export const env = {
  apiUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  shareGatewayUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_SHARE_GATEWAY_URL ??
    "https://trustcarehealth.live/api/share-gateway",
  demoMode: process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_DEMO_LOGIN !== "false",
  offlineCache:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
  screenCaptureProtection:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_SCREEN_CAPTURE_PROTECTION !==
    "false",
};
