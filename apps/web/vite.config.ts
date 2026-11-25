import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devIssuerDir } from "./dev-issuer/dev-issuer-core";
import { devIssuerPlugin } from "./dev-issuer/dev-issuer-plugin";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react(), devIssuerPlugin(devIssuerDir(repoRoot))],
  server: {
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
