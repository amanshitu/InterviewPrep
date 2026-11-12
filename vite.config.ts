import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Multi-page build: each route gets its own thin HTML entry + mount point
// (src/web/entries/*.tsx), served as real, separate documents — deliberately
// not a client-side-routed SPA. The actual page content lives in
// src/web/routes/{app,admin,auth,public}/*.tsx, mirroring MealSathi's
// frontend folder convention. index.html (not today.html) is the Today
// page specifically, so it resolves at "/" to match nav.ts's href and the
// old app's root route.
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
        index: resolve(__dirname, "src/web/index.html"),
        about: resolve(__dirname, "src/web/about.html"),
        login: resolve(__dirname, "src/web/login.html"),
        review: resolve(__dirname, "src/web/review.html"),
        test: resolve(__dirname, "src/web/test.html"),
        selfTest: resolve(__dirname, "src/web/self-test.html"),
        mockInterview: resolve(__dirname, "src/web/mock-interview.html"),
        stats: resolve(__dirname, "src/web/stats.html"),
        settings: resolve(__dirname, "src/web/settings.html"),
        admin: resolve(__dirname, "src/web/admin.html"),
      },
    },
  },
});
