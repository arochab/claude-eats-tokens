# Session Handoff — reprise de contexte

> Permet de reprendre le travail sur `claude-eats-tokens` dans une nouvelle session.
> Supprimable une fois le contexte repris.

## Où on en est

PWA de suivi des tokens Claude **construite et testée en local** :
- Front (GitHub Pages) : `index.html` + `pwa/` + `data/usage.json`.
- Serveur push (Render) : `server/app.py` (Flask), round-trip PC→serveur→PWA
  testé OK, secret invalide rejeté (401).
- Outil PC : `tools/push_usage.py` lit `~/.claude/projects`, agrège, pousse.
- Design DA Anthropic, jauges/anneaux, alertes de seuil, projection de rythme,
  heatmap, donut, tendances, écran réglages (localStorage), notifications PWA.

## Reste à faire pour mettre en ligne (côté Adam)

1. Créer le repo GitHub `claude-eats-tokens` (public, MIT, topics).
2. Activer **GitHub Pages** (source : GitHub Actions) → le workflow `pages.yml`
   déploie le front. URL : `https://arochab.github.io/claude-eats-tokens/`.
3. Déployer `server/` sur **Render** (Blueprint `render.yaml`), définir
   `PUSH_SECRET` (+ `GITHUB_TOKEN`/`GIST_ID` pour la persistance).
4. Mettre l'URL Render dans `pwa/config.js` (`window.CLAUDE_EATS_TOKENS_SERVER`).
5. Sur le PC : `DEMARRER.bat` (env `PUSH_URL` + `PUSH_SECRET`) → pousse en boucle.
6. Sur le tel : ouvrir l'URL Pages, « Ajouter à l'écran d'accueil », activer les
   notifications dans ⚙️.

## Décisions prises

- **Cloud + push** retenu (vs tunnel temps réel) : lien fixe, app ouvrable même
  PC éteint ; compromis = chiffres datés du dernier push. C'est le bon choix
  pour l'usage d'Adam (zéro friction > fraîcheur absolue).
