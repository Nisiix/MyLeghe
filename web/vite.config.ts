import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "FootballLite",
        short_name: "FootballLite",
        description: "Formazione, titolarità stimata e live per la tua lega di fantacalcio",
        lang: "it",
        theme_color: "#083d27",
        background_color: "#f4f6ef",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // In sviluppo le chiamate /api vanno al Worker locale (wrangler dev).
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
