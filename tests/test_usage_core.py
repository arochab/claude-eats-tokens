"""
Tests de la logique pure (tests/test_usage_core.py).

Lance : python -m pytest tests/ -q   (ou : python -m unittest discover -s tests)

Chaque test prouve une formule ou une règle sur des chiffres/chemins CONNUS.
On vise l'AXE 1 (inférence projet) et l'exactitude des calculs (AXE 4).
"""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import usage_core as uc  # noqa: E402


class TestProjectInference(unittest.TestCase):
    """AXE 1 — le cœur. Basé sur les VRAIS cwd observés dans les logs d'Adam."""

    def test_worktree_claude_strips_to_project(self):
        # Le bug historique : ceci renvoyait 'lumiere' / '37ca98'. Doit donner le projet.
        cwd = r"C:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\AGENTIC-FIGMA-MCP\.claude\worktrees\nifty-lumiere-37ca98"
        p = uc.project_from_cwd(cwd)
        self.assertEqual(uc.display_name(p), "AGENTIC-FIGMA-MCP")

    def test_all_worktrees_of_same_project_collapse(self):
        # 3 worktrees différents du même projet -> même clé.
        base = r"C:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\AGENTIC-FIGMA-MCP\.claude\worktrees"
        keys = {
            uc.project_from_cwd(base + r"\nifty-lumiere-37ca98"),
            uc.project_from_cwd(base + r"\sad-gates-0925cb"),
            uc.project_from_cwd(base + r"\quirky-darwin-275e6e"),
        }
        self.assertEqual(len(keys), 1)
        self.assertEqual(uc.display_name(next(iter(keys))), "AGENTIC-FIGMA-MCP")

    def test_codex_worktree(self):
        cwd = r"C:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\00-AXIS-CONTROL\.codex\worktrees\M016-RC5-CODEX"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "00-AXIS-CONTROL")

    def test_plain_project_no_worktree(self):
        cwd = r"C:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\00-AXIS-CONTROL"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "00-AXIS-CONTROL")

    def test_nested_project_last_segment(self):
        cwd = r"c:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\skool-ai-automation\kapman-news"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "kapman-news")

    def test_dev_short_root(self):
        cwd = r"C:\DEV\AGENTIC-FIGMA-MCP\.claude\worktrees\gallant-elion-190581"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "AGENTIC-FIGMA-MCP")

    def test_unix_style_path(self):
        cwd = "/home/claude/work/my-project"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "my-project")

    def test_drive_root_is_none(self):
        self.assertIsNone(uc.project_from_cwd("C:\\"))
        self.assertIsNone(uc.project_from_cwd(""))
        self.assertIsNone(uc.project_from_cwd(None))

    def test_collision_different_roots_distinct_keys(self):
        # Même feuille, racines différentes -> clés DISTINCTES (corrige A1-2).
        a = uc.project_from_cwd(r"C:\DEV\FIGMA-MCP")
        b = uc.project_from_cwd(r"C:\Users\x\Desktop\Other\FIGMA-MCP")
        self.assertNotEqual(a, b)
        self.assertEqual(uc.display_name(a), uc.display_name(b))  # même nom affiché

    def test_build_subfolder_trims_to_project(self):
        # '…/mixhub/APP/src' doit donner le projet 'mixhub', PAS 'src'.
        cwd = r"C:\Users\adamc_ixt0882\Desktop\Adam CHABBI Pro\mixhub\APP\src"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "mixhub")

    def test_subfolder_and_root_merge_to_same_key(self):
        root = uc.project_from_cwd(r"C:\Users\x\Desktop\Pro\mixhub")
        sub = uc.project_from_cwd(r"C:\Users\x\Desktop\Pro\mixhub\APP\src")
        self.assertEqual(root, sub)  # même clé -> fusion

    def test_home_dir_is_none(self):
        # Session lancée depuis le home : pas un vrai projet.
        self.assertIsNone(uc.project_from_cwd(r"C:\Users\adamc_ixt0882"))
        self.assertEqual(uc.display_name(uc.project_from_cwd(r"C:\Users\adamc_ixt0882")), "Sans projet")

    def test_username_with_digits_skipped(self):
        self.assertTrue(uc._looks_like_username("adamc_ixt0882"))
        self.assertTrue(uc._looks_like_username("ADAMC~1"))
        self.assertFalse(uc._looks_like_username("mixhub"))
        self.assertFalse(uc._looks_like_username("AGENTIC-FIGMA-MCP"))

    def test_temp_standalone_kept(self):
        # AppData/Local/Temp/svg2png : svg2png est un vrai nom, on le garde.
        cwd = r"C:\Users\adamc_ixt0882\AppData\Local\Temp\svg2png"
        self.assertEqual(uc.display_name(uc.project_from_cwd(cwd)), "svg2png")


class TestLabelFallback(unittest.TestCase):
    def test_label_truncates_and_normalizes(self):
        txt = "Hard stop.\n\nThe latest verified APK still failed on Adam's real Android phone."
        lbl = uc.label_from_text(txt, max_len=30)
        self.assertLessEqual(len(lbl), 30)
        self.assertNotIn("\n", lbl)
        self.assertTrue(lbl.startswith("Hard stop."))

    def test_label_empty(self):
        self.assertIsNone(uc.label_from_text(""))
        self.assertIsNone(uc.label_from_text(None))
        self.assertIsNone(uc.label_from_text("   \n  "))


class TestModelFamilyAndPricing(unittest.TestCase):
    def test_family_mapping(self):
        self.assertEqual(uc.family("claude-opus-4-8"), "opus")
        self.assertEqual(uc.family("claude-sonnet-4-6"), "sonnet")
        self.assertEqual(uc.family("claude-haiku-4-5"), "haiku")
        self.assertIsNone(uc.family("<synthetic>"))

    def test_cost_uses_correct_model(self):
        # 1M output tokens : Opus coûte $75, Sonnet $15. La VRAIE correction A1-3.
        acc = {"input": 0, "output": 1_000_000, "cacheCreate": 0, "cacheRead": 0}
        self.assertAlmostEqual(uc.cost_of(acc, "opus"), 75.0, places=4)
        self.assertAlmostEqual(uc.cost_of(acc, "sonnet"), 15.0, places=4)
        # Le bug historique passait "" -> tarif Sonnet pour de l'Opus :
        self.assertNotAlmostEqual(uc.cost_of(acc, ""), uc.cost_of(acc, "opus"))

    def test_per_project_cost_is_weighted_sum(self):
        # Projet = 80% Opus + 20% Sonnet en output. Le coût doit refléter le mix.
        opus = {"input": 0, "output": 800_000, "cacheCreate": 0, "cacheRead": 0}
        sonnet = {"input": 0, "output": 200_000, "cacheCreate": 0, "cacheRead": 0}
        weighted = uc.cost_of(opus, "opus") + uc.cost_of(sonnet, "sonnet")
        # = 0.8*75 + 0.2*15 = 60 + 3 = 63
        self.assertAlmostEqual(weighted, 63.0, places=4)
        # L'ancien calcul (tout Sonnet) aurait donné 15 -> 4.2x trop bas.
        all_sonnet = uc.cost_of({"input": 0, "output": 1_000_000, "cacheCreate": 0, "cacheRead": 0}, "sonnet")
        self.assertAlmostEqual(all_sonnet, 15.0, places=4)
        self.assertGreater(weighted, all_sonnet * 4)


class TestWindows(unittest.TestCase):
    def _buckets(self):
        # 3 heures de données : 10h, 13h, 15h (UTC).
        return {
            "2026-06-22T10": {"input": 100, "output": 0, "cacheCreate": 0, "cacheRead": 0},
            "2026-06-22T13": {"input": 200, "output": 0, "cacheCreate": 0, "cacheRead": 0},
            "2026-06-22T15": {"input": 400, "output": 0, "cacheCreate": 0, "cacheRead": 0},
        }

    def test_window_5h_includes_only_recent(self):
        now = datetime(2026, 6, 22, 16, 30, tzinfo=timezone.utc)
        # 5h avant 16:30 = 11:30 -> exclut 10h, inclut 13h & 15h.
        t = uc.window_total(self._buckets(), 5, now)
        self.assertEqual(t["input"], 600)  # 200 + 400

    def test_window_full_history(self):
        now = datetime(2026, 6, 22, 16, 30, tzinfo=timezone.utc)
        t = uc.window_total(self._buckets(), 24, now)
        self.assertEqual(t["input"], 700)  # tous

    def test_w5h_reset_is_oldest_plus_5h(self):
        now = datetime(2026, 6, 22, 16, 30, tzinfo=timezone.utc)
        reset = uc.w5h_reset_at(self._buckets(), now)
        # plus vieux dans la fenêtre 5h = 13h -> reset 18h
        self.assertEqual(reset, "2026-06-22T18:00:00+00:00")


class TestMergeByName(unittest.TestCase):
    def test_same_name_two_roots_merge(self):
        projects = [
            {"name": "AGENTIC-FIGMA-MCP", "path": "C:/DEV/AGENTIC-FIGMA-MCP",
             "total": 100, "cost": 10.0, "sessionCount": 27, "sessions": [],
             "models": [{"model": "opus", "label": "Claude Opus", "total": 100, "cost": 10.0}],
             "input": 100, "output": 0, "cacheCreate": 0, "cacheRead": 0, "lastActivity": "2026-06-01T00:00:00Z"},
            {"name": "AGENTIC-FIGMA-MCP", "path": "C:/Users/x/AGENTIC-FIGMA-MCP",
             "total": 50, "cost": 5.0, "sessionCount": 6, "sessions": [],
             "models": [{"model": "opus", "label": "Claude Opus", "total": 50, "cost": 5.0}],
             "input": 50, "output": 0, "cacheCreate": 0, "cacheRead": 0, "lastActivity": "2026-06-10T00:00:00Z"},
        ]
        out = uc.merge_projects_by_name(projects)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["total"], 150)
        self.assertEqual(out[0]["cost"], 15.0)
        self.assertEqual(out[0]["sessionCount"], 33)
        self.assertEqual(len(out[0]["paths"]), 2)
        self.assertEqual(out[0]["lastActivity"], "2026-06-10T00:00:00Z")  # le plus récent
        self.assertEqual(out[0]["models"][0]["total"], 150)  # breakdown fusionné

    def test_distinct_names_untouched(self):
        projects = [
            {"name": "a", "path": "C:/a", "total": 10, "cost": 1.0, "sessionCount": 1, "sessions": [], "models": [], "input": 10, "output": 0, "cacheCreate": 0, "cacheRead": 0, "lastActivity": None},
            {"name": "b", "path": "C:/b", "total": 20, "cost": 2.0, "sessionCount": 1, "sessions": [], "models": [], "input": 20, "output": 0, "cacheCreate": 0, "cacheRead": 0, "lastActivity": None},
        ]
        out = uc.merge_projects_by_name(projects)
        self.assertEqual(len(out), 2)


class TestProjection(unittest.TestCase):
    def test_linear_projection(self):
        # 7M tokens au jour 13 sur 30 -> ~16.15M
        self.assertEqual(uc.month_projection(7_000_000, 13, 30), round(7_000_000 / 13 * 30))

    def test_projection_day_zero_safe(self):
        self.assertEqual(uc.month_projection(5, 0, 30), 0)


class TestHonestStats(unittest.TestCase):
    """Schéma v3 — métriques honnêtes dérivées des vraies données."""

    def test_median(self):
        self.assertEqual(uc.median([3, 1, 2]), 2)
        self.assertEqual(uc.median([1, 2, 3, 4]), 2.5)
        self.assertEqual(uc.median([]), 0)
        self.assertEqual(uc.median([5]), 5)

    def test_stdev(self):
        self.assertEqual(uc.stdev([2, 2, 2]), 0.0)
        self.assertAlmostEqual(uc.stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2.0, places=3)
        self.assertEqual(uc.stdev([7]), 0.0)  # 1 point -> pas de variance

    def test_percentile_rank(self):
        hist = [10, 20, 30, 40, 50]
        # 35 est > 10,20,30 = 3/5 = 60%
        self.assertEqual(uc.percentile_rank(35, hist), 60)
        self.assertEqual(uc.percentile_rank(5, hist), 0)     # plus bas que tous
        self.assertEqual(uc.percentile_rank(100, hist), 100)  # plus haut que tous
        self.assertEqual(uc.percentile_rank(10, []), 0)       # pas d'historique

    def test_projection_from_slope_flat(self):
        # rythme PLAT : 10/jour pendant 7 jours, jour 10 sur 30 -> marge ~0
        daily = [10] * 10
        r = uc.projection_from_slope(daily, 10, 30)
        self.assertEqual(r["slope"], 10)
        self.assertEqual(r["projection"], 100 + 10 * 20)  # cur=100 + 10*20j restants
        self.assertEqual(r["marginLow"], r["marginHigh"])  # plat -> fourchette nulle

    def test_projection_from_slope_volatile(self):
        # rythme VOLATIL -> fourchette large
        daily = [0, 20, 0, 20, 0, 20, 0]  # jour 7
        r = uc.projection_from_slope(daily, 7, 30)
        self.assertGreater(r["marginHigh"] - r["marginLow"], 0)  # vraie incertitude

    def test_projection_too_little_history(self):
        self.assertIsNone(uc.projection_from_slope([5], 1, 30))  # 1 jour -> None

    def test_projection_end_of_month(self):
        r = uc.projection_from_slope([10, 10, 10], 30, 30)  # dernier jour
        self.assertEqual(r["projection"], 30)  # plus de jours restants

    def test_month_ratio(self):
        # mois courant 120, médiane des précédents [100,80,120] = 100 -> 120%
        self.assertEqual(uc.month_ratio(120, [100, 80, 120]), 120)
        self.assertIsNone(uc.month_ratio(50, []))      # pas d'historique -> None
        self.assertIsNone(uc.month_ratio(50, [0, 0]))  # médiane nulle -> None


class TestAssistantStats(unittest.TestCase):
    """Assistant intelligent — stats robustes (médiane+MAD log, fenêtre 5h)."""

    def test_mad(self):
        self.assertEqual(uc.mad([5, 5, 5]), 0.0)
        # série symétrique : MAD normalisé proche de l'écart-type
        self.assertGreater(uc.mad([1, 2, 3, 4, 5, 100]), 0)  # robuste au pic 100
        self.assertEqual(uc.mad([7]), 0.0)

    def _buckets(self, day, hours):
        # hours = {hour_int: total} -> {"YYYY-MM-DDTHH": accumulateur}
        b = {}
        for h, tot in hours.items():
            b[day + "T%02d" % h] = {"input": tot, "output": 0, "cacheCreate": 0, "cacheRead": 0}
        return b

    def test_daily_peak_5h(self):
        # un jour avec 100 à 10h,11h,12h = pic 5h de 300 (3 heures dans la fenêtre)
        b = self._buckets("2026-06-01", {10: 100, 11: 100, 12: 100})
        peaks = uc.daily_peak_5h(b)
        self.assertEqual(peaks["2026-06-01"], 300)

    def test_baseline_5h_divides_correctly(self):
        # 6 jours, chacun pic 5h = 50M (pas de cumul -> base ~50M, PAS 300M)
        bk = {}
        for d in range(1, 7):
            day = "2026-06-%02d" % d
            bk.update(self._buckets(day, {10: 50_000_000}))
        base = uc.baseline_5h(bk)
        self.assertIsNotNone(base)
        self.assertEqual(base["nDays"], 6)
        # base 5h ~ 50M (à l'arrondi log près), surtout PAS un multiple des jours
        self.assertLess(abs(base["base"] - 50_000_000), 1_000_000)

    def test_baseline_5h_insufficient(self):
        bk = self._buckets("2026-06-01", {10: 100})
        self.assertIsNone(uc.baseline_5h(bk, min_days=5))  # 1 jour < 5

    def test_robust_z_log(self):
        import math
        # value très au-dessus de la médiane log -> z élevé
        med_l = math.log1p(50_000_000)
        mad_l = 0.3
        z_high = uc.robust_z_log(200_000_000, med_l, mad_l)
        self.assertGreater(z_high, 3)  # 4× la base -> hors zone normale
        self.assertEqual(uc.robust_z_log(1, med_l, 0), 0.0)  # mad nul -> 0



class TestOfficialWindows(unittest.TestCase):
    """v4 : fraicheur du vrai % officiel des fenetres (5h/7j)."""

    def test_schema_v5(self):
        self.assertEqual(uc.SCHEMA_VERSION, 5)

    def test_freshness_age(self):
        self.assertEqual(uc.official_freshness({"capturedAt": 1000}, 1300), 300)
        self.assertIsNone(uc.official_freshness(None, 1000))
        self.assertIsNone(uc.official_freshness({}, 1000))

    def test_is_fresh(self):
        now = 100000
        self.assertTrue(uc.official_is_fresh({"capturedAt": now - 60}, now))
        self.assertTrue(uc.official_is_fresh({"capturedAt": now - 5 * 3600}, now))
        self.assertFalse(uc.official_is_fresh({"capturedAt": now - 7 * 3600}, now))
        self.assertFalse(uc.official_is_fresh(None, now))


class TestOpusWasteSuspects(unittest.TestCase):
    """v5 — PARTIE 1 : Waste Radar. Candidats « Opus sur petite tâche ».
    GARDE-FOU : la fonction ne juge pas, elle chiffre une économie THÉORIQUE."""

    def _sess(self, sid, opus_out, msg_count, title="t", extra_acc=None):
        """Fabrique une session enrichie avec un accumulateur Opus donné."""
        opus_acc = {"input": 0, "output": opus_out, "cacheCreate": 0, "cacheRead": 0}
        cbm = [{"model": "opus", "label": "Claude Opus",
                "total": opus_out, "cost": round(uc.cost_of(opus_acc, "opus"), 4),
                "acc": opus_acc}]
        if extra_acc:
            cbm.append(extra_acc)
        out_tokens = opus_out + (extra_acc["acc"].get("output", 0) if extra_acc else 0)
        return {"sessionId": sid, "title": title, "tokens": out_tokens,
                "costByModel": cbm, "outputTokens": out_tokens,
                "messageCount": msg_count}

    def test_small_opus_task_is_suspect_with_positive_saving(self):
        # Opus sur une PETITE sortie (5k output, 6 messages) -> candidat.
        s = self._sess("sess-small", opus_out=5_000, msg_count=6)
        out = uc.opus_waste_suspects([s], min_saving_usd=0.0)
        self.assertEqual(len(out), 1)
        row = out[0]
        self.assertEqual(row["sessionId"], "sess-small")
        # 5000 output Opus = 5000*75/1e6 = 0.375 ; Sonnet = 5000*15/1e6 = 0.075
        self.assertAlmostEqual(row["opusCost"], 0.375, places=4)
        self.assertAlmostEqual(row["sonnetCost"], 0.075, places=4)
        self.assertAlmostEqual(row["saving"], 0.30, places=4)  # économie théorique
        self.assertGreater(row["saving"], 0)
        # reason FACTUELLE : pas de jugement « Sonnet aurait suffi »
        self.assertIn("opus", row["reason"])
        self.assertNotIn("suffi", row["reason"].lower())

    def test_large_opus_task_not_suspect(self):
        # Opus sur une GROSSE sortie (500k output) -> PAS un candidat petite tâche.
        s = self._sess("sess-big", opus_out=500_000, msg_count=200)
        out = uc.opus_waste_suspects([s])
        self.assertEqual(out, [])

    def test_no_opus_returns_empty(self):
        # Session 100% Sonnet -> jamais candidate (rien à économiser).
        sonnet_acc = {"input": 0, "output": 5_000, "cacheCreate": 0, "cacheRead": 0}
        s = {"sessionId": "sess-sonnet", "title": "t", "tokens": 5_000,
             "costByModel": [{"model": "sonnet", "label": "Claude Sonnet",
                              "total": 5_000, "cost": 0.075, "acc": sonnet_acc}],
             "outputTokens": 5_000, "messageCount": 3}
        self.assertEqual(uc.opus_waste_suspects([s]), [])

    def test_min_saving_threshold_filters(self):
        # Petite session Opus mais économie < seuil -> filtrée.
        s = self._sess("sess-tiny", opus_out=1_000, msg_count=3)  # saving=0.06
        self.assertEqual(uc.opus_waste_suspects([s], min_saving_usd=0.5), [])
        self.assertEqual(len(uc.opus_waste_suspects([s], min_saving_usd=0.0)), 1)

    def test_sorted_by_saving_desc(self):
        s1 = self._sess("a", opus_out=3_000, msg_count=5)
        s2 = self._sess("b", opus_out=10_000, msg_count=5)
        out = uc.opus_waste_suspects([s1, s2], min_saving_usd=0.0)
        self.assertEqual([r["sessionId"] for r in out], ["b", "a"])  # b économise +


class TestSelectSessions(unittest.TestCase):
    """v5 — cap intelligent : garde les grosses ET les petites tâches Opus."""

    def test_no_cap_when_under_limit(self):
        sessions = [{"sessionId": str(i), "tokens": i} for i in range(5)]
        out = uc.select_sessions(sessions, cap=60)
        self.assertEqual(len(out), 5)
        self.assertEqual(out[0]["tokens"], 4)  # trié décroissant

    def test_small_opus_survives_the_cap(self):
        # 50 grosses sessions Sonnet + 1 petite session Opus suspecte.
        big = [{"sessionId": "big%02d" % i, "tokens": 10_000_000 + i,
                "models": ["sonnet"], "outputTokens": 500_000} for i in range(50)]
        suspect = {"sessionId": "opus-small", "tokens": 100,
                   "models": ["opus"], "outputTokens": 300,
                   "costByModel": [{"model": "opus"}]}
        out = uc.select_sessions(big + [suspect], cap=45)
        ids = {s["sessionId"] for s in out}
        # la petite tâche Opus (cible du Waste Radar) NE disparait PAS.
        self.assertIn("opus-small", ids)
        self.assertLessEqual(len(out), 45)


class TestDetectAnomalies(unittest.TestCase):
    """v5 — PARTIE 2 : Boîte noire. Épisodes fenêtre 5h anormaux (faits mesurés)."""

    def _acc(self, t):
        return {"input": t, "output": 0, "cacheCreate": 0, "cacheRead": 0}

    def _healthy_baseline_buckets(self):
        # 6 jours calmes, valeurs VARIÉES (MAD > 0) : pics 5h ~3-6M.
        vals = [3_000_000, 5_000_000, 4_000_000, 6_000_000, 5_500_000, 4_500_000]
        days = ["2026-06-30", "2026-07-01", "2026-07-02",
                "2026-07-03", "2026-07-04", "2026-07-05"]
        b = {}
        for day, v in zip(days, vals):
            b[day + "T10"] = self._acc(v)
        return b

    def test_sidechain_spike_flagged_with_real_share(self):
        buckets = self._healthy_baseline_buckets()
        meta = {}
        # jour anormal : 60M sur 3 heures, dominé par des sous-agents.
        for h in (9, 10, 11):
            buckets["2026-07-06T%02d" % h] = self._acc(20_000_000)
            meta["2026-07-06T%02d" % h] = {
                "sidechain": 18_000_000, "ephemeral5m": 1_000_000,
                "ephemeral1h": 0, "byProject": {"BigProj": 20_000_000}}
        now = datetime(2026, 7, 6, 12, tzinfo=timezone.utc)
        base = uc.baseline_5h(buckets, min_days=5)
        self.assertGreater(base["madLog"], 0)  # dispersion réelle -> z calculable
        an = uc.detect_anomalies(buckets, meta, base, now)
        self.assertEqual(len(an), 1)
        ep = an[0]
        self.assertGreaterEqual(ep["z"], 3)              # au-dessus du seuil
        self.assertEqual(ep["total"], 60_000_000)
        self.assertAlmostEqual(ep["sidechainShare"], 0.9, places=2)  # FAIT mesuré
        self.assertEqual(ep["cacheMiss5m"], 3_000_000)   # 3×1M sur la fenêtre
        self.assertEqual(ep["cacheMiss1h"], 0)           # rien -> 0, pas inventé
        self.assertEqual(ep["topProject"], "BigProj")

    def test_healthy_data_returns_empty(self):
        buckets = self._healthy_baseline_buckets()
        now = datetime(2026, 7, 6, 12, tzinfo=timezone.utc)
        base = uc.baseline_5h(buckets, min_days=5)
        # aucun jour n'excède la baseline -> aucune anomalie fabriquée.
        self.assertEqual(uc.detect_anomalies(buckets, {}, base, now), [])

    def test_no_baseline_returns_empty(self):
        self.assertEqual(uc.detect_anomalies({}, {}, None, datetime.now(timezone.utc)), [])


class TestSessionEnrichmentBackcompat(unittest.TestCase):
    """v5 — les sessions enrichies gardent les champs rétrocompat v4."""

    def test_select_sessions_preserves_legacy_fields(self):
        # Une session enrichie doit conserver sessionId/tokens/lastActivity/models.
        s = {"sessionId": "s1", "title": "Refonte", "tokens": 42_000,
             "lastActivity": "2026-07-01T10:00:00Z", "models": ["opus", "sonnet"],
             "cost": 1.23, "costByModel": [{"model": "opus"}],
             "messageCount": 12, "firstActivity": "2026-07-01T09:00:00Z",
             "durationSec": 3600, "outputTokens": 8000}
        out = uc.select_sessions([s], cap=60)[0]
        for legacy in ("sessionId", "title", "tokens", "lastActivity", "models"):
            self.assertIn(legacy, out)
        self.assertEqual(out["models"], ["opus", "sonnet"])
        self.assertEqual(out["tokens"], 42_000)
        # et les nouveaux champs v5 sont là aussi
        for new in ("cost", "costByModel", "messageCount", "firstActivity",
                    "durationSec", "outputTokens"):
            self.assertIn(new, out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
