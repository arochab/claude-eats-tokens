"""
push_usage.py — tourne sur le poste local de l'utilisateur.

Lit les logs locaux de Claude Code (~/.claude/projects/**.jsonl), agrège la
consommation de tokens (par jour / modèle / VRAI projet + fenêtres glissantes),
puis POST le résultat vers le serveur Render (/push). En boucle toutes les N s.

La logique de calcul vit dans `usage_core.py` (testée). Ici on ne fait que de
l'I/O : lire les fichiers en streaming (robuste aux gros volumes), parser ligne
à ligne (robuste aux lignes corrompues), assembler, et pousser.

Usage :
  set PUSH_URL=https://claude-eats-tokens.onrender.com
  set PUSH_SECRET=monsecret
  python tools/push_usage.py            # boucle
  python tools/push_usage.py --once     # un seul envoi
  python tools/push_usage.py --once --verbose   # + diagnostic parsing

Aucune dépendance hors `requests`.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usage_core as uc

# Console Windows en UTF-8 (sinon ⚠/→ plantent en cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

CANDIDATE_DIRS = [
    Path.home() / ".claude" / "projects",
    Path.home() / ".config" / "claude" / "projects",
]


def _first_text(content):
    """Extrait le texte d'un message.content (string ou liste de blocs)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                return b.get("text", "")
    return ""


def iter_records(fp):
    """Génère (record, parse_error) ligne à ligne — JAMAIS le fichier entier en
    mémoire (corrige A2-5). Les lignes illisibles remontent comme erreurs
    comptabilisées au lieu d'être avalées en silence (corrige A2-18)."""
    try:
        with open(fp, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line), False
                except Exception:
                    yield None, True
    except Exception:
        # fichier illisible (verrou Windows, suppression concurrente) : on skip
        return


def build(verbose=False):
    """Agrège tous les logs en un payload usage.json (schéma v2)."""
    source_dir, files = None, []
    for d in CANDIDATE_DIRS:
        if d.exists():
            f = list(d.rglob("*.jsonl"))
            if f:
                source_dir, files = str(d), f
                break

    by_day, by_model, by_hour = {}, {}, {}
    # by_project : clé = chemin du projet -> {tot, models{fam:acc}, sessions{}, last, name}
    by_project = {}
    seen = set()
    messages = 0
    skipped_lines = 0
    first_ts = last_ts = None

    for fp in files:
        # Repli si le cwd manque sur tous les enregistrements : nom de dossier.
        fallback_name = fp.parent.name
        # On lit le fichier en streaming. On garde un peu de contexte de session
        # (titre, 1er prompt) pour le repli de libellé (A1-4).
        session_id = fp.stem
        session_title = None
        session_first_prompt = None
        session_project_key = None

        for rec, err in iter_records(fp):
            if err:
                skipped_lines += 1
                continue

            # Contexte de session (pour repli de libellé) — peu coûteux.
            rtype = rec.get("type")
            if rtype == "custom-title" and not session_title:
                session_title = uc.label_from_text(rec.get("customTitle"))
            if rtype == "user" and not session_first_prompt:
                msg0 = rec.get("message") or {}
                session_first_prompt = uc.label_from_text(_first_text(msg0.get("content")))

            # Clé projet depuis le cwd réel (cœur AXE 1).
            if session_project_key is None:
                cwd = rec.get("cwd")
                pk = uc.project_from_cwd(cwd)
                if pk:
                    session_project_key = pk

            msg = rec.get("message") or {}
            usage = msg.get("usage")
            if not usage:
                continue

            # Dédup : exige les deux champs (corrige DEDUP-KEY-COLLISION).
            mid, rid = msg.get("id"), rec.get("requestId")
            if mid and rid:
                dk = f"{mid}:{rid}"
                if dk in seen:
                    continue
                seen.add(dk)

            model = msg.get("model") or "unknown"
            fam = uc.family(model)
            ts = rec.get("timestamp")
            day = (ts or "")[:10] if ts else "inconnu"
            hour = ts[:13] if ts else None
            if ts:
                first_ts = ts if not first_ts or ts < first_ts else first_ts
                last_ts = ts if not last_ts or ts > last_ts else last_ts

            # jour
            by_day.setdefault(day, uc.empty())
            uc.add_usage(by_day[day], usage)
            # heure
            if hour:
                by_hour.setdefault(hour, uc.empty())
                uc.add_usage(by_hour[hour], usage)
            # modèle (ignore <synthetic>)
            if fam is not None:
                by_model.setdefault(fam, uc.empty())
                uc.add_usage(by_model[fam], usage)

            # projet — clé = chemin, avec breakdown par modèle (corrige A1-3)
            pkey = session_project_key or f"@dir/{fallback_name}"
            proj = by_project.setdefault(pkey, {
                "name": uc.display_name(session_project_key) if session_project_key else uc.display_name(fallback_name),
                "path": session_project_key or fallback_name,
                "models": {},          # fam -> accumulateur
                "sessions": {},        # sessionId -> {tokens, last, models:set, title}
                "byDay": {},           # 'YYYY-MM-DD' -> total (timeline projet)
                "lastActivity": None,
            })
            mfam = fam if fam is not None else "autre"
            proj["models"].setdefault(mfam, uc.empty())
            uc.add_usage(proj["models"][mfam], usage)
            if day != "inconnu":
                proj["byDay"][day] = proj["byDay"].get(day, 0) + uc.total_of({
                    "input": usage.get("input_tokens", 0) or 0,
                    "output": usage.get("output_tokens", 0) or 0,
                    "cacheCreate": usage.get("cache_creation_input_tokens", 0) or 0,
                    "cacheRead": usage.get("cache_read_input_tokens", 0) or 0,
                })

            sess = proj["sessions"].setdefault(session_id, {
                "sessionId": session_id, "tokens": 0, "lastActivity": None,
                "models": set(), "title": None,
            })
            sess["tokens"] += uc.total_of({
                "input": usage.get("input_tokens", 0) or 0,
                "output": usage.get("output_tokens", 0) or 0,
                "cacheCreate": usage.get("cache_creation_input_tokens", 0) or 0,
                "cacheRead": usage.get("cache_read_input_tokens", 0) or 0,
            })
            if fam:
                sess["models"].add(fam)
            if ts and (not sess["lastActivity"] or ts > sess["lastActivity"]):
                sess["lastActivity"] = ts
            if ts and (not proj["lastActivity"] or ts > proj["lastActivity"]):
                proj["lastActivity"] = ts
            messages += 1

        # Après le fichier : pose le titre/1er prompt sur la session si présente.
        if session_project_key or fallback_name:
            pkey = session_project_key or f"@dir/{fallback_name}"
            proj = by_project.get(pkey)
            if proj and session_id in proj["sessions"]:
                proj["sessions"][session_id]["title"] = session_title or session_first_prompt

    # ---- Timeline ----
    days = sorted(d for d in by_day if d != "inconnu")
    timeline = []
    for d in days:
        t = by_day[d]
        timeline.append({"date": d, **t, "total": uc.total_of(t)})

    now = datetime.now(timezone.utc)

    def srange(n):
        t = uc.empty()
        for r in timeline[-n:]:
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                t[k] += r[k]
        t["total"] = uc.total_of(t)
        return t

    # ---- Modèles (global) ----
    models = []
    for fam, t in by_model.items():
        models.append({"model": fam, "label": uc.pretty_model(fam), **t,
                       "total": uc.total_of(t), "cost": round(uc.cost_of(t, fam), 2)})
    models.sort(key=lambda x: -x["total"])

    # ---- Projets (coût pondéré par modèle réel — corrige A1-3/A1-2/A1-4/A1-9) ----
    projects = []
    for pkey, p in by_project.items():
        tot_acc = uc.empty()
        cost = 0.0
        model_break = []
        for fam, acc in p["models"].items():
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                tot_acc[k] += acc[k]
            c = uc.cost_of(acc, fam)
            cost += c
            model_break.append({"model": fam, "label": uc.pretty_model(fam),
                                "total": uc.total_of(acc), "cost": round(c, 2)})
        model_break.sort(key=lambda x: -x["total"])
        # sessions : top par tokens, sérialisables
        sess_list = []
        for s in p["sessions"].values():
            sess_list.append({
                "sessionId": s["sessionId"], "title": s["title"],
                "tokens": s["tokens"], "lastActivity": s["lastActivity"],
                "models": sorted(s["models"]),
            })
        sess_list.sort(key=lambda x: -x["tokens"])
        proj_timeline = [{"date": d, "total": p["byDay"][d]} for d in sorted(p["byDay"])]
        projects.append({
            "project": p["name"],          # rétrocompat (ancien champ)
            "name": p["name"],
            "path": p["path"],
            "total": uc.total_of(tot_acc),
            "cost": round(cost, 2),
            "models": model_break,
            "sessionCount": len(sess_list),
            "sessions": sess_list[:20],    # drill-down (cap raisonnable)
            "timeline": proj_timeline,
            "lastActivity": p["lastActivity"],
            **tot_acc,
        })
    # Fusion au niveau affichage des projets de même nom (A1-2 : données
    # toujours distinctes par chemin, mais une entrée par projet perçu).
    projects = uc.merge_projects_by_name(projects)
    projects.sort(key=lambda x: -x["total"])

    # bucket "Autres" si > 12 (corrige A1-6 : plus de perte silencieuse)
    TOP = 12
    projects_out = projects[:TOP]
    if len(projects) > TOP:
        tail = projects[TOP:]
        other = uc.empty()
        ocost = 0.0
        for p in tail:
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                other[k] += p[k]
            ocost += p["cost"]
        projects_out.append({
            "project": "Autres", "name": "Autres", "path": None,
            "total": uc.total_of(other), "cost": round(ocost, 2),
            "models": [], "sessionCount": sum(p["sessionCount"] for p in tail),
            "sessions": [], "lastActivity": max((p["lastActivity"] for p in tail if p["lastActivity"]), default=None),
            "isOthers": True, **other,
        })

    # ---- Fenêtres ----
    w5h = uc.window_total(by_hour, 5, now)
    w7d = uc.window_total(by_hour, 24 * 7, now)
    w5h_reset = uc.w5h_reset_at(by_hour, now)

    # ---- Semaines / mois / rythme ----
    today_str = now.date().isoformat()
    today = next((r for r in timeline if r["date"] == today_str), None)

    week_map = {}
    for r in timeline:
        wk = uc.iso_week(r["date"])
        week_map[wk] = week_map.get(wk, 0) + r["total"]
    current_week = week_map.get(uc.iso_week(today_str), 0) if timeline else 0

    month_prefix = today_str[:7]
    month_rows = [r for r in timeline if r["date"][:7] == month_prefix]
    current_month = sum(r["total"] for r in month_rows)
    dom = now.day
    import calendar
    dim = calendar.monthrange(now.year, now.month)[1]

    # ---- Stats HONNÊTES (schéma v3) : tout dérivé des vraies données ----
    # Projection sur la pente des 7 derniers jours, avec fourchette.
    month_daily = [r["total"] for r in month_rows]
    projection = uc.month_projection(current_month, dom, dim)  # rétrocompat
    proj_slope = uc.projection_from_slope(month_daily, dom, dim)
    # Totaux des mois civils PRÉCÉDENTS complets (pour la médiane de comparaison).
    by_month = {}
    for r in timeline:
        by_month[r["date"][:7]] = by_month.get(r["date"][:7], 0) + r["total"]
    prev_months = [v for k, v in sorted(by_month.items()) if k < month_prefix]
    m_ratio = uc.month_ratio(current_month, prev_months[-3:])  # vs médiane 3 derniers
    m_median3 = round(uc.median(prev_months[-3:])) if prev_months else None
    # Moyenne + médiane /jour (transparence sur le dénominateur).
    daily_vals = [r["total"] for r in timeline]
    n_days = min(30, max(1, len(timeline)))
    avg = round(srange(30)["total"] / n_days) if timeline else 0
    median_per_day = round(uc.median(daily_vals[-30:])) if daily_vals else 0
    # Percentile du jour : où se situe aujourd'hui dans ton historique.
    today_total = today["total"] if today else 0
    # on compare aux jours PASSÉS (hors aujourd'hui) pour un rang honnête
    past_days = daily_vals[:-1] if len(daily_vals) > 1 else daily_vals
    today_rank = uc.percentile_rank(today_total, past_days) if past_days else None
    # Charge 5h habituelle (robuste, depuis les vrais buckets horaires) —
    # référence honnête de l'assistant intelligent (pas un quota inventé).
    baseline5h = uc.baseline_5h(by_hour)

    # ---- Heatmap horaire (jour de semaine x heure) — corrige MISSING-PEAK-HOURS ----
    hourly = {}  # "HH" -> total, ET grille weekday x hour
    weekday_hour = [[0] * 24 for _ in range(7)]
    for hk, v in by_hour.items():
        try:
            dt = datetime.fromisoformat(hk + ":00:00+00:00")
        except Exception:
            continue
        h = dt.hour
        vt = uc.total_of(v)
        hourly[f"{h:02d}"] = hourly.get(f"{h:02d}", 0) + vt
        weekday_hour[dt.weekday()][h] += vt

    grand = uc.empty()
    gcost = 0.0
    for fam, t in by_model.items():
        for k in ("input", "output", "cacheCreate", "cacheRead"):
            grand[k] += t[k]
        gcost += uc.cost_of(t, fam)
    gtotal = uc.total_of(grand)

    payload = {
        "schema": uc.SCHEMA_VERSION,
        "generatedAt": now.isoformat(),
        "source": {"claudeCodeDir": source_dir, "fileCount": len(files),
                   "messages": messages, "skippedLines": skipped_lines,
                   "firstActivity": first_ts, "lastActivity": last_ts,
                   "apiConnected": False, "pricingAsOf": uc.PRICING_AS_OF},
        "totals": {**grand, "total": gtotal, "cost": round(gcost, 2)},
        "today": {"total": today["total"] if today else 0,
                  "cost": round(uc.cost_of(today, "") if today else 0, 2)},
        "last7Days": srange(7), "last30Days": srange(30),
        "windows": {"w5h": w5h, "w5hResetAt": w5h_reset, "w7d": w7d},
        "weekly": {"weeks": [{"week": k, "total": v} for k, v in sorted(week_map.items())],
                   "currentWeek": current_week},
        "month": {"currentMonth": current_month, "projection": projection,
                  "projSlope": proj_slope, "ratio3m": m_ratio, "median3m": m_median3,
                  "dayOfMonth": dom, "daysInMonth": dim},
        "pace": {"avgPerDay": avg, "medianPerDay": median_per_day, "nDays": n_days,
                 "todayRank": today_rank, "todayTotal": today_total,
                 "medianDay": median_per_day, "baseline5h": baseline5h},
        "timeline": timeline, "models": models, "projects": projects_out,
        "hourly": {"byHour": [{"hour": h, "total": hourly[h]} for h in sorted(hourly)],
                   "weekdayHour": weekday_hour},
        "api": None,
    }
    if verbose:
        print(f"  fichiers={len(files)} messages={messages} "
              f"lignes_corrompues={skipped_lines} projets={len(projects)}")
    return payload


def push(payload, url, secret):
    r = requests.post(url.rstrip("/") + "/push", json=payload,
                      headers={"X-Push-Secret": secret}, timeout=15)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="un seul envoi")
    ap.add_argument("--verbose", action="store_true", help="diagnostic parsing")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL", "60")))
    args = ap.parse_args()

    url = os.environ.get("PUSH_URL", "").strip()
    secret = os.environ.get("PUSH_SECRET", "").strip()
    if not url or not secret:
        print("⚠  Définis PUSH_URL et PUSH_SECRET (voir .env.example). "
              "On écrit quand même data/usage.json en local.")

    out = Path(__file__).resolve().parent.parent / "data" / "usage.json"
    out.parent.mkdir(parents=True, exist_ok=True)

    consecutive_errors = 0

    def cycle():
        nonlocal consecutive_errors
        payload = build(verbose=args.verbose)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        total = payload["totals"]["total"]
        if url and secret:
            try:
                r = push(payload, url, secret)
                if r.ok:
                    ok, consecutive_errors = "OK", 0
                else:
                    consecutive_errors += 1
                    ok = f"ERR {r.status_code}"
            except Exception as e:
                consecutive_errors += 1
                ok = f"ERR {e}"
        else:
            ok = "local only"
        warn = "  ⚠ ÉCHECS RÉPÉTÉS — vérifie le serveur/réseau" if consecutive_errors >= 3 else ""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {total:,} tokens → {ok}{warn}")

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
