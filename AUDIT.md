# AUDIT — claude-eats-tokens

> Audit brutal, MECE, exhaustif. Méthode : lecture des **vrais logs**
> `~/.claude/projects/**/*.jsonl` (schéma réel déduit, fixtures du repo ignorées)
> + relecture du code source + **vérification adversariale** de chaque
> affirmation par un second relecteur. Les findings « overstated » ou « false »
> ci-dessous ont été *dégradés ou retirés après contre-vérification sur le code*
> — pas de complaisance, mais pas d'alarmisme inventé non plus.
>
> Date : 2026-06-22 · Périmètre : front PWA, moteur `push_usage.py`, serveur Flask, persistance Gist.

---

## 0. Faits vérifiés sur les vraies données (socle de l'audit)

Ces faits sont **confirmés** en lisant les vrais `.jsonl`, pas supposés.

| Fait | Preuve |
|---|---|
| Volume réel des logs | **2106 fichiers, 413 Mo au total**, plus gros fichier unique **16 Mo**. |
| Le `cwd` réel est dans chaque enregistrement | clé `cwd` présente sur ~517/601 lignes d'une session type. Ex. `C:\Users\…\AGENTIC-FIGMA-MCP\.claude\worktrees\nifty-lumiere-37ca98`. |
| Le vrai projet = segment **avant** `.claude\worktrees` (ou `.codex\worktrees`) | Règle validée sur **tous** les dossiers réels : 25 worktrees `AGENTIC-FIGMA-MCP` se regroupent correctement ; `00-AXIS-CONTROL`, `claude-eats-tokens`, `kapman-news`, `business-clients` corrects ; seul `C:\` (session sans projet) tombe en `None` → repli. |
| Schéma `message.usage` réel | `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` (+ `cache_creation{}`, `iterations[]`). `message.model` ex. `claude-sonnet-4-6`. |
| Libellés humains disponibles | `customTitle` (titre de session lisible), `lastPrompt` / 1er message user. `slug` = **bruit auto-généré** (`replicated-snacking-horizon`) → c'est la source des noms « lumiere / gates / darwin ». |
| Secrets | `.gitignore` exclut `.env`, `secret.local.bat`, `data/usage.json`, `*.log`. `.env.example` ne contient que des placeholders. **Aucune fuite de secret dans le repo.** ✅ |

---

## 1. Cartographie du code

| Fichier | Lignes | Rôle | Dette principale |
|---|---:|---|---|
| `pwa/app.js` | **534** | Front complet, **IIFE monolithique unique** | 25+ fonctions mélangées : fetch, settings, calibrage, formatage, anneaux SVG, render, 3 charts, heatmap, notifications, cycle SW, UI réglages. Non testable. Code mort `_oldload()`. Charts recréés à chaque render. |
| `tools/push_usage.py` | **314** | Moteur local : lit les `.jsonl`, agrège, POST `/push` | **`pretty_project()` lit le nom de DOSSIER slugifié, ignore le `cwd` réel** (bug #1). `fp.read_text()` charge chaque fichier entier en RAM (413 Mo relus à chaque cycle de 60 s). Coût/projet figé au tarif Sonnet. `projects[:12]` sans bucket « Autres ». Skip-list codée en dur pour le user d'Adam. |
| `server/app.py` | 113 | Flask : `POST /push` (secret), `GET /usage.json`, persistance Gist | Comparaison de secret **non constante** (timing). `CORS(app)` grand ouvert. Validation payload = présence de `totals` seulement. Échecs Gist avalés sans log. |
| `pwa/styles.css` | 187 | Design system (DA Anthropic) | Pas de `:focus-visible`, pas de `prefers-reduced-motion`, dark mode incomplet (héro `#100F0C`), pas de breakpoint < 360px. |
| `index.html` | 171 | Coque SPA | `maximum-scale=1` (bloque le zoom — a11y). Chart.js CDN sans SRI ni repli. Modale réglages sans piège de focus. |
| `sw.v5.js` | 10 | Service worker actif (cache `cet-v5`, network-only sur data) | Correct : purge les caches `!= cet-v5` à l'`activate`. |
| `service-worker.js` | 34 | **SW legacy dupliqué** (cache `v4`) | Doublon au root. Purgé par v5 à la 1re activation, mais piège de scope à supprimer. |
| `pwa/config.js` | 1 | URL serveur Render | URL en dur, pas paramétrable. |

**Synthèse dette** : le cœur du problème n'est pas la quantité de code (compact),
c'est (a) **l'inférence projet fausse à la racine**, (b) le **monolithe front
non testable**, (c) la **robustesse moteur** (lecture mémoire + parsing
silencieux), (d) quelques **trous a11y bloquants**. Tout le reste est secondaire.

---

## 2. Inventaire MECE des défauts (par axe)

Sévérité finale = après contre-vérification. `verdict` indique le résultat du relecteur adversarial.

### AXE 1 — Projets & discussions (le point faible #1)

| ID | Défaut | Sévérité | Impact | Effort | Verdict |
|---|---|---|---|---|---|
| A1-1 | **`cwd` totalement ignoré** : projet = nom de dossier slugifié → worktree (`lumiere`, `gates`, `37ca98`) au lieu du vrai projet | **Bloquant** | Toute la vue Projets est fausse | M | confirmé (vérifié par moi sur les vraies données) |
| A1-2 | Pas de détection de collision : deux projets de même nom feuille fusionnent silencieusement | Majeur | Tokens/coûts mélangés | M | confirmé |
| A1-3 | Coût/projet figé au tarif **Sonnet** quel que soit le mix réel | Bloquant | Coût faux (Opus sous-estimé ~5×) | M | confirmé |
| A1-4 | Aucun repli `customTitle` / 1er message pour un libellé lisible | Majeur | Slugs cryptiques, pas de drill-down | M | confirmé |
| A1-5 | `usage.json` non versionné → on ne peut pas faire évoluer la forme sans casser le front | Majeur | Bloque toute l'évolution | S | confirmé |
| A1-6 | `projects[:12]` sans bucket « Autres » | Majeur | Conso de la traîne invisible | S | confirmé |
| A1-7 | Skip-list codée en dur pour le user d'Adam | Mineur | Casse sur autre machine | S | confirmé |
| A1-8 | Code mort `_oldload()` | Mineur | Bruit | S | confirmé |
| A1-9 | Pas de `lastActivity` par projet (tri par récence impossible) | Mineur | Friction tri | S | confirmé |

### AXE 2 — Qualité code & architecture

| ID | Défaut | Sévérité | Impact | Effort | Verdict |
|---|---|---|---|---|---|
| A2-1 | `app.js` = monolithe 534 lignes, 25+ responsabilités | Majeur | Intestable, non maintenable | L | confirmé |
| A2-2 | Charts Chart.js **détruits/recréés à chaque render** | Majeur | Lag/flicker mobile au changement de période | S | confirmé |
| A2-5 | `fp.read_text()` charge chaque `.jsonl` entier en RAM ; **413 Mo relus chaque cycle** | **Bloquant** | OOM possible, CPU/disque gaspillés | M | confirmé |
| A2-8 | (= A1-1) `pretty_project` sur nom de dossier vs `cwd` | Bloquant | cf. A1-1 | M | confirmé |
| A2-6 | Coût projet au tarif `default` (cf. A1-3) | Majeur | Coût faux | M | confirmé |
| A2-7 | `projects[:12]` (cf. A1-6) | Majeur | Perte de données | M | confirmé |
| A2-11 | Appels Gist sans retry/backoff côté serveur | Majeur | 1 échec transitoire = données non persistées | M | confirmé |
| A2-13 | **Zéro test** (aucune infra) | Majeur | Régressions invisibles, refactor risqué | L | confirmé |
| A2-18 | `splitlines()` + `errors=ignore` : lignes corrompues **avalées sans compteur** | Majeur | Perte de données silencieuse | M | confirmé |
| A2-4 | SW dupliqué (`sw.v5.js` + `service-worker.js`) | Majeur→**Mineur** | v5 purge le v4 à l'activate (auto-réparé) ; reste un foot-gun | S | confirmé, sévérité corrigée |
| A2-10 | Erreur front générique « Impossible de charger » | Mineur | Pas d'auto-diagnostic | S | confirmé |
| A2-14 | Chart.js CDN sans SRI ni repli | Mineur | Charts cassés si CDN KO | S | confirmé |
| A2-17 | Cold-start Render ~50 s sans timeout ni UI | Mineur→Majeur (cf. REL-001) | App figée 50 s | M | confirmé |
| A2-3/9/12/15/16/19 | Code mort, validation env, config en dur, dedup notif fragile, SW minifié | Mineur | divers | S | confirmés |

### AXE 3 — UX/UI & accessibilité

| ID | Défaut | Sévérité | Impact | Effort | Verdict |
|---|---|---|---|---|---|
| A3-1 | **Pas de `:focus-visible`** sur boutons/segments/icônes | **Bloquant** | Navigation clavier invisible (WCAG 2.4.7) | M | confirmé |
| A3-2 | Modale réglages : **pas d'Échap ni de piège de focus** | **Bloquant** | Utilisateur clavier piégé (WCAG 2.4.3) | M | confirmé |
| A3-3 | Boutons période sans `aria-selected`/`role=group` | Majeur | Lecteur d'écran ne sait pas la sélection | M | confirmé |
| A3-6 | Dark mode incomplet (héro `#100F0C`, couleurs charts fixes) | Majeur | Contraste/lecture dégradés en sombre | M | confirmé |
| A3-7 | Aucun handler clavier (flèches période, Échap, Entrée) | Majeur | Power-users clavier bloqués (WCAG 2.1.1) | M | confirmé |
| A3-4 | Canvas/SVG : `aria-label` génériques, pas de `aria-describedby` | Majeur→Mineur | Données chart inaccessibles au lecteur d'écran | M | overstated (labels présents mais génériques) |
| A3-12 | `maximum-scale=1` bloque le zoom mobile | Mineur | Malvoyants ne peuvent zoomer (WCAG 1.4.4) | S | confirmé |
| A3-8 | Pas de `prefers-reduced-motion` | Mineur | Inconfort vestibulaire | S | confirmé |
| A3-9 | Pas de breakpoint < 360px (iPhone SE, vieux Android) | Mineur | Débordement horizontal | M | confirmé |
| A3-10 | États vides pauvres (« Aucune donnée », `000`) sans guidage | Mineur | 1re ouverture confuse | M | confirmé |
| A3-5 | Contraste texte muted | ~~Majeur~~ | `#6B6A60` sur papier = **5.4:1, PASSE AA** | S | **overstated** (corrigé) |
| A3-11/13/14/15 | Anneaux SVG sans `<title>`, code mort, pas de `:hover` | Mineur | polish | S | confirmés |

### AXE 4 — Données & analytics

| ID | Défaut | Sévérité | Impact | Effort | Verdict |
|---|---|---|---|---|---|
| PROJECT-COST-WRONG-MODEL | Coût/projet au tarif Sonnet (= A1-3) | **Bloquant** | Coût faux | M | confirmé |
| MISSING-COST-PER-PROJECT | Pas de coût/projet ventilé par modèle | Majeur | « Quel projet coûte le plus ? » sans réponse | M | confirmé |
| MISSING-WEEK-COMPARISON | Pas de comparaison semaine vs semaine / projet vs projet | Mineur | Peu d'insight tendance | M | confirmé |
| MISSING-PEAK-HOURS | `by_hour` calculé mais **jamais exposé** ni rendu (heatmap horaire) | Mineur | Heures de pointe invisibles | S | confirmé |
| MISSING-MODEL-PER-PROJECT | Pas de mix modèle par projet | Mineur | Pas d'optim modèle/projet | S | confirmé |
| MISSING-EXPORT | Pas d'export CSV/PNG | Mineur | Pas de partage/archive | M | confirmé |
| DEDUP-KEY-COLLISION | Clé dedup `:` si `id` ET `requestId` absents | Mineur | Double-comptage possible (rare) | S | confirmé |
| W5H-RESET-AT | Reset 5h en UTC, edge case DST | Mineur | ±1h rare | S | confirmé |
| MONTH-PROJECTION | Projection linéaire naïve | ~~Majeur~~→Mineur | Hypothèse linéaire, pas un bug | M | **overstated** (`monthrange` gère les bissextiles) |
| HEALTH-SCORE | `100 - worst` | ~~Mineur~~ | Sémantiquement correct | S | **overstated** |
| AVG-ZERO-DIV | `avg` sur données éparses | ~~Mineur~~ | `max(1, …)` empêche la div/0 | S | **overstated** |
| W5H-BOUNDARY | « fenêtre 5h sous-compte d'1h » | ~~Majeur~~ | **FAUX** : `window()` compare des datetime complets, clés horaires planchées | S | **FALSE — retiré** |

> ✅ **Exactitude des calculs : globalement saine.** La fenêtre 5h, la projection
> mensuelle, le score santé et la conversion € sont **corrects** après
> vérification. Les seules vraies erreurs de calcul sont : le **coût par projet
> (mauvais modèle)** et le **dedup `:`** sur enregistrements incomplets.

### CROSS — Sécurité & fiabilité

| ID | Défaut | Sévérité | Impact | Effort | Verdict |
|---|---|---|---|---|---|
| SEC-001 | Comparaison de secret **non constante** (`!=`) sur `/push` | **Bloquant** | Timing attack → fuite du `PUSH_SECRET` | S | confirmé |
| SEC-002 | `CORS(app)` grand ouvert (toute origine) | Majeur | Si secret fuit, POST depuis n'importe où | M | confirmé |
| SEC-003 | Validation payload superficielle (`'totals' in payload`) | Majeur | `{"totals": null}` passe → corruption Gist/front | S | confirmé |
| SEC-004 | Échecs Gist avalés, `/push` renvoie 200 même si l'écriture échoue | Majeur | Perte de données silencieuse au réveil Render | M | confirmé (mitigé par le repli local `data/usage.json`) |
| REL-001 | Cold-start Render ~50 s sans timeout/UI | Majeur | App figée, requêtes empilées | M | confirmé |
| REL-002 | Échecs de push avalés dans la boucle moteur, pas d'alerte | Majeur | Moteur muet pendant des heures | M | confirmé |
| SEC-005 | Pas d'indicateur d'âge/fraîcheur exposé par `/usage.json` | Majeur→Mineur | `generatedAt` existe déjà + `ago()` l'affiche ; manque `age_seconds` serveur | M | overstated |
| REL-003 | Repli démo silencieux | Mineur | `ago()` + bandeau « Démonstration » existent déjà | S | overstated |
| SEC-006 | Scope `GITHUB_TOKEN` non validé au runtime | Mineur | Token sur-scopé = risque élargi | S | confirmé |

> ✅ **Posture secrets : bonne.** `.gitignore` complet, `.env.example` propre.
> Le risque sécurité réel et actionnable = **SEC-001 (timing-safe compare)** et
> **SEC-003 (validation payload)**. Le reste est durcissement.

---

## 3. Top 10 priorisé (matrice impact × effort)

Ordre = quick-wins bloquants d'abord, puis gros chantiers à fort impact.

| # | Action | Axe | Sévérité | Effort | Pourquoi en premier |
|---|---|---|---|---|---|
| 1 | **Inférer le vrai projet depuis `cwd`** (segment avant `.claude/.codex worktrees`) + regroupement + repli `customTitle`→session | A1-1/2/4 | Bloquant | M | C'est *la* demande #1. Règle déjà validée sur 100% des vraies données. |
| 2 | **Coût par projet ventilé par modèle réel** (fini le tarif Sonnet figé) | A1-3 / A4 | Bloquant | M | Chiffres faux = app non crédible. Vient gratuitement avec le refactor d'agrégation #1. |
| 3 | **Streaming + parsing robuste** de `push_usage.py` (ligne à ligne, compteur de lignes corrompues, gros fichiers) | A2-5/18 | Bloquant | M | 413 Mo relus en RAM chaque cycle. Quick-win mémoire/CPU. |
| 4 | **`hmac.compare_digest` + validation de payload typée** sur `/push` | SEC-001/003 | Bloquant | S | Sécurité, ~10 lignes, zéro risque. |
| 5 | **`:focus-visible` + Échap/piège de focus modale + nav clavier** | A3-1/2/7 | Bloquant a11y | M | Trois bloquants WCAG, indispensables pour un livrable « PWA ». |
| 6 | **Versionner `usage.json` (`schema: 2`)** + bucket « Autres » + `lastActivity`/projet | A1-5/6/9 | Majeur | S | Débloque l'évolution sans casser le front déployé. |
| 7 | **Vue Projets dédiée + drill-down sessions + filtre projet cliquable** recalculant les vues | A1 / A3 | Majeur | L | Le livrable visible de l'axe 1. |
| 8 | **Démonolithiser `app.js`** en modules + **tests purs** (agrégation, fenêtres, inférence, formatage) | A2-1/13 | Majeur | L | Rend tout le reste testable et sûr. |
| 9 | **Analytics** : heatmap horaire (données déjà là), modèles/projet, semaine vs semaine, export CSV/PNG | A4 | Majeur/Mineur | M | Valeur produit + pièce de portfolio. |
| 10 | **Fiabilité** : timeout+repli cold-start, retry/backoff Gist, états d'erreur distincts, alerte moteur sur N échecs | REL-001/002, A2-11/10 | Majeur | M | Rend l'app honnête sur sa fraîcheur. |

---

## 4. Risques & angles morts

**Sécurité**
- ✅ Secrets non committés (`.gitignore` vérifié). `.env.example` = placeholders.
- ⚠️ `PUSH_SECRET` comparé en temps non constant (**SEC-001, bloquant, trivial à corriger**).
- ⚠️ `/push` accepte tout payload contenant la clé `totals` → injection de données malformées (**SEC-003**).
- ⚠️ `CORS(app)` total : à restreindre (defense-in-depth ; le secret reste la vraie barrière).
- ⚠️ Scope du `GITHUB_TOKEN` non vérifié : documenter « gist uniquement ».

**Fiabilité**
- Render s'endort (~50 s) → aujourd'hui l'app **se fige** sans feedback (REL-001).
- Le moteur peut **échouer en silence** des heures (REL-002) ; aucune alerte.
- Échec d'écriture Gist **avalé**, `/push` renvoie quand même 200 (SEC-004) ; mitigé par le repli local `data/usage.json` mais pas signalé.
- **Angle mort fraîcheur** : `generatedAt` existe et `ago()` l'affiche, mais rien ne distingue « data d'il y a 2 min » de « cache Render de 2 semaines » côté serveur. À exposer (`age_seconds`).

**Exactitude des calculs**
- ✅ Fenêtre 5h, projection mensuelle, score santé, conversion € : **corrects** (vérifiés, plusieurs accusations initiales étaient fausses/exagérées).
- ⚠️ Seules vraies erreurs : **coût/projet (modèle figé)** et **dedup `:`** sur enregistrements sans `id`/`requestId`.

**Portabilité**
- Skip-list de `pretty_project()` codée pour le user d'Adam → casse ailleurs (mineur, mais à généraliser).

---

## 5. Plan d'implémentation (Phase 2)

Ordre d'exécution dérivé du Top 10, en 4 axes du brief :

1. **AXE 1** (#1, #2, #6, #7) — inférence `cwd`, regroupement, coût/modèle, schéma v2, vue Projets + drill-down + filtre. *Cœur de la valeur.*
2. **AXE 2** (#3, #4, #8) — streaming/robustesse moteur, sécurité serveur, démonolithisation + tests purs.
3. **AXE 3** (#5) — a11y bloquants, dark mode, états vides, responsive, micro-interactions.
4. **AXE 4** (#9) — heatmap horaire, modèles/projet, comparaisons, export ; revalidation chiffrée des formules (tests).
5. **Transverse** (#10) — fiabilité (timeout/repli/retry/alertes), docs (README, CONFORT-SETUP).

**Définition de fini** : 4 axes traités, tests passants, app déployée affichant
de **vrais noms de projets regroupés**, zéro régression, docs à jour, récap
avant/après.

---

*Fin de l'audit. Aucune implémentation n'a été faite — conformément au brief,
l'audit est livré d'abord. Prêt à attaquer la Phase 2 sur validation.*
