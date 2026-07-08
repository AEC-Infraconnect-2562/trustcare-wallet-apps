export const env = {
  apiUrl:
    process.env.EXPO_PUBLIC_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  demoMode: process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_DEMO_LOGIN !== "false",
  offlineCache:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
  screenCaptureProtection:
    process.env.EXPO_PUBLIC_TRUSTCARE_ENABLE_SCREEN_CAPTURE_PROTECTION !==
    "false",
};
