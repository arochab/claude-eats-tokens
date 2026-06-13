# Mettre Claude Eats Tokens en ligne — guide pas à pas

Tout est gratuit. ~15 min la première fois.

## 1. Créer le repo GitHub
1. Dézippe `claude-eats-tokens.zip`.
2. Dans le dossier, ouvre un terminal et lance :
   ```bash
   git init
   git add -A
   git commit -m "Claude Eats Tokens — PWA de suivi des tokens"
   git branch -M main
   git remote add origin https://github.com/arochab/claude-eats-tokens.git
   git push -u origin main
   ```
   (Crée d'abord le repo vide `claude-eats-tokens` sur github.com — public, sans
   README, il est déjà dedans.)
3. Dans le repo → **Settings → General** : description
   « Claude has a serious appetite. This is the kitchen scale. » + topics :
   `pwa, claude, claude-code, github-pages, render, tokens, dashboard,
   service-worker, data-visualization, anthropic`.

## 2. Front → GitHub Pages
- Repo → **Settings → Pages** → Source : **GitHub Actions**.
- Le workflow `pages.yml` déploie tout seul à chaque push.
- URL : `https://arochab.github.io/claude-eats-tokens/`
  (l'app marche déjà ici avec les données de démo).

## 3. Serveur → Render
1. Va sur render.com → **New → Blueprint** → connecte le repo → il lit
   `render.yaml`.
2. Variables d'env : `PUSH_SECRET` (invente un secret long).
   Optionnel (persistance durable) : crée une Gist privée avec un fichier
   `usage.json`, mets `GIST_ID` + un `GITHUB_TOKEN` (scope `gist`).
3. Déploie → tu obtiens `https://claude-eats-tokens.onrender.com`.

## 4. Relier le front au serveur
- Édite `pwa/config.js` :
  ```js
  window.CLAUDE_EATS_TOKENS_SERVER = "https://claude-eats-tokens.onrender.com";
  ```
- Commit + push (Pages se redéploie).

## 5. Envoyer tes vrais chiffres (PC)
- Édite `DEMARRER.bat` : mets le même `PUSH_URL` et `PUSH_SECRET` que Render.
- Double-clic sur `DEMARRER.bat` → il pousse tes tokens en boucle (60 s).
- (Pré-requis : Python installé, coché « Add to PATH ».)

## 6. Sur ton téléphone
- Ouvre `https://arochab.github.io/claude-eats-tokens/`.
- **Ajouter à l'écran d'accueil** → icône + plein écran.
- ⚙️ **Réglages → Notifications → Activer** + cale tes budgets.

Voilà : lien fixe, app ouvrable même PC éteint (derniers chiffres connus),
notifications aux seuils. Plus jamais de QR à re-scanner. ✅
