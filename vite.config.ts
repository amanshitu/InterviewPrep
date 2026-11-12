import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Multi-page build: each route gets its own thin HTML entry + mount point
// (src/web/entries/*.tsx), served as real, separate documents — deliberately
// not a client-side-routed SPA. The actual page content lives in
// src/web/routes/{app,admin,auth,public}/*.tsx, mirroring MealSathi's
// frontend folder convention. Entries are added one at a time as each page
// is migrated (see DEVELOPMENT.md Phase 8.x); only about.html exists so far
// (Phase 8.0, pipeline proof).
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        about: resolve(__dirname, "src/web/about.html"),
      },
    },
  },
});
