import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use /FoodBridge/ in production (e.g., GitHub Pages), / in dev
const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [react()],
  base: isProd ? "/FoodBridge/" : "/",
  server: {
    port: 5173
  }
});
