"""
push_usage.py — tourne sur le PC d'Adam.

Lit les logs locaux de Claude Code (~/.claude/projects/**.jsonl), agrège la
consommation de tokens (par jour / modèle / projet + fenêtres glissantes), puis
POST le résultat vers le serveur Render (/push). En boucle toutes les N secondes.

La PWA hébergée (GitHub Pages) lit ensuite ces chiffres depuis Render — donc
l'app est consultable depuis le téléphone même quand le PC dort (derniers
chiffres connus).

Usage :
  set PUSH_URL=https://claude-eats-tokens.onrender.com
  set PUSH_SECRET=monsecret
  python tools/push_usage.py            # boucle
  python tools/push_usage.py --once     # un seul envoi

Aucune dépendance hors `requests`.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

CANDIDATE_DIRS = [
    Path.home() / ".claude" / "projects",
    Path.home() / ".config" / "claude" / "projects",
]

PRICING = {  # USD / million tokens
    "opus":    {"in": 15.0, "cw": 18.75, "cr": 1.5,  "out": 75.0},
    "sonnet":  {"in": 3.0,  "cw": 3.75,  "cr": 0.3,  "out": 15.0},
    "haiku":   {"in": 0.8,  "cw": 1.0,   "cr": 0.08, "out": 4.0},
    "default": {"in": 3.0,  "cw": 3.75,  "cr": 0.3,  "out": 15.0},
}


def price_for(model):
    m = (model or "").lower()
    if "opus" in m: return PRICING["opus"]
    if "sonnet" in m: return PRICING["sonnet"]
    if "haiku" in m: return PRICING["haiku"]
    return PRICING["default"]


def empty():
    return {"input": 0, "output": 0, "cacheCreate": 0, "cacheRead": 0}


def add(t, u):
    t["input"] += u.get("input_tokens", 0) or 0
    t["output"] += u.get("output_tokens", 0) or 0
    t["cacheCreate"] += u.get("cache_creation_input_tokens", 0) or 0
    t["cacheRead"] += u.get("cache_read_input_tokens", 0) or 0


def cost_of(t, model):
    p = price_for(model)
    return (t["input"]*p["in"] + t["cacheCreate"]*p["cw"]
            + t["cacheRead"]*p["cr"] + t["output"]*p["out"]) / 1_000_000


def model_family(m):
    """Cle de regroupement : toutes les versions d'Opus -> 'opus', etc."""
    s = (m or "").lower()
    if "opus" in s: return "opus"
    if "sonnet" in s: return "sonnet"
    if "haiku" in s: return "haiku"
    if "fable" in s: return "fable"
    if "synthetic" in s: return None  # ignore les entrees techniques
    return "autre"

def pretty_model(family):
    return {"opus":"Claude Opus","sonnet":"Claude Sonnet","haiku":"Claude Haiku",
            "fable":"Claude Fable","autre":"Autre"}.get(family, family or "Inconnu")


import re as _re
def _is_hash(seg):
    # un fragment d'id de session : hexa pur (ex 37ca98, 0925cb) ou tres court alphanum
    return bool(_re.fullmatch(r"[0-9a-f]{4,12}", seg or "", _re.IGNORECASE))

def pretty_project(p):
    # Les noms de dossiers Claude Code = chemin slugifie (C--Users-adam-...-mon-projet)
    # ou parfois un id de session. On cherche le dernier segment PARLANT (pas un hash).
    raw = (p or "").replace("\\", "-").replace("/", "-")
    skip = {"C", "Users", "Desktop", "Documents", "adamc", "adamc_ixt0882", "adam", "AppData", "Roaming"}
    parts = [x for x in raw.split("-") if x and x not in skip]
    # garde les segments non-hash
    real = [x for x in parts if not _is_hash(x)]
    if real:
        name = real[-1]
        if len(name) <= 3 and len(real) >= 2:
            name = real[-2] + "-" + name
    elif parts:
        name = parts[-1]  # tout est hash -> on garde le dernier
    else:
        name = p or "projet"
    return name.replace("_", " ").strip() or "projet"


def iso_week(d):
    dt = datetime.fromisoformat(d)
    iso = dt.isocalendar()
    return f"{iso[0]}-S{iso[1]:02d}"


def build():
    source_dir = None
    files = []
    for d in CANDIDATE_DIRS:
        if d.exists():
            f = list(d.rglob("*.jsonl"))
            if f:
                source_dir, files = str(d), f
                break

    by_day, by_model, by_project, by_hour = {}, {}, {}, {}
    seen = set()
    messages, first_ts, last_ts = 0, None, None

    for fp in files:
        project = fp.parent.name
        try:
            text = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            msg = rec.get("message") or {}
            usage = msg.get("usage")
            if not usage:
                continue
            dedup = f"{msg.get('id','')}:{rec.get('requestId','')}"
            if dedup != ":" and dedup in seen:
                continue
            if dedup != ":":
                seen.add(dedup)
            model = msg.get("model") or "unknown"
            ts = rec.get("timestamp")
            day = (ts or "")[:10] if ts else "inconnu"
            hour = ts[:13] if ts else None
            if ts:
                first_ts = ts if not first_ts or ts < first_ts else first_ts
                last_ts = ts if not last_ts or ts > last_ts else last_ts
            fam = model_family(model)
            pname = pretty_project(project)
            stores = [(by_day, day), (by_project, pname)]
            if fam is not None:  # ignore <synthetic>
                stores.append((by_model, fam))
            for store, key in stores:
                store.setdefault(key, empty())
                add(store[key], usage)
            if hour:
                by_hour.setdefault(hour, empty())
                add(by_hour[hour], usage)
            messages += 1

    days = sorted(d for d in by_day if d != "inconnu")
    timeline = []
    for d in days:
        t = by_day[d]
        timeline.append({"date": d, **t,
                         "total": t["input"]+t["output"]+t["cacheCreate"]+t["cacheRead"]})

    def window(hours):
        now = datetime.now(timezone.utc)
        t = empty()
        for hk, v in by_hour.items():
            hms = datetime.fromisoformat(hk + ":00:00+00:00")
            if (now - hms) <= timedelta(hours=hours):
                for k in ("input", "output", "cacheCreate", "cacheRead"):
                    t[k] += v[k]
        t["total"] = t["input"]+t["output"]+t["cacheCreate"]+t["cacheRead"]
        return t

    # reset fenêtre 5h
    w5h_reset = None
    now = datetime.now(timezone.utc)
    in_win = sorted(hk for hk in by_hour
                    if (now - datetime.fromisoformat(hk + ":00:00+00:00")) <= timedelta(hours=5))
    if in_win:
        w5h_reset = (datetime.fromisoformat(in_win[0] + ":00:00+00:00")
                     + timedelta(hours=5)).isoformat()

    def srange(n):
        t = empty()
        for r in timeline[-n:]:
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                t[k] += r[k]
        t["total"] = t["input"]+t["output"]+t["cacheCreate"]+t["cacheRead"]
        return t

    models = []
    for fam, t in by_model.items():
        tot = t["input"]+t["output"]+t["cacheCreate"]+t["cacheRead"]
        models.append({"model": fam, "label": pretty_model(fam), **t, "total": tot,
                       "cost": round(cost_of(t, fam), 2)})
    models.sort(key=lambda x: -x["total"])

    projects = []
    for pname, t in by_project.items():
        tot = t["input"]+t["output"]+t["cacheCreate"]+t["cacheRead"]
        projects.append({"project": pname, "total": tot,
                         "cost": round(cost_of(t, ""), 2)})
    projects.sort(key=lambda x: -x["total"])
    projects = projects[:12]

    grand = empty()
    gcost = 0.0
    for m, t in by_model.items():
        for k in ("input", "output", "cacheCreate", "cacheRead"):
            grand[k] += t[k]
        gcost += cost_of(t, m)
    gtotal = grand["input"]+grand["output"]+grand["cacheCreate"]+grand["cacheRead"]

    today_str = datetime.now(timezone.utc).date().isoformat()
    today = next((r for r in timeline if r["date"] == today_str), None)

    week_map = {}
    for r in timeline:
        wk = iso_week(r["date"])
        week_map[wk] = week_map.get(wk, 0) + r["total"]
    current_week = week_map.get(iso_week(today_str), 0) if timeline else 0

    month_prefix = today_str[:7]
    month_rows = [r for r in timeline if r["date"][:7] == month_prefix]
    current_month = sum(r["total"] for r in month_rows)
    dom = datetime.now(timezone.utc).day
    import calendar
    dim = calendar.monthrange(datetime.now().year, datetime.now().month)[1]
    projection = round(current_month / dom * dim) if dom else 0
    avg = round(srange(30)["total"] / min(30, max(1, len(timeline))))

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"claudeCodeDir": source_dir, "fileCount": len(files),
                   "messages": messages, "firstActivity": first_ts,
                   "lastActivity": last_ts, "apiConnected": False},
        "totals": {**grand, "total": gtotal, "cost": round(gcost, 2)},
        "today": {"total": today["total"] if today else 0,
                  "cost": round(cost_of(today, "") if today else 0, 2)},
        "last7Days": srange(7), "last30Days": srange(30),
        "windows": {"w5h": window(5), "w5hResetAt": w5h_reset, "w7d": window(24*7)},
        "weekly": {"weeks": [{"week": k, "total": v} for k, v in sorted(week_map.items())],
                   "currentWeek": current_week},
        "month": {"currentMonth": current_month, "projection": projection,
                  "dayOfMonth": dom, "daysInMonth": dim},
        "pace": {"avgPerDay": avg},
        "timeline": timeline, "models": models, "projects": projects, "api": None,
    }


def push(payload, url, secret):
    r = requests.post(url.rstrip("/") + "/push", json=payload,
                      headers={"X-Push-Secret": secret}, timeout=15)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="un seul envoi")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL", "60")))
    args = ap.parse_args()

    url = os.environ.get("PUSH_URL", "").strip()
    secret = os.environ.get("PUSH_SECRET", "").strip()
    if not url or not secret:
        print("⚠  Définis PUSH_URL et PUSH_SECRET (voir .env.example). On écrit quand même data/usage.json en local.")

    out = Path(__file__).resolve().parent.parent / "data" / "usage.json"
    out.parent.mkdir(parents=True, exist_ok=True)

    def cycle():
        payload = build()
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        total = payload["totals"]["total"]
        if url and secret:
            try:
                r = push(payload, url, secret)
                ok = "OK" if r.ok else f"ERR {r.status_code}"
            except Exception as e:
                ok = f"ERR {e}"
        else:
            ok = "local only"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {total:,} tokens → {ok}")

    if args.once:
        cycle()
        return
    print(f"Boucle toutes les {args.interval}s. Ctrl+C pour arrêter.")
    while True:
        try:
            cycle()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("erreur:", e)
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
