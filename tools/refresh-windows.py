#!/usr/bin/env python3
"""
refresh-windows.py — SHIM de rétrocompat (nom à tiret conservé pour moteur.bat).

Le code canonique vit dans le package `claude_eats.refresh_windows` (nom SANS
tiret, importable). Ce fichier délègue simplement l'exécution, pour que
`python tools/refresh-windows.py` (appelé par moteur.bat tous les REFRESH_EVERY
cycles) continue de marcher à l'identique.
Ne rien ajouter ici : toute logique vit dans claude_eats/refresh_windows.py.
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from claude_eats import refresh_windows as _canonical  # noqa: E402

_g = globals()
for _name in dir(_canonical):
    if _name.startswith("__") and _name.endswith("__"):
        continue
    _g[_name] = getattr(_canonical, _name)
del _g, _name


if __name__ == "__main__":
    sys.exit(_canonical.main())
