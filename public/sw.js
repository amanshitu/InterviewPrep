// Minimal service worker: caches the static app shell for fast repeat
// loads and PWA installability. Never caches /api/* — this app is
// fundamentally data-driven (daily queue, review, test), so there's no
// meaningful offline experience to build beyond "the shell loads."
//
// Bump CACHE_NAME whenever static assets change in a way that matters —
// there's no build step to hash filenames for you.
const CACHE_NAME = "interview-prep-shell-v1";
const SHELL_ASSETS = ["/", "/app.js", "/styles.css", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
