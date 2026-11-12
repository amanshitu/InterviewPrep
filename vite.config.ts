import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
  plugins: [react(), tailwindcss()],
  // `npm run dev:web` proxies /api to a `wrangler dev --local --port 8787`
  // instance, so pages can be built and tested against the real (unchanged)
  // backend without a full production build — only the final cutover pass
  // needs the production-equivalent wrangler-dev-against-dist/ check.
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        // src/web/api/*.ts source files happen to live at a dev-server URL
        // path that also starts with "/api" (same prefix as the real
        // backend's REST routes, since Vite's root is src/web). Real
        // backend calls never have a file extension (e.g. /api/me,
        // /api/queue/today); bypass the proxy for anything that does, so
        // Vite serves/transforms those source files itself instead of
        // forwarding the module request to the backend and getting a
        // confusing 401/404 back instead of the actual TypeScript file.
        bypass(req) {
          if (/\.[a-z]+$/i.test(req.url || "")) return req.url;
        },
      },
    },
  },
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
