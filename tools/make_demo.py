"""
make_demo.py — génère data/usage.demo.json (schéma v2) avec des données
réalistes mais synthétiques. Sert de repli quand ni le serveur ni Pages
n'ont de données, et de vitrine portfolio.

Déterministe (pas de hasard) pour des diffs propres.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usage_core as uc

START = datetime(2026, 5, 20, tzinfo=timezone.utc)
DAYS = 34
GEN_AT = "2026-06-22T18:00:00+00:00"

# Projets démo : (nom, base/jour, modèles->part, sessions)
DEMO_PROJECTS = [
    ("brandpulse-app", 520000, {"opus": 0.7, "sonnet": 0.3}, [
        ("Refonte de l'onboarding mobile", 0.34),
        ("Fix paiement Stripe en prod", 0.28),
        ("A/B test page d'accueil", 0.22),
        ("Audit accessibilité", 0.16),
    ]),
    ("kapman-news", 410000, {"sonnet": 0.6, "haiku": 0.4}, [
        ("Pipeline scraping quotidien", 0.45),
        ("Génération newsletter", 0.35),
        ("Dédup des articles", 0.20),
    ]),
    ("serp-scraper", 300000, {"opus": 0.5, "sonnet": 0.5}, [
        ("Anti-bot Cloudflare", 0.55),
        ("Parsing résultats Google", 0.45),
    ]),
    ("mixhub", 240000, {"opus": 0.8, "haiku": 0.2}, [
        ("Moteur de recommandation", 0.6),
        ("Import bibliothèque", 0.4),
    ]),
    ("claude-eats-tokens", 180000, {"opus": 0.9, "sonnet": 0.1}, [
        ("Vue projets réels", 0.5),
        ("Audit & refactor", 0.5),
    ]),
]

# courbe d'intensité par jour de semaine (lun..dim) puis légère croissance
WEEKDAY = [1.0, 1.1, 1.05, 1.15, 0.9, 0.35, 0.3]


def split_usage(total):
    # Répartition typique : beaucoup de cache read, peu d'output.
    return {
        "input_tokens": int(total * 0.013),
        "output_tokens": int(total * 0.064),
        "cache_creation_input_tokens": int(total * 0.096),
        "cache_read_input_tokens": int(total * 0.827),
    }


def main():
    by_day = {}
    by_model = {}
    by_hour = {}
    projects_raw = {}

    for pname, base, mix, sessions in DEMO_PROJECTS:
        projects_raw[pname] = {"models": {}, "byDay": {}, "sessions": []}
        # sessions
        for i, (title, frac) in enumerate(sessions):
            projects_raw[pname]["sessions"].append({
                "sessionId": f"{pname[:4]}-{i:02d}",
                "title": title, "frac": frac,
                "models": sorted(mix.keys()),
            })

    for di in range(DAYS):
        day_dt = START + timedelta(days=di)
        day = day_dt.date().isoformat()
        growth = 1.0 + di * 0.012
        wfac = WEEKDAY[day_dt.weekday()]
        by_day.setdefault(day, uc.empty())
        for pname, base, mix, sessions in DEMO_PROJECTS:
            day_total = int(base * wfac * growth)
            if day_total <= 0:
                continue
            projects_raw[pname]["byDay"][day] = projects_raw[pname]["byDay"].get(day, 0) + day_total
            for fam, part in mix.items():
                u = split_usage(int(day_total * part))
                by_day[day]["input"] += u["input_tokens"]
                by_day[day]["output"] += u["output_tokens"]
                by_day[day]["cacheCreate"] += u["cache_creation_input_tokens"]
                by_day[day]["cacheRead"] += u["cache_read_input_tokens"]
                by_model.setdefault(fam, uc.empty())
                uc.add_usage(by_model[fam], u)
                projects_raw[pname]["models"].setdefault(fam, uc.empty())
                uc.add_usage(projects_raw[pname]["models"][fam], u)
                # heures de pointe : 9-12h et 14-18h
                for h in (10, 11, 15, 16, 21):
                    hk = f"{day}T{h:02d}"
                    by_hour.setdefault(hk, uc.empty())
                    hu = {k: v // 5 for k, v in u.items()}
                    uc.add_usage(by_hour[hk], hu)

    # timeline globale
    days = sorted(by_day)
    timeline = [{"date": d, **by_day[d], "total": uc.total_of(by_day[d])} for d in days]

    # modèles
    models = []
    for fam, t in by_model.items():
        models.append({"model": fam, "label": uc.pretty_model(fam), **t,
                       "total": uc.total_of(t), "cost": round(uc.cost_of(t, fam), 2)})
    models.sort(key=lambda x: -x["total"])

    # projets
    projects = []
    for pname, raw in projects_raw.items():
        tot = uc.empty()
        cost = 0.0
        mb = []
        for fam, acc in raw["models"].items():
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                tot[k] += acc[k]
            c = uc.cost_of(acc, fam)
            cost += c
            mb.append({"model": fam, "label": uc.pretty_model(fam),
                       "total": uc.total_of(acc), "cost": round(c, 2)})
        mb.sort(key=lambda x: -x["total"])
        ptotal = uc.total_of(tot)
        ptl = [{"date": d, "total": raw["byDay"][d]} for d in sorted(raw["byDay"])]
        sess = []
        for s in raw["sessions"]:
            sess.append({"sessionId": s["sessionId"], "title": s["title"],
                         "tokens": int(ptotal * s["frac"]), "lastActivity": GEN_AT,
                         "models": s["models"]})
        sess.sort(key=lambda x: -x["tokens"])
        projects.append({
            "project": pname, "name": pname, "path": f"C:/Users/adam/Desktop/{pname}",
            "paths": [f"C:/Users/adam/Desktop/{pname}"],
            "total": ptotal, "cost": round(cost, 2), "models": mb,
            "sessionCount": len(sess), "sessions": sess, "timeline": ptl,
            "lastActivity": GEN_AT, **tot,
        })
    projects.sort(key=lambda x: -x["total"])

    now = datetime.fromisoformat(GEN_AT)
    w5h = uc.window_total(by_hour, 5, now)
    w7d = uc.window_total(by_hour, 24 * 7, now)

    def srange(n):
        t = uc.empty()
        for r in timeline[-n:]:
            for k in ("input", "output", "cacheCreate", "cacheRead"):
                t[k] += r[k]
        t["total"] = uc.total_of(t)
        return t

    week_map = {}
    for r in timeline:
        wk = uc.iso_week(r["date"])
        week_map[wk] = week_map.get(wk, 0) + r["total"]

    today_str = now.date().isoformat()
    month_prefix = today_str[:7]
    current_month = sum(r["total"] for r in timeline if r["date"][:7] == month_prefix)
    import calendar
    dim = calendar.monthrange(now.year, now.month)[1]
    dom = now.day

    grand = uc.empty()
    gcost = 0.0
    for fam, t in by_model.items():
        for k in ("input", "output", "cacheCreate", "cacheRead"):
            grand[k] += t[k]
        gcost += uc.cost_of(t, fam)

    hourly = {}
    weekday_hour = [[0] * 24 for _ in range(7)]
    for hk, v in by_hour.items():
        dt = datetime.fromisoformat(hk + ":00:00+00:00")
        vt = uc.total_of(v)
        hourly[f"{dt.hour:02d}"] = hourly.get(f"{dt.hour:02d}", 0) + vt
        weekday_hour[dt.weekday()][dt.hour] += vt

    payload = {
        "schema": uc.SCHEMA_VERSION,
        "generatedAt": GEN_AT,
        "demo": True,
        "source": {"claudeCodeDir": None, "fileCount": 51, "messages": 2640,
                   "skippedLines": 0, "firstActivity": days[0] + "T09:00:00Z",
                   "lastActivity": GEN_AT, "apiConnected": False},
        "totals": {**grand, "total": uc.total_of(grand), "cost": round(gcost, 2)},
        "today": {"total": timeline[-1]["total"], "cost": round(uc.cost_of(by_day[days[-1]], ""), 2)},
        "last7Days": srange(7), "last30Days": srange(30),
        "windows": {"w5h": w5h, "w5hResetAt": (now + timedelta(hours=2)).isoformat(), "w7d": w7d},
        "weekly": {"weeks": [{"week": k, "total": v} for k, v in sorted(week_map.items())],
                   "currentWeek": week_map.get(uc.iso_week(today_str), 0)},
        "month": {"currentMonth": current_month,
                  "projection": uc.month_projection(current_month, dom, dim),
                  "projSlope": uc.projection_from_slope([r["total"] for r in timeline if r["date"][:7] == month_prefix], dom, dim),
                  "ratio3m": 108, "median3m": round(current_month * 0.93),
                  "dayOfMonth": dom, "daysInMonth": dim},
        "pace": {"avgPerDay": round(srange(30)["total"] / min(30, len(timeline))),
                 "medianPerDay": round(uc.median([r["total"] for r in timeline])),
                 "nDays": min(30, len(timeline)),
                 "todayRank": 64, "todayTotal": timeline[-1]["total"],
                 "medianDay": round(uc.median([r["total"] for r in timeline]))},
        "timeline": timeline, "models": models, "projects": projects,
        "hourly": {"byHour": [{"hour": h, "total": hourly[h]} for h in sorted(hourly)],
                   "weekdayHour": weekday_hour},
        "api": None,
    }

    out = os.path.join(os.path.dirname(__file__), "..", "data", "usage.demo.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Écrit {out} — {len(projects)} projets, total {uc.total_of(grand):,} tokens, ${round(gcost,2)}")


if __name__ == "__main__":
    main()
