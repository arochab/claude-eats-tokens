<p align="center">
  <img src="assets/hero.png" alt="Claude Eats Tokens" width="100%">
</p>

<h1 align="center">Claude Eats Tokens</h1>

<p align="center">
  <b>Le pèse-personne de Claude. Combien Claude a-t-il dévoré aujourd'hui — et puis-je continuer ?</b>
</p>

<p align="center">
  Claude Code écrit chaque token qu'il consomme dans des logs locaux. Un petit moteur sur le PC les lit,<br>
  les totalise et les pousse vers un serveur gratuit ; une <b>web app installable</b> affiche, depuis le téléphone,<br>
  où vous en êtes — fenêtres glissantes, budgets, projections — dans la charte graphique d'Anthropic.
</p>

<p align="center">
  <img alt="PWA installable" src="https://img.shields.io/badge/PWA-installable-CC785C">
  <img alt="No build step" src="https://img.shields.io/badge/build-no%20build%20step-1A1915">
  <img alt="Coût d'infra" src="https://img.shields.io/badge/infra-100%25%20gratuite-7E9E6D">
  <img alt="Tests" src="https://img.shields.io/badge/tests-101%20%E2%9C%93-7E9E6D">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-D4A27F">
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Démo de Claude Eats Tokens sur mobile" width="280">
  <br>
  <sub><a href="assets/demo.mp4">▶︎ voir la démo en HD (vidéo nette)</a></sub>
</p>

<p align="center">
  <i>Une question, une réponse.</i> <b>« Je peux continuer ? »</b><br>
  🟢 <b>« Tout roule »</b> · 🟠 <b>« Ça chauffe sur les 5 dernières heures »</b> · 🔴 <b>« Lève le pied un moment »</b><br>
  Le feu ne s'allume que sur le vrai signal Max — la fenêtre de 5 h ; une grosse semaine félicite plutôt qu'elle n'alarme.
</p>

---

## Why this one?

Claude Max has **no usage API**. You cannot check how close you are to the
5-hour sliding window that actually throttles you — unless you're sitting
at your desk staring at Claude Code.

This app fixes that. It reads Claude Code's local logs, pushes them to a
free server, and gives you a **phone-installable app** that answers one
question:

> **"Can I keep going, or will I get throttled?"**

Three things no other tracker does:

- **Works from your phone.** Install it, check your usage from the couch,
  the train, anywhere. No terminal, no Python, no npm — just open and go.
- **Alerts before you hit the wall.** Push notifications on your phone when
  your 5-hour window is heating up — based on Anthropic's actual server
  percentage, not a guess.
- **Tells you what to do, not just what happened.** A traffic light with
  severity, ETA to throttle, and plain-language advice. A productive week
  gets a compliment, not a warning.

Zero build step · zero install · cross-platform · free infra · 146 tests · MIT ·
[see it in action →](assets/demo.gif)

---

## En deux phrases

Sur l'abonnement **Claude Max**, il n'existe **aucune API d'usage** : impossible de récupérer un « il vous reste X ». Mais Claude Code journalise déjà chaque échange dans des fichiers `~/.claude/projects/**/*.jsonl`. **Claude Eats Tokens** fait donc la seule chose honnête possible : un moteur Python lit ces logs, agrège la consommation, et la pousse vers une PWA mobile-first qui répond à la seule question qui compte — **« je peux continuer ou pas ? »**.

C'est à la fois mon outil perso de tous les jours et une pièce de portfolio : pipeline de données local, backend durable à coût nul, design system soigné et suite de tests complète.

---

## Architecture

Une PWA statique + un mini-serveur de push, reliés par les propres habitudes alimentaires de Claude. Le poste local reste la seule source de vérité ; tout le reste n'est que transport et affichage.

```
┌─────────────────────────────────────────────────────────────┐
│  Poste local  ·  lit ~/.claude/projects/**/*.jsonl           │
│  tools/push_usage.py — streaming, dédup, agrégation          │
│  (silencieux + démarrage auto Windows)                       │
└───────────────────────────────┬─────────────────────────────┘
                                │  POST /push  (secret partagé)
                                ▼
                ┌───────────────────────┐      ┌──────────────────────┐
                │   Render (Flask)      │ ───► │  Gist privée         │
                │   serveur de push     │      │  (store durable)     │
                └───────────┬───────────┘      └──────────────────────┘
                            │  GET /usage.json
                            ▼
                ┌───────────────────────┐
                │  PWA (GitHub Pages)   │
                │  installable, mobile  │
                └───────────────────────┘
                            ▲
                            │  repli si le serveur Render dort
                ┌───────────────────────┐
                │  data/usage.json      │
                └───────────────────────┘
```

1. **Le poste local est la seule source de vérité.** `tools/push_usage.py` lit les logs JSONL de Claude Code en streaming ligne à ligne (robuste aux gros volumes et aux lignes corrompues, qui sont comptées et non avalées en silence), déduplique les entrées, fusionne les modèles par famille, et agrège par jour, modèle, projet et fenêtres glissantes. **Il n'existe aucune API cloud pour l'usage Max — les logs *sont* la donnée.** Sous Windows, une tâche planifiée pousse les totaux en continu, sans terminal ouvert.
2. **Un serveur gratuit garde les derniers chiffres.** Une app **Flask sur Render** reçoit le push (protégé par secret partagé, comparaison à temps constant) et le recopie dans une **Gist GitHub privée**, pour que les chiffres survivent à la mise en veille du plan gratuit.
3. **La PWA affiche où vous en êtes.** Installable depuis **GitHub Pages**, elle lit la source la plus fraîche disponible (Render → `data/usage.json` → dataset de démo embarqué) et rend le verdict, les jauges, la heatmap et les tendances. En `localhost`, le front ignore Render et lit directement le fichier local (dev sans serveur).

Le calcul vit dans `tools/usage_core.py` — **logique pure et testée** ; `push_usage.py` n'est qu'une coquille d'I/O. Le format d'échange est documenté dans [`SCHEMA.md`](SCHEMA.md) (schéma `usage.json` v4).

---

## L'assistant intelligent

C'est ce qui sépare cette app d'un compteur de tokens. Un compteur affiche un nombre ; ici, le code **raisonne** sur vos données et répond en une phrase à « **je peux continuer ou pas ?** » — sans jamais inventer de quota ni culpabiliser.

Trois partis pris, une ligne chacun :

- **Seule la fenêtre de 5 h peut déclencher une alerte** — c'est le *seul* throttling réel sur Max ; la semaine et le mois n'alarment jamais.
- **On vous compare à vous-même**, via une médiane robuste de votre propre historique — jamais à un faux « il vous reste 23 % ».
- **L'intensité est une bonne nouvelle** : une grosse semaine, c'est « tu montes en puissance », pas un voyant rouge.

L'assistant renvoie **au plus 3 signaux**, triés par gravité, chacun avec un *pourquoi*. Exemples réels générés par l'app :

> 🔴 **Tu vas peut-être être ralenti**
> Ces 5 dernières heures, tu utilises Claude 3 fois plus que d'habitude. Si tu continues à ce rythme, Claude pourrait te ralentir dans ~1 h 10 min (avant que ça se remette à zéro à 14 h30). Pour les grosses tâches, attends ce moment-là.
> *Pourquoi : sur Claude Max, c'est ça qui peut te ralentir — trop d'usage en 5 h. On te prévient avant.*

> 🟢 **Belle journée de travail**
> Aujourd'hui tu utilises Claude 2 fois plus que d'habitude, et il n'est que 11 h. Tu avances bien.

> 🟢 **Tu montes en puissance avec Opus**
> Cette semaine tu utilises Claude 2 fois plus que d'habitude, surtout Opus, le modèle le plus puissant. Tu prends de l'élan.

Le premier signal calcule même une **ETA avant ralentissement** : il extrapole votre débit récent pour estimer *quand* vous toucheriez la zone inhabituelle, et le compare à l'heure du reset.

Et l'app sépare proprement deux familles d'alertes : les **signaux intelligents** ci-dessus, et **vos repères perso** (jour / mois) que *vous* fixez, affichés sous un titre sans ambiguïté — « **Tes repères perso (pas une limite Claude)** ». Un seuil que vous avez choisi ne se déguise jamais en limite imposée par Anthropic.

> La logique de comparaison (médiane, langage humain, signaux) vit dans `pwa/format.js`, couverte par `tests/test_format.mjs`. Le calcul de référence robuste — médiane + MAD en échelle log de votre historique — est fait côté moteur dans `tools/usage_core.py` et seulement consommé par le front.

---

## Fonctionnalités

### Le feu tricolore unifié — « je peux continuer ? »

Le cœur de l'app : une seule réponse, calculée sur le **pire** de trois horizons (5 h · semaine · mois), mais seule la fenêtre de 5 h peut faire virer le feu à l'orange ou au rouge. Voir [« L'assistant intelligent »](#lassistant-intelligent) pour la philosophie complète.

### Carte « Mes fenêtres » — le **vrai** pourcentage officiel

Le pourcentage **serveur exact** de vos fenêtres (5 h, semaine, Opus), le même que celui affiché par Claude Code — pas une estimation. Capté côté PC via l'endpoint officiel d'usage (`tools/refresh-windows.py`, qui rafraîchit le jeton via `claude -p` puis interroge `/api/oauth/usage`). Quand le vrai chiffre n'est pas disponible (PC éteint), un **badge** bascule de « officiel » (vert) à « estimation · moteur endormi » (terracotta), et l'app retombe sur l'estimation maison — **jamais un chiffre inventé qui se ferait passer pour officiel.**

### Carte « Utilisation du forfait » (repli estimé)

Quand le vrai % officiel n'est pas dispo, cette carte prend le relais : un pourcentage **estimé** des limites Max, tokens pondérés (`effectiveTokens`, cache lu × 0,1) pour refléter ce qui compte vraiment. Clairement étiquetée **estimation** (voir « Honnêteté des chiffres »).

### Carte « Où je me situe »

Place l'utilisateur sur un spectre **Découverte → Régulier → Intensif → Power-user**, à partir de sa semaine effective et de son pic 5 h. Les seuils sont des **estimations publiques de tiers** — explicitement **pas** des chiffres officiels Anthropic, qui ne publie aucun quota chiffré.

### Et aussi

- **Vrais projets, regroupés.** Chaque session est rattachée à son projet réel via son `cwd` (tous les `.claude/worktrees/*` d'un même dépôt fusionnent en une seule entrée), avec un coût pondéré par le vrai mix de modèles, un drill-down dans les sessions, et un filtre projet qui recalcule tout le tableau de bord.
- **Notifications par paliers.** Une alerte (sur le téléphone *et* sur le PC) à chaque palier franchi — 25 / 50 / 75 / 90 / 95 / 100 % — sur vos fenêtres 5 h et hebdo, calculée sur le **vrai % officiel** (jamais sur une estimation), une fois par palier et par fenêtre.
- **Héro radar 3D.** Un radar (Canvas natif, sans dépendance) dont les 3 arcs représentent vos 3 fenêtres (5 h / semaine / mois), remplis à leurs vrais pourcentages, teintés par l'état. Le grand chiffre éditorial se pose dessus.
- **Coût en € live.** Une estimation théorique au tarif API, taux $→€ réglable, clairement étiquetée « estimation » (sur Max, le coût réel est un forfait fixe).
- **Courbe d'évolution + projets.** Tendance tokens/jour (Aujourd'hui / 7 j / 30 j / Tout), et la conso par **vrai projet** (regroupé depuis le `cwd`, drill-down par session).
- **PWA complète.** Service worker à la racine (network-first sur l'app-shell, network-only sur la donnée, mise à jour automatique infaillible), shell hors-ligne. Tous les budgets et réglages vivent dans le `localStorage` du téléphone (écran ⚙️) — rien côté serveur.

---

## Installation & usage

### La web app — rien à installer

Ouvrez l'URL GitHub Pages depuis le téléphone, puis **Ajouter à l'écran d'accueil**. C'est tout. Sans moteur ni serveur configuré, l'app retombe sur `data/usage.json` puis sur un jeu de démo embarqué : elle est toujours fonctionnelle.

### Le moteur local (PC) — la source des chiffres

Le moteur lit vos logs Claude Code et pousse les totaux vers le serveur. Depuis
la v1, l'installation tient en **trois commandes** — pas de Python à installer,
pas de fichier à éditer, **pas de clé à recopier**.

```bash
# 1. installer uv une fois (gère Python et le CLI pour vous)
#    macOS/Linux :
curl -LsSf https://astral.sh/uv/install.sh | sh
#    Windows (PowerShell) :
#    irm https://astral.sh/uv/install.ps1 | iex

# 2. installer le moteur
uv tool install "git+https://github.com/arochab/claude-eats-tokens@v1"

# 3. brancher cet ordinateur à votre compte (device-pairing, aucune clé à copier)
claude-push pair
#    → un code « XXXX-XXXX » s'affiche ; ouvrez l'app, vérifiez qu'il correspond,
#      cliquez « Confirmer ». Le moteur récupère votre clé tout seul.

# 4. que ça tourne au démarrage, sans terminal ouvert (per-user, sans admin)
claude-push install-service
```

`claude-push doctor` diagnostique tout (clé, logs Claude trouvés, serveur, service).
`claude-push uninstall` retire le service en une commande (kill-switch).

Le **device-pairing** suit le pattern des CLI modernes (Stripe CLI, `gh auth
login`) : le code identique côté terminal et côté app, vérifié à l'œil, empêche
tout hameçonnage (RFC 8628). La clé vit dans `~/.config/claude-eats/config.json`.

<details><summary>Voie historique (scripts <code>.bat</code>, self-host, sans uv)</summary>

```bash
set PUSH_URL=https://votre-serveur.onrender.com
set CET_API_KEY=cet_votre_code_de_connexion   # (ou PUSH_SECRET en self-host)
python tools/push_usage.py --interval 60
```

Sous **Windows**, `DEMARRER.bat` (double-clic) et
`installer-demarrage-auto.ps1` (tâche planifiée) restent disponibles. Le code de
connexion se met dans `secret.local.bat` (modèle : `secret.local.example.bat`).
</details>

### Déploiement (gratuit de bout en bout)

1. **Front → GitHub Pages.** Le workflow GitHub Actions publie le site statique à chaque push sur `main`.
2. **Serveur → Render.** Déployer `server/` via `render.yaml` (`gunicorn app:app`, rootDir `server/`) ; régler `PUSH_SECRET`, plus `GITHUB_TOKEN` (scope `gist`) et `GIST_ID` pour la persistance durable.
3. **Câblage.** Mettre l'URL Render dans `pwa/config.js`.

Pas à pas complet dans [`DEPLOIEMENT.md`](DEPLOIEMENT.md) et [`CONFORT-SETUP.md`](CONFORT-SETUP.md).

---

## Honnêteté des chiffres

Ce projet assume ses limites — c'est ce qui le rend digne de confiance :

- **Anthropic ne publie aucun quota chiffré** pour Max. La seule limite *dure* connue est la **fenêtre glissante de 5 h**. C'est la seule chose qui peut réellement vous ralentir, et donc la seule qui fait virer le feu.
- **Tous les chiffres de limites** (forfait, positionnement « Où je me situe ») sont des **estimations de tiers**, à recalibrer. Ce ne sont pas des données officielles.
- **Le coût en $/€ est une estimation** au tarif API. Sur Max vous payez un **forfait fixe** : c'est de la « valeur consommée au prix API », pas une facture.
- **Render free s'endort** : la toute première requête après une période d'inactivité peut prendre ~50 s. Le repli `data/usage.json` couvre ce cas.

---

## Stack technique

| Brique | Choix |
|---|---|
| **Front** | HTML/CSS/JS vanilla — **aucun build**, Chart.js pour les graphes |
| **PWA** | Service worker à la racine (`sw.vN.js`), manifest, shell hors-ligne |
| **Moteur** | Python pur (`usage_core.py` logique testable + `push_usage.py` coquille I/O streaming) |
| **Serveur** | Flask sur Render, `gunicorn`, auth à temps constant |
| **Store** | Gist GitHub privée (contourne le disque éphémère du plan gratuit) |
| **CI/CD** | GitHub Actions → déploiement Pages à chaque push |
| **Design** | Charte Anthropic en CSS pur — crème `#F0EEE6`, slate `#1A1915`, terracotta `#CC785C`, clay `#D4A27F` ; serif éditoriale pour les chiffres clés, sans-serif pour l'UI |

---

## Tests

Chaque formule est couverte : inférence de projet depuis le `cwd`, coût pondéré par modèle, fenêtre 5 h, projections, fusion de projets, feu tricolore, positionnement, et helpers de formatage front.

```bash
python tests/run_all.py
```

**146 tests** au total — **91 Python** (`test_usage_core.py`, `test_server.py`, `test_statusline.py`, via `unittest`) et **55 Node** (`test_format.mjs`, via `node:test`). Le runner lance les deux suites et n'est vert que si tout passe.

---

## Carte du dépôt

```
index.html                       landing + dashboard (racine, pour le scope Pages)
pwa/                             app.js · format.js (helpers purs) · styles.css · config.js · manifest · icônes
sw.vN.js                         service worker à la racine (network-first shell, network-only data, purge)
data/usage.json                  derniers chiffres (poussés, schéma v5) · usage.demo.json (échantillon)
server/app.py                    serveur de push Flask (Render) + persistance Gist
tools/usage_core.py              logique pure (cwd→projet, coût/modèle, fenêtres) — entièrement testée
tools/push_usage.py              côté PC : stream logs → agrège → POST /push
tools/make_demo.py               régénère le dataset de démo
tests/                           146 tests · python tests/run_all.py (Python + Node)
DEMARRER.bat                     lance le moteur à la main (double-clic)
installer-demarrage-auto.ps1     crée la tâche planifiée (démarrage auto du moteur)
desinstaller-demarrage-auto.bat  retire la tâche planifiée
render.yaml                      blueprint de déploiement Render
.github/workflows/               déploiement de la PWA sur Pages
assets/                          hero.png (bannière) · demo.gif + .mp4 (démo mobile)
```

---

## Licence

[MIT](LICENSE) · Construit par **Adam Chabbi**.
