// Minimal service worker: caches the static app shell for fast repeat
// loads and PWA installability. Never caches /api/* — this app is
// fundamentally data-driven (daily queue, review, test), so there's no
// meaningful offline experience to build beyond "the shell loads."
//
// Today / Review / Test / Self Test / Mock Interview / Stats / Settings /
// Admin are all one client-routed SPA served from index.html (React
// Router — see entries/app.tsx); only Login and About are still separate
// documents. Vite hashes the JS/CSS bundle filenames on every build, so
// (same as before) only the few genuinely stable, unhashed paths are
// pre-cached here — the runtime fetch handler below opportunistically
// caches whatever hashed assets a visitor's browser actually requests
// (including a deep link straight to a client-routed path like /stats,
// which the Workers asset layer serves via the SPA fallback), so repeat
// loads of anything already visited still work offline.
//
// Bump CACHE_NAME whenever static assets change in a way that matters.
const CACHE_NAME = "interview-prep-shell-v7";
const SHELL_ASSETS = ["/", "/manifest.json", "/theme-init.js", "/favicon.ico"];

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

self.addEventListener("push", (event) => {
  let data = { title: "Interview Prep", body: "You have questions waiting today.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* keep default */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-32.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
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
