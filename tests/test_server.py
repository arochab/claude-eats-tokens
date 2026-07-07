"""
Tests du serveur Flask (tests/test_server.py) — sans réseau.

On stub save_to_gist/load_from_gist pour ne jamais sortir. Couvre la sécurité
(secret timing-safe, validation payload) et la fraîcheur exposée.
Mode multi-tenant testé avec Supabase mocké.
"""
import hashlib
import hmac
import importlib
import json
import os
import sys
import unittest
from unittest import mock
from urllib.parse import quote as up_quote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

# secret de test AVANT import du module (lu au chargement)
os.environ["PUSH_SECRET"] = "test-secret-123"
os.environ.pop("GITHUB_TOKEN", None)  # pas de Gist -> pas de réseau
os.environ.pop("GIST_ID", None)
os.environ.pop("SUPABASE_URL", None)  # pas de multi-tenant par défaut
os.environ.pop("SUPABASE_KEY", None)

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

    def test_health_endpoint(self):
        r = self.c.get("/")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "claude-eats-tokens")
        self.assertIn("multiTenant", body)

    def test_auth_register_disabled_without_supabase(self):
        r = self.c.post("/auth/register", json={"email": "test@example.com"})
        self.assertEqual(r.status_code, 501)

    def test_auth_me_disabled_without_supabase(self):
        r = self.c.get("/auth/me", headers={"X-Api-Key": "cet_test"})
        self.assertEqual(r.status_code, 501)


# ---------------------------------------------------------------------------
# Billing (Lemon Squeezy) — mode multi-tenant
# ---------------------------------------------------------------------------
# Le module `server` est chargé une seule fois, en mode single-tenant (voir en
# haut du fichier). Pour tester le billing on a besoin de MULTI_TENANT=True :
# on pose les env vars Supabase + Lemon Squeezy PUIS on recharge le module via
# importlib.reload dans setUpClass, et on restaure l'état d'origine (env + rechargement
# single-tenant) dans tearDownClass. Ainsi les tests single-tenant du dessus ne
# sont pas affectés. Tout accès Supabase (requests.get/patch) est mocké : aucun
# réseau n'est touché.

LS_WEBHOOK_SECRET_TEST = "whsec-test-abc"
LS_LINK_SECRET_TEST = "linksec-test-xyz"


def _reload_server_with_env(extra_env):
    """Recharge le module server avec des env vars ajoutées. Retourne le module."""
    for k, v in extra_env.items():
        os.environ[k] = v
    return importlib.reload(server)


def _restore_single_tenant():
    """Retire les env multi-tenant/billing et recharge server en single-tenant."""
    for k in ("SUPABASE_URL", "SUPABASE_KEY", "LS_WEBHOOK_SECRET",
              "LS_LINK_SECRET", "LS_CHECKOUT_URL"):
        os.environ.pop(k, None)
    importlib.reload(server)


class _MultiTenantBase(unittest.TestCase):
    """Base : charge server en multi-tenant + billing, restaure ensuite."""

    @classmethod
    def setUpClass(cls):
        cls.srv = _reload_server_with_env({
            "SUPABASE_URL": "https://fake.supabase.co",
            "SUPABASE_KEY": "service-role-fake",
            "LS_WEBHOOK_SECRET": LS_WEBHOOK_SECRET_TEST,
            "LS_LINK_SECRET": LS_LINK_SECRET_TEST,
            "LS_CHECKOUT_URL": "https://store.lemonsqueezy.com/checkout/buy/xyz",
        })
        assert cls.srv.MULTI_TENANT is True

    @classmethod
    def tearDownClass(cls):
        _restore_single_tenant()

    def setUp(self):
        self.srv = type(self).srv
        self.srv.app.testing = True
        self.c = self.srv.app.test_client()


class TestBillingTokens(_MultiTenantBase):
    """Jetons checkout signés + fonction pure derive_plan."""

    def test_make_verify_roundtrip(self):
        uid = "550e8400-e29b-41d4-a716-446655440000"
        tok = self.srv.make_checkout_token(uid)
        self.assertTrue(tok.startswith("ct_"))
        self.assertEqual(self.srv.verify_checkout_token(tok), uid)

    def test_verify_altered_token_returns_none(self):
        uid = "550e8400-e29b-41d4-a716-446655440000"
        tok = self.srv.make_checkout_token(uid)
        altered = tok[:-1] + ("A" if tok[-1] != "A" else "B")  # mute la signature
        self.assertIsNone(self.srv.verify_checkout_token(altered))

    def test_verify_malformed_tokens_return_none(self):
        for bad in (None, "", "ct_", "ct_no-dot", "no-prefix.sig",
                    "ct_.sigonly", "ct_uid.", 12345):
            self.assertIsNone(self.srv.verify_checkout_token(bad),
                              msg=f"devrait rejeter {bad!r}")

    def test_derive_plan_all_statuses(self):
        for status in ("active", "on_trial", "past_due"):
            self.assertEqual(self.srv.derive_plan(status), "pro", msg=status)
        for status in ("cancelled", "paused", "expired", "none", None, "unknown"):
            self.assertEqual(self.srv.derive_plan(status), "free", msg=status)


class TestBillingWebhook(_MultiTenantBase):
    """Route POST /billing/webhook : signature, résolution, idempotence."""

    def _sign(self, raw_bytes):
        return hmac.new(LS_WEBHOOK_SECRET_TEST.encode(), raw_bytes,
                        hashlib.sha256).hexdigest()

    def _payload(self, uid_token=None, status="active", sub_id="sub-42",
                 event="subscription_created", user_email="buyer@example.com"):
        return {
            "meta": {"event_name": event,
                     "custom_data": ({"uid": uid_token} if uid_token else {})},
            "data": {"id": sub_id, "attributes": {
                "status": status, "customer_id": 999,
                "user_email": user_email,
                "renews_at": "2026-08-01T00:00:00Z",
            }},
        }

    def test_valid_signature_updates_user(self):
        uid = "abc-user-id"
        tok = self.srv.make_checkout_token(uid)
        raw = json.dumps(self._payload(uid_token=tok)).encode()
        with mock.patch.object(self.srv, "_sb_update_user",
                               return_value=True) as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        up.assert_called_once()
        called_uid, fields = up.call_args[0]
        self.assertEqual(called_uid, uid)
        self.assertEqual(fields["plan"], "pro")
        self.assertEqual(fields["plan_status"], "active")

    def test_tampered_body_rejected_401(self):
        uid = "abc-user-id"
        tok = self.srv.make_checkout_token(uid)
        raw = json.dumps(self._payload(uid_token=tok)).encode()
        sig = self._sign(raw)
        tampered = bytearray(raw)
        tampered[10] ^= 0x01  # mute un octet -> signature ne correspond plus
        with mock.patch.object(self.srv, "_sb_update_user") as up:
            r = self.c.post("/billing/webhook", data=bytes(tampered),
                            headers={"X-Signature": sig})
        self.assertEqual(r.status_code, 401)
        up.assert_not_called()

    def test_missing_signature_rejected_401(self):
        raw = json.dumps(self._payload()).encode()
        with mock.patch.object(self.srv, "_sb_update_user") as up:
            r = self.c.post("/billing/webhook", data=raw)  # pas de X-Signature
        self.assertEqual(r.status_code, 401)
        up.assert_not_called()

    def test_idempotent_same_state_twice(self):
        uid = "abc-user-id"
        tok = self.srv.make_checkout_token(uid)
        raw = json.dumps(self._payload(uid_token=tok)).encode()
        sig = self._sign(raw)
        with mock.patch.object(self.srv, "_sb_update_user",
                               return_value=True) as up:
            r1 = self.c.post("/billing/webhook", data=raw, headers={"X-Signature": sig})
            r2 = self.c.post("/billing/webhook", data=raw, headers={"X-Signature": sig})
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(up.call_count, 2)
        # État absolu identique aux deux appels (idempotence)
        self.assertEqual(up.call_args_list[0], up.call_args_list[1])

    def test_resolve_by_subscription_id(self):
        # Pas de uid : résolution par ls_subscription_id (mock _sb_get_user_by_sub).
        raw = json.dumps(self._payload(uid_token=None, sub_id="sub-77")).encode()
        with mock.patch.object(self.srv, "_sb_get_user_by_sub",
                               return_value={"id": "u-by-sub"}) as bysub, \
             mock.patch.object(self.srv, "_sb_update_user", return_value=True) as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        bysub.assert_called_once_with("sub-77")
        self.assertEqual(up.call_args[0][0], "u-by-sub")

    def test_resolve_by_email(self):
        # Ni uid ni sub connu : résolution par email.
        raw = json.dumps(self._payload(uid_token=None,
                                       user_email="found@example.com")).encode()
        with mock.patch.object(self.srv, "_sb_get_user_by_sub", return_value=None), \
             mock.patch.object(self.srv, "_sb_get_user_by_email",
                               return_value={"id": "u-by-email"}) as byemail, \
             mock.patch.object(self.srv, "_sb_update_user", return_value=True) as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        byemail.assert_called_once_with("found@example.com")
        self.assertEqual(up.call_args[0][0], "u-by-email")

    def test_unresolved_user_acks_200(self):
        # uid bidon, sub inconnu, email inconnu -> 200 ACK (pas de retry), pas d'update.
        raw = json.dumps(self._payload(uid_token="ct_fake.badsig",
                                       sub_id="sub-unknown")).encode()
        with mock.patch.object(self.srv, "_sb_get_user_by_sub", return_value=None), \
             mock.patch.object(self.srv, "_sb_get_user_by_email", return_value=None), \
             mock.patch.object(self.srv, "_sb_update_user") as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        up.assert_not_called()

    def test_update_failure_returns_500(self):
        uid = "abc-user-id"
        tok = self.srv.make_checkout_token(uid)
        raw = json.dumps(self._payload(uid_token=tok)).encode()
        with mock.patch.object(self.srv, "_sb_update_user", return_value=False):
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 500)

    def test_non_subscription_event_acked(self):
        raw = json.dumps(self._payload(event="order_created")).encode()
        with mock.patch.object(self.srv, "_sb_update_user") as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        up.assert_not_called()

    def test_cancelled_downgrades_to_free(self):
        uid = "abc-user-id"
        tok = self.srv.make_checkout_token(uid)
        raw = json.dumps(self._payload(uid_token=tok, status="cancelled",
                                       event="subscription_updated")).encode()
        with mock.patch.object(self.srv, "_sb_update_user",
                               return_value=True) as up:
            r = self.c.post("/billing/webhook", data=raw,
                            headers={"X-Signature": self._sign(raw)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(up.call_args[0][1]["plan"], "free")


class TestBillingCheckout(_MultiTenantBase):
    """Route GET /billing/checkout : auth + redirection signée."""

    def test_checkout_requires_auth(self):
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value=None):
            r = self.c.get("/billing/checkout?key=bad")
        self.assertEqual(r.status_code, 401)

    def test_checkout_redirects_with_signed_uid(self):
        import urllib.parse as up
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value={"id": "u-123",
                                             "email": "me@example.com"}):
            r = self.c.get("/billing/checkout?key=cet_good")
        self.assertEqual(r.status_code, 302)
        loc = up.unquote(r.headers["Location"])  # Flask ré-encode le Location
        self.assertTrue(loc.startswith(self.srv.LS_CHECKOUT_URL))
        self.assertIn("checkout[email]=me@example.com", loc)
        # Le uid dans l'URL doit être un jeton vérifiable qui redonne u-123.
        marker = "checkout[custom][uid]="
        self.assertIn(marker, loc)
        token = loc.split(marker, 1)[1]
        self.assertEqual(self.srv.verify_checkout_token(token), "u-123")

    def test_checkout_501_without_url(self):
        # Sans LS_CHECKOUT_URL configurée -> 501.
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value={"id": "u-123", "email": "me@x.com"}), \
             mock.patch.object(self.srv, "LS_CHECKOUT_URL", ""):
            r = self.c.get("/billing/checkout?key=cet_good")
        self.assertEqual(r.status_code, 501)


# ---------------------------------------------------------------------------
# Instrumentation GTM (Bloc B) — /stats, /beacon, activation
# ---------------------------------------------------------------------------
class TestStatsSingleTenant(unittest.TestCase):
    """/stats en mode legacy (le module de tête est single-tenant)."""

    def setUp(self):
        server.app.testing = True
        self.c = server.app.test_client()

    def test_stats_bad_key_401(self):
        r = self.c.get("/stats?key=nope")
        self.assertEqual(r.status_code, 401)

    def test_stats_no_key_401(self):
        r = self.c.get("/stats")
        self.assertEqual(r.status_code, 401)

    def test_stats_good_key_but_not_multitenant_501(self):
        r = self.c.get("/stats?key=test-secret-123")
        self.assertEqual(r.status_code, 501)


class TestBeaconSingleTenant(unittest.TestCase):
    """/beacon reste dispo même sans multi-tenant (best-effort no-op)."""

    def setUp(self):
        server.app.testing = True
        self.c = server.app.test_client()

    def test_beacon_returns_gif_no_multitenant(self):
        r = self.c.get("/beacon?ref=hn")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.mimetype, "image/gif")

    def test_sanitize_ref_unit(self):
        self.assertEqual(server._sanitize_ref("hn"), "hn")
        self.assertEqual(server._sanitize_ref("reddit-cc"), "reddit-cc")
        self.assertEqual(server._sanitize_ref("HN"), "hn")  # normalisé minuscule
        for bad in ("../etc", "a b", "x" * 33, "", None, "a/b", "réf", 42):
            self.assertIsNone(server._sanitize_ref(bad), msg=f"devrait rejeter {bad!r}")


class TestStatsMultiTenant(_MultiTenantBase):
    """/stats en multi-tenant : counts + visits mockés, JSON agrégé 0-PII."""

    def test_stats_returns_aggregates(self):
        with mock.patch.object(self.srv, "_sb_count",
                               side_effect=[12, 5, 3]) as cnt, \
             mock.patch.object(self.srv, "_sb_visits",
                               return_value={"hn": 40, "reddit-cc": 7}):
            r = self.c.get("/stats?key=test-secret-123")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body["accounts"], 12)
        self.assertEqual(body["activated"], 5)
        self.assertEqual(body["pro"], 3)
        self.assertEqual(body["visits"], {"hn": 40, "reddit-cc": 7})
        # 3 counts : users, activated (first_push_at not null), pro
        self.assertEqual(cnt.call_count, 3)

    def test_stats_bad_key_401_multitenant(self):
        r = self.c.get("/stats?key=wrong")
        self.assertEqual(r.status_code, 401)


class TestBeaconMultiTenant(_MultiTenantBase):
    """/beacon en multi-tenant : upsert appelé, ref invalide ignoré."""

    def test_beacon_valid_ref_bumps(self):
        with mock.patch.object(self.srv, "_sb_bump_visit") as bump:
            r = self.c.get("/beacon?ref=hn")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.mimetype, "image/gif")
        bump.assert_called_once_with("hn")

    def test_beacon_invalid_ref_ignored_no_crash(self):
        with mock.patch.object(self.srv, "_sb_bump_visit") as bump:
            r = self.c.get("/beacon?ref=" + up_quote("../etc"))
        self.assertEqual(r.status_code, 200)   # toujours un GIF, pas de crash
        self.assertEqual(r.mimetype, "image/gif")
        bump.assert_not_called()

    def test_beacon_no_ref_ignored(self):
        with mock.patch.object(self.srv, "_sb_bump_visit") as bump:
            r = self.c.get("/beacon")
        self.assertEqual(r.status_code, 200)
        bump.assert_not_called()

    def test_bump_visit_never_throws_on_error(self):
        # Le store échoue (réseau) : best-effort, aucune exception ne remonte.
        with mock.patch.object(self.srv.requests, "get",
                               side_effect=Exception("boom")):
            self.srv._sb_bump_visit("hn")  # ne doit pas lever


class TestActivationOnPush(_MultiTenantBase):
    """/push réussi en multi-tenant marque first_push_at/last_push_at."""

    def test_push_marks_activation(self):
        # Un utilisateur résolu par API key + save Supabase OK -> _mark_activation.
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value={"id": "user-9", "email": "a@b.c"}), \
             mock.patch.object(self.srv, "_sb_save_usage", return_value=True), \
             mock.patch.object(self.srv, "_sb_update_user",
                               return_value=True) as up:
            r = self.c.post("/push", json=GOOD, headers={"X-Api-Key": "cet_ok"})
        self.assertEqual(r.status_code, 200)
        up.assert_called_once()
        called_uid, fields = up.call_args[0]
        self.assertEqual(called_uid, "user-9")
        self.assertEqual(fields["last_push_at"], "now()")
        # first_push_at posé seulement s'il est NULL (COALESCE, pas écrasé).
        self.assertEqual(fields["first_push_at"], "COALESCE(first_push_at, now())")

    def test_push_no_activation_when_save_fails(self):
        # Si le save échoue, on ne marque pas l'activation (et 500).
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value={"id": "user-9", "email": "a@b.c"}), \
             mock.patch.object(self.srv, "_sb_save_usage", return_value=False), \
             mock.patch.object(self.srv, "_sb_update_user") as up:
            r = self.c.post("/push", json=GOOD, headers={"X-Api-Key": "cet_ok"})
        self.assertEqual(r.status_code, 500)
        up.assert_not_called()

    def test_activation_best_effort_never_breaks_push(self):
        # _sb_update_user qui plante ne doit PAS faire échouer le /push (200).
        with mock.patch.object(self.srv, "_sb_get_user_by_api_key",
                               return_value={"id": "user-9", "email": "a@b.c"}), \
             mock.patch.object(self.srv, "_sb_save_usage", return_value=True), \
             mock.patch.object(self.srv, "_sb_update_user",
                               side_effect=Exception("boom")):
            r = self.c.post("/push", json=GOOD, headers={"X-Api-Key": "cet_ok"})
        self.assertEqual(r.status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
