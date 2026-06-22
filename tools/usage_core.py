"""
usage_core.py — logique pure (testable, sans I/O) du moteur Claude Eats Tokens.

Tout ce qui est calcul vit ici : inférence du vrai projet depuis le `cwd`,
tarification par modèle, agrégation, fenêtres glissantes, projection. Aucune
lecture de fichier ni réseau — ça, c'est le rôle de `push_usage.py`.

Pourquoi séparer : ce module est couvert par `tests/test_usage_core.py`. On peut
prouver chaque formule sur des chiffres connus sans dépendre des vrais logs.

Schéma de sortie : voir SCHEMA.md. Version courante = SCHEMA_VERSION.
"""
import calendar
import re
from datetime import datetime, timezone, timedelta

SCHEMA_VERSION = 2

# Tarif API (USD / million de tokens). Sur Max c'est un forfait : ces chiffres
# servent à estimer une *valeur théorique*, pas une facture.
PRICING = {
    "opus":    {"in": 15.0, "cw": 18.75, "cr": 1.5,  "out": 75.0},
    "sonnet":  {"in": 3.0,  "cw": 3.75,  "cr": 0.3,  "out": 15.0},
    "haiku":   {"in": 0.8,  "cw": 1.0,   "cr": 0.08, "out": 4.0},
    "fable":   {"in": 3.0,  "cw": 3.75,  "cr": 0.3,  "out": 15.0},
    "default": {"in": 3.0,  "cw": 3.75,  "cr": 0.3,  "out": 15.0},
}

# Segments de chemin universels à ignorer pour nommer un projet (pas spécifique
# à une machine — corrige le finding A1-7). Sert à remonter au dossier PARLANT
# quand la feuille du chemin est un dossier technique.
_GENERIC_SEGMENTS = {
    "c:", "d:", "e:", "f:", "g:", "h:", "users", "user", "desktop", "documents",
    "document", "appdata", "local", "locallow", "roaming", "temp", "tmp", "home",
    "opt", "var", "mnt", "media", "srv", "projects", "repos", "code", "dev",
    "google drive", "mon drive", "onedrive", "dropbox", "adam chabbi pro",
    # sous-dossiers de build/source courants : le projet est le parent
    "src", "app", "apps", "dist", "build", "lib", "packages", "pkg", "cmd",
    "frontend", "backend", "client", "server", "web", "www", "public",
}

# Le slug du dossier Claude pour une session sans projet réel (cwd = 'C:\\').
_NULL_DIR_SLUGS = {"c--", "c", ""}

# Marqueurs de worktree : le projet est le segment JUSTE AVANT.
_WORKTREE_MARKERS = (".claude", ".codex", ".git")


def family(model):
    """Clé de regroupement : toutes les versions d'Opus -> 'opus', etc.
    Retourne None pour les entrées techniques (<synthetic>) à ignorer."""
    s = (model or "").lower()
    if "opus" in s:
        return "opus"
    if "sonnet" in s:
        return "sonnet"
    if "haiku" in s:
        return "haiku"
    if "fable" in s:
        return "fable"
    if "synthetic" in s:
        return None
    return "autre"


def pretty_model(fam):
    return {
        "opus": "Claude Opus", "sonnet": "Claude Sonnet", "haiku": "Claude Haiku",
        "fable": "Claude Fable", "autre": "Autre",
    }.get(fam, fam or "Inconnu")


def price_for(model_or_family):
    m = (model_or_family or "").lower()
    if "opus" in m:
        return PRICING["opus"]
    if "sonnet" in m:
        return PRICING["sonnet"]
    if "haiku" in m:
        return PRICING["haiku"]
    if "fable" in m:
        return PRICING["fable"]
    return PRICING["default"]


def empty():
    return {"input": 0, "output": 0, "cacheCreate": 0, "cacheRead": 0}


def add_usage(acc, usage):
    """Ajoute un objet message.usage (schéma réel des logs) à un accumulateur."""
    acc["input"] += usage.get("input_tokens", 0) or 0
    acc["output"] += usage.get("output_tokens", 0) or 0
    acc["cacheCreate"] += usage.get("cache_creation_input_tokens", 0) or 0
    acc["cacheRead"] += usage.get("cache_read_input_tokens", 0) or 0


def total_of(t):
    return t["input"] + t["output"] + t["cacheCreate"] + t["cacheRead"]


def cost_of(t, model_or_family):
    """Coût USD d'un accumulateur, au tarif du modèle donné."""
    p = price_for(model_or_family)
    return (t["input"] * p["in"] + t["cacheCreate"] * p["cw"]
            + t["cacheRead"] * p["cr"] + t["output"] * p["out"]) / 1_000_000


# --------------------------------------------------------------------------
# Inférence du VRAI projet — cœur de l'AXE 1.
# --------------------------------------------------------------------------
def project_from_cwd(cwd):
    """Déduit le chemin-clé du projet depuis le cwd réel d'un enregistrement.

    Règle (déterministe, validée sur 100% des vrais logs d'Adam) :
      1. Si le chemin contient un marqueur de worktree (.claude/.codex/.git suivi
         de 'worktrees'), le projet = segment JUSTE AVANT ce marqueur.
         Ex.  C:\\...\\AGENTIC-FIGMA-MCP\\.claude\\worktrees\\nifty-lumiere-37ca98
              -> 'AGENTIC-FIGMA-MCP'
      2. Sinon, dernier segment significatif du chemin.
         Ex.  C:\\Users\\adam\\Desktop\\Pro\\kapman-news -> 'kapman-news'
      3. Si rien d'exploitable (ex. 'C:\\') -> None (l'appelant repliera sur le
         titre/la session).

    Retourne le chemin canonique du projet (string) ou None. Le chemin sert de
    CLÉ de regroupement (évite les collisions de noms — finding A1-2) ; le nom
    affiché se dérive avec display_name().
    """
    if not cwd or not str(cwd).strip():
        return None
    norm = str(cwd).replace("\\", "/").rstrip("/")
    parts = [p for p in norm.split("/") if p]
    if not parts:
        return None
    low = [p.lower() for p in parts]

    # 1) marqueur de worktree -> segment juste avant
    for i, seg in enumerate(low):
        if seg in _WORKTREE_MARKERS and i >= 1:
            # confirme que c'est bien un layout worktree (…/<marker>/worktrees/<slug>)
            if i + 1 < len(low) and low[i + 1] == "worktrees":
                return "/".join(parts[:i])  # chemin complet jusqu'au projet
            # …/<marker> sans 'worktrees' : le projet reste le segment avant
            return "/".join(parts[:i])

    # 2) chemin canonique : on rogne les feuilles techniques/génériques pour
    #    que la CLÉ pointe sur le dossier projet réel (ainsi '…/mixhub/APP/src'
    #    et '…/mixhub' fusionnent). Drive seul / home -> None.
    trimmed = list(parts)
    while trimmed:
        last = trimmed[-1]
        low = last.lower()
        if (re.fullmatch(r"[A-Za-z]:", last)
                or low in _GENERIC_SEGMENTS
                or _looks_like_username(last)):
            trimmed.pop()
            continue
        break
    if not trimmed:
        return None
    return "/".join(trimmed)


def display_name(project_path):
    """Nom lisible à partir du chemin-clé renvoyé par project_from_cwd.

    Remonte au dernier segment PARLANT : si la feuille est un dossier technique
    (src, app, dist…) ou générique (username, drive), on prend le parent
    significatif. Ex. '…/mixhub/APP/src' -> 'mixhub' ; 'C:/Users/adamc_ixt0882'
    -> 'Sans projet' ; 'C--' -> 'Sans projet'."""
    if not project_path:
        return "Sans projet"
    raw = str(project_path).replace("\\", "/")
    if raw.lower().strip("/-") in _NULL_DIR_SLUGS:
        return "Sans projet"
    parts = [p for p in raw.split("/") if p]
    # remonte tant que la feuille est générique / un drive / une version
    while parts:
        last = parts[-1]
        low = last.lower()
        if (re.fullmatch(r"[A-Za-z]:", last)
                or low in _GENERIC_SEGMENTS
                or _looks_like_username(last)):
            parts.pop()
            continue
        return last
    return "Sans projet"


def _looks_like_username(seg):
    """Heuristique portable : segment qui ressemble au home de l'utilisateur
    (ex. 'adamc_ixt0882', 'ADAMC~1'). Évite de coder un username en dur (A1-7)."""
    s = seg or ""
    if "~" in s and any(c.isdigit() for c in s):
        return True
    # mot unique avec chiffres en suffixe et underscore : profil Windows typique
    if re.fullmatch(r"[a-zA-Z]+[_-]?[a-zA-Z0-9]*\d{3,}", s):
        return True
    return False


def label_from_text(text, max_len=60):
    """Libellé court et factuel depuis le 1er message / customTitle (repli A1-4).
    N'invente rien : tronque proprement la 1re ligne utile."""
    if not text:
        return None
    s = " ".join(str(text).split())  # normalise les espaces/sauts de ligne
    if not s:
        return None
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return s


# --------------------------------------------------------------------------
# Fenêtres glissantes & projections (fonctions pures, testables).
# --------------------------------------------------------------------------
def window_total(hour_buckets, hours, now):
    """Somme des buckets horaires dans les `hours` dernières heures.

    `hour_buckets` : dict {'YYYY-MM-DDTHH': accumulateur}. `now` : datetime aware
    UTC. On compare l'heure-plancher du bucket à now (les logs sont en UTC).
    """
    t = empty()
    cutoff = now - timedelta(hours=hours)
    for hk, v in hour_buckets.items():
        hms = datetime.fromisoformat(hk + ":00:00+00:00")
        if hms >= cutoff and hms <= now + timedelta(hours=1):
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                t[k] += v[k]
    t["total"] = total_of(t)
    return t


def w5h_reset_at(hour_buckets, now):
    """Heure de reset de la fenêtre 5h = (plus vieux bucket dans la fenêtre) + 5h."""
    in_win = sorted(
        hk for hk in hour_buckets
        if (now - datetime.fromisoformat(hk + ":00:00+00:00")) <= timedelta(hours=5)
        and (now - datetime.fromisoformat(hk + ":00:00+00:00")) >= timedelta(0)
    )
    if not in_win:
        return None
    return (datetime.fromisoformat(in_win[0] + ":00:00+00:00")
            + timedelta(hours=5)).isoformat()


def month_projection(current_month, day_of_month, days_in_month):
    """Projection linéaire fin de mois. `days_in_month` vient de
    calendar.monthrange (gère les bissextiles)."""
    if not day_of_month:
        return 0
    return round(current_month / day_of_month * days_in_month)


def iso_week(date_str):
    iso = datetime.fromisoformat(date_str).isocalendar()
    return f"{iso[0]}-S{iso[1]:02d}"


def merge_projects_by_name(projects):
    """Fusionne au niveau AFFICHAGE les projets qui partagent le même nom
    (ex. AGENTIC-FIGMA-MCP sous deux racines, ou plusieurs 'Sans projet').

    Les clés de chemin restent distinctes en interne (pas de collision de
    données — A1-2), mais l'utilisateur voit UNE entrée par projet perçu. On
    additionne tokens/coût/sessions et on garde la liste des chemins source.
    `projects` : liste de dicts produits par build(). Retourne une nouvelle liste.
    """
    merged = {}
    order = []
    for p in projects:
        key = p.get("name") or p.get("project") or "Sans projet"
        if key not in merged:
            merged[key] = {
                "project": key, "name": key, "path": p.get("path"),
                "paths": [], "input": 0, "output": 0, "cacheCreate": 0,
                "cacheRead": 0, "total": 0, "cost": 0.0, "sessionCount": 0,
                "sessions": [], "models": {}, "lastActivity": None, "_days": {},
            }
            order.append(key)
        m = merged[key]
        for k in ("input", "output", "cacheCreate", "cacheRead", "total"):
            m[k] += p.get(k, 0)
        m["cost"] = round(m["cost"] + p.get("cost", 0.0), 2)
        m["sessionCount"] += p.get("sessionCount", 0)
        m["sessions"].extend(p.get("sessions", []))
        for row in p.get("timeline", []):
            m["_days"][row["date"]] = m["_days"].get(row["date"], 0) + row.get("total", 0)
        if p.get("path"):
            m["paths"].append(p["path"])
        # fusion des breakdown modèles
        for mb in p.get("models", []):
            agg = m["models"].setdefault(mb["model"], {"model": mb["model"],
                  "label": mb["label"], "total": 0, "cost": 0.0})
            agg["total"] += mb.get("total", 0)
            agg["cost"] = round(agg["cost"] + mb.get("cost", 0.0), 2)
        la = p.get("lastActivity")
        if la and (not m["lastActivity"] or la > m["lastActivity"]):
            m["lastActivity"] = la
    out = []
    for key in order:
        m = merged[key]
        m["models"] = sorted(m["models"].values(), key=lambda x: -x["total"])
        m["sessions"].sort(key=lambda x: -x.get("tokens", 0))
        m["sessions"] = m["sessions"][:20]
        m["timeline"] = [{"date": d, "total": m["_days"][d]} for d in sorted(m["_days"])]
        del m["_days"]
        out.append(m)
    return out
