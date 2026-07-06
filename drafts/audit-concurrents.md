# Audit concurrents — juillet 2026

> Contexte : 23+ trackers Claude sortis en juin 2026. Audit réalisé le 2 juillet
> sur les repos les plus scorés (cctally, cc-usage-tracker-tracker).

---

## Le vrai concurrent : cctally

**Repo :** github.com/omrikais/cctally · Score 60-61

| | cctally | Claude Eats Tokens |
|---|---|---|
| **Type** | CLI + dashboard localhost:8789 | PWA mobile-first (GitHub Pages) |
| **Mobile** | Dashboard responsive via réseau local — pas une PWA, pas installable, pas offline | Vrai PWA installable sur téléphone, offline, push notifs |
| **Notifs** | Desktop only (macOS/Linux) — seuils non documentés | Push téléphone + PC à 25/50/75/90/95/100 % sur vrai % serveur |
| **5h window** | Très granulaire : per-window rollups, per-model, per-project | Tracking intégré + feu tricolore + ETA avant throttle |
| **Setup** | Python 3.11+ / npm / hooks dans `~/.claude/settings.json` | Zéro install, zéro build, zéro dépendance (sauf Chart.js) |
| **Plateformes** | macOS/Linux only | Toutes (navigateur web) |
| **Conversation viewer** | Oui — transcripts, coûts par tour, subagents | Non |
| **Performance** | Revendique 12× plus rapide que les alternatives | Client-side, léger |

### Où on gagne
- **Mobile-first** — seul tracker utilisable depuis le téléphone comme une vraie app
- **Notifs sur téléphone** — cctally n'envoie qu'en desktop, et uniquement macOS/Linux
- **Cross-platform** — cctally exclut Windows ; nous marchons partout
- **Zéro friction** — pas de Python, pas de npm, pas de hooks à injecter
- **Assistant décisionnel** — « je peux continuer ? » avec ETA, pas juste des chiffres
- **Honnêteté explicite** — estimation vs officiel clairement étiqueté (badge vert/terracotta)

### Où ils gagnent
- **Analytics granulaires** — viewer de conversations avec coûts par tour
- **5h détaillé** — rollups par fenêtre, par modèle, par projet
- **Performance brute** — SQLite local, pas de latence réseau
- **Coût par % de quota** — métrique d'efficacité ($/% trend)

### Verdict
Pas le même segment. cctally = analytics développeur desktop. Claude Eats Tokens = moniteur mobile "at a glance" avec assistant. Complémentaires plus que rivaux directs.

---

## Pas un concurrent : cc-usage-tracker-tracker

**Repo :** github.com/jamesleoreyes/cc-usage-tracker-tracker · Score 60

C'est un **méta-outil** : une app macOS native (status bar) qui traque les *trackers Claude sur GitHub*, pas l'usage Claude lui-même. Il référence et classe les 23+ outils par activité (active/aging/stale/archived).

Aucun chevauchement avec Claude Eats Tokens. Pas un concurrent.

---

## Positionnement résumé (3 bullets)

1. **Seul tracker mobile** — PWA installable, offline, notifs push sur le téléphone
2. **Seul tracker avec assistant décisionnel** — feu tricolore + ETA + « je peux continuer ? »
3. **Zéro friction, toutes plateformes** — pas de Python/npm/hooks, marche sur Windows/macOS/Linux/téléphone
