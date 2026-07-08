export const env = {
  apiUrl:
    import.meta.env.VITE_TRUSTCARE_API_URL ??
    "https://trustcare.example.com/trpc",
  shareGatewayUrl: import.meta.env.VITE_TRUSTCARE_SHARE_GATEWAY_URL,
  shlGatewayUrl: import.meta.env.VITE_TRUSTCARE_SHL_GATEWAY_URL,
  shlViewerUrl: import.meta.env.VITE_TRUSTCARE_SHL_VIEWER_URL,
  demoMode: import.meta.env.VITE_TRUSTCARE_ENABLE_DEMO_LOGIN !== "false",
  offlineCache: import.meta.env.VITE_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false",
};
