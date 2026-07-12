import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devShareGatewayPlugin } from "./devShareGatewayPlugin";

function apiClientChunk(normalizedId: string) {
  if (!normalizedId.includes("/packages/api-client/src/")) return null;
  const moduleName = normalizedId.split("/").at(-1)?.replace(/\.ts$/, "");
  if (!moduleName || moduleName === "index") return null;
  if (moduleName === "verifier") return "trustcare-api-verifier";
  if (moduleName.startsWith("walletExchange"))
    return "trustcare-api-wallet-exchange";
  if (
    moduleName === "walletContractLoader" ||
    moduleName === "portalIssuerResolver" ||
    moduleName === "portalBaseUrl" ||
    moduleName === "dpop"
  )
    return "trustcare-api-portal";
  if (moduleName === "shareGatewayClient")
    return "trustcare-api-share-gateway";
  if (moduleName === "payer") return "trustcare-api-payer";
  if (
    moduleName === "wallet" ||
    moduleName === "walletRepository" ||
    moduleName === "shl"
  )
    return "trustcare-api-wallet";
  return "trustcare-api-foundation";
}

function normalizedModuleId(id: string) {
  return id.replace(/\\/g, "/");
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), devShareGatewayPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: (id) => apiClientChunk(normalizedModuleId(id)),
              test: (id) =>
                normalizedModuleId(id).includes("/packages/api-client/src/"),
              priority: 50,
              includeDependenciesRecursively: false,
            },
            {
              name: "trustcare-wallet-core",
              test: (id) =>
                normalizedModuleId(id).includes("/packages/wallet-core/"),
              priority: 40,
              includeDependenciesRecursively: false,
            },
            {
              name: "trustcare-ui-web",
              test: (id) =>
                normalizedModuleId(id).includes("/packages/ui-web/"),
              priority: 40,
              includeDependenciesRecursively: false,
            },
            {
              name: "trustcare-shared",
              test: (id) => {
                const normalizedId = normalizedModuleId(id);
                return (
                  normalizedId.includes("/packages/design-tokens/") ||
                  normalizedId.includes("/packages/i18n/")
                );
              },
              priority: 40,
              includeDependenciesRecursively: false,
            },
            {
              name: "vendor-icons",
              test: (id) => normalizedModuleId(id).includes("lucide-react"),
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: "vendor-react",
              test: (id) => {
                const normalizedId = normalizedModuleId(id);
                return (
                  normalizedId.includes("node_modules") &&
                  (normalizedId.includes("react") ||
                    normalizedId.includes("scheduler"))
                );
              },
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: "vendor",
              test: (id) => normalizedModuleId(id).includes("node_modules"),
              priority: 10,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
