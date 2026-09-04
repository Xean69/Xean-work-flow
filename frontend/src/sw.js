// Hand-written service worker (vite-plugin-pwa's injectManifest strategy)
// — the only way to add a custom `push`/`notificationclick` listener, since
// generateSW (the previous strategy) only accepts declarative Workbox
// options, no inline JS. Everything above the push/notificationclick
// listeners exists to replicate exactly what the old generateSW output did
// (confirmed by diffing the built sw.js before/after this change) — nothing
// about caching or offline behavior is meant to change here.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

self.skipWaiting();
clientsClaim();

// vite-plugin-pwa's build step replaces this literal token with the real
// precache manifest — required by injectManifest, the build fails loudly
// if it's missing or malformed.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Any navigation not otherwise cached falls back to the app shell instead
// of a browser offline error — same app-shell-only offline behavior
// generateSW's navigateFallback option used to provide automatically.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// --- Web Push ---------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Not JSON — degrade to an empty payload rather than dropping the
    // notification entirely.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Xean", {
      body: data.body,
      icon: data.icon || "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      data: { url: data.url || "/" },
    })
  );
});

// Focuses an already-open window on the target page rather than always
// opening a new tab — the common bug with this handler is skipping the
// matchAll/focus step entirely.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => client.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
