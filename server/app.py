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
import hmac
import json
import logging
import os
import secrets
import time
import hashlib

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

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://arochab.github.io/claude-eats-tokens")

# Lecture publique (la PWA est sur GitHub Pages, autre origine).
CORS(app, resources={
    r"/usage.json": {"origins": "*", "methods": ["GET"]},
    r"/auth/*": {"origins": "*", "methods": ["GET", "POST"]},
    r"/api/*": {"origins": "*", "methods": ["GET", "POST"]},
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


def _sb_get_user_by_api_key(api_key):
    """Cherche un utilisateur par sa clé API (hash SHA-256)."""
    if not MULTI_TENANT or not api_key:
        return None
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?api_key_hash=eq.{key_hash}&select=id,email,plan",
        headers=_sb_headers(), timeout=10)
    if r.ok and r.json():
        return r.json()[0]
    return None


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
        out["user"] = {"email": user.get("email", ""), "plan": user.get("plan", "free")}
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
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
