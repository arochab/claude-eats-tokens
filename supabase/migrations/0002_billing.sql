-- Claude Eats Tokens — billing (Lemon Squeezy) — migration additive
-- Exécuter dans Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Ajoute à la table `users` les colonnes nécessaires au suivi d'abonnement
-- Lemon Squeezy. Purement additif : le CHECK sur `plan` reste INCHANGÉ
-- (free / pro) — `plan` est dérivé du statut d'abonnement côté serveur
-- (derive_plan()). `plan_status` porte le statut brut Lemon Squeezy pour
-- l'affichage et le debug.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ls_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'none'
  CHECK (plan_status IN ('none','active','on_trial','past_due','cancelled','paused','expired'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Un abonnement Lemon Squeezy ne peut être rattaché qu'à un seul utilisateur.
-- Index partiel : on ignore les lignes sans abonnement (NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ls_subscription_id
  ON users (ls_subscription_id) WHERE ls_subscription_id IS NOT NULL;
