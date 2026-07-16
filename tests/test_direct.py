"""
Tests de la voie DIRECTE (tests/test_direct.py) — sans réseau.

Le moteur écrit dans Supabase sans serveur intermédiaire (migration 0005).
Deux choses valent d'être verrouillées ici :

1. Le CHOIX de la voie (cfg.use_direct) : un self-hoster qui n'a qu'un
   PUSH_SECRET doit garder la voie serveur historique, intacte.

2. Le FAUX SUCCÈS (push_direct) : PostgREST répond **HTTP 200 avec un corps
   `false`** quand la fonction SQL refuse la clé. Un code qui ne testerait que
   `r.ok` pousserait dans le vide en affichant « OK » — exactement la panne
   silencieuse qui a coûté 2 jours de données en juillet. C'est le test le plus
   important du fichier.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from claude_eats import config as cfg  # noqa: E402
from claude_eats import push_usage as engine  # noqa: E402

GOOD = {"schema": 5, "totals": {"total": 1000}}

_ENV_KEYS = ("CET_API_KEY", "PUSH_SECRET", "PUSH_URL",
             "CET_SUPABASE_URL", "CET_SUPABASE_KEY", "CET_FORCE_SERVER",
             "CLAUDE_EATS_HOME")


class _EnvBase(unittest.TestCase):
    """Isole l'environnement ET le config.json (sinon la vraie clé d'Adam fuit
    dans les tests et `use_direct` renvoie True partout)."""

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in _ENV_KEYS}
        for k in _ENV_KEYS:
            os.environ.pop(k, None)
        # config_dir() vide -> _load_config() renvoie {} -> aucune clé héritée.
        self._tmp = self.enterContext(mock.patch.object(
            cfg, "_load_config", return_value={}))

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


class TestUseDirect(_EnvBase):
    def test_no_credentials_is_not_direct(self):
        self.assertFalse(cfg.use_direct())

    def test_api_key_alone_is_direct(self):
        # URL + clé publishable ont des valeurs par défaut : la clé suffit.
        os.environ["CET_API_KEY"] = "cet_" + "x" * 43
        self.assertTrue(cfg.use_direct())

    def test_push_secret_alone_stays_on_server(self):
        # Self-host historique : PUSH_SECRET sans clé cet_ -> voie serveur.
        os.environ["PUSH_SECRET"] = "un-secret-self-host"
        self.assertFalse(cfg.use_direct())

    def test_force_server_overrides_api_key(self):
        os.environ["CET_API_KEY"] = "cet_" + "x" * 43
        os.environ["CET_FORCE_SERVER"] = "1"
        self.assertFalse(cfg.use_direct())

    def test_env_beats_default_url(self):
        os.environ["CET_SUPABASE_URL"] = "https://exemple.supabase.co"
        self.assertEqual(cfg.supabase_url(), "https://exemple.supabase.co")

    def test_default_url_is_https(self):
        # Les chiffres ne doivent jamais partir en clair.
        self.assertTrue(cfg.supabase_url().startswith("https://"))


class _Resp:
    """Réponse requests minimale."""

    def __init__(self, status=200, body=True, raises=False):
        self.status_code = status
        self.ok = 200 <= status < 300
        self._body = body
        self._raises = raises

    def json(self):
        if self._raises:
            raise ValueError("pas du JSON")
        return self._body


class TestPushDirect(_EnvBase):
    def test_true_body_is_success(self):
        with mock.patch.object(engine.requests, "post", return_value=_Resp(200, True)):
            ok, label = engine.push_direct(GOOD, "cet_bonne_cle")
        self.assertTrue(ok)
        self.assertEqual(label, "OK")

    def test_false_body_on_http_200_is_a_failure(self):
        """LE test qui compte : 200 + `false` = clé refusée, PAS un succès."""
        with mock.patch.object(engine.requests, "post", return_value=_Resp(200, False)):
            ok, label = engine.push_direct(GOOD, "cet_mauvaise_cle")
        self.assertFalse(ok)
        self.assertIn("ERR", label)  # le moteur détecte "ERR" dans la dernière ligne

    def test_http_error_is_a_failure(self):
        with mock.patch.object(engine.requests, "post", return_value=_Resp(503, None)):
            ok, label = engine.push_direct(GOOD, "cet_cle")
        self.assertFalse(ok)
        self.assertIn("503", label)

    def test_unreadable_body_is_a_failure(self):
        with mock.patch.object(engine.requests, "post", return_value=_Resp(200, None, raises=True)):
            ok, label = engine.push_direct(GOOD, "cet_cle")
        self.assertFalse(ok)
        self.assertIn("ERR", label)

    def test_key_travels_in_body_never_in_url(self):
        """La clé ne doit jamais finir dans une URL (historique, logs, référents)."""
        seen = {}

        def _capture(url, **kw):
            seen["url"] = url
            seen["json"] = kw.get("json")
            seen["headers"] = kw.get("headers")
            return _Resp(200, True)

        with mock.patch.object(engine.requests, "post", side_effect=_capture):
            engine.push_direct(GOOD, "cet_secrete")

        self.assertNotIn("cet_secrete", seen["url"])
        self.assertEqual(seen["json"]["p_api_key"], "cet_secrete")
        self.assertEqual(seen["json"]["p_data"], GOOD)
        self.assertTrue(seen["url"].endswith("/rest/v1/rpc/cet_push_usage"))

    def test_calls_the_rpc_not_the_table(self):
        """Passer par la fonction, jamais par la table : la table est en RLS."""
        seen = {}

        def _capture(url, **kw):
            seen["url"] = url
            return _Resp(200, True)

        with mock.patch.object(engine.requests, "post", side_effect=_capture):
            engine.push_direct(GOOD, "cet_cle")
        self.assertNotIn("/rest/v1/usage_blobs", seen["url"])
        self.assertIn("/rpc/", seen["url"])


class TestRunCycleRouting(_EnvBase):
    """run_cycle doit router vers la bonne voie, et compter les échecs."""

    def setUp(self):
        super().setUp()
        self.out = self.enterContext(mock.patch.object(
            engine.cfg, "usage_path")).return_value
        self.enterContext(mock.patch.object(engine, "build", return_value=GOOD))

    def test_direct_route_calls_push_direct_not_server(self):
        with mock.patch.object(engine, "push_direct", return_value=(True, "OK")) as pd, \
             mock.patch.object(engine, "push") as srv:
            errs, ok = engine.run_cycle("https://serveur.example", api_key="cet_k",
                                        out=self.out, direct=True)
        pd.assert_called_once()
        srv.assert_not_called()
        self.assertEqual(ok, "OK")
        self.assertEqual(errs, 0)

    def test_legacy_route_calls_server_not_direct(self):
        with mock.patch.object(engine, "push_direct") as pd, \
             mock.patch.object(engine, "push", return_value=_Resp(200, {})) as srv:
            errs, ok = engine.run_cycle("https://serveur.example", secret="s",
                                        out=self.out, direct=False)
        srv.assert_called_once()
        pd.assert_not_called()
        self.assertEqual(ok, "OK")

    def test_direct_failure_increments_error_counter(self):
        with mock.patch.object(engine, "push_direct", return_value=(False, "ERR cle refusee")):
            errs, ok = engine.run_cycle("https://serveur.example", api_key="cet_k",
                                        out=self.out, direct=True, consecutive_errors=2)
        self.assertEqual(errs, 3)     # 2 -> 3 : le watchdog voit la panne
        self.assertIn("ERR", ok)

    def test_direct_success_resets_error_counter(self):
        with mock.patch.object(engine, "push_direct", return_value=(True, "OK")):
            errs, _ = engine.run_cycle("https://serveur.example", api_key="cet_k",
                                       out=self.out, direct=True, consecutive_errors=7)
        self.assertEqual(errs, 0)


if __name__ == "__main__":
    unittest.main()
