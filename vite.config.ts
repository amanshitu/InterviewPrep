import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// index.html is now the single-page app covering every authenticated route
// (Today through Admin) via React Router + a persistent AppShell layout
// (see entries/app.tsx) — matching MealSathi's own client-routed shell,
// after an earlier true-MPA attempt (separate document per route) turned
// out to feel like a full reload on every sidebar click. login.html and
// about.html stay separate documents on purpose: real navigation
// boundaries (signed-out/in, and a rarely-visited info page), not part of
// the core click-between-constantly workflow the SPA conversion was for.
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
        home: resolve(__dirname, "src/web/home.html"),
        about: resolve(__dirname, "src/web/about.html"),
        login: resolve(__dirname, "src/web/login.html"),
        guide: resolve(__dirname, "src/web/guide.html"),
        faq: resolve(__dirname, "src/web/faq.html"),
        privacy: resolve(__dirname, "src/web/privacy.html"),
        terms: resolve(__dirname, "src/web/terms.html"),
        grievance: resolve(__dirname, "src/web/grievance.html"),
        press: resolve(__dirname, "src/web/press.html"),
      },
    },
  },
});
