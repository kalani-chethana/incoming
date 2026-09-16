import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Enable HTTPS by default so mobile/LAN devices can access the camera
const disableHttps = process.env.HTTPS === "false" || process.env.NO_HTTPS === "true";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(!disableHttps ? [basicSsl()] : []),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});

