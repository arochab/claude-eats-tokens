/* Service worker v44 — Claude Eats Tokens.
   Stratégie : network-first sur l'app-shell (toujours la dernière version),
   network-ONLY sur les données (usage.json, Render, Supabase). Purge tout cache
   != v44 à l'activation. Nom de fichier neuf à chaque montée de version = jamais
   servi depuis un ancien cache (corrige le piège de cache A2-4/A2-19).
   v41-v42 : l'app ne passe plus par aucun serveur. Elle lit la base Supabase en
   direct (cet_get_usage, migration 0005) et y crée les comptes (cet_register /
   cet_me, migration 0006), au lieu d'interroger Render — suspendu le 15/07/2026
   pour dépassement du quota gratuit (750 h/mois partagées par tout le workspace,
   brûlées en 15,6 jours par 2 services allumés en permanence).
   Le ping de réveil de Render au boot est supprimé en voie directe : c'était lui
   qui rallumait le serveur, et donc le compteur, à chaque ouverture de l'app.
   Les appels à la base sont des POST, que ce worker ignore déjà (garde `method
   !== GET`) : aucun risque de chiffres figés en cache.
   v42 sort aussi l'inscription : un inconnu peut créer un compte même Render
   suspendu, ce qui était impossible entre le 15 juil et le 1er août. Un
   garde-fou par IP y est ajouté au passage, l'ancienne route /auth/register
   étant ouverte sans aucune limite sur une base gratuite de 500 Mo.
   v43 : l'appairage du PC sort a son tour (migration 0007 : cet_pair_start /
   _confirm / _poll). Plus AUCUN flux ne passe par Render. `claude-push pair`
   installe et demarre desormais le service dans la foulee : une commande au
   lieu de deux, et ca tourne tout de suite au lieu d'attendre la prochaine
   session Windows.
   v44 : le paiement sort a son tour. Le checkout passe par l'Edge Function
   `billing` (Supabase, gratuite et toujours allumee) et non plus par Render.
   La cle voyage desormais dans le CORPS d'un POST : elle n'apparait plus en
   ?key= dans une URL, qui serait partie dans l'historique, les logs et le
   Referer envoye a Lemon Squeezy. PLUS AUCUN flux ne touche Render.
   Invalide v43. */
const CACHE = "cet-v44";
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
  return url.pathname.endsWith("usage.json")
    || url.href.indexOf("onrender.com") >= 0
    || url.href.indexOf("supabase.co") >= 0;
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
