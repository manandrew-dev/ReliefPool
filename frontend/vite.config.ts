import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The oracle's CORS allows http://localhost:5173 by default
    // (docs/api.md section 2). Fail if the port is taken instead of
    // silently moving to another port that CORS would block.
    port: 5173,
    strictPort: true,
  },
});
