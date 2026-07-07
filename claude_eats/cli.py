"""
cli.py — point d'entrée de la commande `claude-push` (voir [project.scripts]).

Une fois le moteur installé (`uv tool install "git+https://…"` ou `pip install`),
l'utilisateur lance simplement :

    claude-push                 # boucle de push (défaut) + refresh périodique
    claude-push --once          # un seul envoi puis sortie
    claude-push doctor          # diagnostic (stub — un autre agent l'étoffera)
    claude-push pair            # appairage de l'appareil (stub)
    claude-push install-service # installe le service/tâche planifiée (stub)
    claude-push uninstall       # retire le service (stub)

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
    """Diagnostic de l'installation (STUB — un autre agent l'implémentera)."""
    print("claude-push doctor — diagnostic")
    print("  dossier de config :", cfg.config_dir())
    print("  repli local        :", cfg.usage_path(),
          "(présent)" if cfg.usage_path().exists() else "(absent)")
    print("  PUSH_URL           :", cfg.push_url())
    print("  clé de connexion   :", "définie" if cfg.api_key() else "absente")
    print("  secret self-host   :", "défini" if cfg.push_secret() else "absent")
    print("\n  (diagnostic complet à venir — stub)")
    return 0


def cmd_pair(args):
    """Appairage de l'appareil au 1er run (STUB — implémenté par un autre agent)."""
    print("claude-push pair — appairage de l'appareil")
    print("  À implémenter (device-pairing). La clé sera stockée dans",
          cfg.config_file())
    return 1


def cmd_install_service(args):
    """Installe le service / tâche planifiée (STUB — un autre agent l'implémentera)."""
    print("claude-push install-service — installation du service d'arrière-plan")
    print("  À implémenter (tâche planifiée Windows / service). Stub.")
    return 1


def cmd_uninstall(args):
    """Retire le service / tâche planifiée (STUB)."""
    print("claude-push uninstall — retrait du service d'arrière-plan")
    print("  À implémenter. Stub.")
    return 1


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
    sub.add_parser("pair", help="appairer cet appareil (stub)").set_defaults(func=cmd_pair)
    sub.add_parser("install-service",
                   help="installer le service d'arrière-plan (stub)").set_defaults(func=cmd_install_service)
    sub.add_parser("uninstall",
                   help="retirer le service d'arrière-plan (stub)").set_defaults(func=cmd_uninstall)

    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    func = getattr(args, "func", cmd_push)
    return func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
