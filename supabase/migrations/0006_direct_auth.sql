-- Claude Eats Tokens — inscription + profil sans serveur — migration additive
--
-- Suite de 0005. Il restait deux routes Flask dans le chemin d'un NOUVEL
-- utilisateur : /auth/register (créer un compte) et /auth/me (lire son profil).
-- Tant qu'elles vivaient sur Render, personne ne pouvait s'inscrire pendant une
-- suspension. On les descend dans la base, même modèle que 0005 :
--   cet_register(email) -> {ok, api_key, email, plan} | {error}
--   cet_me(clé)         -> {email, plan, plan_status, plan_renews_at} | NULL
--
-- POURQUOI cet_me EXISTE alors que cet_get_usage renvoie déjà `user` : un compte
-- neuf n'a AUCUNE donnée, donc cet_get_usage renvoie NULL. Sans cet_me, l'écran
-- « mon compte » resterait vide entre l'inscription et le premier push.
--
-- GÉNÉRATION DE LA CLÉ : gen_random_uuid() ×2 -> 'cet_' + 64 hexa. On reste sur
-- du pg_catalog NATIF (pas pgcrypto) pour la même raison qu'en 0005 : aucune
-- dépendance au schéma où une extension serait installée. Deux UUIDv4 = ~244
-- bits d'aléa cryptographique, très au-delà du nécessaire. Le format reste
-- compatible avec le contrôle du front (/^cet_[A-Za-z0-9_-]{20,}$/) et avec le
-- hash SHA-256 déjà utilisé partout (users.api_key_hash).
--
-- LA CLÉ N'EST RENDUE QU'UNE FOIS, à l'inscription : la base ne stocke que son
-- hash. Perdue = perdue (il faudra en régénérer une). C'est le comportement
-- historique de /auth/register, conservé tel quel.

-- ---------------------------------------------------------------------------
-- Garde-fou anti-abus (best-effort, par IP).
--
-- L'ancienne route Flask était ouverte SANS AUCUNE limite : n'importe qui
-- pouvait créer des comptes en boucle. Sur une base gratuite (500 Mo), ça
-- revient à laisser un inconnu la remplir. On ferme le trou ici plutôt que de
-- reproduire la faille.
--
-- POURQUOI PAR IP ET NON GLOBALEMENT : un plafond global serait une arme —
-- il suffirait de le saturer pour empêcher TOUTE nouvelle inscription, juste au
-- moment d'un lancement. Un plafond par IP ne pénalise que l'abuseur.
--
-- « best-effort » assumé : l'IP vient de x-forwarded-for, posé par l'edge
-- Supabase. Ça n'arrête pas un attaquant distribué ; ça arrête le script
-- opportuniste, qui est la menace réelle à cette échelle.
CREATE TABLE IF NOT EXISTS public.register_throttle (
  ip           text PRIMARY KEY,
  count        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- RLS sans policy, comme le reste : `anon` n'y touche jamais en direct.
ALTER TABLE public.register_throttle ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- INSCRIPTION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_register(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_key   text;
  v_ip    text := '';
  v_hits  integer := 0;
BEGIN
  -- Validation email : même exigence que le Flask historique (non vide + @),
  -- plus une borne de longueur (RFC 5321 : 254 caractères).
  -- strpos() et non position(x IN y) : `position` est une syntaxe SQL spéciale,
  -- pas une fonction qualifiable par son schéma (et search_path est vide ici).
  v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  IF v_email = ''
     OR pg_catalog.strpos(v_email, '@') = 0
     OR pg_catalog.length(v_email) > 254
  THEN
    RETURN pg_catalog.jsonb_build_object('error', 'email required');
  END IF;

  -- IP de l'appelant (best-effort). request.headers peut être absent (appel
  -- direct en SQL) ou non-JSON : dans ce cas on n'applique simplement pas de
  -- limite, on ne casse jamais l'inscription pour ça.
  BEGIN
    v_ip := pg_catalog.split_part(
      (pg_catalog.current_setting('request.headers', true))::jsonb ->> 'x-forwarded-for',
      ',', 1);
    v_ip := pg_catalog.btrim(COALESCE(v_ip, ''));
  EXCEPTION WHEN OTHERS THEN
    v_ip := '';
  END;

  IF v_ip <> '' THEN
    -- Purge opportuniste : la fenêtre glissante d'1 h se réinitialise ainsi
    -- sans tâche planifiée, et la table ne peut pas enfler.
    DELETE FROM public.register_throttle
     WHERE window_start < pg_catalog.now() - INTERVAL '1 hour';

    SELECT t.count INTO v_hits
      FROM public.register_throttle t WHERE t.ip = v_ip;

    -- 20/h/IP : très large pour un humain (et pour un lancement, où les
    -- visiteurs arrivent d'IP différentes), étroit pour un script.
    IF COALESCE(v_hits, 0) >= 20 THEN
      RETURN pg_catalog.jsonb_build_object('error', 'rate limited');
    END IF;

    INSERT INTO public.register_throttle (ip, count) VALUES (v_ip, 1)
    ON CONFLICT (ip) DO UPDATE
      SET count = public.register_throttle.count + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.email = v_email) THEN
    RETURN pg_catalog.jsonb_build_object('error', 'email already registered');
  END IF;

  v_key := 'cet_'
        || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
        || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  INSERT INTO public.users (email, api_key_hash, plan, plan_status)
  VALUES (
    v_email,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_key, 'UTF8')), 'hex'),
    'free',
    'none'
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'api_key', v_key, 'email', v_email, 'plan', 'free');

EXCEPTION
  -- Deux inscriptions simultanées sur le même email : l'index unique tranche.
  -- On répond comme le doublon détecté plus haut, jamais une erreur brute.
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('error', 'email already registered');
END;
$$;

-- ---------------------------------------------------------------------------
-- PROFIL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_me(p_api_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  IF p_api_key IS NULL OR pg_catalog.length(p_api_key) < 24 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_user
    FROM public.users
   WHERE api_key_hash = pg_catalog.encode(
           pg_catalog.sha256(pg_catalog.convert_to(p_api_key, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'email',          v_user.email,
    'plan',           v_user.plan,
    'plan_status',    v_user.plan_status,
    'plan_renews_at', v_user.plan_renews_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Exposition : REVOKE d'abord (PUBLIC reçoit EXECUTE par défaut).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cet_register(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet_me(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cet_register(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cet_me(text) TO anon, authenticated;
