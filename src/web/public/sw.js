// Minimal service worker: caches the static app shell for fast repeat
// loads and PWA installability. Never caches /api/* — this app is
// fundamentally data-driven (daily queue, review, test), so there's no
// meaningful offline experience to build beyond "the shell loads."
//
// Every route — Today through Admin, plus Login/Home/About/Guide/FAQ/
// Privacy/Terms/Press/Grievance — is one client-routed SPA served from
// index.html (React Router — see entries/app.tsx), one document total.
// Vite hashes the JS/CSS bundle filenames on every build, so
// (same as before) only the few genuinely stable, unhashed paths are
// pre-cached here — the runtime fetch handler below opportunistically
// caches whatever hashed assets a visitor's browser actually requests
// (including a deep link straight to a client-routed path like /stats,
// which the Workers asset layer serves via the SPA fallback), so repeat
// loads of anything already visited still work offline.
//
// Bump CACHE_NAME whenever static assets change in a way that matters.
const CACHE_NAME = "interview-prep-shell-v10";
const SHELL_ASSETS = ["/", "/manifest.json", "/theme-init.js", "/favicon.ico"];

self.addEventListener("install", (event) => {
  // No self.skipWaiting() here on purpose: a worker updating an
  // already-controlled page parks in "waiting" until the app's
  // "Reload to update" prompt (src/web/lib/pwa-update.ts) posts it a
  // SKIP_WAITING message, so a deploy never swaps code under a session
  // mid-use. A brand-new install (nothing controlling the page yet) still
  // activates immediately regardless, since there's no previous worker to
  // wait on.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
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
  let data = { title: "ExamStreak", body: "You have questions waiting today.", url: "/" };
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

  // Navigations (the index.html shell itself, including every client-
  // routed path via the SPA fallback) go network-first, not cache-first.
  // This app deploys often, and Vite hashes every JS/CSS filename on each
  // build — a cache-first shell always serves the *previous* deploy's
  // html on the first load after a new one (same "stale-while-revalidate"
  // staleness window below, intentional for assets), whose script tags
  // reference hashed files the new deploy no longer has. Those requests
  // 404 (served as index.html by the SPA fallback, actually, which is
  // worse: a 200 with the wrong MIME type), and the page never mounts —
  // blank screen until a manual reload picks up the now-cached fresh
  // shell. Network-first for navigations only shows the stale cached
  // shell when there's truly no network (offline), which is exactly the
  // case this cache exists for.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

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
