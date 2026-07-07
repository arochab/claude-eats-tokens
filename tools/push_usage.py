"""
push_usage.py — SHIM de rétrocompat.

Le moteur (agrégation + push) a été déplacé dans le package installable
`claude_eats.push_usage` (voir pyproject.toml, commande `claude-push`). Ce
fichier reste pour ne pas casser les .bat existants (DEMARRER.bat / moteur.bat)
qui appellent `python tools/push_usage.py --once`.

Il ré-exporte le namespace du module (build/push/official_windows… — utile si un
autre script importait ces fonctions) et délègue l'exécution à son `main()`.
Ne rien ajouter ici : toute logique vit dans claude_eats/push_usage.py.

NB : le repli local n'est plus `../../data/usage.json` mais le dossier de config
utilisateur (~/.config/claude-eats/usage.json), car une fois le moteur installé
le dépôt n'existe plus à côté. Voir claude_eats/config.py.
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from claude_eats import push_usage as _canonical  # noqa: E402

_g = globals()
for _name in dir(_canonical):
    if _name.startswith("__") and _name.endswith("__"):
        continue
    _g[_name] = getattr(_canonical, _name)
del _g, _name


if __name__ == "__main__":
    _canonical.main()
