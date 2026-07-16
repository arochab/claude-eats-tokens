"""
Tests de l'appairage côté CLI (tests/test_pairing.py) — sans réseau.

L'appairage est le flux le plus délicat du produit : il livre une clé. Ce qui
est verrouillé ici :

1. **La clé ne voyage jamais dans une URL** (historique, logs, référents).
2. **`pair` va jusqu'au bout** : il installe ET démarre le service. Avant, il
   fallait enchaîner une 2e commande à la main, et sur Windows attendre la
   session suivante — deux marches sur lesquelles on perdait les gens.
3. **Un échec d'installation n'efface pas la clé** : elle est acquise, on rend 0
   et on le dit. Perdre la clé pour un service raté serait absurde.
4. **Un code expiré/consommé s'arrête net** au lieu de boucler 10 minutes.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from claude_eats import cli  # noqa: E402
from claude_eats import config as cfg  # noqa: E402

_ENV_KEYS = ("CET_API_KEY", "CET_SUPABASE_URL", "CET_SUPABASE_KEY",
             "CET_FRONTEND_URL", "PUSH_SECRET", "PUSH_URL")


class _Base(unittest.TestCase):
    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in _ENV_KEYS}
        for k in _ENV_KEYS:
            os.environ.pop(k, None)
        # Isole du vrai config.json (sinon la clé d'Adam fuit dans les tests).
        self.enterContext(mock.patch.object(cfg, "_load_config", return_value={}))
        self.enterContext(mock.patch.object(cli.time, "sleep"))
        self.enterContext(mock.patch("webbrowser.open"))
        self.saved = self.enterContext(mock.patch.object(cfg, "save_config"))

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


class TestFrontendUrl(_Base):
    def test_default_is_the_public_pwa(self):
        self.assertTrue(_https(cli._frontend_url()))

    def test_env_overrides(self):
        os.environ["CET_FRONTEND_URL"] = "https://exemple.test/app/"
        self.assertEqual(cli._frontend_url(), "https://exemple.test/app")


def _https(u):
    return u.startswith("https://")


class TestSbRpc(_Base):
    def test_body_carries_args_and_url_stays_clean(self):
        seen = {}

        def _post(url, **kw):
            seen["url"] = url
            seen["json"] = kw.get("json")
            return mock.Mock(**{"json.return_value": {"ok": True},
                                "raise_for_status.return_value": None})

        with mock.patch.object(cli.engine.requests, "post", side_effect=_post):
            cli._sb_rpc("cet_pair_confirm", {"p_api_key": "cet_secrete"})

        self.assertNotIn("cet_secrete", seen["url"])
        self.assertEqual(seen["json"]["p_api_key"], "cet_secrete")
        self.assertTrue(seen["url"].endswith("/rest/v1/rpc/cet_pair_confirm"))


class TestCmdPair(_Base):
    """cmd_pair enchaîne start -> poll -> save -> install. On mocke _sb_rpc."""

    def _run(self, responses, install_rc=0):
        """responses : liste de retours successifs de _sb_rpc."""
        with mock.patch.object(cli, "_sb_rpc", side_effect=responses) as rpc, \
             mock.patch.object(cli, "cmd_install_service",
                               return_value=install_rc) as inst:
            rc = cli.cmd_pair(mock.Mock())
        return rc, rpc, inst

    def test_happy_path_saves_key_and_installs_service(self):
        rc, rpc, inst = self._run([
            {"code": "WDJB-MJHT", "expires_in": 600},
            {"status": "pending"},
            {"status": "ready", "api_key": "cet_la_vraie_cle"},
        ])
        self.assertEqual(rc, 0)
        self.saved.assert_called_once_with({"api_key": "cet_la_vraie_cle"})
        # LE point : on ne s'arrête pas a la cle, on va jusqu'a "ca tourne".
        inst.assert_called_once()

    def test_install_failure_keeps_the_key_and_still_succeeds(self):
        rc, _, inst = self._run([
            {"code": "WDJB-MJHT", "expires_in": 600},
            {"status": "ready", "api_key": "cet_la_vraie_cle"},
        ], install_rc=1)
        self.saved.assert_called_once_with({"api_key": "cet_la_vraie_cle"})
        inst.assert_called_once()
        self.assertEqual(rc, 0)  # la cle est acquise : ce n'est PAS un echec

    def test_rate_limited_stops_immediately(self):
        rc, rpc, inst = self._run([{"error": "rate limited"}])
        self.assertEqual(rc, 1)
        self.assertEqual(rpc.call_count, 1)   # aucun poll inutile
        inst.assert_not_called()
        self.saved.assert_not_called()

    def test_expired_code_stops_instead_of_looping(self):
        rc, _, inst = self._run([
            {"code": "WDJB-MJHT", "expires_in": 600},
            {"status": "expired"},
        ])
        self.assertEqual(rc, 1)
        inst.assert_not_called()
        self.saved.assert_not_called()

    def test_consumed_code_stops(self):
        rc, _, _ = self._run([
            {"code": "WDJB-MJHT", "expires_in": 600},
            {"status": "consumed"},
        ])
        self.assertEqual(rc, 1)
        self.saved.assert_not_called()

    def test_start_unreachable_is_a_clean_failure(self):
        with mock.patch.object(cli, "_sb_rpc", side_effect=RuntimeError("réseau")), \
             mock.patch.object(cli, "cmd_install_service") as inst:
            rc = cli.cmd_pair(mock.Mock())
        self.assertEqual(rc, 1)
        inst.assert_not_called()
        self.saved.assert_not_called()

    def test_network_hiccup_during_poll_is_retried(self):
        # Un poll qui casse ne doit pas tuer l'appairage : on retente.
        rc, _, inst = self._run([
            {"code": "WDJB-MJHT", "expires_in": 600},
            RuntimeError("coupure passagère"),
            {"status": "ready", "api_key": "cet_la_vraie_cle"},
        ])
        self.assertEqual(rc, 0)
        self.saved.assert_called_once_with({"api_key": "cet_la_vraie_cle"})
        inst.assert_called_once()

    def test_confirm_url_carries_the_code_not_a_key(self):
        printed = []
        with mock.patch.object(cli, "_sb_rpc", side_effect=[
            {"code": "WDJB-MJHT", "expires_in": 600},
            {"status": "ready", "api_key": "cet_la_vraie_cle"},
        ]), mock.patch.object(cli, "cmd_install_service", return_value=0), \
             mock.patch("builtins.print", side_effect=lambda *a, **k: printed.append(" ".join(map(str, a)))):
            cli.cmd_pair(mock.Mock())
        out = "\n".join(printed)
        self.assertIn("?pair=WDJB-MJHT", out)      # le code, lui, peut circuler
        self.assertNotIn("cet_la_vraie_cle", out)  # la cle, JAMAIS affichee


if __name__ == "__main__":
    unittest.main()
