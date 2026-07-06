# Hosted Setup — Multi-tenant avec Supabase (workflow CLI)

> Activer le mode multi-tenant (héberger les données de plusieurs utilisateurs)
> sur ton serveur Render existant. Coût : 0 €. Tout se fait au terminal, sauf
> les 3 env vars Render (Render free n'a pas de CLI pratique — dashboard, 1 min).

Le mode multi-tenant s'active **tout seul** dès que `SUPABASE_URL` est présent
côté serveur. Ton mode perso (`PUSH_SECRET` + Gist) continue en parallèle,
intact.

---

## Prérequis

- Un compte Supabase (gratuit) — tu en as un : `adam.chabbi94@gmail.com`.
- `npx` (fourni avec Node). Rien à installer globalement : on appelle
  `npx supabase ...` à la demande.

## 1. Lier le CLI à ton compte

```bash
npx supabase login
```

Ça ouvre le navigateur et génère un token — colle-le, c'est tout.

## 2. Initialiser + créer le projet

```bash
# Depuis la racine du repo
npx supabase init            # crée le dossier supabase/ (config locale)
```

Puis crée le projet distant (ou réutilise-en un existant). Le plus simple en
CLI :

```bash
npx supabase projects create claude-eats-tokens \
  --org-id <ton-org-id> \
  --region eu-west-1 \
  --db-password '<un-mot-de-passe-fort>'
```

> `--org-id` : `npx supabase orgs list` te le donne.
> Garde le mot de passe DB de côté (tu n'en as pas besoin pour l'app, mais
> Supabase le redemande pour certaines opérations).

## 3. Lier le repo local au projet + pousser le schéma

```bash
npx supabase link --project-ref <project-ref>   # le ref est affiché à l'étape 2
npx supabase db push                            # applique la migration du schéma
```

La migration du schéma est versionnée dans
[`supabase/migrations/`](supabase/migrations/) (générée depuis
`server/supabase-schema.sql`). `db push` est **idempotent** (`CREATE TABLE IF
NOT EXISTS`) : tu peux le relancer sans risque.

> Si `supabase/migrations/` est vide, crée la migration à partir du schéma :
> ```bash
> mkdir -p supabase/migrations
> cp server/supabase-schema.sql supabase/migrations/0001_multitenant.sql
> npx supabase db push
> ```

## 4. Récupérer URL + clé service_role

```bash
npx supabase projects api-keys --project-ref <project-ref>
```

Tu veux deux valeurs :

- **Project URL** : `https://<project-ref>.supabase.co` → `SUPABASE_URL`
- **service_role key** (pas `anon` !) → `SUPABASE_KEY`

> ⚠ La clé `service_role` a tous les droits et **bypass la RLS**. Elle ne vit
> QUE dans les env vars de Render (côté serveur Flask). Jamais dans le front,
> jamais commitée.

## 5. Configurer Render (dashboard, 1 min)

Render free n'expose pas de CLI d'env vars pratique — c'est la seule étape au
dashboard.

1. Dashboard Render → service `claude-eats-tokens` → **Environment**
2. Ajoute :
   - `SUPABASE_URL` = ton URL Supabase
   - `SUPABASE_KEY` = ta clé `service_role`
   - `FRONTEND_URL` = `https://arochab.github.io/claude-eats-tokens`
3. **Garde** tes variables existantes (`PUSH_SECRET`, `GITHUB_TOKEN`,
   `GIST_ID`) — le mode legacy continue de tourner pour toi.
4. Render redéploie tout seul au save.

## 6. Tester le flux multi-tenant

1. Ouvre la PWA → bouton **compte** (icône personne) en haut à droite.
2. Entre un email → tu reçois une **clé API** (`cet_...`). Copie-la.
3. Simule un autre utilisateur qui pousse ses chiffres :
   ```bash
   PUSH_URL=https://claude-eats-tokens.onrender.com \
   CET_API_KEY=cet_la_cle_recue \
   python tools/push_usage.py --once
   ```
   (sous Windows cmd : `set PUSH_URL=...` puis `set CET_API_KEY=...` sur des
   lignes séparées, puis `python tools/push_usage.py --once`)
4. Dans la PWA, entre la clé API → les données apparaissent.

> Render free s'endort : la première requête après inactivité peut prendre ~50 s.

## Comment ça marche

```
Mode legacy (Adam)          Mode multi-tenant (autres)
PUSH_SECRET → Gist          CET_API_KEY → Supabase PostgreSQL
                            (clé hashée SHA-256, jamais stockée en clair)
```

Le mode est choisi automatiquement côté serveur :
`SUPABASE_URL` présent → multi-tenant ; absent → legacy. Les deux coexistent.

## À propos de l'intégration GitHub ↔ Supabase

Supabase propose de **connecter le repo GitHub** pour rejouer les migrations à
chaque push. **Inutile ici** : on a une seule migration figée et `db push`
manuel suffit. Cette intégration a du sens pour un vrai backend qui évolue
souvent — pas pour ce projet. On reste sur le CLI, plus simple et sans
dépendance de plus.

## Limites du free tier Supabase

| Ressource | Limite | Suffisant pour |
|---|---|---|
| PostgreSQL | 500 MB | ~500 utilisateurs |
| API calls | Illimité (service_role) | Largement |
| Auth Supabase | Non utilisé (on gère l'auth nous-mêmes) | — |

Au-delà → Supabase Pro à 25 $/mois, mais à ce stade tu auras des utilisateurs
Pro qui paient, donc c'est rentable.
