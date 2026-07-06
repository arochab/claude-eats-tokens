# Hosted Setup — Multi-tenant avec Supabase

> Guide pour activer le mode multi-tenant (héberger les données de plusieurs
> utilisateurs) sur ton serveur Render existant. Coût : 0 €.

---

## 1. Créer un projet Supabase (2 min)

1. Va sur [supabase.com](https://supabase.com) → **New project**
2. Nom : `claude-eats-tokens` (ou ce que tu veux)
3. Région : la plus proche de tes users (ex: eu-west)
4. Note le **mot de passe** de la base (pas besoin ici, mais garde-le)

## 2. Créer les tables (1 min)

1. Dans Supabase Dashboard → **SQL Editor** → **New query**
2. Copie-colle le contenu de `server/supabase-schema.sql`
3. Clique **Run**

## 3. Récupérer les clés (1 min)

1. Dashboard → **Settings** → **API**
2. Note :
   - **Project URL** → c'est ton `SUPABASE_URL` (ex: `https://xxxx.supabase.co`)
   - **service_role key** (pas la anon key !) → c'est ton `SUPABASE_KEY`

> ⚠ La clé service_role a tous les droits. Ne la mets JAMAIS dans le frontend.
> Elle ne vit que dans les env vars de Render (côté serveur).

## 4. Configurer Render (1 min)

1. Dashboard Render → ton service `claude-eats-tokens` → **Environment**
2. Ajoute :
   - `SUPABASE_URL` = ton URL Supabase
   - `SUPABASE_KEY` = ta clé service_role
   - `FRONTEND_URL` = `https://arochab.github.io/claude-eats-tokens` (ou ton URL)
3. **Garde** tes variables existantes (`PUSH_SECRET`, `GITHUB_TOKEN`, `GIST_ID`) — le mode legacy continue de fonctionner pour toi

## 5. Tester

1. Ouvre ta PWA → bouton **compte** (icône personne) en haut à droite
2. Entre un email → tu reçois une **clé API** (`cet_...`)
3. Copie cette clé
4. Sur ton PC, un autre utilisateur peut maintenant faire :
   ```bat
   set PUSH_URL=https://claude-eats-tokens.onrender.com
   set CET_API_KEY=cet_la_cle_recue
   python tools/push_usage.py --once
   ```
5. Dans la PWA, entre la clé API → tes données apparaissent

## 6. Comment ça marche

```
Mode legacy (Adam) :        Mode multi-tenant (autres) :
PUSH_SECRET → Gist          CET_API_KEY → Supabase PostgreSQL
                             (hash SHA-256, jamais stocké en clair)
```

Les deux modes coexistent sur le même serveur. Ton mode perso (PUSH_SECRET)
n'est pas affecté. Les nouveaux utilisateurs utilisent une API key personnelle.

## Limites du free tier Supabase

| Ressource | Limite | Suffisant pour |
|---|---|---|
| PostgreSQL | 500 MB | ~500 utilisateurs |
| API calls | Illimité (service_role) | Largement |
| Auth | Pas utilisé (on gère nous-mêmes) | — |

Quand tu dépasses → Supabase Pro à 25 $/mois. Mais à ce stade, tu auras
des utilisateurs Pro qui paient 3 €/mois, donc c'est rentable.
