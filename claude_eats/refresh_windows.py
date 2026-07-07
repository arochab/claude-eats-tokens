#!/usr/bin/env python3
"""
refresh-windows.py — capture le VRAI pourcentage officiel des fenêtres Claude.

Stratégie robuste (validée sur le PC d'Adam) :
  1. Si le jeton OAuth local est expiré, on lance `claude -p "OK"` en headless :
     Claude Code rafraîchit alors le jeton tout seul (vérifié : passe de "expiré"
     à "frais"). C'est l'astuce clé — pas besoin de session interactive.
  2. On interroge l'endpoint officiel /api/oauth/usage avec le jeton (maintenant
     frais) et on récupère le % serveur exact des fenêtres (5h / 7j / Opus / Sonnet).
  3. On écrit le résultat dans ~/.claude/usage-windows.json (même format que le
     statusline), que push_usage.py lira pour le pousser vers la PWA.

Tout est best-effort : aucune erreur ne plante. Ne manipule PAS le secret : lit
le jeton déjà stocké par Claude Code, ne l'affiche pas, ne le pousse nulle part.

Usage : python tools/refresh-windows.py   (à lancer périodiquement / au démarrage)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HOME = os.path.expanduser("~")
CREDS = os.path.join(HOME, ".claude", ".credentials.json")
RELAY = os.path.join(HOME, ".claude", "usage-windows.json")
OAUTH_URL = "https://api.anthropic.com/api/oauth/usage"
CLAUDE_VERSION = "2.1.89"


def _log(msg):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(msg, flush=True)


def token_info():
    """(accessToken, expiresAt_ms) ou (None, None)."""
    try:
        with open(CREDS, encoding="utf-8") as f:
            o = (json.load(f) or {}).get("claudeAiOauth") or {}
        return o.get("accessToken"), o.get("expiresAt")
    except Exception:
        return None, None


def ensure_fresh_token():
    """Si le jeton est expiré, lance `claude -p` pour le rafraîchir. Renvoie le
    jeton frais (ou None). Best-effort : si claude indisponible, on tente quand
    même l'endpoint avec le jeton existant."""
    token, exp = token_info()
    fresh = isinstance(exp, (int, float)) and exp / 1000.0 > time.time() + 30
    if token and fresh:
        return token
    # jeton expiré/absent -> on déclenche un refresh via une requête headless triviale
    claude = _find_claude()
    if claude:
        try:
            _log("  jeton expiré -> rafraîchissement via claude -p…")
            subprocess.run([claude, "-p", "OK", "--output-format", "json"],
                           capture_output=True, timeout=90, text=True)
        except Exception as e:
            _log(f"  (refresh claude a échoué: {e})")
    token, exp = token_info()  # relire (claude a peut-être réécrit)
    return token


def _find_claude():
    """Localise l'exécutable claude (PATH ou emplacement WinGet connu)."""
    from shutil import which
    p = which("claude")
    if p:
        return p
    cand = os.path.join(HOME, "AppData", "Local", "Microsoft", "WinGet", "Packages")
    try:
        for d in os.listdir(cand):
            if d.lower().startswith("anthropic.claudecode"):
                exe = os.path.join(cand, d, "claude.exe")
                if os.path.exists(exe):
                    return exe
                exe = os.path.join(cand, d, "claude")
                if os.path.exists(exe):
                    return exe
    except Exception:
        pass
    return None


def fetch_usage(token):
    """Appelle l'endpoint officiel. Renvoie le JSON ou None."""
    if not token:
        return None
    try:
        req = urllib.request.Request(OAUTH_URL, headers={
            "Authorization": "Bearer " + token,
            "anthropic-beta": "oauth-2025-04-20",
            "User-Agent": "claude-code/" + CLAUDE_VERSION,
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req, timeout=8) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _iso_to_epoch(s):
    """ISO 8601 -> epoch secondes (int) ou None."""
    if not s:
        return None
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def normalize(usage):
    """JSON de l'endpoint -> dict relais (mêmes clés que statusline-windows.py)."""
    if not isinstance(usage, dict):
        return None

    def win(key):
        w = usage.get(key)
        if not isinstance(w, dict):
            return None, None
        u = w.get("utilization")
        try:
            u = round(float(u), 1)
        except (TypeError, ValueError):
            return None, None
        if u < 0 or u > 100:
            return None, None
        return u, _iso_to_epoch(w.get("resets_at"))

    out = {"capturedAt": int(time.time()), "source": "oauth", "stale": False}
    p5, r5 = win("five_hour")
    p7, r7 = win("seven_day")
    po, ro = win("seven_day_opus")
    ps, rs = win("seven_day_sonnet")
    if p5 is not None:
        out["w5hPct"], out["w5hResetAt"] = p5, r5
    if p7 is not None:
        out["w7dPct"], out["w7dResetAt"] = p7, r7
    if po is not None:
        out["w7dOpusPct"], out["w7dOpusResetAt"] = po, ro
    if ps is not None:
        out["w7dSonnetPct"], out["w7dSonnetResetAt"] = ps, rs
    has_any = any(k in out for k in ("w5hPct", "w7dPct", "w7dOpusPct", "w7dSonnetPct"))
    return out if has_any else None


def write_relay(win):
    try:
        os.makedirs(os.path.dirname(RELAY), exist_ok=True)
        tmp = RELAY + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(win, f)
        os.replace(tmp, RELAY)
        return True
    except OSError:
        return False


# --- notifications PC par paliers (25/50/75/90/95/100 % sur 5h et hebdo) ---
WINDOW_MARKS = [25, 50, 75, 90, 95, 100]
FIRED_FILE = os.path.join(HOME, ".claude", "usage-windows-fired.json")


def _load_fired():
    try:
        with open(FIRED_FILE, encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _save_fired(d):
    try:
        with open(FIRED_FILE, "w", encoding="utf-8") as f:
            json.dump(d, f)
    except OSError:
        pass


def detect_milestones(win, fired):
    """Renvoie [(label, pct, mark)] des paliers NOUVELLEMENT franchis, et met à
    jour `fired` (clé = fenêtre+reset+palier). Ne notifie que sur le vrai %."""
    out = []
    pairs = [("w5hPct", "w5hResetAt", "Fenêtre 5 h"),
             ("w7dPct", "w7dResetAt", "Fenêtre hebdo")]
    keep = {}
    for pk, rk, label in pairs:
        p = win.get(pk)
        if not isinstance(p, (int, float)):
            continue
        wid = label + ":" + str(win.get(rk, 0))
        for m in WINDOW_MARKS:
            if p >= m:
                key = wid + ":" + str(m)
                keep[key] = 1
                if not fired.get(key):
                    out.append((label, round(p), m))
    # ne garde que les clés des fenêtres actives (purge des anciens resets)
    fired.clear()
    fired.update(keep)
    return out


def notify_windows(title, body):
    """Toast Windows best-effort via PowerShell (sans dépendance)."""
    try:
        ps = (
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null;"
            "$t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent("
            "[Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
            "$x=$t.GetElementsByTagName('text');"
            "$x.Item(0).AppendChild($t.CreateTextNode(%r))|Out-Null;"
            "$x.Item(1).AppendChild($t.CreateTextNode(%r))|Out-Null;"
            "$n=[Windows.UI.Notifications.ToastNotification]::new($t);"
            "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Eats Tokens').Show($n);"
        ) % (title, body)
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                       capture_output=True, timeout=10)
    except Exception:
        pass


def main():
    token = ensure_fresh_token()
    usage = fetch_usage(token)
    win = normalize(usage)
    if win:
        # notifs PC par paliers (avant d'écrire le relais, sur le vrai %)
        fired = _load_fired()
        for label, pct, mark in detect_milestones(win, fired):
            if mark >= 100:
                notify_windows(label + " — plein (" + str(pct) + "%)", "Claude risque de te ralentir. Ça repart au reset.")
            elif mark >= 90:
                notify_windows(label + " — " + str(mark) + "% (" + str(pct) + "%)", "Lève le pied, tu approches du plafond.")
            else:
                notify_windows(label + " — " + str(mark) + "%", "Tu es à " + str(pct) + "% de ta fenêtre.")
        _save_fired(fired)
    if win and write_relay(win):
        bits = []
        if "w5hPct" in win:
            bits.append(f"5h {win['w5hPct']:.0f}%")
        if "w7dPct" in win:
            bits.append(f"7j {win['w7dPct']:.0f}%")
        if "w7dOpusPct" in win:
            bits.append(f"Opus {win['w7dOpusPct']:.0f}%")
        _log("  fenêtres officielles : " + " · ".join(bits) + "  → " + RELAY)
        return 0
    _log("  fenêtres officielles indisponibles (jeton/endpoint) — repli estimation")
    return 1


if __name__ == "__main__":
    sys.exit(main())
