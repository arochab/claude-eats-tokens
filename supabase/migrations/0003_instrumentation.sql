-- Claude Eats Tokens — instrumentation GTM (funnel à 0€) — migration additive
-- Exécuter dans Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Objectif : mesurer le funnel d'acquisition (visite par canal → compte créé
-- → ACTIVATION → Pro) SANS AUCUNE donnée personnelle. Purement agrégé :
--   - PAS d'IP, PAS de user-agent, PAS de cookie, PAS de timestamp par visite.
--   - Seulement des compteurs et deux dates d'activité au niveau du compte.
-- La privacy est un argument de vente du produit : on ne stocke que des
-- agrégats. Purement additif et rétrocompatible (ADD COLUMN IF NOT EXISTS).

-- ACTIVATION : dates de première/dernière poussée du script PC.
-- first_push_at = première fois que l'utilisateur a envoyé du usage (activation).
-- last_push_at  = dernière activité (rétention).
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_push_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

-- COMPTAGE PAR CANAL : un simple compteur par valeur de ?ref= (hn, reddit-cc,
-- ph, x…). Zéro PII : une ligne = un canal, une colonne = son nombre de visites.
-- Pas de qui, pas de quand par visite, juste un total incrémental.
CREATE TABLE IF NOT EXISTS visits (
  ref TEXT PRIMARY KEY,
  count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS : cohérent avec le reste du schéma (service_role bypass côté serveur).
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
