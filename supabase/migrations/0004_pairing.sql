-- Claude Eats Tokens — device pairing (façon Stripe CLI / RFC 8628) — migration additive
-- Exécuter dans Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- OBJECTIF : appairer un CLI à un compte SANS copier-coller de clé API.
-- Flow (device authorization, inspiré de Stripe CLI et RFC 8628 §3.2) :
--   1. Le CLI appelle POST /pair/start → le serveur génère un code court lisible
--      (ex "WDJB-MJHT", ~40 bits d'entropie) et l'affiche dans le terminal.
--   2. L'utilisateur ouvre la PWA (déjà authentifiée, elle CONNAÎT sa clé cet_
--      en clair côté client) sur l'écran de confirmation (?pair=CODE).
--   3. ANTI-PHISHING : le MÊME code s'affiche dans le CLI ET dans la PWA.
--      L'utilisateur VÉRIFIE VISUELLEMENT qu'ils correspondent avant de cliquer
--      « Confirmer ». C'est la mitigation clé de RFC 8628 contre le phishing de
--      code d'appairage (cf. attaque Storm-2372 sur le device code flow) : un
--      attaquant qui aurait démarré un /pair/start ne peut pas obtenir la clé
--      sans que la victime confirme un code qu'elle n'a pas vu dans SON terminal.
--   4. La PWA appelle POST /pair/confirm {code, api_key} → le serveur valide la
--      clé, marque le code 'confirmed' et y STOCKE la clé cet_ en clair (voir
--      trade-off ci-dessous).
--   5. Le CLI, qui poll GET /pair/poll?code=CODE toutes les ~2s, reçoit
--      {status:ready, api_key} UNE SEULE FOIS puis le code passe à 'consumed'.
--
-- TTL : 10 minutes. Un code non confirmé/consommé expire (expires_at < now()).
--
-- TRADE-OFF STOCKAGE DE LA CLÉ (api_key en clair, colonne `api_key`) :
--   Le reste du schéma ne stocke QUE le hash SHA-256 de la clé (users.api_key_hash).
--   Ici on doit re-servir la clé EN CLAIR au CLI : un hash ne suffit pas. La PWA
--   est la seule à connaître la clé en clair (window.CET_API_KEY), donc c'est
--   elle qui la transmet à la confirmation. On la stocke en clair dans
--   pairing_codes.api_key, MAIS :
--     - TTL court (10 min) et effacée (mise à NULL) dès qu'elle est servie
--       (status → 'consumed'), donc jamais re-servie ;
--     - jamais loggée (aucun log ne contient api_key) ;
--     - table protégée par RLS + accès service_role uniquement (jamais exposée
--       au client anon).
--   Alternative écartée (chiffrement au repos) : surcoût de gestion de clé pour
--   un secret déjà à TTL 10 min et effacé au premier service. Documenté ici pour
--   que le choix soit explicite et révisable.

CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,               -- code court affiché des deux côtés, ex "WDJB-MJHT"
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','consumed','expired')),
  api_key TEXT,                        -- clé cet_ EN CLAIR, posée à la confirmation,
                                       -- effacée (NULL) dès qu'elle est servie au CLI
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL      -- created_at + 10 min
);

-- Index sur l'expiration (lookup/purge des codes périmés).
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_codes (expires_at);

-- RLS : cohérent avec le reste du schéma (service_role bypass côté serveur ;
-- la table n'est JAMAIS accessible via la clé anon).
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;
