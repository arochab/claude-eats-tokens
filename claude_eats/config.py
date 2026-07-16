"""
config.py — dossier de config utilisateur + résolution des identifiants.

Une fois le moteur INSTALLÉ (uv tool install / pip install), on ne peut plus
écrire dans `../../data` (le repo n'existe pas à côté de l'exécutable). On
rapatrie donc l'état runtime dans un dossier de config utilisateur, cross-platform :

    ~/.config/claude-eats/        (POSIX et Windows — convention simple, unique)
        usage.json                (dernier payload construit, repli local)
        config.json               (facultatif : { "api_key": "cet_...",
                                                   "push_url": "https://..." })

Choix DOCUMENTÉ : on privilégie `~/.config/claude-eats/` sur TOUS les OS (y
compris Windows) pour une seule convention à retenir et documenter. Un override
explicite reste possible via la variable d'environnement CLAUDE_EATS_HOME.

Résolution des identifiants (ordre de priorité) :
  - clé de connexion  : env CET_API_KEY  -> config.json["api_key"]
  - secret self-host  : env PUSH_SECRET   -> config.json["secret"]
  - URL du serveur    : env PUSH_URL      -> config.json["push_url"] -> défaut Render
  - base directe      : env CET_SUPABASE_URL/_KEY -> config.json -> défaut hébergé
"""
import json
import os
from pathlib import Path

# Serveur hébergé par défaut (déjà la valeur historique). Le futur pairing pourra
# l'écraser via config.json ; l'env PUSH_URL reste prioritaire pour le self-host.
DEFAULT_PUSH_URL = "https://claude-eats-tokens.onrender.com"

# --- Voie DIRECTE (par défaut depuis le 16/07/2026) -------------------------
# Le moteur écrit dans Supabase sans passer par aucun serveur. Voir la migration
# 0005 : la fonction cet_push_usage() valide la clé `cet_` dans la base.
#
# Pourquoi la clé ci-dessous peut vivre dans un dépôt public : c'est la clé
# PUBLISHABLE (rôle `anon`). Elle n'ouvre rien par elle-même — toutes les tables
# sont en RLS sans policy, et les deux seules fonctions exposées exigent une clé
# `cet_` valide. C'est exactement le rôle que jouait l'URL Render publique.
DEFAULT_SUPABASE_URL = "https://yayimgpoopjwmmpzlrpm.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_ajTgSKAQytS_6bSf-2V8Kw_4L-oG8ju"

# Nom du dossier de config (sous ~/.config par défaut, cross-platform).
_APP_DIRNAME = "claude-eats"


def config_dir() -> Path:
    """Retourne (en le créant si absent) le dossier de config utilisateur.

    Override possible via l'env CLAUDE_EATS_HOME (utile pour les tests / installs
    portables). Sinon ~/.config/claude-eats/ sur tous les OS.
    """
    override = os.environ.get("CLAUDE_EATS_HOME", "").strip()
    base = Path(override) if override else (Path.home() / ".config" / _APP_DIRNAME)
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return base


def usage_path() -> Path:
    """Chemin du dernier payload construit (repli local, écrit à chaque cycle)."""
    return config_dir() / "usage.json"


def config_file() -> Path:
    """Chemin du fichier config.json (identifiants persistés, ex. futur pairing)."""
    return config_dir() / "config.json"


def _load_config() -> dict:
    """Lit config.json (best-effort). Retourne {} si absent/illisible."""
    fp = config_file()
    try:
        if fp.exists():
            data = json.loads(fp.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def save_config(updates: dict) -> Path:
    """Fusionne `updates` dans config.json et l'écrit. Retourne son chemin.

    Sert au futur pairing (un autre agent l'appellera pour stocker la clé)."""
    data = _load_config()
    data.update({k: v for k, v in (updates or {}).items() if v is not None})
    fp = config_file()
    fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return fp


def api_key() -> str:
    """Clé de connexion (CET_API_KEY) : env d'abord, puis config.json["api_key"]."""
    v = os.environ.get("CET_API_KEY", "").strip()
    if v:
        return v
    return str(_load_config().get("api_key", "") or "").strip()


def push_secret() -> str:
    """Secret self-host (PUSH_SECRET) : env d'abord, puis config.json["secret"]."""
    v = os.environ.get("PUSH_SECRET", "").strip()
    if v:
        return v
    return str(_load_config().get("secret", "") or "").strip()


def push_url() -> str:
    """URL du serveur : env PUSH_URL, puis config.json["push_url"], puis défaut."""
    v = os.environ.get("PUSH_URL", "").strip()
    if v:
        return v
    v = str(_load_config().get("push_url", "") or "").strip()
    return v or DEFAULT_PUSH_URL


def supabase_url() -> str:
    """URL Supabase : env CET_SUPABASE_URL, puis config.json, puis défaut hébergé."""
    v = os.environ.get("CET_SUPABASE_URL", "").strip()
    if v:
        return v
    v = str(_load_config().get("supabase_url", "") or "").strip()
    return v or DEFAULT_SUPABASE_URL


def supabase_key() -> str:
    """Clé publishable : env CET_SUPABASE_KEY, puis config.json, puis défaut."""
    v = os.environ.get("CET_SUPABASE_KEY", "").strip()
    if v:
        return v
    v = str(_load_config().get("supabase_key", "") or "").strip()
    return v or DEFAULT_SUPABASE_KEY


def use_direct() -> bool:
    """True si le moteur doit écrire DIRECTEMENT dans Supabase (sans serveur).

    Condition : une clé `cet_` ET une base joignable. C'est la voie normale
    depuis le 16/07/2026. Un self-hoster qui ne pose que PUSH_URL+PUSH_SECRET
    (sans clé `cet_`) garde la voie serveur historique, intacte.

    Échappatoire explicite : CET_FORCE_SERVER=1 force l'ancienne voie (utile
    pour déboguer le serveur lui-même).
    """
    if os.environ.get("CET_FORCE_SERVER", "").strip() in ("1", "true", "yes"):
        return False
    return bool(api_key() and supabase_url() and supabase_key())
