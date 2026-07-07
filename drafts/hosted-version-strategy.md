# Stratégie — Hosted Version (SaaS a cout zero)

> Objectif : cafe money (50-200 EUR/mois) + levier portfolio.
> Contrainte absolue : zero frais de serveur (ou le strict minimum).

---

## Le probleme aujourd'hui

Le setup est trop complexe pour quiconque sauf Adam :
1. Creer un repo GitHub
2. Deployer sur Render
3. Creer une Gist + GitHub token
4. Configurer des env vars
5. Installer une tache planifiee Windows

**Resultat : 0 utilisateur externe.** Le produit est bon, mais inaccessible.

## La solution : "Je heberge tout pour toi"

L'utilisateur s'inscrit, installe un petit script sur son PC, et ca marche.
Adam gere un seul serveur pour tout le monde.

---

## Architecture cible (cout zero)

```
PC utilisateur                    Infra Adam (gratuite)
+-----------------+     POST     +---------------------+
| push_usage.py   | ----------> | Render (Flask)      |
| + API key perso |    /push    | multi-tenant        |
+-----------------+             | auth par API key    |
                                +----------+----------+
                                           |
                                           v
                                +---------------------+
                                | Supabase free tier   |
                                | PostgreSQL 500 MB    |
                                | = ~500 users          |
                                +---------------------+
                                           ^
                                           |
                                +----------+----------+
                                | PWA (GitHub Pages)   |
                                | login GitHub OAuth   |
                                | GET /usage.json?me   |
                                +---------------------+
```

### Pourquoi Supabase free tier

| Limite free tier | Capacite | Suffisant ? |
|---|---|---|
| Storage | 500 MB PostgreSQL | ~500 users (1 MB/user max) |
| Auth | Illimite (GitHub OAuth) | Largement |
| API calls | 50k/mois | ~50 users actifs (push toutes les 60s) |
| Cout | 0 EUR | Exactement |
| Upgrade | 25 USD/mois (Pro) | Quand > 100 users actifs |

### Alternative si Supabase est trop lourd : Cloudflare Workers + KV

| | Supabase | Cloudflare Workers |
|---|---|---|
| Cout | 0 | 0 |
| Cold start | ~2s | ~10ms |
| Capacite free | 50k req/mois | 100k req/JOUR |
| Auth | Built-in OAuth | A coder (JWT) |
| Effort dev | ~3h | ~5h |
| Scalabilite | 100 users | 1000+ users |

**Recommandation :** commencer par Supabase (plus simple, OAuth inclus). Migrer vers Cloudflare si ca decolle.

---

## Modele de prix — IMPLEMENTE (juillet 2026)

### Free tier (diagnostic de l'instant present)
- Feu tricolore (verdict vert/orange/rouge) + fenetres officielles + estimation forfait
- Mini-stats (aujourd'hui, semaine, rythme)
- Alerte + ETA DANS l'app
- Courbe sur 7 jours + liste des projets
- Carte "Ou je me situe"
- 1 SEULE notif push : fenetre PLEINE (100%) — le filet anti-blocage

### Pro — 5 EUR/mois (memoire + anticipation + bras arme sur le telephone)
- Notifs push par paliers 25/50/75/90/95% (etre prevenu AVANT le mur)
- Historique 30j + illimite + comparaisons mois/mois
- Projection fin de mois
- Drill-down projets (donut, sessions)
- Export CSV / PNG
- Rapport hebdo auto, seuils d'alerte perso, cout/efficacite avances
- **Waste Radar** ⭐ : audit du gaspillage Opus chiffre en € ("telle tache aurait pu
  passer sur un modele plus leger — a verifier"). ROI : l'abo se rembourse seul.
- **Boite noire** ⭐ : quand ta fenetre 5h fond anormalement, une phrase humaine dit
  POURQUOI (tes sous-agents invisibles chez les concurrents). Carte conditionnelle.

### Pourquoi 5 EUR (un Pro dense le justifie)
- Toujours accessible (moins qu'un cafe et demi)
- 12 users Pro = 60 EUR/mois (objectif bas) ; 40 users = 200 EUR/mois (objectif haut)
- Pas de cout fixe en face (Supabase free + Render free + Waste Radar etage 1 = 0€)
- Waste Radar / Boite noire = 2 secrets que les 23 concurrents ne peuvent copier
  (log par-message + sur le telephone). **Avance produit, pas juste un tracker.**

### Paiement : Lemon Squeezy (IMPLEMENTE)
- Merchant of Record : gere la TVA UE, les recus, les factures. Pas de societe requise.
- Liaison paiement↔compte : **checkout token signe** (`ct_<user_id>.<hmac>`), stateless,
  passe en `custom_data` du checkout, verifie par HMAC cote webhook. Non-usurpable,
  zero friction, decouple de l'auth. Voir server/app.py + HOSTED-SETUP.md.

---

## Roadmap d'implementation

### Phase 1 — Fondations (1 jour)
1. Creer projet Supabase (gratuit)
2. Table `users` (via Supabase Auth, auto)
3. Table `usage_blobs` (user_id, data JSONB, saved_at)
4. Activer GitHub OAuth dans Supabase Auth

### Phase 2 — Backend multi-tenant (1 jour)
1. `server/app.py` : remplacer PUSH_SECRET par JWT Supabase
2. `server/app.py` : remplacer Gist par queries Supabase
3. Nouveau endpoint `/auth/login` (redirect vers GitHub OAuth)
4. Nouveau endpoint `/auth/callback` (echange code → JWT)
5. `render.yaml` : nouvelles env vars (SUPABASE_URL, SUPABASE_KEY)

### Phase 3 — Frontend auth (1 jour)
1. Ecran de login dans la PWA (bouton "Se connecter avec GitHub")
2. Stocker le JWT dans localStorage
3. Passer le JWT dans les headers fetch
4. Gerer la deconnexion

### Phase 4 — Push client auth (2h)
1. `tools/push_usage.py` : lire un JWT local (~/.claude-eats-tokens/auth.json)
2. Commande `python tools/push_usage.py --login` qui ouvre le navigateur, recupere le JWT
3. Le JWT est ensuite reutilise a chaque push

### Phase 5 — Paywall (1 jour)
1. Page Lemon Squeezy pour le plan Pro (5 EUR/mois)
2. Webhook Lemon Squeezy → Supabase (met a jour `users.plan`)
3. Frontend : verifier `user.plan` et masquer les features Pro derriere un CTA
4. Bandeau discret "Passe a Pro pour l'historique complet et les notifications"

### Phase 6 — Landing page (demi-journee)
1. Modifier index.html pour afficher une landing si pas connecte
2. Hero + 3 bullets + bouton "Commencer gratuitement"
3. Section pricing (Free vs Pro)

---

## Ce qu'on garde intact

- **L'option self-hosted reste** — le repo est MIT, n'importe qui peut deployer chez soi
- **Le mode demo fonctionne** — la PWA est toujours utilisable sans compte
- **Le moteur local ne change pas** — `usage_core.py` reste pur, teste, identique
- **Le design ne change pas** — meme charte Anthropic, memes composants

## Ce qu'on NE fait PAS

- Pas de multi-device sync (localStorage suffit pour les settings)
- Pas de tableau de bord equipe (viendra plus tard si traction)
- Pas de Stripe Atlas / societe (Lemon Squeezy gere la TVA)
- Pas de custom domain au debut (on garde GitHub Pages)

---

## Risques

| Risque | Probabilite | Mitigation |
|---|---|---|
| Personne ne paie | HAUTE | Le sponsor button + la visibilite HN/Reddit compensent. Cout = 0, donc pas de perte |
| Supabase free tier depasse | BASSE | Upgrade a 25 USD/mois = toujours rentable a 10+ users Pro |
| Anthropic change les logs | MOYENNE | Le parser est deja robuste (corrupted lines skipped). S'adapter au cas par cas |
| Un concurrent fait pareil | MOYENNE | Notre avantage = deja deploye, PWA solide, 146 tests. Execution > idee |

---

## Metriques de succes

| Metrique | Objectif 1 mois | Objectif 3 mois |
|---|---|---|
| Inscrits (free) | 20 | 100 |
| Users Pro | 5 | 20-60 |
| MRR | 15 EUR | 60-180 EUR |
| Churn | < 20%/mois | < 15%/mois |
