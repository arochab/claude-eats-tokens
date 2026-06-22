"""
Tests du serveur Flask (tests/test_server.py) — sans réseau.

On stub save_to_gist/load_from_gist pour ne jamais sortir. Couvre la sécurité
(secret timing-safe, validation payload) et la fraîcheur exposée.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

# secret de test AVANT import du module (lu au chargement)
os.environ["PUSH_SECRET"] = "test-secret-123"
os.environ.pop("GITHUB_TOKEN", None)  # pas de Gist -> pas de réseau
os.environ.pop("GIST_ID", None)

import app as server  # noqa: E402

GOOD = {
    "schema": 2, "totals": {"total": 1000, "input": 10, "output": 20,
                            "cacheCreate": 5, "cacheRead": 965, "cost": 0.5},
    "timeline": [], "models": [], "projects": [],
}


class TestServer(unittest.TestCase):
    def setUp(self):
        server.app.testing = True
        self.c = server.app.test_client()
        server._cache["data"] = None
        server._cache["ts"] = 0

    def test_push_requires_secret(self):
        r = self.c.post("/push", json=GOOD)  # pas d'en-tête
        self.assertEqual(r.status_code, 401)

    def test_push_wrong_secret(self):
        r = self.c.post("/push", json=GOOD, headers={"X-Push-Secret": "nope"})
        self.assertEqual(r.status_code, 401)

    def test_push_good_secret_accepts(self):
        r = self.c.post("/push", json=GOOD, headers={"X-Push-Secret": "test-secret-123"})
        self.assertEqual(r.status_code, 200)  # pas de Gist configurée -> 200
        self.assertTrue(r.get_json()["ok"])

    def test_push_rejects_malformed_payload(self):
        bad = [{"totals": None}, {"totals": "x"}, {"totals": {"total": "nan"}},
               {"nope": 1}, {"totals": {"total": 1}, "models": "notalist"}]
        for b in bad:
            r = self.c.post("/push", json=b, headers={"X-Push-Secret": "test-secret-123"})
            self.assertEqual(r.status_code, 400, msg=f"devrait rejeter {b}")

    def test_usage_404_when_empty(self):
        r = self.c.get("/usage.json")
        self.assertEqual(r.status_code, 404)

    def test_usage_returns_data_with_age(self):
        self.c.post("/push", json=GOOD, headers={"X-Push-Secret": "test-secret-123"})
        r = self.c.get("/usage.json")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body["totals"]["total"], 1000)
        self.assertIn("serverAgeSeconds", body)
        self.assertEqual(r.headers.get("Cache-Control"), "no-store")

    def test_payload_validator_unit(self):
        self.assertTrue(server._valid_payload(GOOD))
        self.assertFalse(server._valid_payload({"totals": {"total": None}}))
        self.assertFalse(server._valid_payload("not a dict"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
