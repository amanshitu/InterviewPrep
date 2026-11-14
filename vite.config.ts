import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// index.html is the single document for the entire app — authenticated
// routes (Today through Admin) via React Router + a persistent AppShell
// layout, and every public/auth page (Login, Home, About, Guide, FAQ,
// Privacy, Terms, Press, Grievance) as sibling top-level routes that
// render without AppShell/AuthGate (see entries/app.tsx). An earlier
// true-MPA attempt (separate document per route) turned out to feel like
// a full reload on every sidebar click; a later phase kept the public
// pages as their own separate documents on the theory that they were rare
// "real navigation boundaries" — consolidated into this one document too,
// since a visitor clicking from Home -> About -> Privacy -> Login still
// benefits from not reloading the whole JS bundle each time, and Cloudflare's
// assets `not_found_handling: "single-page-application"` fallback (see
// wrangler.toml) already treats every path as belonging to this one document.
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
      },
    },
  },
});
