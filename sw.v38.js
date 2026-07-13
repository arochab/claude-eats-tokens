/* Service worker v38 — Claude Eats Tokens.
   Stratégie : network-first sur l'app-shell (toujours la dernière version),
   network-ONLY sur les données (usage.json, Render). Purge tout cache != v38 à
   l'activation. Nom de fichier neuf à chaque montée de version = jamais servi
   depuis un ancien cache (corrige le piège de cache A2-4/A2-19).
   v38 : nettoyage typographique du texte visible avant partage public. Tous les
   cadratins, demi-cadratins et points de suspension unicode retirés du texte
   affiché (i18n fr/en, index.html, app.js) et remplacés par une ponctuation
   naturelle (virgule, deux-points, parenthèses). Les commentaires de code et les
   symboles fonctionnels (euro, environ, coché) sont conservés. Invalide v37. */
const CACHE = "cet-v38";
const ASSETS = [
  "./", "./index.html", "./pwa/app.js", "./pwa/styles.css", "./pwa/config.js",
  "./pwa/format.js", "./pwa/radar-hero.js", "./pwa/aurora.js", "./pwa/tokens-field.js",
  "./pwa/i18n/fr.js", "./pwa/i18n/en.js", "./pwa/i18n/index.js",
  "./pwa/manifest.json", "./pwa/icon-192.png", "./pwa/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// le front peut demander l'activation immédiate d'une nouvelle version
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isData(url) {
  return url.pathname.endsWith("usage.json") || url.href.indexOf("onrender.com") >= 0;
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Données : toujours le réseau, jamais le cache.
  if (isData(url)) { e.respondWith(fetch(e.request)); return; }
  // App-shell : network-first (frais si en ligne), repli cache si hors-ligne.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (clients.openWindow) return clients.openWindow("../");
    })
  );
});
