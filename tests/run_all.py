"""
run_all.py — lance toute la suite de tests (Python + Node) en une commande.

    python tests/run_all.py

- Python (stdlib unittest) : logique moteur/serveur (usage_core, push, server).
- Node (node:test) : helpers purs front (pwa/format.js).

Sort en code != 0 si un test échoue (utilisable en CI).
"""
import glob
import os
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.join(ROOT, "tests")


def run(cmd, label):
    print(f"\n=== {label} ===")
    r = subprocess.run(cmd, cwd=ROOT)
    return r.returncode == 0


def main():
    ok = True
    # Python
    ok &= run([sys.executable, "-m", "unittest", "discover", "-s", "tests",
               "-p", "test_*.py"], "Python (unittest)")
    # Node (si dispo)
    mjs = glob.glob(os.path.join(TESTS, "*.mjs"))
    if mjs:
        node = "node"
        try:
            ok &= run([node, "--test", *mjs], "Node (node:test)")
        except FileNotFoundError:
            print("⚠  Node introuvable — tests front sautés.")
    print("\n" + ("✅ TOUT VERT" if ok else "❌ DES TESTS ÉCHOUENT"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
