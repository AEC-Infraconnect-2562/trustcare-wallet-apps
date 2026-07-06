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
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler"))
            return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
