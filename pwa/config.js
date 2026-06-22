/* Source des données pour la PWA.
   En local (localhost/127.0.0.1/fichier), on n'interroge PAS Render : on lit
   directement data/usage.json (généré par le moteur) puis la démo. En prod
   (GitHub Pages), on pointe sur le serveur Render. */
(function () {
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "" || location.protocol === "file:";
  window.CLAUDE_EATS_TOKENS_SERVER = isLocal ? "" : "https://claude-eats-tokens.onrender.com";
})();
