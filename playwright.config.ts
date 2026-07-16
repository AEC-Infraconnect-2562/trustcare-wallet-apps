import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.WALLET_E2E_BASE_URL?.trim();
const localBaseUrl = "http://127.0.0.1:5187";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["line"]],
  use: {
    baseURL: externalBaseUrl || localBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          "corepack pnpm@9.15.9 --filter wallet-web exec vite --host 127.0.0.1 --port 5187 --strictPort",
        url: localBaseUrl,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          VITE_TRUSTCARE_RUNTIME_ENV: "sandbox",
          VITE_TRUSTCARE_SANDBOX_TEST_LOGIN_ENABLED: "true",
          VITE_TRUSTCARE_PORTAL_BASE_URL:
            "https://trustcare-hospital-network-production.up.railway.app",
        },
      },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
