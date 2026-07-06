"""
usage_core.py — logique pure (testable, sans I/O) du moteur Claude Eats Tokens.

Tout ce qui est calcul vit ici : inférence du vrai projet depuis le `cwd`,
tarification par modèle, agrégation, fenêtres glissantes, projection. Aucune
lecture de fichier ni réseau — ça, c'est le rôle de `push_usage.py`.

Pourquoi séparer : ce module est couvert par `tests/test_usage_core.py`. On peut
prouver chaque formule sur des chiffres connus sans dépendre des vrais logs.

Schéma de sortie : voir SCHEMA.md. Version courante = SCHEMA_VERSION.

LICENCE : le dépôt est MIT, SAUF les heuristiques propriétaires de ce fichier
(_looks_opus_suspect, select_sessions, opus_waste_suspects, detect_anomalies),
couvertes par LICENSE-ENGINE.md (source-available : self-host OK, produit
concurrent commercial interdit sans autorisation écrite).
"""
import calendar
import re
from datetime import datetime, timezone, timedelta

SCHEMA_VERSION = 5  # v5 : sessions enrichies (byModel/cost/durée) + anomalies[] (fenêtre 5h)

# Tarif API (USD / million de tokens). Sur Max c'est un forfait : ces chiffres
# servent à estimer une *valeur théorique*, pas une facture.
# Date de validité des tarifs (à mettre à jour si Anthropic change ses prix).
PRICING_AS_OF = "2026-01"
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
    """[Déprécié — projection linéaire naïve] Conservé pour rétrocompat.
    Préférer projection_from_slope (pente récente + fourchette)."""
    if not day_of_month:
        return 0
    return round(current_month / day_of_month * days_in_month)


# --------------------------------------------------------------------------
# Statistiques HONNÊTES (schéma v3) — tout est dérivé des vraies données.
# Principe validé par le jury : zéro chiffre inventé, tout sourçable.
# --------------------------------------------------------------------------
def median(values):
    """Médiane (résiste aux pics, contrairement à la moyenne)."""
    xs = sorted(v for v in values if v is not None)
    n = len(xs)
    if n == 0:
        return 0
    mid = n // 2
    if n % 2:
        return xs[mid]
    return (xs[mid - 1] + xs[mid]) / 2


def stdev(values):
    """Écart-type (population). Sert à la fourchette de projection."""
    xs = [v for v in values if v is not None]
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return (sum((x - m) ** 2 for x in xs) / n) ** 0.5


def percentile_rank(value, history):
    """Rang percentile de `value` dans `history` : % des éléments STRICTEMENT
    inférieurs. Ex. 'plus chargé que 72% de tes journées'. 0..100.
    `history` = la timeline réelle (totaux/jour), value inclus ou non."""
    xs = [v for v in history if v is not None]
    if not xs:
        return 0
    below = sum(1 for x in xs if x < value)
    return round(below / len(xs) * 100)


def projection_from_slope(daily_totals, day_of_month, days_in_month):
    """Projection fin de mois basée sur la PENTE des 7 derniers jours (et non
    la moyenne depuis le 1er), avec une fourchette = écart-type * jours restants.

    `daily_totals` : liste des totaux/jour du MOIS EN COURS (ordre chronologique).
    Retourne {projection, marginLow, marginHigh, slope, basis} ou None si trop peu
    d'historique. Honnête : la fourchette dit l'incertitude, pas un faux plafond.
    """
    cur = sum(daily_totals)
    days_left = max(0, days_in_month - day_of_month)
    if days_left == 0:
        return {"projection": round(cur), "marginLow": round(cur),
                "marginHigh": round(cur), "slope": 0, "basis": 0}
    recent = daily_totals[-7:]
    if len(recent) < 2:
        return None  # pas assez d'historique pour une pente fiable
    slope = sum(recent) / len(recent)        # moyenne /jour des derniers jours
    sigma = stdev(recent)
    proj = cur + slope * days_left
    margin = sigma * days_left
    return {
        "projection": round(proj),
        "marginLow": round(max(cur, proj - margin)),
        "marginHigh": round(proj + margin),
        "slope": round(slope),
        "basis": len(recent),
    }


def month_ratio(current_month, previous_months):
    """Ratio du mois courant à la MÉDIANE des mois précédents complets (%).
    `previous_months` : liste des totaux des mois civils précédents (complets).
    None si < 1 mois d'historique (on n'invente pas de comparaison)."""
    prev = [m for m in previous_months if m]
    if not prev:
        return None
    med = median(prev)
    if not med:
        return None
    return round(current_month / med * 100)


def mad(values):
    """MAD normalisé (×1.4826) = écart-type ROBUSTE, insensible aux pics.
    Sur un usage très irrégulier (ratio 13×), bien plus fiable que stdev."""
    xs = [v for v in values if v is not None]
    if len(xs) < 2:
        return 0.0
    med = median(xs)
    return 1.4826 * median([abs(x - med) for x in xs])


def daily_peak_5h(hour_buckets):
    """Pour CHAQUE jour, le plus gros total sur 5h consécutives, à partir des
    VRAIS buckets horaires. Retourne {date: peak5h}. Exact (pas reconstruit)."""
    # regroupe les heures par jour : {date: {hour_int: total}}
    by_day_hours = {}
    for hk, v in hour_buckets.items():
        day, hh = hk[:10], int(hk[11:13])
        by_day_hours.setdefault(day, {})[hh] = total_of(v)
    peaks = {}
    for day, hours in by_day_hours.items():
        best = 0
        for start in range(24):
            s = sum(hours.get((start + k) % 24, 0) for k in range(5))
            if s > best:
                best = s
        if best > 0:
            peaks[day] = best
    return peaks


def baseline_5h(hour_buckets, min_days=5):
    """Charge 5h HABITUELLE (robuste) + bornes, en échelle log (la dispersion
    d'Adam est multiplicative). Retourne {base, high, medianLog, madLog, nDays}
    ou None si pas assez d'historique. `high` = médiane + 3·MAD (zone inhabituelle).
    """
    import math
    peaks = list(daily_peak_5h(hour_buckets).values())
    if len(peaks) < min_days:
        return None
    logs = [math.log1p(p) for p in peaks]
    med_l = median(logs)
    mad_l = mad(logs)
    return {
        "base": round(math.expm1(med_l)),               # charge 5h médiane
        "high": round(math.expm1(med_l + 3 * mad_l)),    # zone inhabituelle (~99e)
        "medianLog": med_l, "madLog": mad_l, "nDays": len(peaks),
    }


def robust_z_log(value, median_log, mad_log):
    """Score robuste de `value` (en log) vs une référence log. ~99e percentile à 3."""
    import math
    if not mad_log:
        return 0.0
    return (math.log1p(value) - median_log) / mad_log


def iso_week(date_str):
    iso = datetime.fromisoformat(date_str).isocalendar()
    return f"{iso[0]}-S{iso[1]:02d}"


# --------------------------------------------------------------------------
# v5 — sélection des sessions à garder (cap intelligent, testable).
# --------------------------------------------------------------------------
SESSIONS_CAP = 60          # nb max de sessions gardées par projet (était 20)
_SESS_BIGGEST = 40         # on garde d'office les 40 plus grosses (drill-down)
_SESS_SUSPECT = 20         # + jusqu'à 20 sessions "suspectes Opus" (cible Waste Radar)


def _looks_opus_suspect(s):
    """True si la session sent le « Opus lancé sur une petite tâche » : de l'Opus
    présent (dans models/byModel) ET peu de sortie. Sert uniquement à décider
    QUELLES sessions on garde quand on cappe (pas un jugement — cf. garde-fou)."""
    models = s.get("models") or []
    by_model = s.get("costByModel") or []
    has_opus = ("opus" in models
                or any((m.get("model") == "opus") for m in by_model))
    if not has_opus:
        return False
    out = s.get("outputTokens")
    # peu d'output = signal de tâche courte. Si outputTokens manque (session
    # d'un ancien build sans enrichissement), on ne peut pas juger -> pas suspect.
    return out is not None and out < 20_000


def select_sessions(sessions, cap=SESSIONS_CAP):
    """Choisit les sessions à conserver quand on dépasse `cap`.

    Choix DOCUMENTÉ : trier uniquement par tokens décroissants ferait disparaître
    les petites tâches Opus — précisément la CIBLE du Waste Radar. On garde donc :
      - les `_SESS_BIGGEST` plus grosses (utile au drill-down par volume) ;
      - puis, dans le reste, jusqu'à `_SESS_SUSPECT` sessions « suspectes Opus »
        (Opus + peu d'output), triées par output croissant (les plus petites
        d'abord) ;
      - on complète avec les plus grosses restantes jusqu'à `cap`.
    Déduplication par sessionId. Ordre de sortie : tokens décroissants.
    """
    if len(sessions) <= cap:
        return sorted(sessions, key=lambda x: -x.get("tokens", 0))
    by_tokens = sorted(sessions, key=lambda x: -x.get("tokens", 0))
    kept, kept_ids = [], set()
    for s in by_tokens[:_SESS_BIGGEST]:
        kept.append(s)
        kept_ids.add(s.get("sessionId"))
    rest = [s for s in by_tokens if s.get("sessionId") not in kept_ids]
    suspects = sorted(
        (s for s in rest if _looks_opus_suspect(s)),
        key=lambda x: (x.get("outputTokens") or 0),  # les plus petites d'abord
    )
    for s in suspects[:_SESS_SUSPECT]:
        if len(kept) >= cap:
            break
        kept.append(s)
        kept_ids.add(s.get("sessionId"))
    # complète avec les plus grosses restantes si on n'a pas atteint le cap
    for s in rest:
        if len(kept) >= cap:
            break
        if s.get("sessionId") in kept_ids:
            continue
        kept.append(s)
        kept_ids.add(s.get("sessionId"))
    return sorted(kept, key=lambda x: -x.get("tokens", 0))


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
        # v5 : cap intelligent (60) préservant les petites tâches Opus (Waste Radar),
        # au lieu d'un simple tri-tokens + cap 20 qui les faisait disparaître.
        m["sessions"] = select_sessions(m["sessions"], SESSIONS_CAP)
        m["timeline"] = [{"date": d, "total": m["_days"][d]} for d in sorted(m["_days"])]
        del m["_days"]
        out.append(m)
    return out


# --- v4 : fenêtres officielles (vrai % serveur) ---
# Le capteur statusline écrit un fichier relais {w5hPct, w7dPct, ..., capturedAt}.
# On ne fait CONFIANCE au % officiel que s'il est assez récent ; sinon le front
# retombe sur l'estimation (avec un badge). Pur et testable.

OFFICIAL_FRESH_SECONDS = 6 * 3600  # 6 h : au-delà, on considère le % périmé


def official_freshness(win, now_epoch):
    """Renvoie l'âge en secondes du % officiel, ou None si pas de capture.

    win = dict du fichier relais (ou None). now_epoch = temps courant (epoch s).
    """
    if not win or "capturedAt" not in win:
        return None
    try:
        age = int(now_epoch) - int(win["capturedAt"])
    except (TypeError, ValueError):
        return None
    return max(0, age)


def official_is_fresh(win, now_epoch, max_age=OFFICIAL_FRESH_SECONDS):
    """True si le % officiel capté est assez récent pour être affiché comme tel."""
    age = official_freshness(win, now_epoch)
    return age is not None and age <= max_age


# --------------------------------------------------------------------------
# v5 — PARTIE 1 : Waste Radar (candidats « Opus sur petite tâche »).
# Pur, testable. GARDE-FOU : on ne dit JAMAIS « Sonnet aurait suffi ». On liste
# des CANDIDATS et l'économie THÉORIQUE si les mêmes tokens Opus étaient facturés
# au tarif Sonnet — le front décide du mot exact. Aucun jugement fabriqué ici.
# --------------------------------------------------------------------------
_WASTE_MAX_OUTPUT = 20_000    # « peu de sortie » = tâche probablement courte
_WASTE_MAX_MESSAGES = 40      # « peu d'échanges » = tâche probablement simple


def _sonnet_cost_of_opus_acc(acc):
    """Coût des mêmes tokens s'ils étaient facturés au tarif Sonnet (théorique)."""
    return cost_of(acc, "sonnet")


def opus_waste_suspects(sessions, min_saving_usd=0.5):
    """[PROPRIÉTAIRE — feature « Waste Radar », voir LICENSE-ENGINE.md]
    Repère les sessions où de l'Opus a été utilisé avec des signaux de FAIBLE
    complexité (peu d'output, peu de messages), et chiffre l'économie THÉORIQUE
    Opus→Sonnet (mêmes tokens Opus recalculés au tarif Sonnet).

    `sessions` : liste des sessions enrichies (champ `costByModel` avec, par
    famille, l'accumulateur {input/output/cacheCreate/cacheRead}, `outputTokens`,
    `messageCount`). Retourne, triée par `saving` décroissant :
        [{sessionId, title, opusCost, sonnetCost, saving, outputTokens,
          messageCount, reason}]
    `reason` est FACTUEL (ex. 'opus, 3k output, 5 messages') — pas un jugement.
    Ne retient que les candidats dont l'économie théorique >= `min_saving_usd`.
    """
    out = []
    for s in sessions or []:
        # retrouve l'accumulateur Opus de la session (posé par le build enrichi)
        opus_acc = None
        for row in (s.get("costByModel") or []):
            if row.get("model") == "opus" and row.get("acc"):
                opus_acc = row["acc"]
                break
        if not opus_acc:
            continue
        output_tokens = s.get("outputTokens")
        if output_tokens is None:
            output_tokens = opus_acc.get("output", 0)
        message_count = s.get("messageCount") or 0
        # signaux de faible complexité (les DEUX doivent tenir : petite sortie
        # ET peu d'échanges), sinon ce n'est pas un candidat « petite tâche ».
        low_output = output_tokens < _WASTE_MAX_OUTPUT
        low_messages = message_count and message_count < _WASTE_MAX_MESSAGES
        if not (low_output and low_messages):
            continue
        opus_cost = cost_of(opus_acc, "opus")
        sonnet_cost = _sonnet_cost_of_opus_acc(opus_acc)
        saving = opus_cost - sonnet_cost
        if saving < min_saving_usd:
            continue
        out.append({
            "sessionId": s.get("sessionId"),
            "title": s.get("title"),
            "opusCost": round(opus_cost, 4),
            "sonnetCost": round(sonnet_cost, 4),
            "saving": round(saving, 4),
            "outputTokens": output_tokens,
            "messageCount": message_count,
            # FACTUEL : décrit ce qu'on a mesuré, ne conclut pas.
            "reason": "opus, %s output, %s messages" % (output_tokens, message_count),
        })
    out.sort(key=lambda x: -x["saving"])
    return out


# --------------------------------------------------------------------------
# v5 — PARTIE 2 : Boîte noire (anomalies fenêtre 5h, split sous-agents/cache).
# Pur, testable. GARDE-FOU : uniquement des FAITS mesurés (part sous-agents réelle,
# cache-miss réels). Aucune interprétation ici — le front décide quoi en dire.
# --------------------------------------------------------------------------
_ANOMALY_Z = 3.0              # seuil robuste (~99e percentile en échelle log)


def _peak5h_window_of_day(day_hours):
    """Pour un jour {hour_int: total}, renvoie (best5h, start_hour) de la fenêtre
    5h glissante la plus chargée. day_hours indexé par heure entière 0..23."""
    best, best_start = 0, None
    for start in range(24):
        s = sum(day_hours.get((start + k) % 24, 0) for k in range(5))
        if s > best:
            best, best_start = s, start
    return best, best_start


def detect_anomalies(hour_buckets, hour_meta, baseline, now):
    """[PROPRIÉTAIRE — feature « Boîte noire », voir LICENSE-ENGINE.md]
    Repère les JOURS de la fenêtre 7j glissante où le pic 5h dépasse
    anormalement la baseline habituelle (z robuste >= _ANOMALY_Z).

    - `hour_buckets` : {'YYYY-MM-DDTHH': accumulateur} (standard, uc.empty()).
    - `hour_meta`    : {'YYYY-MM-DDTHH': {sidechain, ephemeral5m, ephemeral1h,
                        byProject:{name:tokens}}} — structure PARALLÈLE (v5).
    - `baseline`     : sortie de baseline_5h (ou None). On réutilise medianLog/madLog.
    - `now`          : datetime aware UTC.

    Retourne, par épisode anormal (trié par z décroissant) :
        {window, z, total, sidechainShare, cacheMiss5m, cacheMiss1h, topProject}
    - `window` : 'YYYY-MM-DDTHH' de DÉBUT de la fenêtre 5h la plus chargée du jour.
    - `sidechainShare` : part (0..1) de tokens issus de sous-agents sur la fenêtre.
    - `cacheMiss5m/1h` : tokens ephemeral 5m/1h mesurés sur la fenêtre (0 si absents).
    - `topProject` : projet le plus consommateur sur la fenêtre (ou None).
    []  si `baseline` None ou rien d'anormal. Ne fabrique AUCUNE interprétation.
    """
    if not baseline:
        return []
    med_log = baseline.get("medianLog")
    mad_log = baseline.get("madLog")
    if not mad_log:  # dispersion nulle -> tout z = 0, rien d'« anormal »
        return []

    cutoff = now - timedelta(days=7)
    # regroupe les heures par jour dans la fenêtre 7j
    by_day = {}   # day -> {hour_int: total}
    for hk, v in hour_buckets.items():
        try:
            dt = datetime.fromisoformat(hk + ":00:00+00:00")
        except Exception:
            continue
        if dt < cutoff or dt > now + timedelta(hours=1):
            continue
        by_day.setdefault(hk[:10], {})[int(hk[11:13])] = total_of(v)

    episodes = []
    for day, day_hours in by_day.items():
        best5h, start = _peak5h_window_of_day(day_hours)
        if best5h <= 0 or start is None:
            continue
        z = robust_z_log(best5h, med_log, mad_log)
        if z < _ANOMALY_Z:
            continue
        # heures composant la fenêtre 5h la plus chargée du jour
        window_hours = [(start + k) % 24 for k in range(5)]
        window_keys = ["%sT%02d" % (day, h) for h in window_hours]
        # agrège les FAITS mesurés sur ces heures (structure parallèle)
        sidechain = 0
        eph5m = 0
        eph1h = 0
        by_project = {}
        for wk in window_keys:
            meta = hour_meta.get(wk)
            if not meta:
                continue
            sidechain += meta.get("sidechain", 0) or 0
            eph5m += meta.get("ephemeral5m", 0) or 0
            eph1h += meta.get("ephemeral1h", 0) or 0
            for name, tok in (meta.get("byProject") or {}).items():
                by_project[name] = by_project.get(name, 0) + (tok or 0)
        top_project = None
        if by_project:
            top_project = max(by_project.items(), key=lambda kv: kv[1])[0]
        share = (sidechain / best5h) if best5h else 0.0
        episodes.append({
            "window": "%sT%02d" % (day, start),
            "z": round(z, 2),
            "total": best5h,
            "sidechainShare": round(max(0.0, min(1.0, share)), 4),
            "cacheMiss5m": eph5m,
            "cacheMiss1h": eph1h,
            "topProject": top_project,
        })
    episodes.sort(key=lambda e: -e["z"])
    return episodes
