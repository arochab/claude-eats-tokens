"""
Claude Eats Tokens — push server (Flask).

Rôle minimal et gratuit (Render free tier) : recevoir les chiffres d'usage
poussés par le PC d'Adam (POST /push, protégé par un secret partagé) et les
resservir à la PWA (GET /usage.json). Les données vivent dans une Gist privée
GitHub pour survivre au disque éphémère du free tier — même approche que
kapman-news.

Env (Render → Environment) :
  PUSH_SECRET      secret partagé PC ↔ serveur (obligatoire)
  GITHUB_TOKEN     token avec scope `gist` (persistance durable, optionnel)
  GIST_ID          id de la Gist privée qui stocke usage.json (optionnel)
  PORT             fourni par Render
"""
import json
import os
import time

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # la PWA (GitHub Pages) appelle ce serveur depuis une autre origine

PUSH_SECRET = os.environ.get("PUSH_SECRET", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GIST_ID = os.environ.get("GIST_ID", "")
GIST_FILE = "usage.json"

# Cache mémoire (rapide) + Gist (durable).
_cache = {"data": None, "ts": 0}


def _gist_headers():
    return {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }


def save_to_gist(payload):
    if not (GITHUB_TOKEN and GIST_ID):
        return False
    try:
        body = {"files": {GIST_FILE: {"content": json.dumps(payload)}}}
        r = requests.patch(
            f"https://api.github.com/gists/{GIST_ID}",
            headers=_gist_headers(), json=body, timeout=10,
        )
        return r.ok
    except Exception:
        return False


def load_from_gist():
    if not (GITHUB_TOKEN and GIST_ID):
        return None
    try:
        r = requests.get(
            f"https://api.github.com/gists/{GIST_ID}",
            headers=_gist_headers(), timeout=10,
        )
        if not r.ok:
            return None
        content = r.json()["files"][GIST_FILE]["content"]
        return json.loads(content)
    except Exception:
        return None


@app.get("/")
def health():
    return jsonify({"service": "claude-eats-tokens", "ok": True})


@app.post("/push")
def push():
    """Le PC envoie ici son usage.json frais."""
    secret = request.headers.get("X-Push-Secret", "")
    if not PUSH_SECRET or secret != PUSH_SECRET:
        return jsonify({"error": "unauthorized"}), 401
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "bad json"}), 400
    if not payload or "totals" not in payload:
        return jsonify({"error": "invalid payload"}), 400
    _cache["data"] = payload
    _cache["ts"] = time.time()
    save_to_gist(payload)
    return jsonify({"ok": True, "received": payload["totals"].get("total", 0)})


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
    resp = jsonify(data)
    resp.headers["Cache-Control"] = "no-store"
    return resp


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
