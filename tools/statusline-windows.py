#!/usr/bin/env python3
"""
statusline-windows.py — SHIM de rétrocompat (nom à tiret conservé pour
~/.claude/settings.json et les .bat existants).

Le code canonique vit dans le package `claude_eats.statusline_windows` (nom SANS
tiret, importable). Ce fichier ré-exporte son namespace et délègue l'exécution,
pour :
  - rester un statusline fonctionnel (Claude Code lance ce chemin),
  - ne pas casser `tests/test_statusline.py` qui le charge par chemin
    (spec_from_file_location) et accède à `_clean_pct`, `extract_windows`,
    `status_line`.
Ne rien ajouter ici : toute logique vit dans claude_eats/statusline_windows.py.
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from claude_eats import statusline_windows as _canonical  # noqa: E402

_g = globals()
for _name in dir(_canonical):
    if _name.startswith("__") and _name.endswith("__"):
        continue
    _g[_name] = getattr(_canonical, _name)
del _g, _name


if __name__ == "__main__":
    _canonical.main()
