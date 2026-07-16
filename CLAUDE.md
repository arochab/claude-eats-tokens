# Claude Eats Tokens — Agent Instructions

> ## ⚠️ LIS `AGENT.md` MAINTENANT, AVANT TOUTE AUTRE CHOSE.
>
> `AGENT.md` est la **mémoire vivante** du projet : les pièges déjà payés, les
> décisions produit gravées, les chantiers laissés en plan par la session
> précédente, et la façon de travailler avec Adam. Ce fichier-ci décrit
> l'architecture (le *quoi*) ; `AGENT.md` contient le *pourquoi* et le
> *n'y retombe pas*.
>
> **Tu dois aussi le mettre à jour en fin de session** dès que tu as appris
> quelque chose de non déductible du code (un piège, une décision d'Adam, un
> chantier ouvert). Le protocole exact est en tête de `AGENT.md`.

Claude Eats Tokens est un **suivi visuel de la consommation de tokens Claude**
(Claude Code + API), distribué comme **Progressive Web App** installable sur
téléphone. Front statique sur **GitHub Pages**, petit serveur de push sur
**Render**. 100% gratuit à faire tourner.

Audience : usage perso d'Adam + pièce de portfolio. Mobile-first.

## Architecture (réglée — ne pas re-dériver)

**Depuis le 16 juil 2026, il n'y a plus de serveur dans le chemin des données.**

```
Poste local (lit ~/.claude/projects)  ──rpc cet_push_usage──►  Supabase (PostgreSQL)
                                                                     ▲
   PWA (GitHub Pages)  ────────────────rpc cet_get_usage────────────┘
   data/usage.json (repli) ──► data/usage.demo.json (démo)
```

- Le PC et la PWA parlent **directement** à PostgREST avec la clé *publishable*
  (publique, rôle `anon`), et prouvent leur identité avec la clé perso `cet_`.
  Toutes les tables sont en **RLS sans policy** : `anon` ne lit RIEN en direct.
  Seules les deux fonctions `SECURITY DEFINER` de la migration **0005**
  (`cet_get_usage`, `cet_push_usage`) sont exposées ; elles comparent le SHA-256
  de la clé et ne rendent que les lignes de son porteur.
- **Render est hors du chemin** (`server/app.py` reste au dépôt pour la voie
  legacy self-host : `PUSH_SECRET` sans clé `cet_`). Pourquoi : le 15 juil 2026
  à 15h00, Render a suspendu le service pour *Free Tier Usage Exceeded* — les
  750 h/mois gratuites sont **partagées par tout le workspace**, et deux services
  allumés en permanence les brûlent en 15,6 jours. Le quota ne se recharge que le
  1er du mois. Une archi qui meurt une fois par mois n'est pas une archi.
- Bascule côté PC : `config.use_direct()` (clé `cet_` présente → direct).
  `CET_FORCE_SERVER=1` force l'ancienne voie. Côté front : `useDirect()` dans
  `pwa/app.js`. Aucun des deux ne contacte Render en voie directe — c'est le
  point clé : **sans appelant, Render dort et ne consomme plus rien**.

- **Le service worker vit à la RACINE** (`sw.vN.js`, actuellement `sw.v29.js`) —
  jamais dans `pwa/`, sinon le scope ne couvre pas toute l'app. Network-first sur
  l'app-shell, network-ONLY sur `usage.json`/Render, purge tout cache != version
  courante. Pour invalider proprement un déploiement bloqué en cache : monter la
  version (renommer en `sw.v30.js`, bumper `CACHE`/commentaires dedans) + mettre à
  jour `SW_FILE` dans `pwa/app.js`.
- **Le front lit dans cet ordre** : `window.CLAUDE_EATS_TOKENS_SERVER` (Render) →
  `data/usage.json` (Pages) → `data/usage.demo.json` (démo). Réglé dans
  `pwa/config.js`, qui en **localhost** ignore Render et lit directement le
  fichier local (dev sans serveur).
- **Schéma `usage.json` = v5** (champ `schema`, additif : v4 = windowsOfficial, v5 = sessions enrichies + wasteSuspects + anomalies). Calcul pur et testable dans
  `tools/usage_core.py` (couvert par `tests/`). `push_usage.py` n'est qu'une
  coquille I/O (streaming ligne à ligne, robuste aux gros volumes/corruptions).
  Les projets sont déduits du **vrai `cwd`** (segment avant `.claude/.codex
  worktrees`), regroupés par nom, avec coût pondéré par modèle, `sessions[]`,
  `models[]`, `timeline[]` et `lastActivity` pour le drill-down.
- **Serveur** `server/app.py` sur Render (`gunicorn app:app`, rootDir `server/`).
  Données persistées dans une **Gist privée** (env `GITHUB_TOKEN` scope `gist`,
  `GIST_ID`) + `PUSH_SECRET`.
- **Le PC pousse** via `tools/push_usage.py` (boucle, env `PUSH_URL` +
  `PUSH_SECRET`). C'est la seule source des chiffres : Anthropic n'expose pas
  d'API d'usage pour l'abonnement Max.

## Réglages & budgets (côté client)

Les plafonds (jour / semaine / mois / fenêtre 5h / fenêtre 7j / crédits API),
le taux $→€, le seuil d'alerte et les projets en cours sont **dans le
localStorage du téléphone** (écran ⚙️). Rien de tout ça ne vit côté serveur.

## Gotchas

- Sur **Max**, pas de compteur officiel « il reste X » : la logique réelle =
  fenêtres glissantes de 5h. Les budgets sont ceux qu'Adam fixe lui-même.
- Le **coût $/€ est une estimation** au tarif API (Max = forfait fixe).
- Render free s'endort : la première requête peut prendre ~50s.

## Design system (DA Anthropic)

Crème `#F0EEE6` · Slate `#1A1915` · Terracotta `#CC785C` · Clay `#D4A27F`.
Serif éditoriale pour les chiffres clés, sans-serif pour l'UI. Tout vit dans
`pwa/styles.css`.
