"""
usage_core.py — SHIM de rétrocompat.

Le code canonique a été déplacé dans le package installable
`claude_eats.usage_core` (voir pyproject.toml). Ce fichier reste pour ne pas
casser :
  - les tests (`tests/test_usage_core.py` fait `sys.path.insert(.../tools)` puis
    `import usage_core`),
  - les autres scripts de `tools/` (make_demo.py) et les .bat.

Il ré-exporte TOUT le namespace du module canonique (y compris les noms privés
comme `_looks_like_username`, référencés par les tests). Ne rien ajouter ici :
toute logique vit dans claude_eats/usage_core.py.
"""
import os
import sys

# Rend le package `claude_eats` importable même si seul tools/ est sur sys.path
# (cas des tests). La racine du dépôt est le parent de ce dossier tools/.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from claude_eats import usage_core as _canonical  # noqa: E402

# Ré-exporte tout le namespace public + privé (constantes, fonctions, privés).
_g = globals()
for _name in dir(_canonical):
    if _name.startswith("__") and _name.endswith("__"):
        continue
    _g[_name] = getattr(_canonical, _name)
del _g, _name
