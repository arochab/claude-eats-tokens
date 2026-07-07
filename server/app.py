"""
Claude Eats Tokens — push server (Flask).

Deux modes de fonctionnement :
1. **Legacy (single-tenant)** : un seul utilisateur, auth par PUSH_SECRET,
   persistance dans une Gist privée GitHub. C'est le mode historique d'Adam.
2. **Multi-tenant (hosted)** : plusieurs utilisateurs, auth par API key
   personnelle, persistance dans Supabase PostgreSQL (free tier).

Le mode est choisi automatiquement :
- Si SUPABASE_URL est défini → multi-tenant.
- Sinon → legacy (PUSH_SECRET + Gist).

Les deux modes peuvent coexister : Adam garde son PUSH_SECRET, les autres
utilisateurs utilisent leur API key.

Env (Render → Environment) :
  -- Legacy --
  PUSH_SECRET      secret partagé PC ↔ serveur (obligatoire en legacy)
  GITHUB_TOKEN     token avec scope `gist` (persistance durable, optionnel)
  GIST_ID          id de la Gist privée qui stocke usage.json (optionnel)
  -- Multi-tenant --
  SUPABASE_URL     URL du projet Supabase
  SUPABASE_KEY     clé service_role (pas anon — on gère l'auth nous-mêmes)
  -- Communs --
  ALLOWED_ORIGINS  origines autorisées en lecture (def. github.io + onrender)
  PORT             fourni par Render
"""
import base64
import hmac
import json
import logging
import os
import secrets
import time
import hashlib
import urllib.parse

import requests
from flask import Flask, jsonify, request, redirect
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cet")

app = Flask(__name__)

PUSH_SECRET = os.environ.get("PUSH_SECRET", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GIST_ID = os.environ.get("GIST_ID", "")
GIST_FILE = "usage.json"

# Multi-tenant (Supabase)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # service_role key
MULTI_TENANT = bool(SUPABASE_URL and SUPABASE_KEY)

# Billing (Lemon Squeezy)
LS_WEBHOOK_SECRET = os.environ.get("LS_WEBHOOK_SECRET", "")  # signe les webhooks
LS_LINK_SECRET = os.environ.get("LS_LINK_SECRET", "")        # signe le token checkout (uid)
LS_CHECKOUT_URL = os.environ.get("LS_CHECKOUT_URL", "")      # URL de checkout LS du produit

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://arochab.github.io/claude-eats-tokens")

# Lecture publique (la PWA est sur GitHub Pages, autre origine).
CORS(app, resources={
    r"/usage.json": {"origins": "*", "methods": ["GET"]},
    r"/auth/*": {"origins": "*", "methods": ["GET", "POST"]},
    r"/api/*": {"origins": "*", "methods": ["GET", "POST"]},
    # Beacon d'instrumentation : ping GET fire-and-forget depuis le navigateur.
    r"/beacon": {"origins": "*", "methods": ["GET"]},
})

# Cache mémoire legacy (rapide) + Gist (durable).
_cache = {"data": None, "ts": 0, "lastGistOk": None}


# ---------------------------------------------------------------------------
# Supabase helpers (multi-tenant)
# ---------------------------------------------------------------------------
def _sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


_USER_SELECT = "id,email,plan,plan_status,plan_renews_at"


def _sb_get_user_by_api_key(api_key):
    """Cherche un utilisateur par sa clé API (hash SHA-256)."""
    if not MULTI_TENANT or not api_key:
        return None
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?api_key_hash=eq.{key_hash}&select={_USER_SELECT}",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        return r.json()[0]
    return None


def _sb_get_user_by_sub(sub_id):
    """Cherche un utilisateur par son id d'abonnement Lemon Squeezy."""
    if not MULTI_TENANT or not sub_id:
        return None
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?ls_subscription_id=eq.{sub_id}&select=id,email,plan",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        return r.json()[0]
    return None


def _sb_get_user_by_email(email):
    """Cherche un utilisateur par email (webhook : fallback de résolution)."""
    if not MULTI_TENANT or not email:
        return None
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?email=eq.{email}&select=id,email,plan",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        return r.json()[0]
    return None


def _sb_update_user(user_id, fields):
    """PATCH partiel d'une ligne users (id=eq.{user_id}). Retourne r.ok."""
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}",
        headers=_sb_headers(), json=fields, timeout=10)
    return r.ok


# ---------------------------------------------------------------------------
# Instrumentation GTM (agrégats 0-PII : activation + comptage par canal)
# ---------------------------------------------------------------------------
def _mark_activation(user_id):
    """ACTIVATION : marque last_push_at (toujours) + first_push_at (si NULL).

    Best-effort : toute erreur est avalée — l'instrumentation ne doit JAMAIS
    faire échouer un /push. On utilise COALESCE côté PostgREST pour ne pas
    écraser first_push_at une fois posé (première activation figée).
    """
    if not MULTI_TENANT or not user_id:
        return
    try:
        _sb_update_user(user_id, {
            "last_push_at": "now()",
            "first_push_at": "COALESCE(first_push_at, now())",
        })
    except Exception:  # noqa: BLE001 — jamais throw : stat best-effort
        pass


_REF_RE = None  # compilé paresseusement (voir _sanitize_ref)


def _sanitize_ref(ref):
    """Valide/normalise un canal ?ref= : [a-z0-9-] minuscules, max 32 car.

    Retourne le ref propre ou None si invalide (ex "../etc", vide, trop long).
    """
    global _REF_RE
    if not ref or not isinstance(ref, str):
        return None
    ref = ref.strip().lower()
    if _REF_RE is None:
        import re
        _REF_RE = re.compile(r"^[a-z0-9-]{1,32}$")
    return ref if _REF_RE.match(ref) else None


def _sb_count(table, filt=""):
    """Nombre de lignes d'une table (0-PII) via Prefer: count=exact.

    Retourne un int (0 en cas d'erreur). On lit le Content-Range renvoyé par
    PostgREST : `0-24/25` → 25. Best-effort, jamais throw.
    """
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=id" + (f"&{filt}" if filt else "")
        r = requests.get(
            url,
            headers={**_sb_headers(), "Prefer": "count=exact", "Range": "0-0"},
            timeout=10)
        cr = r.headers.get("Content-Range", "")
        if "/" in cr:
            total = cr.split("/", 1)[1]
            if total.isdigit():
                return int(total)
    except Exception:  # noqa: BLE001
        pass
    return 0


def _sb_visits():
    """Retourne le comptage par canal {ref: count, ...} (0-PII). Best-effort."""
    out = {}
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/visits?select=ref,count",
            headers=_sb_headers(), timeout=10)
        if r.ok and isinstance(r.json(), list):
            for row in r.json():
                ref = row.get("ref")
                if ref is not None:
                    out[ref] = row.get("count", 0)
    except Exception:  # noqa: BLE001
        pass
    return out


def _sb_bump_visit(ref):
    """Incrémente le compteur du canal `ref` (upsert : GET count puis PATCH/POST).

    Le ref est déjà sanitizé par l'appelant. Best-effort : jamais throw.
    """
    if not MULTI_TENANT or not ref:
        return
    try:
        # Lit le compteur actuel (si la ligne existe).
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/visits?ref=eq.{ref}&select=count",
            headers=_sb_headers(), timeout=10)
        rows = r.json() if r.ok else []
        if rows:
            current = rows[0].get("count", 0) or 0
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/visits?ref=eq.{ref}",
                headers=_sb_headers(),
                json={"count": current + 1, "updated_at": "now()"},
                timeout=10)
        else:
            # Première visite de ce canal : insert (merge-duplicates au cas où
            # deux pings arrivent en concurrence sur la clé primaire `ref`).
            requests.post(
                f"{SUPABASE_URL}/rest/v1/visits",
                headers={**_sb_headers(),
                         "Prefer": "resolution=merge-duplicates,return=minimal"},
                json={"ref": ref, "count": 1},
                timeout=10)
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Billing helpers (Lemon Squeezy)
# ---------------------------------------------------------------------------
def make_checkout_token(user_id):
    """Jeton signé porté dans checkout[custom][uid] et renvoyé par le webhook.

    Format : ct_{user_id}.{sig} où sig = HMAC-SHA256(LS_LINK_SECRET, user_id),
    tronqué à 32 caractères base64url. Prouve que le uid vient bien de nous.
    """
    sig = base64.urlsafe_b64encode(
        hmac.new(LS_LINK_SECRET.encode(), user_id.encode(), hashlib.sha256).digest()
    ).decode()[:32]
    return f"ct_{user_id}.{sig}"


def verify_checkout_token(token):
    """Vérifie un jeton produit par make_checkout_token. Retourne user_id ou None.

    Robuste : tout jeton absent/malformé/altéré renvoie None sans lever.
    """
    try:
        if not token or not isinstance(token, str) or not token.startswith("ct_"):
            return None
        body = token[3:]  # retire "ct_"
        user_id, sig = body.split(".", 1)  # split sur le premier '.'
        if not user_id or not sig:
            return None
        expected = base64.urlsafe_b64encode(
            hmac.new(LS_LINK_SECRET.encode(), user_id.encode(), hashlib.sha256).digest()
        ).decode()[:32]
        if hmac.compare_digest(expected, sig):
            return user_id
        return None
    except Exception:  # noqa: BLE001 — jamais throw sur entrée hostile
        return None


# Statuts Lemon Squeezy qui donnent droit au plan 'pro'.
_ACTIVE_STATUSES = {"active", "on_trial", "past_due"}


def derive_plan(status):
    """Fonction PURE : mappe un statut d'abonnement LS vers 'pro' ou 'free'."""
    return "pro" if status in _ACTIVE_STATUSES else "free"


def _sb_save_usage(user_id, payload):
    """Sauvegarde le usage.json d'un utilisateur dans Supabase."""
    body = {"user_id": user_id, "data": payload}
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/usage_blobs",
        headers={**_sb_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=body, timeout=10)
    # Upsert : si l'utilisateur a déjà une ligne, on la remplace
    if r.status_code == 409:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/usage_blobs?user_id=eq.{user_id}",
            headers=_sb_headers(),
            json={"data": payload, "saved_at": "now()"},
            timeout=10)
    return r.ok


def _sb_load_usage(user_id):
    """Charge le dernier usage.json d'un utilisateur depuis Supabase."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/usage_blobs?user_id=eq.{user_id}&select=data,saved_at&order=saved_at.desc&limit=1",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        row = r.json()[0]
        return row["data"], row["saved_at"]
    return None, None


# ---------------------------------------------------------------------------
# Gist helpers (legacy)
# ---------------------------------------------------------------------------
def _gist_headers():
    return {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}


def _with_retry(fn, what, attempts=3):
    """Exécute fn() avec backoff exponentiel (1s, 2s, 4s). Log chaque échec."""
    delay = 1.0
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            log.warning("%s échec (tentative %d/%d) : %s", what, i + 1, attempts, e)
            if i + 1 < attempts:
                time.sleep(delay)
                delay *= 2
    return None


def save_to_gist(payload):
    if not (GITHUB_TOKEN and GIST_ID):
        return False

    def _do():
        body = {"files": {GIST_FILE: {"content": json.dumps(payload)}}}
        r = requests.patch(f"https://api.github.com/gists/{GIST_ID}",
                           headers=_gist_headers(), json=body, timeout=10)
        r.raise_for_status()
        return True

    ok = bool(_with_retry(_do, "save_to_gist"))
    _cache["lastGistOk"] = ok
    return ok


def load_from_gist():
    if not (GITHUB_TOKEN and GIST_ID):
        return None

    def _do():
        r = requests.get(f"https://api.github.com/gists/{GIST_ID}",
                         headers=_gist_headers(), timeout=10)
        r.raise_for_status()
        return json.loads(r.json()["files"][GIST_FILE]["content"])

    return _with_retry(_do, "load_from_gist")


def _valid_payload(p):
    """Validation de structure (corrige SEC-003 : plus que 'totals' présent)."""
    if not isinstance(p, dict):
        return False
    totals = p.get("totals")
    if not isinstance(totals, dict):
        return False
    if not isinstance(totals.get("total"), (int, float)):
        return False
    # champs attendus, type souple mais présent
    for key, typ in (("timeline", list), ("models", list), ("projects", list)):
        if key in p and not isinstance(p[key], typ):
            return False
    return True


def _auth_user():
    """Extrait l'utilisateur depuis la requête (API key ou PUSH_SECRET legacy)."""
    # 1. API key multi-tenant
    api_key = request.headers.get("X-Api-Key", "")
    if api_key and MULTI_TENANT:
        user = _sb_get_user_by_api_key(api_key)
        if user:
            return {"mode": "multi", "user": user}
        return None

    # 2. Legacy PUSH_SECRET
    secret = request.headers.get("X-Push-Secret", "")
    if secret and PUSH_SECRET and hmac.compare_digest(secret, PUSH_SECRET):
        return {"mode": "legacy"}

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def health():
    return jsonify({"service": "claude-eats-tokens", "ok": True,
                    "hasData": _cache["data"] is not None,
                    "multiTenant": MULTI_TENANT,
                    "lastGistOk": _cache["lastGistOk"]})


@app.post("/push")
def push():
    """Le PC envoie ici son usage.json frais."""
    auth = _auth_user()
    if not auth:
        log.info("push refusé : auth invalide")
        return jsonify({"error": "unauthorized"}), 401

    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "bad json"}), 400
    if not _valid_payload(payload):
        return jsonify({"error": "invalid payload"}), 400

    if auth["mode"] == "multi":
        # Multi-tenant : stockage Supabase
        user_id = auth["user"]["id"]
        ok = _sb_save_usage(user_id, payload)
        if ok:
            _mark_activation(user_id)  # best-effort, ne casse jamais le push
        status = 200 if ok else 500
        return jsonify({"ok": ok, "received": payload["totals"].get("total", 0)}), status
    else:
        # Legacy : stockage Gist
        _cache["data"] = payload
        _cache["ts"] = time.time()
        gist_ok = save_to_gist(payload)
        status = 200 if gist_ok or not (GITHUB_TOKEN and GIST_ID) else 207
        return jsonify({"ok": True, "persisted": gist_ok,
                        "received": payload["totals"].get("total", 0)}), status


@app.get("/usage.json")
def usage():
    """La PWA lit ici les derniers chiffres."""
    # Multi-tenant : l'utilisateur passe son API key
    api_key = request.headers.get("X-Api-Key", "") or request.args.get("key", "")
    if api_key and MULTI_TENANT:
        user = _sb_get_user_by_api_key(api_key)
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data, saved_at = _sb_load_usage(user["id"])
        if data is None:
            return jsonify({"error": "no data yet"}), 404
        out = dict(data) if isinstance(data, dict) else data
        out["user"] = {
            "email": user.get("email", ""),
            "plan": user.get("plan", "free"),
            "plan_status": user.get("plan_status", "none"),
            "plan_renews_at": user.get("plan_renews_at"),
        }
        resp = jsonify(out)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    # Legacy : cache mémoire + Gist
    data = _cache["data"]
    if data is None:
        data = load_from_gist()
        if data is not None:
            _cache["data"] = data
            _cache["ts"] = time.time()
    if data is None:
        return jsonify({"error": "no data yet"}), 404
    # on annote la fraîcheur sans muter l'objet stocké (corrige SEC-005)
    out = dict(data)
    out["serverAgeSeconds"] = round(time.time() - _cache["ts"]) if _cache["ts"] else None
    resp = jsonify(out)
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------------------
# Instrumentation GTM — /stats (funnel agrégé) + /beacon (comptage par canal)
# ---------------------------------------------------------------------------
# GIF transparent 1×1 (43 octets) : réponse la plus légère possible pour un
# pixel de tracking déclenché via <img>. Zéro corps de sens, aucune donnée.
_PIXEL_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")


@app.get("/stats")
def stats():
    """Funnel GTM agrégé, 0-PII. Protégé par PUSH_SECRET (?key=).

    Retourne {accounts, activated, pro, visits}. Aucune donnée personnelle :
    uniquement des compteurs. 401 si mauvais key, 501 si pas multi-tenant.
    """
    key = request.args.get("key", "")
    if not (key and PUSH_SECRET and hmac.compare_digest(key, PUSH_SECRET)):
        return jsonify({"error": "unauthorized"}), 401
    if not MULTI_TENANT:
        return jsonify({"error": "multi-tenant not enabled"}), 501

    return jsonify({
        "accounts": _sb_count("users"),
        "activated": _sb_count("users", "first_push_at=not.is.null"),
        "pro": _sb_count("users", "plan=eq.pro"),
        "visits": _sb_visits(),
    })


@app.get("/beacon")
def beacon():
    """Pixel d'instrumentation : incrémente le compteur du canal ?ref=.

    0-PII : on ne stocke qu'un compteur par canal (pas d'IP, pas d'UA, pas de
    timestamp par visite). Best-effort : renvoie toujours un GIF 1×1 (204-like)
    même si le ref est invalide ou si le store échoue.
    """
    ref = _sanitize_ref(request.args.get("ref", ""))
    if ref and MULTI_TENANT:
        _sb_bump_visit(ref)  # best-effort, jamais throw
    resp = app.response_class(_PIXEL_GIF, mimetype="image/gif")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp


# ---------------------------------------------------------------------------
# Auth multi-tenant (inscription + login)
# ---------------------------------------------------------------------------
@app.post("/auth/register")
def register():
    """Crée un compte et retourne une API key."""
    if not MULTI_TENANT:
        return jsonify({"error": "multi-tenant not enabled"}), 501

    body = request.get_json(force=True) if request.is_json else {}
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "email required"}), 400

    # Vérifier si l'email existe déjà
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?email=eq.{email}&select=id",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        return jsonify({"error": "email already registered"}), 409

    # Générer une API key
    api_key = f"cet_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Créer l'utilisateur
    user_data = {
        "email": email,
        "api_key_hash": key_hash,
        "plan": "free",
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/users",
        headers={**_sb_headers(), "Prefer": "return=representation"},
        json=user_data, timeout=10)

    if not r.ok:
        log.warning("register failed: %s %s", r.status_code, r.text)
        return jsonify({"error": "registration failed"}), 500

    user = r.json()[0] if r.json() else {}
    return jsonify({
        "ok": True,
        "api_key": api_key,
        "email": email,
        "plan": "free",
        "message": "Garde cette clé API précieusement — elle ne sera plus affichée.",
    }), 201


@app.get("/auth/me")
def me():
    """Retourne le profil de l'utilisateur connecté (via API key)."""
    if not MULTI_TENANT:
        return jsonify({"error": "multi-tenant not enabled"}), 501

    api_key = request.headers.get("X-Api-Key", "")
    if not api_key:
        return jsonify({"error": "api key required"}), 401

    user = _sb_get_user_by_api_key(api_key)
    if not user:
        return jsonify({"error": "invalid api key"}), 401

    return jsonify({
        "email": user.get("email", ""),
        "plan": user.get("plan", "free"),
        "plan_status": user.get("plan_status", "none"),
        "plan_renews_at": user.get("plan_renews_at"),
    })


# ---------------------------------------------------------------------------
# Billing (Lemon Squeezy) — checkout + webhook
# ---------------------------------------------------------------------------
@app.get("/billing/checkout")
def billing_checkout():
    """Redirige l'utilisateur (authentifié) vers le checkout Lemon Squeezy.

    On préremplit l'email et on injecte un jeton signé (uid) dans le custom
    data : le webhook s'en servira pour rattacher l'abonnement au bon compte.
    """
    if not MULTI_TENANT:
        return jsonify({"error": "multi-tenant not enabled"}), 501

    api_key = request.headers.get("X-Api-Key", "") or request.args.get("key", "")
    user = _sb_get_user_by_api_key(api_key)
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    if not LS_CHECKOUT_URL:
        return jsonify({"error": "checkout not configured"}), 501

    email = user.get("email", "")
    token = make_checkout_token(user["id"])
    url = (
        LS_CHECKOUT_URL
        + "?checkout[email]=" + urllib.parse.quote(email)
        + "&checkout[custom][uid]=" + urllib.parse.quote(token)
    )
    return redirect(url, code=302)


@app.post("/billing/webhook")
def billing_webhook():
    """Reçoit les événements d'abonnement Lemon Squeezy.

    - Vérifie la signature HMAC (X-Signature) sur le corps brut.
    - Résout l'utilisateur (jeton uid signé → id d'abonnement → email).
    - Dérive le plan depuis le statut et écrit un état ABSOLU (idempotent).
    - 200 = traité/ACK, 401 = signature invalide, 500 = update raté (retry LS).
    """
    if not MULTI_TENANT:
        return jsonify({"error": "multi-tenant not enabled"}), 501

    raw = request.get_data()
    sig = request.headers.get("X-Signature", "")
    expected = hmac.new(LS_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        log.info("webhook refusé : signature invalide")
        return jsonify({"error": "invalid signature"}), 401

    try:
        payload = json.loads(raw)
        event = payload["meta"]["event_name"]
        attrs = payload["data"]["attributes"]
    except Exception:  # noqa: BLE001 — corps mal formé après signature valide
        log.warning("webhook : corps JSON invalide")
        return jsonify({"error": "bad json"}), 400

    # On ne traite que les événements d'abonnement. Le reste (order_created,
    # etc.) est simplement ACK pour éviter les retries inutiles de Lemon Squeezy.
    if not event.startswith("subscription_"):
        return jsonify({"ok": True, "ignored": event}), 200

    status = attrs.get("status")
    custom = payload["meta"].get("custom_data", {}) or {}
    sub_id = str(payload["data"].get("id") or "")

    # Résolution de l'utilisateur, par priorité décroissante de confiance.
    user_id = verify_checkout_token(custom.get("uid"))
    if not user_id and sub_id:
        u = _sb_get_user_by_sub(sub_id)
        user_id = u["id"] if u else None
    if not user_id:
        u = _sb_get_user_by_email((attrs.get("user_email") or "").strip().lower())
        user_id = u["id"] if u else None

    if not user_id:
        # On ACK pour ne pas provoquer de retry sur un abonnement orphelin.
        log.error("webhook %s : utilisateur introuvable (uid/sub/email) sub=%s", event, sub_id)
        return jsonify({"ok": True, "unresolved": True}), 200

    fields = {
        "plan": derive_plan(status),
        "plan_status": status,
        "ls_subscription_id": sub_id or None,
        "ls_customer_id": str(attrs.get("customer_id") or "") or None,
        "plan_renews_at": attrs.get("renews_at") or attrs.get("ends_at"),
        "updated_at": "now()",
    }
    if not _sb_update_user(user_id, fields):
        # Update raté (réseau/5xx) : on renvoie 500 pour que LS retente.
        log.warning("webhook %s : update user %s échoué", event, user_id)
        return jsonify({"error": "update failed"}), 500

    return jsonify({"ok": True, "event": event, "plan": fields["plan"]}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
