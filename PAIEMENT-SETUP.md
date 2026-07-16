# Ouvrir Pro à la vente — ce qu'il reste à faire

**Tout le code est écrit, déployé et testé.** L'Edge Function `billing` tourne,
les secrets sont posés, le webhook a été validé de bout en bout avec des
signatures réelles (abonnement → `pro`, résiliation → `free`, rejeu idempotent,
mauvaise signature → 401).

Il reste **3 actions** qui ne peuvent pas être déléguées à un agent : elles
engagent ton identité, ton compte bancaire et ta fiscalité. Compte 15 minutes,
l'essentiel étant l'attente de la validation par Lemon Squeezy.

---

## Pourquoi Lemon Squeezy et pas Stripe

Lemon Squeezy est **Merchant of Record** : c'est *lui* le vendeur légal. Il
collecte et reverse la TVA dans chaque pays de l'UE, émet les factures, gère les
impayés et les remboursements. Avec Stripe, tout ça retomberait sur toi, dans 27
régimes de TVA différents — inenvisageable pour un projet solo à quelques euros
par mois. Il prend ~5 % + 0,50 $ par transaction : c'est le prix de ne pas faire
de comptabilité européenne.

---

## 1. Créer le compte et le produit

1. Va sur <https://app.lemonsqueezy.com/register>, crée le compte, remplis
   l'onboarding (identité, IBAN, régime fiscal). C'est la partie longue, et
   c'est la seule qui demande vraiment ton attention.
2. **New Product** → nom : `Claude Eats Tokens Pro` → type : **Subscription** →
   fixe ton prix mensuel.
3. Ouvre le produit → **Share** → copie l'**URL de checkout**
   (ressemble à `https://<toi>.lemonsqueezy.com/buy/<uuid>`).

Puis, dans un terminal, à la racine du projet :

```bash
npx supabase secrets set "LS_CHECKOUT_URL=<colle_l_url_ici>"
```

C'est la seule commande à lancer. Aucun redéploiement n'est nécessaire : la
fonction relit ses secrets.

## 2. Brancher le webhook

Dans Lemon Squeezy → **Settings → Webhooks → +** :

- **Callback URL** :
  `https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/webhook`
- **Signing secret** : demande-le à l'agent, ou récupère-le toi-même — il a été
  généré et posé dans les secrets Supabase sous le nom `LS_WEBHOOK_SECRET`.
  Il n'est **volontairement pas écrit dans ce dépôt**.
- **Events** : coche les 6 `subscription_*`
  (`created`, `updated`, `cancelled`, `resumed`, `expired`, `paused`).
  Les autres événements sont acquittés et ignorés par la fonction.

## 3. Vérifier

```bash
curl -s https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/health
```

Les trois doivent être à `true` :

```json
{"ok":true,"checkoutConfigured":true,"webhookConfigured":true,"linkSecretConfigured":true}
```

Puis, dans l'app : **Compte → Passer à Pro**. Le checkout Lemon Squeezy doit
s'ouvrir avec ton email prérempli. Paie en **mode test** d'abord (Lemon Squeezy
a un test mode avec des cartes fictives) : ton plan doit basculer sur `pro` dans
les secondes qui suivent.

Tant que l'étape 1 n'est pas faite, le bouton affiche « Pro n'est pas encore
ouvert à la vente. Bientôt. » — pas une erreur, un état assumé.

---

## Comment ça marche (pour la prochaine session)

```
PWA --POST {api_key}--> billing/checkout --302--> Lemon Squeezy
                             |                          |
                             |  uid signé (HMAC)        | paiement
                             v                          v
                        users.id  <---- billing/webhook (HMAC vérifié)
```

- **Le checkout** valide la clé `cet_`, puis fabrique l'URL LS avec un jeton
  `ct_{uid}.{signature}` dans `checkout[custom][uid]`. La signature empêche
  d'attacher un abonnement au compte d'un tiers.
- **Le webhook** vérifie le HMAC sur le **corps brut** (c'est la raison d'être de
  cette fonction : PostgREST ne donne que le JSON déjà parsé, la signature y
  serait invérifiable), résout l'utilisateur (jeton signé → id d'abonnement →
  email) et écrit un **état absolu** — donc rejouable sans effet de bord.
- `past_due` reste **pro** : on ne coupe pas l'accès sur une carte expirée que
  Lemon Squeezy va relancer plusieurs jours.

Coût : **0 €**. 500 000 appels/mois inclus dans le palier gratuit Supabase, et
aucune heure d'instance à surveiller — c'est précisément ce qui a tué le serveur
Render le 15 juillet 2026.
