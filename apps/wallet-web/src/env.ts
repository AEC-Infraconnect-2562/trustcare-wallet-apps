export const env = {
  apiUrl: import.meta.env.VITE_TRUSTCARE_API_URL ?? "https://trustcare.example.com/trpc",
  demoMode: import.meta.env.VITE_TRUSTCARE_ENABLE_DEMO_LOGIN !== "false",
  offlineCache: import.meta.env.VITE_TRUSTCARE_ENABLE_OFFLINE_CACHE !== "false"
};

