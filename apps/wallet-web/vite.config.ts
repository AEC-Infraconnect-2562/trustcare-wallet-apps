import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devShareGatewayPlugin } from "./devShareGatewayPlugin";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), devShareGatewayPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.includes("/packages/wallet-core/"))
            return "trustcare-wallet-core";
          if (normalizedId.includes("/packages/api-client/"))
            return "trustcare-api-client";
          if (normalizedId.includes("/packages/ui-web/"))
            return "trustcare-ui-web";
          if (
            normalizedId.includes("/packages/design-tokens/") ||
            normalizedId.includes("/packages/i18n/")
          )
            return "trustcare-shared";
          if (!normalizedId.includes("node_modules")) return undefined;
          if (normalizedId.includes("lucide-react")) return "vendor-icons";
          if (
            normalizedId.includes("react") ||
            normalizedId.includes("scheduler")
          )
            return "vendor-react";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
