import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The proxy sends any request that starts with /api to our Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
