"""
cli.py — point d'entrée de la commande `claude-push` (voir [project.scripts]).

Une fois le moteur installé (`uv tool install "git+https://…"` ou `pip install`),
l'utilisateur lance simplement :

    claude-push                 # boucle de push (défaut) + refresh périodique
    claude-push --once          # un seul envoi puis sortie
    claude-push pair            # branche cet ordinateur (device-flow, sans clé à copier)
    claude-push install-service # lance au démarrage (tâche Windows / launchd / systemd)
    claude-push uninstall       # retire le service (kill-switch en 1 commande)
    claude-push doctor          # diagnostic : clé, logs, serveur, service

La commande PAR DÉFAUT (sans sous-commande) lance la boucle de push existante.
On rapatrie ici la logique que faisait `moteur.bat` : toutes les REFRESH_EVERY
itérations, on capte le VRAI % officiel des fenêtres (5h/7j) via refresh_windows,
pour que le futur service ne régresse pas cette feature.

Le moteur (agrégation + push) est identique à avant : il vit dans
claude_eats.push_usage. Ici on n'ajoute que la STRUCTURE CLI et la boucle.
"""
import argparse
import os
import sys
import time

from . import push_usage as engine
from . import config as cfg

# Console Windows en UTF-8 (sinon les emojis/accents plantent en cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Toutes les N itérations de la boucle, on rafraîchit le vrai % officiel des
# fenêtres (équivalent du REFRESH_EVERY=10 de moteur.bat). ~1 mini-requête / 10 min
# à intervalle 60 s.
DEFAULT_REFRESH_EVERY = 10


def _refresh_windows_safe():
    """Capte le vrai % officiel des fenêtres (best-effort, ne plante jamais).

    Rapatrié de moteur.bat (`python tools/refresh-windows.py`). Import paresseux :
    refresh_windows peut lancer un sous-processus `claude -p`, on ne le charge
    donc qu'au moment utile."""
    try:
        from . import refresh_windows
        refresh_windows.main()
    except SystemExit:
        # refresh_windows.main() fait sys.exit(code) — on l'absorbe.
        pass
    except Exception as e:
        print("  (refresh fenêtres ignoré :", e, ")")


def cmd_push(args):
    """Commande par défaut : boucle de push (ou --once), avec refresh périodique."""
    url = cfg.push_url()
    secret = cfg.push_secret()
    api_key = cfg.api_key()
    out = cfg.usage_path()

    if not url or (not secret and not api_key):
        print("⚠  Aucun identifiant : définis CET_API_KEY (ou PUSH_SECRET) et "
              "PUSH_URL — via l'environnement ou " + str(cfg.config_file()) + ".")
        print(f"   On écrit quand même {out} en local (repli).")

    consecutive_errors = 0

    if args.once:
        # un seul envoi : on capte aussi les fenêtres une fois (utile en test)
        if not args.no_refresh:
            _refresh_windows_safe()
        engine.run_cycle(url, secret=secret, api_key=api_key, out=out,
                         verbose=args.verbose)
        return 0

    print(f"Boucle toutes les {args.interval}s (refresh fenêtres tous les "
          f"{args.refresh_every} cycles). Ctrl+C pour arrêter.")
    tick = args.refresh_every  # déclenche un refresh au 1er tour (comme moteur.bat)
    while True:
        try:
            if not args.no_refresh and tick >= args.refresh_every:
                _refresh_windows_safe()
                tick = 0
            consecutive_errors, _ = engine.run_cycle(
                url, secret=secret, api_key=api_key, out=out,
                verbose=args.verbose, consecutive_errors=consecutive_errors)
            tick += 1
        except KeyboardInterrupt:
            print("\nArrêt.")
            break
        except Exception as e:
            print("erreur:", e)
        time.sleep(args.interval)
    return 0


def cmd_doctor(args):
    """Diagnostic : tout est-il en place pour que tes chiffres remontent ?"""
    from pathlib import Path
    ok = "✓"
    ko = "✗"
    print("claude-push doctor — diagnostic\n")

    # 1) identifiants
    has_key = bool(cfg.api_key())
    has_secret = bool(cfg.push_secret())
    print(f"  {ok if (has_key or has_secret) else ko} identifiant :",
          "clé de connexion" if has_key else ("secret self-host" if has_secret
          else "AUCUN — lance `claude-push pair`"))
    print("     config :", cfg.config_file(),
          "(présent)" if cfg.config_file().exists() else "(absent)")

    # 2) logs Claude Code trouvés ?
    found = None
    for d in (Path.home() / ".claude" / "projects",
              Path.home() / ".config" / "claude" / "projects"):
        if d.exists() and any(d.rglob("*.jsonl")):
            found = d
            break
    print(f"  {ok if found else ko} logs Claude Code :",
          str(found) if found else "introuvables (Claude Code a-t-il tourné ?)")

    # 3) la destination répond ? On teste la voie RÉELLEMENT utilisée, sinon le
    #    diagnostic mentirait (ex. « serveur mort » alors qu'on écrit en direct).
    if cfg.use_direct():
        sb = cfg.supabase_url().rstrip("/")
        try:
            # cet_get_usage avec une clé vide : la base doit répondre 200/null.
            # On ne teste PAS la vraie clé ici (doctor ne doit rien écrire).
            r = engine.requests.post(
                f"{sb}/rest/v1/rpc/cet_get_usage",
                json={"p_api_key": ""},
                headers={"apikey": cfg.supabase_key(),
                         "Authorization": f"Bearer {cfg.supabase_key()}",
                         "Content-Type": "application/json"},
                timeout=20)
            alive = r.ok
        except Exception:
            alive = False
        print(f"  {ok if alive else ko} base (écriture directe, sans serveur) :",
              sb, "(répond)" if alive else "(pas de réponse — réseau ?)")
    else:
        url = cfg.push_url().rstrip("/")
        try:
            r = engine.requests.get(url + "/", timeout=60)
            alive = r.ok
        except Exception:
            alive = False
        print(f"  {ok if alive else ko} serveur :",
              url, "(répond)" if alive else "(pas de réponse — Render dort ~50s ?)")

    # 4) service d'arrière-plan installé ?
    import subprocess
    svc = False
    try:
        if sys.platform.startswith("win"):
            q = subprocess.run(["schtasks", "/Query", "/TN", _SERVICE_NAME],
                               capture_output=True, text=True)
            svc = q.returncode == 0
        elif sys.platform == "darwin":
            svc = (Path.home() / "Library" / "LaunchAgents"
                   / (_LAUNCHD_LABEL + ".plist")).exists()
        else:
            svc = (Path.home() / ".config" / "systemd" / "user"
                   / _SYSTEMD_UNIT).exists()
    except Exception:
        pass
    print(f"  {ok if svc else '·'} service d'arrière-plan :",
          "installé" if svc else "non installé (`claude-push install-service`)")

    # 5) repli local
    up = cfg.usage_path()
    print(f"  · dernier envoi local :", up, "(présent)" if up.exists() else "(absent)")
    print()
    return 0


def cmd_pair(args):
    """Appaire cet ordinateur à un compte SANS copier-coller de clé (device-flow).

    Flux (façon Stripe CLI / RFC 8628) :
      1. POST /pair/start → le serveur renvoie un code court (XXXX-XXXX) + une URL.
      2. On affiche le code + on ouvre le navigateur sur l'URL (la PWA, déjà
         connectée). L'utilisateur VÉRIFIE que le code affiché ici = celui de la
         PWA (anti-phishing), puis clique « Confirmer ».
      3. On interroge /pair/poll toutes les 2 s jusqu'à recevoir la clé cet_,
         qu'on écrit dans config.json. Fini : plus jamais de clé à recopier.
    """
    import webbrowser

    url = cfg.push_url().rstrip("/")
    print("claude-push pair — brancher cet ordinateur")

    # 1) démarrer l'appairage
    try:
        r = engine.requests.post(url + "/pair/start", timeout=60)
    except Exception as e:
        print("  ✗ Impossible de joindre le serveur :", e)
        print("    (Render s'endort ; réessaie dans ~1 min.)")
        return 1
    if r.status_code == 501:
        print("  ✗ L'appairage n'est pas disponible sur ce serveur "
              "(mode multi-tenant requis).")
        return 1
    if not r.ok:
        print("  ✗ Le serveur a refusé de démarrer l'appairage :", r.status_code)
        return 1
    data = r.json()
    code = data.get("code", "")
    confirm_url = data.get("confirm_url", "")
    expires_in = int(data.get("expires_in", 600))

    # 2) afficher le code + ouvrir la PWA (ET imprimer l'URL en clair : le
    #    webbrowser peut échouer, notamment en SSH/headless).
    print()
    print("  ┌─────────────────────────────────────────────┐")
    print("  │  Ton code d'appairage :   " + code.ljust(18) + "│")
    print("  └─────────────────────────────────────────────┘")
    print()
    print("  1. Ouvre cette page (elle devrait s'ouvrir toute seule) :")
    print("       " + (confirm_url or (url + "/?pair=" + code)))
    print("  2. Vérifie que le code affiché est bien : " + code)
    print("  3. Clique « Confirmer » dans l'app.")
    print()
    print(f"  (Le code expire dans {expires_in // 60} min. En attente…)")
    try:
        if confirm_url:
            webbrowser.open(confirm_url)
    except Exception:
        pass

    # 3) poll jusqu'à la clé (ou expiration)
    deadline = time.time() + expires_in
    while time.time() < deadline:
        time.sleep(2)
        try:
            pr = engine.requests.get(url + "/pair/poll",
                                     params={"code": code}, timeout=30)
        except Exception:
            continue  # réseau capricieux : on retente
        if pr.status_code in (404, 410):
            print("  ✗ Code expiré ou déjà utilisé. Relance `claude-push pair`.")
            return 1
        if not pr.ok:
            continue
        body = pr.json()
        st = body.get("status")
        if st == "ready" and body.get("api_key"):
            cfg.save_config({"api_key": body["api_key"]})
            print("  ✓ C'est branché ! Ta clé est enregistrée dans",
                  cfg.config_file())
            print("    Lance `claude-push install-service` pour que ça tourne "
                  "tout seul au démarrage.")
            return 0
        if st == "expired":
            print("  ✗ Code expiré. Relance `claude-push pair`.")
            return 1
        # sinon : pending, on continue d'attendre
    print("  ✗ Temps écoulé sans confirmation. Relance `claude-push pair`.")
    return 1


# --- Service d'arrière-plan cross-OS (per-user, SANS admin/sudo) ------------
# Whitehat : on installe un service dans l'espace UTILISATEUR uniquement, jamais
# en admin ; `claude-push uninstall` le retire intégralement en une commande.

_SERVICE_NAME = "ClaudeEatsTokens"        # Windows (Task Scheduler)
_LAUNCHD_LABEL = "com.claudeeats.push"    # macOS (LaunchAgent)
_SYSTEMD_UNIT = "claude-eats.service"     # Linux (systemd --user)


def _exe_path():
    """Chemin de l'exécutable claude-push installé (posé par uv/pip), pour que le
    service pointe sur un binaire STABLE (pas un python volatil)."""
    import shutil
    exe = shutil.which("claude-push")
    if exe:
        return exe
    # repli : relancer via l'interpréteur courant + le module
    return None


def cmd_install_service(args):
    """Installe un service per-user qui lance `claude-push` au démarrage."""
    import subprocess
    plat = sys.platform
    exe = _exe_path()
    print("claude-push install-service — que ça tourne tout seul au démarrage")

    if not cfg.api_key() and not cfg.push_secret():
        print("  ⚠  Aucune clé de connexion. Lance d'abord `claude-push pair`.")
        return 1

    if plat.startswith("win"):
        # Tâche planifiée au logon. L'exe posé par uv/pip est un vrai binaire sans
        # fenêtre console (plus besoin de pythonw/.vbs).
        target = exe or (sys.executable + " -m claude_eats.cli")
        try:
            subprocess.run(
                ["schtasks", "/Create", "/SC", "ONLOGON", "/TN", _SERVICE_NAME,
                 "/TR", f'"{target}"', "/F", "/RL", "LIMITED"],
                check=True, capture_output=True, text=True)
            print("  ✓ Tâche planifiée créée (au démarrage de session).")
            print("    Elle démarrera au prochain login. Pour lancer tout de "
                  "suite : ouvre le Planificateur de tâches ou relance ta session.")
            print("    Retrait : claude-push uninstall")
            return 0
        except Exception as e:
            print("  ✗ Échec de création de la tâche :", e)
            return 1

    if plat == "darwin":
        from pathlib import Path
        target = exe or (sys.executable)
        prog_args = [target] if exe else [sys.executable, "-m", "claude_eats.cli"]
        la_dir = Path.home() / "Library" / "LaunchAgents"
        la_dir.mkdir(parents=True, exist_ok=True)
        plist = la_dir / (_LAUNCHD_LABEL + ".plist")
        args_xml = "".join(f"    <string>{a}</string>\n" for a in prog_args)
        plist.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
            '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
            '<plist version="1.0"><dict>\n'
            f'  <key>Label</key><string>{_LAUNCHD_LABEL}</string>\n'
            '  <key>ProgramArguments</key><array>\n' + args_xml + '  </array>\n'
            '  <key>RunAtLoad</key><true/>\n'
            '  <key>KeepAlive</key><true/>\n'
            '</dict></plist>\n', encoding="utf-8")
        try:
            uid = os.getuid()
            subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(plist)],
                           capture_output=True, text=True)
            print("  ✓ LaunchAgent installé :", plist)
            print("    Il tourne maintenant et redémarrera à chaque session.")
            print("    Retrait : claude-push uninstall")
            return 0
        except Exception as e:
            print("  ✗ Échec launchctl :", e, "— plist écrit dans", plist)
            return 1

    # Linux : systemd --user
    from pathlib import Path
    target = exe or (sys.executable + " -m claude_eats.cli")
    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit = unit_dir / _SYSTEMD_UNIT
    unit.write_text(
        "[Unit]\nDescription=Claude Eats Tokens push agent\n\n"
        "[Service]\n" + f"ExecStart={target}\n" + "Restart=always\nRestartSec=10\n\n"
        "[Install]\nWantedBy=default.target\n", encoding="utf-8")
    try:
        subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
        subprocess.run(["systemctl", "--user", "enable", "--now", _SYSTEMD_UNIT],
                       check=True, capture_output=True, text=True)
        # survivre sans session ouverte
        subprocess.run(["loginctl", "enable-linger", os.environ.get("USER", "")],
                       capture_output=True)
        print("  ✓ Service systemd --user activé :", unit)
        print("    Retrait : claude-push uninstall")
        return 0
    except Exception as e:
        print("  ✗ Échec systemd :", e, "— unit écrit dans", unit)
        return 1


def cmd_uninstall(args):
    """Retire complètement le service per-user (kill-switch whitehat, 1 commande)."""
    import subprocess
    from pathlib import Path
    plat = sys.platform
    print("claude-push uninstall — arrêter le service d'arrière-plan")

    if plat.startswith("win"):
        try:
            subprocess.run(["schtasks", "/Delete", "/TN", _SERVICE_NAME, "/F"],
                           check=True, capture_output=True, text=True)
            print("  ✓ Tâche planifiée supprimée.")
            return 0
        except Exception as e:
            print("  (rien à retirer, ou échec :", e, ")")
            return 0

    if plat == "darwin":
        plist = Path.home() / "Library" / "LaunchAgents" / (_LAUNCHD_LABEL + ".plist")
        try:
            uid = os.getuid()
            subprocess.run(["launchctl", "bootout", f"gui/{uid}/{_LAUNCHD_LABEL}"],
                           capture_output=True, text=True)
        except Exception:
            pass
        try:
            plist.unlink(missing_ok=True)
        except Exception:
            pass
        print("  ✓ LaunchAgent retiré.")
        return 0

    # Linux
    try:
        subprocess.run(["systemctl", "--user", "disable", "--now", _SYSTEMD_UNIT],
                       capture_output=True, text=True)
    except Exception:
        pass
    try:
        (Path.home() / ".config" / "systemd" / "user" / _SYSTEMD_UNIT).unlink(missing_ok=True)
    except Exception:
        pass
    print("  ✓ Service systemd --user retiré.")
    return 0


def build_parser():
    """Construit le parseur argparse avec ses sous-commandes.

    La commande par défaut (sans sous-commande) = la boucle de push. Les options
    de push (--once/--interval/--verbose/--refresh-every/--no-refresh) sont donc
    aussi acceptées au niveau racine, pour `claude-push --once` etc.
    """
    ap = argparse.ArgumentParser(
        prog="claude-push",
        description="Claude Eats Tokens — pousse ta conso de tokens Claude vers la PWA.",
    )

    def add_push_opts(p):
        p.add_argument("--once", action="store_true",
                       help="un seul envoi puis sortie (sinon : boucle)")
        p.add_argument("--verbose", action="store_true",
                       help="diagnostic de parsing")
        p.add_argument("--interval", type=int,
                       default=int(os.environ.get("INTERVAL", "60")),
                       help="secondes entre deux envois (défaut 60)")
        p.add_argument("--refresh-every", type=int,
                       default=int(os.environ.get("REFRESH_EVERY",
                                                  str(DEFAULT_REFRESH_EVERY))),
                       help="capte le vrai %% officiel des fenêtres tous les N cycles")
        p.add_argument("--no-refresh", action="store_true",
                       help="ne pas capter les fenêtres officielles (pas de claude -p)")

    # options de push au niveau racine (commande par défaut)
    add_push_opts(ap)
    ap.set_defaults(func=cmd_push)

    sub = ap.add_subparsers(dest="command", metavar="<commande>")

    p_push = sub.add_parser("push", help="boucle de push (défaut)")
    add_push_opts(p_push)
    p_push.set_defaults(func=cmd_push)

    sub.add_parser("doctor", help="diagnostic de l'installation").set_defaults(func=cmd_doctor)
    sub.add_parser("pair", help="brancher cet ordinateur (sans copier de clé)").set_defaults(func=cmd_pair)
    sub.add_parser("install-service",
                   help="lancer au démarrage (tâche/service per-user)").set_defaults(func=cmd_install_service)
    sub.add_parser("uninstall",
                   help="retirer le service d'arrière-plan").set_defaults(func=cmd_uninstall)

    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    func = getattr(args, "func", cmd_push)
    return func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
