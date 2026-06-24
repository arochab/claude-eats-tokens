"""
Claude Eats Tokens — push server (Flask).

Rôle minimal et gratuit (Render free tier) : recevoir les chiffres d'usage
poussés par le poste local (POST /push, protégé par un secret partagé) et les
resservir à la PWA (GET /usage.json). Les données vivent dans une Gist privée
GitHub pour survivre au disque éphémère du free tier.

Durcissements de sécurité/fiabilité (voir AUDIT.md) :
- comparaison de secret en temps constant (hmac.compare_digest) ;
- validation typée du payload /push ;
- retry + backoff sur les écritures/lectures Gist, avec logs ;
- CORS restreint (lecture publique GET, /push non exposé au navigateur) ;
- /usage.json expose l'âge des données (fraîcheur côté front).

Env (Render → Environment) :
  PUSH_SECRET      secret partagé PC ↔ serveur (obligatoire)
  GITHUB_TOKEN     token avec scope `gist` (persistance durable, optionnel)
  GIST_ID          id de la Gist privée qui stocke usage.json (optionnel)
  ALLOWED_ORIGINS  origines autorisées en lecture (def. github.io + onrender)
  PORT             fourni par Render
"""
import hmac
import json
import logging
import os
import time

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cet")

app = Flask(__name__)

PUSH_SECRET = os.environ.get("PUSH_SECRET", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GIST_ID = os.environ.get("GIST_ID", "")
GIST_FILE = "usage.json"

# Lecture publique (la PWA est sur GitHub Pages, autre origine). /usage.json ne
# contient que des compteurs de tokens : aucun secret, aucun risque. On autorise
# donc TOUTES les origines en GET (un wildcard *.github.io flask-cors ne matche
# pas fiablement le sous-domaine et bloquait le téléphone). /push reste protégé
# par le secret (hmac) et n'est pas appelé depuis un navigateur.
CORS(app, resources={r"/usage.json": {"origins": "*", "methods": ["GET"]}})

# Cache mémoire (rapide) + Gist (durable).
_cache = {"data": None, "ts": 0, "lastGistOk": None}


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


@app.get("/")
def health():
    return jsonify({"service": "claude-eats-tokens", "ok": True,
                    "hasData": _cache["data"] is not None,
                    "lastGistOk": _cache["lastGistOk"]})


@app.post("/push")
def push():
    """Le PC envoie ici son usage.json frais."""
    secret = request.headers.get("X-Push-Secret", "")
    # comparaison en temps constant (corrige SEC-001)
    if not PUSH_SECRET or not hmac.compare_digest(secret, PUSH_SECRET):
        log.info("push refusé : secret invalide")
        return jsonify({"error": "unauthorized"}), 401
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "bad json"}), 400
    if not _valid_payload(payload):
        return jsonify({"error": "invalid payload"}), 400
    _cache["data"] = payload
    _cache["ts"] = time.time()
    gist_ok = save_to_gist(payload)
    # 207 si reçu mais non persisté durablement (le PC peut logguer l'alerte)
    status = 200 if gist_ok or not (GITHUB_TOKEN and GIST_ID) else 207
    return jsonify({"ok": True, "persisted": gist_ok,
                    "received": payload["totals"].get("total", 0)}), status


@app.get("/usage.json")
def usage():
    """La PWA lit ici les derniers chiffres."""
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
