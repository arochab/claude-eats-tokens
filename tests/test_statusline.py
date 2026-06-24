"""
Tests du capteur de fenêtres officielles (tools/statusline-windows.py).

On vérifie la logique PURE d'extraction du vrai % serveur depuis le JSON que
Claude Code pousse sur stdin, et les garde-fous contre les valeurs aberrantes.
"""
import importlib.util
import os
import sys
import unittest

# le fichier a un tiret -> import par chemin
_PATH = os.path.join(os.path.dirname(__file__), "..", "tools", "statusline-windows.py")
_spec = importlib.util.spec_from_file_location("statusline_windows", _PATH)
sw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sw)


class TestCleanPct(unittest.TestCase):
    def test_valeur_normale(self):
        self.assertEqual(sw._clean_pct(23.5, 1738425600), 23.5)
        self.assertEqual(sw._clean_pct(0, 1), 0)
        self.assertEqual(sw._clean_pct(100, 1), 100)

    def test_hors_bornes_rejete(self):
        self.assertIsNone(sw._clean_pct(-1, 1))
        self.assertIsNone(sw._clean_pct(101, 1))
        self.assertIsNone(sw._clean_pct(1738425600, 1738425600))  # epoch qui a fuité (bug #52326)

    def test_non_numerique(self):
        self.assertIsNone(sw._clean_pct(None, 1))
        self.assertIsNone(sw._clean_pct("abc", 1))


class TestExtractWindows(unittest.TestCase):
    def test_5h_et_7j(self):
        payload = {"rate_limits": {
            "five_hour": {"used_percentage": 88, "resets_at": 1738425600},
            "seven_day": {"used_percentage": 34.2, "resets_at": 1738857600},
        }}
        w = sw.extract_windows(payload)
        self.assertEqual(w["w5hPct"], 88)
        self.assertEqual(w["w5hResetAt"], 1738425600)
        self.assertEqual(w["w7dPct"], 34.2)
        self.assertEqual(w["source"], "statusline")
        self.assertIn("capturedAt", w)

    def test_accepte_utilization_endpoint(self):
        # l'endpoint OAuth nomme le champ "utilization" au lieu de "used_percentage"
        payload = {"rate_limits": {"five_hour": {"utilization": 50, "resets_at": 1}}}
        w = sw.extract_windows(payload)
        self.assertEqual(w["w5hPct"], 50)

    def test_opus_et_sonnet_bonus(self):
        payload = {"rate_limits": {
            "five_hour": {"used_percentage": 10, "resets_at": 1},
            "seven_day_opus": {"used_percentage": 72, "resets_at": 2},
        }}
        w = sw.extract_windows(payload)
        self.assertEqual(w["w7dOpusPct"], 72)

    def test_absence_rate_limits_retourne_none(self):
        self.assertIsNone(sw.extract_windows({}))
        self.assertIsNone(sw.extract_windows({"rate_limits": None}))
        self.assertIsNone(sw.extract_windows(None))

    def test_fenetres_vides_ne_creent_rien(self):
        # rate_limits présent mais sans % exploitable -> None (on n'écrase pas le relais)
        payload = {"rate_limits": {"five_hour": {"used_percentage": None}}}
        self.assertIsNone(sw.extract_windows(payload))

    def test_epoch_aberrant_ignore_la_fenetre(self):
        # used_percentage == resets_at (bug) -> la fenêtre 5h est ignorée, mais 7j passe
        payload = {"rate_limits": {
            "five_hour": {"used_percentage": 1738425600, "resets_at": 1738425600},
            "seven_day": {"used_percentage": 40, "resets_at": 9},
        }}
        w = sw.extract_windows(payload)
        self.assertNotIn("w5hPct", w)
        self.assertEqual(w["w7dPct"], 40)


class TestStatusLine(unittest.TestCase):
    def test_ligne_lisible(self):
        line = sw.status_line({"w5hPct": 88, "w7dPct": 34})
        self.assertIn("5 h 88%", line)
        self.assertIn("7 j 34%", line)

    def test_ligne_attente(self):
        self.assertIn("attente", sw.status_line(None))


if __name__ == "__main__":
    unittest.main()
