#!/usr/bin/env python3
"""
moteur.py — la boucle de push, version robuste (remplace la boucle moteur.bat).

Lancé par pythonw.exe (aucune fenêtre, aucune chaîne wscript→cmd que les
antivirus tuent en silence). La tâche planifiée le (re)lance toutes les 5 min :
si une instance tourne déjà, la nouvelle s'éteint immédiatement grâce au verrou
socket — donc au pire, un moteur mort est ressuscité en moins de 5 minutes.

Ce qu'il fait, comme moteur.bat avant lui :
  - charge PUSH_URL / PUSH_SECRET / CET_API_KEY depuis secret.local.bat
  - toutes les REFRESH_EVERY itérations : refresh-windows.py (vrai % officiel
    des fenêtres 5h/7j)
  - à chaque itération : push_usage.py --once, puis dodo INTERVAL secondes

Diagnostic : logs/moteur.log (rotation à 512 Ko) + logs/heartbeat.log
(horodatage à chaque cycle — si ce fichier est vieux, le moteur est mort).
"""
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(REPO, "logs")
LOG_FILE = os.path.join(LOGS, "moteur.log")
HEARTBEAT = os.path.join(LOGS, "heartbeat.log")
LOG_MAX_BYTES = 512 * 1024

INTERVAL = 60          # secondes entre deux push
REFRESH_EVERY = 10     # 1 refresh officiel des fenêtres toutes les N itérations
LOCK_PORT = 49717      # verrou anti-double-instance (libéré à la mort du process)

# python.exe (console) pour les enfants, lancés sans fenêtre via CREATE_NO_WINDOW ;
# sys.executable peut être pythonw.exe, qui casse la capture stdout des enfants.
PYTHON = sys.executable.replace("pythonw.exe", "python.exe")
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

_lock_socket = None  # gardé vivant tant que le process vit


def acquire_lock():
    """Une seule instance : bind un port localhost. Échec = déjà un moteur."""
    global _lock_socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", LOCK_PORT))
    except OSError:
        s.close()
        return False
    _lock_socket = s
    return True


def log(msg):
    os.makedirs(LOGS, exist_ok=True)
    try:
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > LOG_MAX_BYTES:
            old = LOG_FILE + ".old"
            if os.path.exists(old):
                os.remove(old)
            os.replace(LOG_FILE, old)
    except OSError:
        pass
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("[%s] %s\n" % (stamp, msg))


def heartbeat(status):
    os.makedirs(LOGS, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(HEARTBEAT, "w", encoding="utf-8") as f:
        f.write("%s %s\n" % (stamp, status))


def load_secrets():
    """Parse secret.local.bat (lignes `set CLE=valeur`) vers os.environ."""
    path = os.path.join(REPO, "secret.local.bat")
    if not os.path.exists(path):
        log("FATAL secret.local.bat introuvable — rien à pousser")
        return False
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r'^\s*set\s+"?([A-Za-z_][A-Za-z0-9_]*)=([^"\r\n]*)"?\s*$', line)
            if m:
                os.environ[m.group(1)] = m.group(2).strip()
    if not os.environ.get("PUSH_URL"):
        log("FATAL PUSH_URL absent de secret.local.bat")
        return False
    if not (os.environ.get("PUSH_SECRET") or os.environ.get("CET_API_KEY")):
        log("FATAL ni PUSH_SECRET ni CET_API_KEY dans secret.local.bat")
        return False
    return True


def run_child(script, args, timeout):
    """Lance un script du dossier tools/ sans fenêtre ; retourne (ok, résumé)."""
    cmd = [PYTHON, os.path.join(REPO, "tools", script)] + args
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    try:
        p = subprocess.run(
            cmd, cwd=REPO, env=env, timeout=timeout,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=NO_WINDOW,
        )
        out = ((p.stdout or "") + (p.stderr or "")).strip()
        tail = out.splitlines()[-1] if out else ""
        return p.returncode == 0, "exit=%d %s" % (p.returncode, tail[:300])
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT apres %ds" % timeout
    except Exception as e:  # noqa: BLE001 — le moteur ne doit jamais mourir
        return False, "EXC %s: %s" % (type(e).__name__, e)


def main():
    if not acquire_lock():
        return 0  # une instance tourne déjà — sortie silencieuse, c'est normal
    log("=== moteur demarre (pid %d, python %s) ===" % (os.getpid(), PYTHON))
    if not load_secrets():
        heartbeat("FATAL secrets")
        return 1

    tick = REFRESH_EVERY  # premier cycle : refresh officiel immédiat
    failures = 0
    while True:
        try:
            if tick >= REFRESH_EVERY:
                ok, info = run_child("refresh-windows.py", [], timeout=300)
                log("refresh-windows %s" % info)
                tick = 0
            ok, info = run_child("push_usage.py", ["--once"], timeout=300)
            log("push %s" % info)
            # push_usage sort en exit=0 meme si le POST a echoue : il ecrit
            # "→ OK" ou "→ ERR ..." sur sa derniere ligne, on se fie a ca.
            if ok and "ERR" in info:
                ok = False
            if ok:
                failures = 0
                heartbeat("OK")
            else:
                failures += 1
                heartbeat("FAIL x%d" % failures)
            tick += 1
        except Exception as e:  # noqa: BLE001
            log("boucle EXC %s: %s" % (type(e).__name__, e))
        time.sleep(INTERVAL)


if __name__ == "__main__":
    sys.exit(main())
