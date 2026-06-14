const CACHE = "claude-eats-tokens-v4";
const ASSETS = [
  "./", "./index.html", "./pwa/app.js", "./pwa/styles.css", "./pwa/config.js",
  "./pwa/manifest.json", "./pwa/icon-192.png", "./pwa/icon-512.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Les données usage.json : JAMAIS de cache, toujours le réseau direct (network-only).
  if (url.pathname.endsWith("usage.json") || url.href.indexOf("onrender.com") >= 0) {
    e.respondWith(fetch(e.request));
    return;
  }
  // App shell : réseau d'abord (pour récupérer les MAJ), repli cache.
  e.respondWith(
    fetch(e.request).then((r) => {
      const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r;
    }).catch(() => caches.match(e.request))
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow("../");
  }));
});
