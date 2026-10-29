import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root serves both apps.
  envDir: resolve(import.meta.dirname, "../.."),
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: {
    port: 5173,
    // Fail instead of drifting to another port: Playwright (and any origin allow-listed in
    // the Descope project) expects localhost:5173.
    strictPort: true,
    // Same-origin in dev so cookie-mode sessions reach the API without CORS.
    proxy: { "/api": "http://localhost:3001" },
  },
});
