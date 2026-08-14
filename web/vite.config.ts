import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { "react-vendor": ["react", "react-dom", "react-router-dom"], "mui-vendor": ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"], "data-vendor": ["@tanstack/react-query", "axios", "react-hook-form"] } } }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: { provider: "v8", reporter: ["text", "json-summary"], include: ["src/**/*.{ts,tsx}"], exclude: ["src/main.tsx", "src/test/**"] }
  }
});
