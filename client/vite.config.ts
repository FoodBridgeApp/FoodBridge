import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE ?? "http://localhost:8080";
  return {
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    define: {
      __API_BASE__: JSON.stringify(apiBase)
    }
  };
});
