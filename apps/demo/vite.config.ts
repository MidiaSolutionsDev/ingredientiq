import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/demo",
  server: { host: true, port: 5173 },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
