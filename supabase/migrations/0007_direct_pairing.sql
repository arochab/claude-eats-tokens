-- Claude Eats Tokens — appairage sans serveur — migration additive
--
-- Dernier flux qui vivait encore sur Render. Porte /pair/start, /pair/confirm
-- et /pair/poll (server/app.py) en RPC, sur la table pairing_codes déjà créée
-- par la migration 0004. Le protocole ne change PAS (device authorization,
-- façon Stripe CLI / RFC 8628) :
--   1. le PC appelle cet_pair_start() -> code court affiché dans le terminal
--   2. l'utilisateur ouvre la PWA (déjà connectée) sur ?pair=CODE
--   3. ANTI-PHISHING : le MÊME code s'affiche des deux côtés. Il VÉRIFIE
--      visuellement avant de confirmer. Sans avoir vu le code dans SON terminal,
--      il ne confirmera pas celui d'un attaquant (mitigation RFC 8628 §5.4,
--      cf. l'attaque Storm-2372 sur le device code flow).
--   4. la PWA appelle cet_pair_confirm(code, clé)
--   5. le PC, qui poll cet_pair_poll(code), reçoit la clé UNE SEULE FOIS
--
-- Aucune clé n'est jamais recopiée à la main.

-- ---------------------------------------------------------------------------
-- Throttle générique (remplace register_throttle, créé le matin même en 0006).
-- On généralise plutôt que d'empiler une table par route. La table ne contient
-- que des compteurs éphémères à fenêtre d'1 h : rien à migrer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rpc_throttle (
  action       text NOT NULL,
  ip           text NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action, ip)
);

ALTER TABLE public.rpc_throttle ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public.register_throttle;

-- IP de l'appelant (best-effort). request.headers est absent en SQL direct et
-- peut être non-JSON : on renvoie '' plutôt que de lever, pour ne JAMAIS casser
-- l'appel métier à cause de l'instrumentation anti-abus.
CREATE OR REPLACE FUNCTION public.cet__client_ip()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_ip text;
BEGIN
  v_ip := pg_catalog.split_part(
    (pg_catalog.current_setting('request.headers', true))::jsonb ->> 'x-forwarded-for',
    ',', 1);
  RETURN pg_catalog.btrim(COALESCE(v_ip, ''));
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END;
$$;

-- Retourne true si l'appelant peut encore agir, et compte le coup.
-- Sans IP connue -> autorisé (on ne bloque pas faute d'information).
--
-- PAR IP ET NON GLOBAL, délibérément : un plafond global serait une arme, il
-- suffirait de le saturer pour bloquer tout le monde. Ici seul l'abuseur trinque.
CREATE OR REPLACE FUNCTION public.cet__throttle_ok(p_action text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip   text;
  v_hits integer;
BEGIN
  v_ip := public.cet__client_ip();
  IF v_ip = '' THEN
    RETURN true;
  END IF;

  -- Purge opportuniste : la fenêtre glissante d'1 h se réinitialise sans tâche
  -- planifiée, et la table ne peut pas enfler.
  DELETE FROM public.rpc_throttle
   WHERE window_start < pg_catalog.now() - INTERVAL '1 hour';

  SELECT t.count INTO v_hits
    FROM public.rpc_throttle t
   WHERE t.action = p_action AND t.ip = v_ip;

  IF COALESCE(v_hits, 0) >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.rpc_throttle (action, ip, count) VALUES (p_action, v_ip, 1)
  ON CONFLICT (action, ip) DO UPDATE
    SET count = public.rpc_throttle.count + 1;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- cet_register RÉÉCRITE sur le throttle générique.
--
-- OBLIGATOIRE, pas cosmétique : la version de 0006 lisait register_throttle,
-- que cette migration vient de supprimer. Sans cette réécriture, toute
-- inscription planterait sur une table absente. Le comportement visible est
-- identique (20/h/IP, mêmes messages d'erreur), seul le compteur change de
-- table.
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
BEGIN
  -- strpos() et non position(x IN y) : `position` est une syntaxe SQL spéciale,
  -- pas une fonction qualifiable par son schéma (et search_path est vide ici).
  v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  IF v_email = ''
     OR pg_catalog.strpos(v_email, '@') = 0
     OR pg_catalog.length(v_email) > 254
  THEN
    RETURN pg_catalog.jsonb_build_object('error', 'email required');
  END IF;

  IF NOT public.cet__throttle_ok('register', 20) THEN
    RETURN pg_catalog.jsonb_build_object('error', 'rate limited');
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
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('error', 'email already registered');
END;
$$;

REVOKE ALL ON FUNCTION public.cet_register(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cet_register(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Génération du code court.
--
-- POURQUOI PAS random() : random() est un PRNG NON cryptographique, dont l'état
-- se déduit d'observations. Un code d'appairage devinable = une clé volée : un
-- attaquant prédirait le code d'une victime et poll-erait sa clé avant elle.
-- gen_random_uuid() est un CSPRNG natif (pg_catalog) — même raison qu'en 0006 :
-- pas de dépendance à pgcrypto.
--
-- Échantillonnage par REJET (on jette les octets >= 248) : 256 n'est pas un
-- multiple de 31, un simple `% 31` rendrait les 8 premiers symboles plus
-- probables. Le rejet supprime ce biais.
--
-- Alphabet sans ambiguïté visuelle (ni 0/O, ni 1/I/L) : 31^8 ≈ 8,5e11 (~39,6
-- bits) sur une durée de vie de 10 min.
CREATE OR REPLACE FUNCTION public.cet__gen_pair_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_alpha CONSTANT text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c_n     CONSTANT integer := 31;
  c_max   CONSTANT integer := 248;   -- 8 * 31 : plus grand multiple sous 256
  v_hex   text := '';
  v_i     integer := 1;
  v_byte  integer;
  v_out   text := '';
BEGIN
  WHILE pg_catalog.length(v_out) < 8 LOOP
    IF v_i + 1 > pg_catalog.length(v_hex) THEN
      v_hex := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
      v_i := 1;
    END IF;
    v_byte := ('x' || pg_catalog.substr(v_hex, v_i, 2))::bit(8)::integer;
    v_i := v_i + 2;
    IF v_byte < c_max THEN
      v_out := v_out || pg_catalog.substr(c_alpha, 1 + (v_byte % c_n), 1);
    END IF;
  END LOOP;
  RETURN pg_catalog.substr(v_out, 1, 4) || '-' || pg_catalog.substr(v_out, 5, 4);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) DÉMARRAGE — appelé par le PC, NON authentifié (il n'a pas encore de clé,
--    c'est tout l'objet de l'appairage). D'où le throttle : 10/h/IP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_pair_start()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_try  integer := 0;
BEGIN
  IF NOT public.cet__throttle_ok('pair_start', 10) THEN
    RETURN pg_catalog.jsonb_build_object('error', 'rate limited');
  END IF;

  -- Purge des codes périmés : la table reste petite sans tâche planifiée.
  DELETE FROM public.pairing_codes
   WHERE expires_at < pg_catalog.now() - INTERVAL '1 hour';

  -- Retry sur collision (extrêmement rare à ~39 bits).
  WHILE v_try < 5 LOOP
    v_try := v_try + 1;
    v_code := public.cet__gen_pair_code();
    BEGIN
      INSERT INTO public.pairing_codes (code, status, expires_at)
      VALUES (v_code, 'pending', pg_catalog.now() + INTERVAL '10 minutes');
      RETURN pg_catalog.jsonb_build_object('code', v_code, 'expires_in', 600);
    EXCEPTION WHEN unique_violation THEN
      NULL;  -- code déjà pris : on retire
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('error', 'could not create pairing code');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) CONFIRMATION — appelée par la PWA, qui connaît la clé en clair.
--    On stocke la clé en clair dans pairing_codes.api_key : TTL 10 min et
--    effacée dès qu'elle est servie (cf. le trade-off documenté en 0004).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_pair_confirm(p_code text, p_api_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.pairing_codes%ROWTYPE;
  v_code   text;
  v_exists boolean;
BEGIN
  v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  IF v_code = '' OR p_api_key IS NULL OR pg_catalog.length(p_api_key) < 24 THEN
    RETURN pg_catalog.jsonb_build_object('error', 'code and api_key required');
  END IF;

  -- La clé doit correspondre à un utilisateur réel.
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.api_key_hash = pg_catalog.encode(
             pg_catalog.sha256(pg_catalog.convert_to(p_api_key, 'UTF8')), 'hex')
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN pg_catalog.jsonb_build_object('error', 'invalid api key');
  END IF;

  SELECT * INTO v_row FROM public.pairing_codes p WHERE p.code = v_code;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('error', 'unknown code');
  END IF;
  IF v_row.expires_at < pg_catalog.now() THEN
    UPDATE public.pairing_codes
       SET status = 'expired', api_key = NULL WHERE code = v_code;
    RETURN pg_catalog.jsonb_build_object('error', 'code expired');
  END IF;
  IF v_row.status <> 'pending' THEN
    -- Déjà confirmé/consommé/expiré : on ne ré-arme JAMAIS un code.
    RETURN pg_catalog.jsonb_build_object('error', 'code not pending');
  END IF;

  UPDATE public.pairing_codes
     SET status = 'confirmed', api_key = p_api_key
   WHERE code = v_code;

  RETURN pg_catalog.jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) POLL — appelé par le PC toutes les ~2 s. Sert la clé UNE SEULE FOIS.
--    Code inconnu et code périmé renvoient la MÊME chose : on ne révèle pas
--    l'existence d'un code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cet_pair_poll(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row  public.pairing_codes%ROWTYPE;
  v_code text;
  v_key  text;
BEGIN
  v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code, '')));
  IF v_code = '' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'expired');
  END IF;

  SELECT * INTO v_row FROM public.pairing_codes p WHERE p.code = v_code;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'expired');
  END IF;

  IF v_row.expires_at < pg_catalog.now() THEN
    UPDATE public.pairing_codes
       SET status = 'expired', api_key = NULL WHERE code = v_code;
    RETURN pg_catalog.jsonb_build_object('status', 'expired');
  END IF;

  IF v_row.status = 'confirmed' THEN
    v_key := v_row.api_key;
    -- CONSOMME AVANT DE RÉPONDRE. L'UPDATE ... WHERE status='confirmed' est
    -- atomique : deux polls simultanés ne peuvent pas recevoir la clé tous les
    -- deux, un seul gagne la ligne.
    UPDATE public.pairing_codes
       SET status = 'consumed', api_key = NULL
     WHERE code = v_code AND status = 'confirmed';
    IF NOT FOUND THEN
      -- Un autre poll a gagné la course : on ne sert rien.
      RETURN pg_catalog.jsonb_build_object('status', 'consumed');
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'ready', 'api_key', v_key);
  END IF;

  IF v_row.status = 'consumed' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'consumed');
  END IF;

  RETURN pg_catalog.jsonb_build_object('status', 'pending');
END;
$$;

-- ---------------------------------------------------------------------------
-- Exposition. Les helpers cet__* NE SONT PAS exposés : ils tournent déjà avec
-- les droits du propriétaire quand les fonctions publiques les appellent.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cet__client_ip() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet__throttle_ok(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet__gen_pair_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet_pair_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet_pair_confirm(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cet_pair_poll(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cet_pair_start() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cet_pair_confirm(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cet_pair_poll(text) TO anon, authenticated;
