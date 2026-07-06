-- Claude Eats Tokens — Supabase schema (multi-tenant)
-- Exécuter dans Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Table utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index sur le hash de la clé API (lookup rapide)
CREATE INDEX IF NOT EXISTS idx_users_api_key_hash ON users (api_key_hash);

-- Table des données d'usage (un blob JSON par utilisateur, upsert)
CREATE TABLE IF NOT EXISTS usage_blobs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS) — désactivé pour les requêtes service_role
-- mais activé pour la sécurité en profondeur
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_blobs ENABLE ROW LEVEL SECURITY;

-- Policy : le service_role bypass RLS (c'est le comportement par défaut)
-- On n'a pas besoin de policies pour l'instant car on utilise la clé service_role
-- côté serveur Flask uniquement (jamais exposée au client).
