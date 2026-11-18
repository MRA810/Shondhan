import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development every /api/* request is forwarded to Django (which only listens on this laptop),
// so phones on the same Wi-Fi reach Django through this server and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 600 }, // the 3D figure (three.js) is its own chunk, loaded only when needed
  server: {
    port: 5173,
    // changeOrigin: Django sees "127.0.0.1:8000" as the host, whichever address the visitor typed
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
    // addresses of temporary internet tunnels (see README, "Open it on other devices")
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
  },
});
