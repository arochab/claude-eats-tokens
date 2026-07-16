-- Claude Eats Tokens — accès client direct (sans serveur) — migration additive
--
-- POURQUOI : le serveur Flask sur Render n'était qu'un videur devant la base.
-- Il lisait la clé API, vérifiait son hash, et relayait vers PostgREST avec la
-- clé service_role. Coût : un service à héberger, 750 h/mois de quota gratuit
-- partagé, et une suspension dès qu'on dépasse (arrivée le 15/07/2026 à 15h00).
--
-- ICI : on descend ce videur DANS la base. Deux fonctions SECURITY DEFINER
-- refont exactement le travail de _auth_user() + /usage.json + /push :
--   cet_get_usage(clé)        -> le blob de CE user, enrichi du bloc `user`
--   cet_push_usage(clé, data) -> upsert du blob de CE user + activation
--
-- MODÈLE DE SÉCURITÉ (le point important) :
--   - Les tables restent en RLS SANS AUCUNE policy => le rôle `anon` ne peut
--     RIEN lire ni écrire en direct. Ceci est inchangé et reste vrai.
--   - Seules ces deux fonctions sont exposées à `anon`. Étant SECURITY DEFINER,
--     elles s'exécutent avec les droits du propriétaire et contournent RLS,
--     mais elles ne rendent QUE les lignes du porteur d'une clé valide.
--   - La clé API n'est jamais stockée en clair : on compare le SHA-256, comme
--     le faisait _sb_get_user_by_api_key(). Le format `cet_` + 32 octets
--     urlsafe = ~256 bits d'entropie -> le bruteforce via anon est hors sujet.
--   - search_path = '' + tout est qualifié : pas de détournement de résolution
--     de nom (le piège classique des SECURITY DEFINER).
--   - sha256() est une fonction NATIVE de Postgres (pg_catalog, >= PG11) : pas
--     de dépendance à pgcrypto ni au schéma où il serait installé.
--
-- CONSÉQUENCE : la PWA parle à PostgREST avec la clé PUBLISHABLE (publique par
-- conception, rôle `anon`) et prouve son identité avec la clé `cet_` de
-- l'utilisateur. Plus aucun serveur entre le téléphone et la base.

-- ---------------------------------------------------------------------------
-- LECTURE : rend le usage.json de l'utilisateur porteur de la clé.
-- Retourne NULL si la clé est inconnue OU s'il n'y a pas encore de données —
-- indiscernables volontairement (on ne révèle pas l'existence d'un compte).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_get_usage(p_api_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  public.users%ROWTYPE;
  v_data  jsonb;
  v_saved timestamptz;
BEGIN
  -- Garde-fou d'entrée : une vraie clé fait ~47 caractères ("cet_" + 43).
  IF p_api_key IS NULL OR length(p_api_key) < 24 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_user
    FROM public.users
   WHERE api_key_hash = encode(pg_catalog.sha256(
           pg_catalog.convert_to(p_api_key, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT b.data, b.saved_at INTO v_data, v_saved
    FROM public.usage_blobs b
   WHERE b.user_id = v_user.id;
  IF v_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Même enveloppe que celle que posait Flask dans /usage.json : le front lit
  -- d.user.plan (gating Pro) et d.serverAgeSeconds (fraîcheur). Le `||` écrase
  -- les clés de même nom, donc ces deux champs font autorité.
  RETURN v_data || jsonb_build_object(
    'user', jsonb_build_object(
      'email',          v_user.email,
      'plan',           v_user.plan,
      'plan_status',    v_user.plan_status,
      'plan_renews_at', v_user.plan_renews_at
    ),
    'serverAgeSeconds', GREATEST(0,
      floor(EXTRACT(EPOCH FROM (pg_catalog.now() - v_saved)))::int)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ÉCRITURE : upsert du blob + marquage d'activation (first/last_push_at).
-- Retourne true si écrit, false si clé invalide ou payload non conforme.
-- Le PC est le seul appelant. Validation alignée sur _valid_payload() côté
-- Flask : un objet, avec totals.total numérique.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_push_usage(p_api_key text, p_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_api_key IS NULL OR length(p_api_key) < 24 THEN
    RETURN false;
  END IF;

  -- Validation de structure (refuse un blob vide/malformé avant d'écraser
  -- des données valides).
  IF p_data IS NULL
     OR pg_catalog.jsonb_typeof(p_data) <> 'object'
     OR pg_catalog.jsonb_typeof(p_data -> 'totals') <> 'object'
     OR pg_catalog.jsonb_typeof(p_data -> 'totals' -> 'total') <> 'number'
  THEN
    RETURN false;
  END IF;

  SELECT id INTO v_user_id
    FROM public.users
   WHERE api_key_hash = encode(pg_catalog.sha256(
           pg_catalog.convert_to(p_api_key, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.usage_blobs (user_id, data, saved_at)
  VALUES (v_user_id, p_data, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET data = EXCLUDED.data,
        saved_at = EXCLUDED.saved_at;

  -- Activation (funnel GTM) : first_push_at figé à la première poussée.
  UPDATE public.users
     SET last_push_at  = pg_catalog.now(),
         first_push_at = COALESCE(first_push_at, pg_catalog.now())
   WHERE id = v_user_id;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Exposition : uniquement ces deux fonctions, uniquement à anon/authenticated.
-- REVOKE d'abord (CREATE OR REPLACE ne réinitialise pas les droits, et PUBLIC
-- reçoit EXECUTE par défaut sur toute nouvelle fonction).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cet_get_usage(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet_push_usage(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cet_get_usage(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cet_push_usage(text, jsonb) TO anon, authenticated;
