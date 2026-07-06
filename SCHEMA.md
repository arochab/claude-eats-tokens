# `usage.json` — schéma de données

Le moteur (`tools/push_usage.py`) produit ce JSON ; le front (`pwa/app.js`) le
consomme ; le serveur (`server/app.py`) le relaie. Champ `schema` = version.

## v5 (courant)

```jsonc
{
  "schema": 5,
  "generatedAt": "2026-06-22T18:00:00+00:00",   // ISO UTC, quand le moteur a tourné
  "demo": false,                                  // true uniquement pour le dataset démo
  "source": {
    "claudeCodeDir": "C:\\Users\\...\\.claude\\projects" | null,  // null => mode démo
    "fileCount": 2125,
    "messages": 24640,
    "skippedLines": 0,            // lignes JSONL corrompues ignorées (visibilité, pas silencieux)
    "firstActivity": "ISO", "lastActivity": "ISO",
    "apiConnected": false
  },
  "totals": { "input", "output", "cacheCreate", "cacheRead", "total", "cost" },  // cost = USD théorique
  "today":  { "total", "cost" },
  "last7Days":  { "input","output","cacheCreate","cacheRead","total" },
  "last30Days": { ... },
  "timeline": [ { "date":"YYYY-MM-DD", "input","output","cacheCreate","cacheRead","total" }, ... ],
  "windows": {                                   // ESTIMATION maison (calcul local)
    "w5h":  { ...accumulateur..., "total" },     // fenêtre glissante 5h
    "w5hResetAt": "ISO" | null,                  // (plus vieux bucket dans la fenêtre) + 5h
    "w7d":  { ... }
  },

  // —— Nouveauté v4 : le VRAI % officiel des fenêtres (serveur Anthropic) ——
  // Capturé par tools/refresh-windows.py (endpoint OAuth /api/oauth/usage, jeton
  // rafraîchi via `claude -p`) ou tools/statusline-windows.py. ABSENT si le moteur
  // n'a pas pu capter (jeton expiré, hors session) -> le front retombe sur
  // l'estimation `windows` ci-dessus, avec un badge explicite. JAMAIS inventé.
  "windowsOfficial": {                           // ou null
    "w5hPct": N, "w5hResetAt": EPOCH_SEC,        // % serveur exact + reset (epoch s)
    "w7dPct": N, "w7dResetAt": EPOCH_SEC,
    "w7dOpusPct": N, "w7dOpusResetAt": EPOCH_SEC,    // optionnels (si exposés)
    "w7dSonnetPct": N, "w7dSonnetResetAt": EPOCH_SEC,
    "capturedAt": EPOCH_SEC,                      // quand on a capté
    "source": "oauth" | "statusline",
    "stale": false                               // true = capture trop vieille (> 6h) -> traiter en estimation
  },
  "weekly": { "weeks":[ {"week":"2026-S25","total":N}, ... ], "currentWeek": N },
  "models": [ { "model":"opus", "label":"Claude Opus", ...acc..., "total", "cost" }, ... ],

  // —— Enrichi en v3 : pace & month robustes (pilotent feu tricolore + assistant) ——
  "pace": {
    "avgPerDay": N, "medianPerDay": N, "medianDay": N, "nDays": N,
    "todayRank": N, "todayTotal": N,         // rang percentile du jour vs l'historique
    "baseline5h": { "base": N, "high": N,    // seuils robustes fenêtre 5h (base = médiane, high = inhabituel)
                    "medianLog": N, "madLog": N, "nDays": N }   // médiane + MAD en échelle log
  },
  "month": {
    "currentMonth": N, "projection": N,      // projection = pente robuste sur l'historique
    "projSlope": N, "ratio3m": N, "median3m": N,
    "dayOfMonth": N, "daysInMonth": N
  },

  // —— Nouveautés v2 (toujours présentes) ——
  "projects": [
    {
      "project": "AGENTIC-FIGMA-MCP",   // = name (rétrocompat v1)
      "name": "AGENTIC-FIGMA-MCP",
      "path": "C:/.../AGENTIC-FIGMA-MCP",
      "paths": ["...", "..."],          // si le même nom regroupe plusieurs racines
      "total": N, "cost": N,            // coût PONDÉRÉ par le vrai mix de modèles
      "input","output","cacheCreate","cacheRead",
      "models":  [ {"model","label","total","cost"}, ... ],   // mix par projet
      "sessions":[ {                                          // drill-down, cap 60 (v5)
        "sessionId","title","tokens","lastActivity","models":[...],  // rétrocompat v4
        // —— Enrichi en v5 (Waste Radar) ——
        "cost": N,                        // coût USD théorique de la session (mix réel)
        "costByModel": [ {"model","label","total","cost"}, ... ],  // par famille
        "messageCount": N,                // nb de messages comptés (dédupliqués)
        "firstActivity": "ISO",           // 1er timestamp -> avec lastActivity donne la durée
        "durationSec": N | null,          // (last - first) en s, ou null si indéterminable
        "outputTokens": N                 // total output de la session (proxy de taille de tâche)
      }, ... ],
      "sessionCount": N,                  // vrai nombre de sessions (AVANT cap 60)
      "timeline": [ {"date","total"}, ... ],   // permet le filtre projet côté front
      "lastActivity": "ISO",
      "isOthers": true                 // uniquement sur le bucket d'agrégation "Autres"
    }
  ],
  "hourly": {
    "byHour":      [ {"hour":"09","total":N}, ... ],   // total par heure du jour (0–23)
    "weekdayHour": [ [24 valeurs], ... 7 lignes ]      // grille jour-de-semaine × heure (heatmap)
  },

  // —— Nouveautés v5 (additives ; absentes = rien à signaler, jamais inventé) ——

  // Candidats « Opus lancé sur une petite tâche » (Waste Radar). CANDIDATS, pas
  // un verdict : on ne dit JAMAIS « Sonnet aurait suffi ». `saving` = économie
  // THÉORIQUE si les MÊMES tokens Opus étaient facturés au tarif Sonnet. Top 30.
  "wasteSuspects": [
    {
      "sessionId": "…", "title": "…", "project": "…",
      "opusCost": N, "sonnetCost": N, "saving": N,   // USD théoriques
      "outputTokens": N, "messageCount": N,          // signaux de faible complexité
      "reason": "opus, 465 output, 35 messages"       // FACTUEL, aucun jugement
    }, ...
  ],

  // Épisodes de fenêtre 5h anormaux sur les 7 derniers jours (Boîte noire).
  // Pré-digéré (quelques Ko) — PAS les records bruts. Uniquement des FAITS
  // mesurés : part réelle de sous-agents, cache-miss réels. [] si baseline
  // insuffisante ou rien d'anormal (z robuste < 3). Aucune interprétation ici.
  "anomalies": [
    {
      "window": "2026-07-06T09",        // 'YYYY-MM-DDTHH' = début de la fenêtre 5h la + chargée du jour
      "z": N,                            // score robuste (log) vs baseline 5h (~3 = ~99e percentile)
      "total": N,                        // tokens du pic 5h
      "sidechainShare": 0..1,            // part de tokens issus de sous-agents (isSidechain)
      "cacheMiss5m": N, "cacheMiss1h": N,  // tokens cache_creation ephemeral 5m/1h (0 si absents)
      "topProject": "…" | null           // projet dominant sur la fenêtre
    }, ...
  ],
  "api": null,
  "serverAgeSeconds": 42              // AJOUTÉ par le serveur sur GET /usage.json (fraîcheur)
}
```

## Inférence du projet (cœur AXE 1)

`tools/usage_core.py :: project_from_cwd(cwd)` — déterministe :

1. **Marqueur worktree** : si le chemin contient `.claude/worktrees`,
   `.codex/worktrees` (ou `.git`), le projet = segment **juste avant**.
   `…/AGENTIC-FIGMA-MCP/.claude/worktrees/nifty-lumiere-37ca98` → `AGENTIC-FIGMA-MCP`.
2. **Sinon** : on rogne les feuilles techniques (`src`, `app`, `dist`…) et
   génériques (drive, home, username) pour retomber sur le dossier projet.
3. **Sinon** (`C:\`, vide) → `null` → repli sur titre de session / id.

Les clés restent **les chemins** (pas de collision de données entre deux projets
homonymes) ; la **fusion par nom** se fait seulement à l'affichage
(`merge_projects_by_name`), en conservant `paths[]`.

## Waste Radar & anomalies (cœur v5)

Deux fonctions PURES et testables dans `tools/usage_core.py` :

- `opus_waste_suspects(sessions, min_saving_usd=0.5)` — repère les sessions où de
  l'Opus a servi avec des signaux de FAIBLE complexité (peu d'output, peu de
  messages) et chiffre l'économie **théorique** Opus→Sonnet (mêmes tokens Opus
  recalculés au tarif Sonnet via `PRICING`). **Garde-fou** : ce sont des
  *candidats*, jamais « Sonnet aurait suffi ». Sert à peupler `wasteSuspects`.
- `detect_anomalies(hour_buckets, hour_meta, baseline, now)` — sur la fenêtre 7j
  glissante, repère les jours dont le pic 5h dépasse anormalement la baseline
  (z robuste ≥ 3, réutilise `daily_peak_5h`/`baseline_5h`/`robust_z_log`). Pour
  chaque épisode : `sidechainShare` (part réelle de sous-agents), `cacheMiss5m/1h`
  (tokens ephemeral réels), `topProject`. **Garde-fou** : uniquement des FAITS
  mesurés, aucune interprétation. `[]` si baseline insuffisante ou rien d'anormal.

Le split par sous-agent / cache est accumulé au parsing dans une structure
**parallèle** `by_hour_meta` (elle ne pollue pas `by_hour`, qui reste des
accumulateurs `uc.empty()`). Le cap sessions passe de 20 à **60** via
`select_sessions`, qui garde les 40 plus grosses **+** jusqu'à 20 « suspectes
Opus » pour ne pas faire disparaître les petites tâches Opus (la cible).

## Rétrocompatibilité

Le schéma est **additif** : chaque version ne fait qu'ajouter des champs (v2 a
ajouté `projects`/`hourly`, v3 a enrichi `pace`/`month` avec les statistiques
robustes, v4 a ajouté `windowsOfficial`, v5 enrichit les `sessions` et ajoute
`wasteSuspects`/`anomalies`). Tous les champs antérieurs sont conservés ; un
front plus ancien ignore simplement les nouveaux. Le front lit `schema` (garde
`SUPPORTED_SCHEMA`) et dégrade proprement si un champ manque.

## Tests

Chaque formule (inférence, coût/modèle, fenêtre 5h, projection, fusion) est
couverte par `tests/test_usage_core.py`. Le serveur par `tests/test_server.py`,
les helpers front par `tests/test_format.mjs`. Lancer : `python tests/run_all.py`.
