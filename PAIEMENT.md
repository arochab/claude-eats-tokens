# Paiement — comment ça marche

**En place et prouvé en mode test le 17 juil 2026.** Stripe, sans serveur à
héberger : une Edge Function Supabase, gratuite et toujours allumée.

```
PWA --POST {api_key}--> billing/checkout --crée la session--> Stripe
                              |                                  |
                              | uid en metadata (côté serveur)   | paiement
                              v                                  v
                         users.id  <---- billing/webhook (signature vérifiée)
```

## Ce qui existe

| | |
|---|---|
| Compte Stripe | `acct_1TuAGJQoKodFAbMx` (FR, EUR) |
| Produit | `Claude Eats Tokens Pro` |
| Tarif | **5 €/mois**, récurrent |
| Webhook | `.../functions/v1/billing/webhook`, 6 événements |
| Secrets | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (côté Supabase, jamais dans le dépôt) |

État à tout moment :

```bash
curl -s https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/health
```

## Les 3 choix qui comptent

**Stripe et pas Lemon Squeezy.** Sur un abonnement à 5 €, LS prenait ~0,71 €
(14 % de la recette) contre ~0,33 € (6,5 %). Ce que LS apportait en échange —
être le vendeur légal et gérer la TVA des 27 — ne se justifie pas sous le seuil
européen de **10 000 €/an** de ventes B2C numériques transfrontalières. **Ce
seuil est le seul déclencheur** pour rouvrir le sujet ; d'ici là, règles
françaises et une déclaration. Le jour venu : Stripe Tax pour le calcul, un
comptable pour le dépôt.

**L'uid est posé côté serveur.** La session de paiement est créée par la
fonction, qui glisse l'identifiant du compte dans `subscription_data.metadata`.
Il ne passe jamais par le navigateur : rien à signer, rien à falsifier. (La
version Lemon Squeezy le faisait transiter par une URL, d'où un jeton HMAC
maison — supprimé, devenu inutile.)

**Les statuts Stripe sont traduits.** `users.plan_status` n'accepte que le
vocabulaire de l'app ; Stripe dit `trialing` et `canceled` (un seul L). Écrire le
statut brut ferait échouer le webhook en boucle et **le client paierait sans
recevoir son Pro**. La traduction vit dans `supabase/functions/billing/logic.ts`,
testée sur les 8 statuts réels de l'API.

## Ce qui est vérifié

Contre la fonction déployée, avec de vraies signatures :

- checkout → vraie URL `checkout.stripe.com` · clé invalide → 401
- abonnement actif → `pro` · rejeu du même webhook → toujours `pro`
- `trialing` → `on_trial` · `canceled` → `cancelled` + `free`
- `past_due` → **reste `pro`** (Stripe relance plusieurs jours : on ne punit pas
  une carte expirée)
- statut inconnu → `free` (fail-closed)
- **webhook vieux de 10 min → 401** (anti-rejeu, tolérance 5 min) : sans ça, un
  `subscription_created` capté sur le réseau serait rejouable des mois plus tard
- mauvais secret → 401 · événement hors abonnement → acquitté sans agir

## Passer en live

Deux choses restent, et elles sont à Adam.

**1. Activer le compte Stripe.** Il affiche aujourd'hui `charges_enabled: false` :
identité et IBAN pas finalisés. En test ça ne gêne pas ; en live, rien ne peut
être encaissé tant que ce n'est pas fait.

**2. Reposer les 3 secrets en version live.** Le catalogue live est **séparé** du
catalogue test : le produit, le tarif et le webhook sont à recréer là-bas.

```bash
# Stripe en mode Live -> Développeurs -> Clés API
npx supabase secrets set "STRIPE_SECRET_KEY=sk_live_..."
npx supabase secrets set "STRIPE_PRICE_ID=price_..."       # le tarif live
npx supabase secrets set "STRIPE_WEBHOOK_SECRET=whsec_..." # le endpoint live
```

`health` passera `liveMode` à `true`. Aucun redéploiement : la fonction relit ses
secrets.

> Un agent peut refaire produit + tarif + webhook via l'API à partir de la clé
> live, comme ça a été fait en test. Mais une clé live n'a rien à faire dans une
> conversation : pose-la toi-même, ou fais-la lire depuis un fichier ignoré par
> git puis supprimé.

## Pièges déjà payés

- **`customer_creation` n'existe qu'en mode `payment`.** En mode `subscription`,
  Stripe répond 400 — le client y est créé d'office. Trouvé en test ; en live
  ç'aurait été un bouton « Passer à Pro » mort.
- **Le secret d'un webhook n'est rendu qu'à sa création.** Impossible de le
  relire ensuite : pour le récupérer, il faut supprimer l'endpoint et le recréer.
- **Test et live sont deux mondes séparés** : produits, tarifs, webhooks, clés.
  Rien ne traverse.
