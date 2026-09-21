import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// By default, run on plain HTTP for clean localhost usage without certificate warnings.
// To re-enable self-signed HTTPS for LAN devices, start with HTTPS=true
const enableHttps = process.env.HTTPS === "true";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(enableHttps ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});

