/* Source des données pour la PWA.
   En local (localhost/127.0.0.1/fichier), on n'interroge PAS Render : on lit
   directement data/usage.json (généré par le moteur) puis la démo. En prod
   (GitHub Pages), on pointe sur le serveur Render. */
(function () {
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "" || location.protocol === "file:";
  window.CLAUDE_EATS_TOKENS_SERVER = isLocal ? "" : "https://claude-eats-tokens.onrender.com";

  /* --- Multi-tenant : API key stockée dans localStorage --- */
  var API_KEY_STORE = "tokenTracker.apiKey.v1";
  window.CET_API_KEY = null;
  try {
    window.CET_API_KEY = localStorage.getItem(API_KEY_STORE) || null;
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
