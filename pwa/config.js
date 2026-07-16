/* Source des données pour la PWA.

   VOIE NORMALE (depuis le 16/07/2026) : la PWA lit DIRECTEMENT la base
   Supabase, sans aucun serveur intermédiaire. Elle appelle la fonction SQL
   cet_get_usage(clé) (migration 0005) avec :
     - la clé PUBLISHABLE ci-dessous, publique par conception (rôle `anon`) ;
     - la clé personnelle `cet_` de l'utilisateur, gardée dans localStorage.

   Pourquoi la clé publishable peut être en clair dans un dépôt public : elle
   n'ouvre RIEN seule. Toutes les tables sont en RLS sans policy (lecture anon
   = tableau vide, vérifié), et les deux seules fonctions exposées exigent une
   clé `cet_` valide, dont le hash est comparé côté base.

   Le serveur Render reste câblé UNIQUEMENT pour la voie legacy (self-host avec
   PUSH_SECRET, sans clé `cet_`). Dès qu'une clé est présente, on ne le
   contacte plus du tout — c'est ce qui met fin au compteur d'heures gratuites.

   EN LOCAL : on ne coupe plus l'accès à la base. L'ancienne règle « localhost =
   zéro requête » existait parce que réveiller Render coûtait ~50s à chaque F5 ;
   la base directe répond en < 1s, donc la raison a disparu. Conséquence utile :
   en dev on voit les VRAIS chiffres, au lieu du data/usage.json du dépôt qui est
   un artefact de test souvent périmé (il a déjà fait diagnostiquer des bugs
   d'affichage qui n'existaient pas en prod). Sans clé, rien ne change :
   data/usage.json puis démo. Render, lui, reste coupé en local. */
(function () {
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "" || location.protocol === "file:";

  /* --- Base Supabase (voie directe) : active partout, y compris en local --- */
  window.CET_SUPABASE_URL = "https://yayimgpoopjwmmpzlrpm.supabase.co";
  window.CET_SUPABASE_KEY = "sb_publishable_ajTgSKAQytS_6bSf-2V8Kw_4L-oG8ju";

  /* --- Serveur Render (legacy : self-host sans clé cet_) --- */
  window.CLAUDE_EATS_TOKENS_SERVER = isLocal ? "" : "https://claude-eats-tokens.onrender.com";

  /* --- Clé personnelle, stockée dans localStorage --- */
  var API_KEY_STORE = "tokenTracker.apiKey.v1";
  window.CET_API_KEY = null;
  try {
    window.CET_API_KEY = localStorage.getItem(API_KEY_STORE) || null;
  } catch (e) {}

  /* Reprise d'une clé passée en ?key=... : sert à brancher un téléphone en
     ouvrant un simple lien, sans recopier 47 caractères à la main. On la range
     immédiatement dans localStorage puis on NETTOIE l'URL (history.replaceState)
     pour ne pas la laisser traîner dans la barre d'adresse, l'historique ou un
     partage de lien. */
  try {
    var m = /[?&]key=([^&#]+)/.exec(location.search);
    if (m && m[1]) {
      var k = decodeURIComponent(m[1]);
      if (/^cet_[A-Za-z0-9_-]{20,}$/.test(k)) {
        localStorage.setItem(API_KEY_STORE, k);
        window.CET_API_KEY = k;
        var clean = location.pathname + location.search.replace(/([?&])key=[^&#]*(&|$)/, "$1").replace(/[?&]$/, "") + location.hash;
        history.replaceState(null, "", clean);
      }
    }
  } catch (e) {}

  window.CET_setApiKey = function (key) {
    window.CET_API_KEY = key || null;
    try {
      if (key) localStorage.setItem(API_KEY_STORE, key);
      else localStorage.removeItem(API_KEY_STORE);
    } catch (e) {}
  };

  window.CET_clearApiKey = function () {
    window.CET_setApiKey(null);
  };
})();
