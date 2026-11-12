import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Multi-page build: each route gets its own HTML entry + small React mount
// point (see web/src/entries/*.tsx), served as real, separate documents —
// deliberately not a client-side-routed SPA. Entries are added one at a
// time as each page is migrated (see DEVELOPMENT.md Phase 8.x); only
// about.html exists so far (Phase 8.0, pipeline proof).
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        about: resolve(__dirname, "web/about.html"),
      },
    },
  },
});
