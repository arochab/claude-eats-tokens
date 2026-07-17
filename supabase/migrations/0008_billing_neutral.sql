-- Claude Eats Tokens — colonnes de facturation neutres — migration additive
--
-- Adam a tranché pour **Stripe** plutôt que Lemon Squeezy (17 juil 2026).
-- Raison : sur des petits tickets, LS prend le double. Sur un abonnement à
-- 5 €/mois, LS ~= 0,71 € (14 % de la recette) contre ~0,33 € (6,5 %) pour
-- Stripe. Le Merchant of Record de LS (TVA collectée et reversée dans les 27)
-- ne se justifie pas tant qu'on est sous le seuil européen de 10 000 €/an de
-- ventes B2C numériques transfrontalières. C'est CE seuil, pas une intuition,
-- qui devra rouvrir le débat.
--
-- Les colonnes portaient le préfixe `ls_` (Lemon Squeezy). Stocker un id Stripe
-- dans `ls_subscription_id` serait un mensonge qui survivrait des années. On
-- neutralise le nom : le prochain fournisseur ne coûtera pas une migration.
--
-- SANS PERTE : renommer une colonne conserve ses données. Une seule ligne était
-- concernée (escapemusiccollective@gmail.com, abonnement « 2323494 ») : c'est un
-- test de webhook SIMULÉ du 7 juil — LS n'a jamais été configuré, donc aucun vrai
-- paiement n'a pu exister, et ce compte n'a jamais poussé la moindre donnée
-- (first_push_at NULL). Son id d'abonnement ne correspondra à rien chez Stripe,
-- ce qui est sans conséquence : la résolution retombe sur l'email.

ALTER TABLE public.users RENAME COLUMN ls_subscription_id TO billing_subscription_id;
ALTER TABLE public.users RENAME COLUMN ls_customer_id TO billing_customer_id;

-- L'index unique suit son nom de colonne, mais garde son ancien nom : on le
-- renomme aussi, pour ne pas laisser de trace de LS dans le schéma.
ALTER INDEX IF EXISTS idx_users_ls_subscription_id
  RENAME TO idx_users_billing_subscription_id;

-- ---------------------------------------------------------------------------
-- On GARDE la contrainte sur plan_status, et c'est délibéré.
--
-- Elle n'accepte que le vocabulaire de l'app :
--   none | active | on_trial | past_due | cancelled | paused | expired
-- Or Stripe dit `trialing` et `canceled` (un seul L), `unpaid`, `incomplete`…
-- Écrire le statut Stripe BRUT ferait violer la contrainte -> le PATCH échoue
-- -> le webhook renvoie 500 -> Stripe retente en boucle -> **le client a payé
-- et n'a jamais son Pro**. C'est exactement le genre de panne silencieuse que
-- ce projet a déjà payée.
--
-- La contrainte est donc un garde-fou UTILE : elle force la traduction dans
-- l'Edge Function (voir stripeStatusToCanonical) au lieu de laisser filer un
-- vocabulaire étranger dans la base. On ne la relâche pas.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.users.plan_status IS
  'Statut d''abonnement dans le vocabulaire de l''app (jamais le statut brut du '
  'fournisseur) : none|active|on_trial|past_due|cancelled|paused|expired. '
  'La traduction depuis Stripe est faite par l''Edge Function billing.';

COMMENT ON COLUMN public.users.billing_subscription_id IS
  'Id d''abonnement chez le fournisseur de paiement (Stripe : sub_...).';

COMMENT ON COLUMN public.users.billing_customer_id IS
  'Id client chez le fournisseur de paiement (Stripe : cus_...).';
