# Ouvrir Pro à la vente — ce qu'il reste à faire

**Tout le code est écrit, déployé et prouvé.** L'Edge Function `billing` tourne
en mode Stripe, et le webhook a été validé de bout en bout avec de vraies
signatures : abonnement → `pro`, résiliation → `free`, rejeu idempotent,
signature vieille de 10 min → refusée, mauvais secret → refusé.

Il reste **4 actions** qui ne peuvent pas être déléguées à un agent : elles
engagent ton identité, ton compte bancaire et ta fiscalité. Compte 15 minutes,
l'essentiel étant l'onboarding Stripe.

---

## Pourquoi Stripe (tranché le 17 juil 2026)

Sur des petits tickets, Lemon Squeezy prend le double : sur un abonnement à
5 €/mois, ~0,71 € (14 % de la recette) contre ~0,33 € (6,5 %) pour Stripe.

Ce que Lemon Squeezy apportait et que Stripe n'apporte pas : le statut de
**Merchant of Record**. LS était le vendeur légal, collectait et reversait la TVA
dans les 27 pays. Avec Stripe, **c'est toi le vendeur**.

**Ça ne pose pas de problème tant que tu es sous le seuil européen de
10 000 €/an de ventes B2C numériques transfrontalières** : en dessous, tu restes
sur les règles françaises et une seule déclaration. Au-dessus, il faut le guichet
OSS, la TVA au taux de chaque pays, et des déclarations trimestrielles.

**10 000 €/an est donc le déclencheur** pour rouvrir le sujet. À ce moment-là :
[Stripe Tax](https://stripe.com/tax) (0,5 %/transaction) pour le calcul et les
factures, et un comptable pour le dépôt. Un agent peut surveiller le seuil et
t'alerter ; il ne peut pas t'immatriculer ni signer une déclaration.

> Ceci décrit un mécanisme, ce n'est pas un conseil fiscal. Le jour où ça devient
> réel, fais valider par un comptable.

---

## 1. Créer le compte et le produit

1. <https://dashboard.stripe.com/register> → crée le compte, remplis
   l'activation (identité, IBAN). C'est la partie longue.
2. **Reste en mode TEST** pour l'instant (interrupteur en haut à droite).
3. **Produits → + Ajouter un produit** → nom : `Claude Eats Tokens Pro` →
   tarif **récurrent**, mensuel → fixe ton prix.
4. Copie l'**ID du tarif** (commence par `price_...`, pas `prod_...`).

## 2. Donner les 2 clés

Dans un terminal, à la racine du projet. **Lance-les toi-même** : je n'ai pas
besoin de voir ta clé secrète, et elle n'a rien à faire dans une conversation.

```bash
# Développeurs → Clés API → "Clé secrète" (sk_test_... en mode test)
npx supabase secrets set "STRIPE_SECRET_KEY=sk_test_..."

# L'ID du tarif copié à l'étape 1
npx supabase secrets set "STRIPE_PRICE_ID=price_..."
```

Aucun redéploiement : la fonction relit ses secrets.

## 3. Brancher le webhook

Stripe → **Développeurs → Webhooks → + Ajouter un point de terminaison** :

- **URL** : `https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/webhook`
- **Événements** : coche exactement ces 6 —
  `checkout.session.completed`,
  `customer.subscription.created`,
  `customer.subscription.updated`,
  `customer.subscription.deleted`,
  `customer.subscription.paused`,
  `customer.subscription.resumed`
  (tout le reste est acquitté et ignoré par la fonction)
- Stripe affiche alors un **secret de signature** (`whsec_...`) :

```bash
npx supabase secrets set "STRIPE_WEBHOOK_SECRET=whsec_..."
```

## 4. Vérifier, puis passer en live

```bash
curl -s https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/health
```

Attendu en mode test :

```json
{"ok":true,"provider":"stripe","checkoutConfigured":true,"webhookConfigured":true,"liveMode":false}
```

Puis dans l'app : **Compte → Passer à Pro**. Paie avec la carte de test
`4242 4242 4242 4242` (date future, CVC au hasard). Ton plan doit basculer sur
`pro` en quelques secondes.

Quand c'est bon : rebascule Stripe en **mode live**, et refais les étapes 2 et 3
avec les clés live (`sk_live_...`, nouveau `price_...`, nouveau `whsec_...`).
`liveMode` passera à `true`.

Tant que l'étape 2 n'est pas faite, le bouton affiche « Pro n'est pas encore
ouvert à la vente. Bientôt. » — pas une erreur, un état assumé.

---

## Comment ça marche (pour la prochaine session)

```
PWA --POST {api_key}--> billing/checkout --crée la session--> Stripe
                              |                                  |
                              | uid en metadata (côté serveur)   | paiement
                              v                                  v
                         users.id  <---- billing/webhook (signature vérifiée)
```

- **Le checkout** valide la clé `cet_`, puis crée la Checkout Session via l'API
  Stripe. L'uid est posé dans `subscription_data.metadata` **côté serveur** : il
  ne passe jamais par le navigateur, donc rien à signer et rien à falsifier.
  (Chez Lemon Squeezy il transitait par une URL, d'où un jeton HMAC maison —
  supprimé, devenu inutile.)
- **Le webhook** vérifie la signature sur le **corps brut** (c'est la raison
  d'être de cette fonction : PostgREST ne donne que le JSON déjà parsé, la
  signature y serait invérifiable), refuse au-delà de **5 min** d'écart
  (anti-rejeu), résout l'utilisateur (metadata → id d'abonnement → email) et
  écrit un **état absolu** — donc rejouable sans effet de bord.
- **Les statuts Stripe sont TRADUITS** avant d'atteindre la base (`trialing` →
  `on_trial`, `canceled` → `cancelled`). La colonne `plan_status` a une
  contrainte qui n'accepte que le vocabulaire de l'app : écrire le statut brut
  ferait échouer le webhook en boucle, et le client aurait payé sans recevoir son
  Pro. La traduction vit dans `supabase/functions/billing/logic.ts`, testée.
- `past_due` reste **pro** : on ne coupe pas l'accès sur une carte expirée que
  Stripe va relancer plusieurs jours.

Coût d'hébergement : **0 €**. 500 000 appels/mois inclus dans le palier gratuit
Supabase, et aucune heure d'instance à surveiller — c'est précisément ce qui a
tué le serveur Render le 15 juillet 2026.
