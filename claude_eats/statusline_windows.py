#!/usr/bin/env python3
"""
statusline-windows.py — capte le VRAI pourcentage officiel des fenêtres Claude.

Claude Code (>= v2.1.80) pousse sur le STDIN des scripts de statusline un JSON
contenant le champ `rate_limits` : le pourcentage SERVEUR exact des fenêtres
glissantes 5 h et 7 j (le même chiffre que `/usage`), pour les abonnés Pro/Max,
après la première réponse API de la session.

Ce script lit ce JSON, en extrait les fenêtres, et les écrit dans un petit
fichier relais (~/.claude/usage-windows.json) que push_usage.py lira ensuite
pour les pousser vers la PWA. Il ré-émet aussi une ligne de statut lisible afin
de rester un statusline fonctionnel.

Installation (Adam, une fois) — dans ~/.claude/settings.json :
  "statusLine": { "type": "command", "command": "python \"<repo>/tools/statusline-windows.py\"" }

Aucune donnée sensible n'est lue ici : seulement le champ rate_limits que Claude
Code fournit lui-même. Robuste : si rate_limits est absent, on n'écrase rien.
"""
import json
import os
import sys
import time

RELAY = os.path.join(os.path.expanduser("~"), ".claude", "usage-windows.json")


def _clean_pct(v, reset_at):
    """Garde un pourcentage 0..100 plausible.

    Protège contre le bug #52326 où `used_percentage` peut contenir par erreur
    la valeur epoch de `resets_at` tant que la fenêtre n'a pas de données.
    """
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if v < 0 or v > 100:
        return None
    if reset_at is not None and v == reset_at:  # valeur epoch qui a fuité
        return None
    return round(v, 1)


def extract_windows(payload):
    """payload = JSON du stdin statusline -> dict windowsOfficial ou None."""
    rl = (payload or {}).get("rate_limits")
    if not isinstance(rl, dict):
        return None

    def win(key):
        w = rl.get(key)
        if not isinstance(w, dict):
            return None, None
        reset = w.get("resets_at")
        # used_percentage (stdin) ou utilization (endpoint OAuth) — on accepte les deux
        pct = w.get("used_percentage", w.get("utilization"))
        return _clean_pct(pct, reset), reset

    p5, r5 = win("five_hour")
    p7, r7 = win("seven_day")
    # bonus : Opus / Sonnet hebdo si présents
    po, ro = win("seven_day_opus")
    ps, rs = win("seven_day_sonnet")

    if p5 is None and p7 is None and po is None and ps is None:
        return None  # rien d'exploitable -> on n'écrase pas le relais

    out = {"capturedAt": int(time.time()), "source": "statusline"}
    if p5 is not None:
        out["w5hPct"] = p5
        out["w5hResetAt"] = r5
    if p7 is not None:
        out["w7dPct"] = p7
        out["w7dResetAt"] = r7
    if po is not None:
        out["w7dOpusPct"] = po
        out["w7dOpusResetAt"] = ro
    if ps is not None:
        out["w7dSonnetPct"] = ps
        out["w7dSonnetResetAt"] = rs
    return out


def status_line(win):
    """Une ligne lisible pour le statusline (best-effort)."""
    if not win:
        return "Claude Eats Tokens — fenêtres : en attente de Claude…"
    bits = []
    if "w5hPct" in win:
        bits.append("5 h {:.0f}%".format(win["w5hPct"]))
    if "w7dPct" in win:
        bits.append("7 j {:.0f}%".format(win["w7dPct"]))
    return "Fenêtres Claude — " + " · ".join(bits) if bits else "Fenêtres Claude"


def main():
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    win = extract_windows(payload)
    if win is not None:
        try:
            os.makedirs(os.path.dirname(RELAY), exist_ok=True)
            tmp = RELAY + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(win, f)
            os.replace(tmp, RELAY)  # écriture atomique
        except OSError:
            pass  # jamais bloquer le statusline pour une erreur d'I/O

    # ré-émet une ligne de statut (Claude Code l'affiche)
    try:
        sys.stdout.write(status_line(win))
    except Exception:
        pass


if __name__ == "__main__":
    main()
