# Paiement — comment ça marche

**EN LIGNE ET EN LIVE depuis le 17 juil 2026.** Stripe, sans serveur à héberger :
une Edge Function Supabase, gratuite et toujours allumée. Le compte encaisse de
l'argent réel (`charges_enabled` + `payouts_enabled` = true).

```
PWA --POST {api_key}--> billing/checkout --crée la session--> Stripe
                              |                                  |
                              | uid en metadata (côté serveur)   | paiement
                              v                                  v
                         users.id  <---- billing/webhook (signature vérifiée)
```

## Ce qui existe (LIVE)

| | |
|---|---|
| Compte Stripe | `acct_1TndCzQoVk5hxOnP` (Adam CHABBI, FR, EUR) — activé |
| Produit | `Claude Eats Tokens Pro` |
| Tarif | **5 €/mois**, récurrent |
| Webhook | `.../functions/v1/billing/webhook`, 6 événements |
| Secrets | `STRIPE_SECRET_KEY` (live), `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (côté Supabase, jamais dans le dépôt) |
| Clé Stripe | nommée « Claude Eats Tokens » — une clé DÉDIÉE, séparée de celle qui sert à nadelio (utilisée le 13 juil) |

> Un compte Stripe **de test séparé** existe aussi (`acct_1TuAGJQoKodFAbMx`,
> « Claude Eats Tokens Test »), où toute la mécanique a d'abord été prouvée. C'est
> un bac à sable, sans lien avec le compte live ci-dessus.

État à tout moment :

```bash
curl -s https://yayimgpoopjwmmpzlrpm.supabase.co/functions/v1/billing/health
# -> liveMode:true quand les clés live sont en place
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

## Ce qui reste (une seule chose, et c'est à Adam)

Le circuit live répond entièrement — checkout, webhook, mise à jour du plan. Ce
qui n'a **pas** été testé, parce qu'un agent ne saisit jamais de numéro de carte :
**un vrai paiement de bout en bout**.

Pour le faire toi-même, une fois : Compte → Passer à Pro → paie avec **ta propre
carte**. Ton plan doit basculer sur `pro`. Tu peux ensuite te rembourser et
résilier depuis le dashboard Stripe (le webhook te remettra en `free`). C'est la
seule preuve qui manque, et elle ne peut venir que de toi.

Astuce : si tu veux tester sans dépenser, baisse temporairement le tarif à
0,50 € (le minimum Stripe pour une carte en EUR), fais le tour complet, puis
remets 5 €. Les abonnements déjà pris gardent leur ancien prix.

## Repasser en test (si besoin de déboguer)

Les clés de test existent toujours sur le compte bac à sable. Pour y revenir
temporairement, reposer les 3 secrets version test ; `health` repassera
`liveMode:false`. Aucun redéploiement : la fonction relit ses secrets.

## Pièges déjà payés

- **`customer_creation` n'existe qu'en mode `payment`.** En mode `subscription`,
  Stripe répond 400 — le client y est créé d'office. Trouvé en test ; en live
  ç'aurait été un bouton « Passer à Pro » mort.
- **Une clé secrète standard n'est révélée qu'à sa création.** Après, Stripe ne
  montre plus que `sk_live_...XXXX`. Impossible de la « recopier » depuis le site.
  Pour Claude Eats Tokens, une clé DÉDIÉE a été créée (nommée « Claude Eats
  Tokens ») plutôt que réutiliser celle de nadelio — une clé par projet.
- **Créer une clé secrète déclenche un 2FA** (lien email + code TOTP). Normal,
  c'est une action sensible. Passe par un vrai humain.
- **Le secret d'un webhook n'est rendu qu'à sa création.** Impossible de le
  relire ensuite : pour le récupérer, supprimer l'endpoint et le recréer.
- **Test et live sont deux comptes séparés** ici (pas juste deux modes) :
  produits, tarifs, webhooks, clés. Rien ne traverse.
- **Notepad ajoute `.txt` en double** malgré les guillemets → `sk.local.txt.txt`,
  que `*.local.txt` n'attrapait pas. `.gitignore` couvre maintenant `*.local.txt*`.
