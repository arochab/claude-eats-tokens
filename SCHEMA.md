# `usage.json` — schéma de données

Le moteur (`tools/push_usage.py`) produit ce JSON ; le front (`pwa/app.js`) le
consomme ; le serveur (`server/app.py`) le relaie. Champ `schema` = version.

## v3 (courant)

```jsonc
{
  "schema": 3,
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
  "windows": {
    "w5h":  { ...accumulateur..., "total" },     // fenêtre glissante 5h
    "w5hResetAt": "ISO" | null,                  // (plus vieux bucket dans la fenêtre) + 5h
    "w7d":  { ... }
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
      "sessions":[ {"sessionId","title","tokens","lastActivity","models":[...] }, ... ],  // drill-down
      "sessionCount": N,
      "timeline": [ {"date","total"}, ... ],   // permet le filtre projet côté front
      "lastActivity": "ISO",
      "isOthers": true                 // uniquement sur le bucket d'agrégation "Autres"
    }
  ],
  "hourly": {
    "byHour":      [ {"hour":"09","total":N}, ... ],   // total par heure du jour (0–23)
    "weekdayHour": [ [24 valeurs], ... 7 lignes ]      // grille jour-de-semaine × heure (heatmap)
  },
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

## Rétrocompatibilité

Le schéma est **additif** : chaque version ne fait qu'ajouter des champs (v2 a
ajouté `projects`/`hourly`, v3 a enrichi `pace`/`month` avec les statistiques
robustes). Tous les champs antérieurs sont conservés ; un front plus ancien
ignore simplement les nouveaux. Le front lit `schema` (garde `SUPPORTED_SCHEMA`)
et dégrade proprement si un champ manque.

## Tests

Chaque formule (inférence, coût/modèle, fenêtre 5h, projection, fusion) est
couverte par `tests/test_usage_core.py`. Le serveur par `tests/test_server.py`,
les helpers front par `tests/test_format.mjs`. Lancer : `python tests/run_all.py`.
