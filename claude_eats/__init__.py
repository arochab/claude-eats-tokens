"""
claude_eats — moteur packagé de Claude Eats Tokens.

Ce package rend installable (via `uv tool install` / `pip install`) le moteur qui
tournait auparavant comme scripts épars dans `tools/`. Il expose la commande
`claude-push` (voir [project.scripts] dans pyproject.toml -> claude_eats.cli:main).

Le code canonique vit ICI. Les fichiers `tools/*.py` sont désormais de minces
shims qui ré-exportent depuis ce package, pour ne pas casser les tests ni les
scripts .bat existants (repli).
"""

__version__ = "1.0.0"
