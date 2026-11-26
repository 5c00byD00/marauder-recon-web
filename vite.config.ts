import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages project site: https://5c00byd00.github.io/marauder-recon-web/
  base: "/marauder-recon-web/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
