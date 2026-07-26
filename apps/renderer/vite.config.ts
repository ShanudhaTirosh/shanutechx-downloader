import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // required for file:// loading from Electron's packaged app
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
