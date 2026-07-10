// Tests des helpers purs front (tests/test_format.mjs).
// Lance : node --test tests/test_format.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Charger i18n AVANT format.js (même ordre que dans index.html)
require("../pwa/i18n/fr.js");
require("../pwa/i18n/en.js");
const CETI18N = require("../pwa/i18n/index.js");
// Forcer le français pour que les assertions existantes continuent de passer
CETI18N.setLang("fr");
const CET = require("../pwa/format.js");

test("fmt — formats compacts FR", () => {
  assert.equal(CET.fmt(0), "0");
  assert.equal(CET.fmt(950), "950");
  assert.equal(CET.fmt(1500), "2 k");
  assert.equal(CET.fmt(1_200_000), "1,2 M");
  assert.equal(CET.fmt(2_100_000_000), "2,1 Md");
});

test("pct — borné et sûr", () => {
  assert.equal(CET.pct(50, 100), 50);
  assert.equal(CET.pct(0, 0), 0);          // budget nul -> 0, pas NaN
  assert.equal(CET.pct(5000, 100), 999);   // borné à 999
  assert.equal(CET.pct(100, 100), 100);
});

test("esc — échappe le HTML", () => {
  assert.equal(CET.esc("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
  assert.equal(CET.esc("safe"), "safe");
});

test("modelColor — par famille", () => {
  assert.equal(CET.modelColor("Claude Opus"), CET.COLORS.opus);
  assert.equal(CET.modelColor("claude-sonnet-4"), CET.COLORS.sonnet);
  assert.equal(CET.modelColor("haiku"), CET.COLORS.haiku);
  assert.equal(CET.modelColor("autre"), CET.COLORS.default);
});

test("ringColor / toneOf — seuils", () => {
  assert.equal(CET.ringColor(40, 80), "#7E9E6D");  // vert
  assert.equal(CET.ringColor(60, 80), "#C8923D");  // ambre (>=50)
  assert.equal(CET.ringColor(85, 80), "#C8923D");  // ambre (>=warn)
  assert.equal(CET.ringColor(100, 80), "#B5563A"); // rouge
  assert.equal(CET.toneOf(40, 80), "ok");
  assert.equal(CET.toneOf(60, 80), "warn");
  assert.equal(CET.toneOf(90, 80), "bad");
  assert.equal(CET.toneOf(120, 80), "bad");
});

test("ago — temps relatif avec now injecté", () => {
  const base = Date.parse("2026-06-22T12:00:00Z");
  assert.equal(CET.ago("2026-06-22T11:59:40Z", base), "à l'instant");
  assert.equal(CET.ago("2026-06-22T11:30:00Z", base), "il y a 30 min");
  assert.equal(CET.ago("2026-06-22T09:00:00Z", base), "il y a 3 h");
  assert.equal(CET.ago("2026-06-20T12:00:00Z", base), "il y a 2 j");
  assert.equal(CET.ago(null, base), "—");
});

test("until — reset futur avec now injecté", () => {
  const base = Date.parse("2026-06-22T12:00:00Z");
  assert.equal(CET.until("2026-06-22T11:00:00Z", base), "réinitialisée"); // passé
  assert.equal(CET.until("2026-06-22T12:30:00Z", base), "reset dans 30 min");
  assert.match(CET.until("2026-06-22T14:15:00Z", base), /reset dans 2 h/);
});

test("ringSVG — pur, contient l'offset attendu", () => {
  const svg = CET.ringSVG(50, 100, 10, "#eee", "#f00", "<i>c</i>");
  assert.match(svg, /<svg/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /<i>c<\/i>$/);          // centerHTML appended
  assert.match(svg, /stroke-dashoffset/);
});

// ---------- Assistant token intelligent ----------
const baseD = () => ({
  pace: { baseline5h: { base: 50_000_000, high: 1_400_000_000, medianLog: 17.7, madLog: 0.3, nDays: 30 },
          todayRank: 50, medianPerDay: 60_000_000, todayTotal: 30_000_000 },
  windows: { w5h: { total: 40_000_000 }, w7d: { total: 100_000_000 },
             w5hResetAt: new Date(Date.now() + 3*3600000).toISOString() },
  models: [{ model: "opus", total: 100 }], weekly: { weeks: [{total:50},{total:50},{total:50}] }
});

test("assistant — données insuffisantes -> []", () => {
  assert.deepEqual(CET.assistant(null), []);
  assert.deepEqual(CET.assistant({}), []);
});

test("assistant — fenêtre 5h calme -> aucun signal 5h", () => {
  const sigs = CET.assistant(baseD(), Date.now());
  assert.equal(sigs.find(s => s.id === "w5h"), undefined);  // w5h=40M < 2x base
});

test("assistant — fenêtre 5h soutenue -> signal warn/bad", () => {
  const d = baseD();
  d.windows.w5h.total = 600_000_000;  // 12x la base -> alerte
  const sigs = CET.assistant(d, Date.now());
  const w5 = sigs.find(s => s.id === "w5h");
  assert.ok(w5, "doit produire un signal fenêtre 5h");
  assert.ok(["warn","bad"].includes(w5.level));
  assert.match(w5.msg, /Claude/);
  assert.match(w5.why, /Max/);
});

test("assistant — grosse journée tôt -> signal info/warn", () => {
  const d = baseD();
  d.pace.todayRank = 95; d.pace.todayTotal = 300_000_000;
  // 10h du matin (tôt)
  const tenAM = new Date(); tenAM.setHours(10,0,0,0);
  const sigs = CET.assistant(d, tenAM.getTime());
  const bd = sigs.find(s => s.id === "bigday");
  assert.ok(bd, "doit signaler la grosse journée avant 18h");
  assert.match(bd.msg, /Aujourd.hui/);
});

test("assistant — grosse journée en soirée -> silencieux", () => {
  const d = baseD();
  d.pace.todayRank = 95;
  const tenPM = new Date(); tenPM.setHours(22,0,0,0);
  const sigs = CET.assistant(d, tenPM.getTime());
  assert.equal(sigs.find(s => s.id === "bigday"), undefined);  // trop tard pour agir
});

test("assistant — max 3 signaux, triés par gravité", () => {
  const d = baseD();
  d.windows.w5h.total = 800_000_000;
  d.pace.todayRank = 98; d.pace.todayTotal = 500_000_000;
  const noon = new Date(); noon.setHours(12,0,0,0);
  const sigs = CET.assistant(d, noon.getTime());
  assert.ok(sigs.length <= 3);
  // le plus grave en premier
  if (sigs.length > 1) {
    const order = { bad:0, warn:1, info:2 };
    assert.ok(order[sigs[0].level] <= order[sigs[1].level]);
  }
});

// ---------- Feu tricolore unifié (status) ----------
test("status — données insuffisantes -> dégradé propre", () => {
  const s = CET.status({}, Date.now());
  assert.equal(s.level, "green");
  assert.ok(Array.isArray(s.gauges));
});

test("status — tout calme -> VERT", () => {
  const d = baseD();
  d.windows.w5h.total = 40_000_000;                         // 5h tranquille
  d.windows.w7d.total = 100;                                // ~ médiane des semaines
  d.weekly.weeks = [{total:80},{total:100},{total:120}];    // semaine calme
  d.month = { ratio3m: 100, currentMonth: 5_000_000 };      // mois calme
  const s = CET.status(d, Date.now());
  assert.equal(s.level, "green");
  assert.match(s.title, /Tout roule/);
});

test("status — fenêtre 5h au max -> ROUGE", () => {
  const d = baseD();
  d.windows.w5h.total = 1_300_000_000;  // ~93% de high (1.4Md) -> rouge
  const s = CET.status(d, Date.now());
  assert.equal(s.level, "red");
  assert.match(s.title, /Lève le pied/);
  assert.match(s.msg, /ralentir/);
});

test("status — semaine intense + 5h calme -> VERT 'montée en puissance' (jamais orange)", () => {
  const d = baseD();
  d.windows.w5h.total = 40_000_000;       // 5h calme -> rien ne ralentit
  d.windows.w7d.total = 300;              // semaine: 6x la médiane(50)
  const s = CET.status(d, Date.now());
  assert.equal(s.level, "green");         // une grosse semaine n'est PAS une alerte
  assert.match(s.title, /montes en puissance/);
});

test("status — seule la fenêtre 5h peut faire chauffer le feu", () => {
  const d = baseD();
  d.windows.w5h.total = 600_000_000;      // 12x la base -> orange
  d.windows.w7d.total = 50;               // semaine calme
  const s = CET.status(d, Date.now());
  assert.equal(s.level, "orange");        // c'est bien la 5h qui décide
  assert.match(s.title, /5 dernières heures/);
});

test("status — gauges couvrent 5h/semaine/mois", () => {
  const d = baseD();
  d.month = { ratio3m: 120, currentMonth: 5_000_000 };
  const s = CET.status(d, Date.now());
  const keys = s.gauges.map(g => g.key);
  assert.ok(keys.includes("5h"));
  assert.ok(keys.includes("7d"));
  assert.ok(keys.includes("month"));
});

// ---------- Où je me situe (position) ----------
// helper : construit un d avec une semaine effective ciblée (tout en cache lu,
// pondéré ×0.1 -> effWeek = cacheRead*0.1)
const dWeek = (effTarget, extra) => Object.assign({
  windows: { w7d: { input: 0, output: 0, cacheCreate: 0, cacheRead: effTarget / 0.1 },
             w5h: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 } },
  weekly: { weeks: [{ total: 100 }, { total: 100 }, { total: effTarget }] },
}, extra || {});

test("position — données insuffisantes -> null", () => {
  assert.equal(CET.position({}, null, Date.now()), null);
  assert.equal(CET.position(null, null, Date.now()), null);
});

test("position — petite semaine -> Découverte", () => {
  const p = CET.position(dWeek(0.1e9), null, Date.now());
  assert.equal(p.tierIndex, 0);
  assert.equal(CETI18N.t(p.tierLabel), "Découverte");
});

test("position — semaine moyenne -> Régulier", () => {
  const p = CET.position(dWeek(1e9), null, Date.now());
  assert.equal(p.tierIndex, 1);
  assert.equal(CETI18N.t(p.tierLabel), "Régulier");
});

test("position — grosse semaine -> Intensif", () => {
  const p = CET.position(dWeek(3e9), null, Date.now());
  assert.equal(p.tierIndex, 2);
  assert.equal(CETI18N.t(p.tierLabel), "Intensif");
});

test("position — le pic 5h qui frôle la limite force Power-user", () => {
  // semaine modeste MAIS pic 5h à 90% de la limite -> power-user (vrai signal Max)
  const d = dWeek(1e9);
  d.windows.w5h = { input: 0, output: 0, cacheCreate: 0, cacheRead: (600e6 * 0.9) / 0.1 };
  const p = CET.position(d, null, Date.now());
  assert.equal(p.brushes5h, true);
  assert.equal(p.tierIndex, 3);
  assert.equal(CETI18N.t(p.tierLabel), "Power-user");
});

test("position — marqueur borné 2..100 et % enveloppe cohérent", () => {
  const p = CET.position(dWeek(2e9), null, Date.now());
  assert.ok(p.markerPct >= 2 && p.markerPct <= 100);
  assert.equal(p.pctEnveloppe, Math.round(2e9 / 9500e6 * 100));  // ~21%
});

// ---------- Utilisation du forfait ----------
test("effectiveTokens — pondère le cache lu", () => {
  const acc = { input: 0, output: 0, cacheCreate: 0, cacheRead: 1000 };
  assert.equal(CET.effectiveTokens(acc, 0.1), 100);   // cache lu * 0.1
  assert.equal(CET.effectiveTokens(acc, 1), 1000);    // kCache=1 -> brut
  assert.equal(CET.effectiveTokens({ input: 50, output: 50, cacheCreate: 0, cacheRead: 0 }, 0.1), 100);
  assert.equal(CET.effectiveTokens(null), 0);
});

test("nextWeeklyReset — prochain lundi 00:00", () => {
  // un mardi -> lundi suivant (6 jours après)
  const tue = new Date(2026, 5, 23, 15, 0, 0).getTime(); // mar 23 juin 2026 15h
  const reset = new Date(CET.nextWeeklyReset(tue));
  assert.equal(reset.getDay(), 1);          // lundi
  assert.equal(reset.getHours(), 0);
  assert.ok(reset.getTime() > tue);
  // un lundi 00:00 pile -> +7j (pas aujourd'hui)
  const mon = new Date(2026, 5, 22, 0, 0, 0).getTime(); // lun 22 juin 00:00
  const r2 = new Date(CET.nextWeeklyReset(mon + 1000)); // juste après minuit
  assert.equal(r2.getDay(), 1);
  assert.ok(r2.getTime() > mon);
});

test("weeklyResetLabel — format français court", () => {
  const label = CET.weeklyResetLabel(new Date(2026, 5, 29).getTime()); // lun 29 juin
  assert.match(label, /lun/);
  assert.match(label, /29/);
});

// ---------- Mes fenêtres (vraies % officielles) ----------
const SEC = 1750000000; // un epoch seconds arbitraire (mi-2025)
const officialD = (extra) => ({
  windowsOfficial: Object.assign({
    w5hPct: 23, w5hResetAt: SEC + 3600,
    w7dPct: 61, w7dResetAt: SEC + 86400,
    w7dOpusPct: 92, w7dOpusResetAt: SEC + 86400,
    capturedAt: SEC, source: "claude-code", stale: false,
  }, extra || {}),
});

test("windowsCard — absente -> null", () => {
  assert.equal(CET.windowsCard({}, Date.now()), null);
  assert.equal(CET.windowsCard(null, Date.now()), null);
  assert.equal(CET.windowsCard({ windowsOfficial: null }, Date.now()), null);
});

test("windowsCard — fenêtres présentes -> 3 lignes structurées", () => {
  const r = CET.windowsCard(officialD(), Date.now());
  assert.equal(r.stale, false);
  assert.equal(r.source, "claude-code");
  assert.equal(r.capturedAt, SEC * 1000);        // secondes -> ms
  assert.equal(r.rows.length, 3);
  const keys = r.rows.map(x => x.key);
  assert.deepEqual(keys, ["w5h", "w7d", "w7dOpus"]);
  assert.deepEqual(r.rows.map(x => x.label),
    ["Fenêtre 5 h", "Cette semaine · tous modèles", "Cette semaine · Opus"]);
  // resets convertis en ms
  assert.equal(r.rows[0].resetAt, (SEC + 3600) * 1000);
});

test("windowsCard — fenêtre Opus optionnelle omise si absente", () => {
  const r = CET.windowsCard(officialD({ w7dOpusPct: undefined, w7dOpusResetAt: undefined }), Date.now());
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map(x => x.key), ["w5h", "w7d"]);
});

test("windowsCard — flag stale conservé", () => {
  const r = CET.windowsCard(officialD({ stale: true }), Date.now());
  assert.equal(r.stale, true);
  assert.equal(r.rows.length, 3);                // on garde les valeurs même périmées
});

test("windowsCard — seuils de couleur sage/ambre/brique", () => {
  const r = CET.windowsCard(officialD({ w5hPct: 49, w7dPct: 50, w7dOpusPct: 86 }), Date.now());
  assert.equal(r.rows[0].level, "sage");  assert.equal(r.rows[0].color, "#7E9466"); // 49 < 50
  assert.equal(r.rows[1].level, "amber"); assert.equal(r.rows[1].color, "#C8923D"); // 50..85
  assert.equal(r.rows[2].level, "brick"); assert.equal(r.rows[2].color, "#A8432F"); // > 85
  // bornes hautes : 85 reste ambre, 100 reste brique
  const r2 = CET.windowsCard(officialD({ w5hPct: 85, w7dPct: 100 }), Date.now());
  assert.equal(r2.rows[0].level, "amber");
  assert.equal(r2.rows[1].level, "brick");
});

test("windowsCard — pct borné 0..100 et arrondi", () => {
  const r = CET.windowsCard(officialD({ w5hPct: -5, w7dPct: 120.6, w7dOpusPct: 61.4 }), Date.now());
  assert.equal(r.rows[0].pct, 0);
  assert.equal(r.rows[1].pct, 100);
  assert.equal(r.rows[2].pct, 61);
});

// ---------- Notifications par paliers (windowAlerts) ----------
const offD = (o) => ({ windowsOfficial: Object.assign({ capturedAt: 1, source: "oauth", stale: false }, o) });

test("windowAlerts — franchit les paliers 25/50/75/90/95/100 sur 5h", () => {
  const r = CET.windowAlerts(offD({ w5hPct: 77, w5hResetAt: 1000 }), {});
  const marks = r.alerts.map(a => a.mark).sort((a,b)=>a-b);
  assert.deepEqual(marks, [25, 50, 75]);            // 77% -> 25,50,75 franchis
  assert.equal(r.alerts[0].label, "fenêtre 5 h");
});

test("windowAlerts — ne renotifie pas un palier déjà franchi", () => {
  const d = offD({ w5hPct: 60, w5hResetAt: 1000 });
  const r1 = CET.windowAlerts(d, {});
  assert.equal(r1.alerts.length, 2);                // 25, 50
  const r2 = CET.windowAlerts(d, r1.fired);         // même fenêtre, même %
  assert.equal(r2.alerts.length, 0);                // rien de neuf
});

test("windowAlerts — un nouveau reset relance les paliers", () => {
  const r1 = CET.windowAlerts(offD({ w5hPct: 30, w5hResetAt: 1000 }), {});
  assert.equal(r1.alerts.length, 1);                // 25
  // fenêtre remise à zéro (reset différent), % repart
  const r2 = CET.windowAlerts(offD({ w5hPct: 30, w5hResetAt: 2000 }), r1.fired);
  assert.equal(r2.alerts.length, 1);                // 25 de la NOUVELLE fenêtre
});

test("windowAlerts — 5h ET hebdo indépendants", () => {
  const r = CET.windowAlerts(offD({ w5hPct: 95, w5hResetAt: 1, w7dPct: 51, w7dResetAt: 2 }), {});
  const labels = [...new Set(r.alerts.map(a => a.label))].sort();
  assert.deepEqual(labels, ["fenêtre 5 h", "fenêtre hebdo"]);
  assert.ok(r.alerts.some(a => a.label === "fenêtre 5 h" && a.mark === 95));
  assert.ok(r.alerts.some(a => a.label === "fenêtre hebdo" && a.mark === 50));
});

test("windowAlerts — JAMAIS de notif sur une estimation (stale)", () => {
  const r = CET.windowAlerts(offD({ w5hPct: 99, w5hResetAt: 1, stale: true }), {});
  assert.equal(r.alerts.length, 0);
});

test("windowAlerts — pas de windowsOfficial -> rien", () => {
  assert.equal(CET.windowAlerts({}, {}).alerts.length, 0);
});

// ---------- Gating Pro (planFromData) : FAIL-OPEN ----------
test("planFromData — pas de clé API -> pro (self-hosted/dev)", () => {
  assert.equal(CET.planFromData(null, { user: { plan: "free" } }), "pro");
  assert.equal(CET.planFromData("", { user: { plan: "free" } }), "pro");
});

test("planFromData — démo (pas de user.plan) -> pro, tout ouvert", () => {
  assert.equal(CET.planFromData("cet_abc", { demo: true }), "pro");
  assert.equal(CET.planFromData("cet_abc", {}), "pro");
  assert.equal(CET.planFromData("cet_abc", null), "pro");
});

test("planFromData — hébergé + plan free -> free (seul cas bridé)", () => {
  assert.equal(CET.planFromData("cet_abc", { user: { plan: "free" } }), "free");
});

test("planFromData — hébergé + plan pro -> pro", () => {
  assert.equal(CET.planFromData("cet_abc", { user: { plan: "pro" } }), "pro");
});

// ---------- Waste Radar (wasteRadarCard) ----------
const wasteD = (suspects) => ({ wasteSuspects: suspects });

test("wasteRadarCard — pas de suspects -> null", () => {
  assert.equal(CET.wasteRadarCard({}, 0.9), null);
  assert.equal(CET.wasteRadarCard(wasteD([]), 0.9), null);
  assert.equal(CET.wasteRadarCard(null, 0.9), null);
});

test("wasteRadarCard — total sous 0,5 $ -> null (rien à signaler)", () => {
  const r = CET.wasteRadarCard(wasteD([{ saving: 0.2 }, { saving: 0.1 }]), 0.9);
  assert.equal(r, null);
});

test("wasteRadarCard — somme des saving + conversion USD->€", () => {
  const suspects = [
    { sessionId: "s1", title: "Renommer des variables", project: "app", saving: 2.0, reason: "sortie courte" },
    { sessionId: "s2", title: "Formatter du JSON", project: "app", saving: 1.5, reason: "peu de tokens" },
  ];
  const r = CET.wasteRadarCard(wasteD(suspects), 0.9);
  assert.equal(r.count, 2);
  assert.equal(r.totalUsd, 3.5);
  assert.ok(Math.abs(r.totalEur - 3.15) < 1e-9);   // 3.5 * 0.9
  assert.equal(r.hasRate, true);
  assert.equal(r.top.length, 2);
  assert.equal(r.top[0].title, "Renommer des variables");
  assert.ok(Math.abs(r.top[0].savingEur - 1.8) < 1e-9);
});

test("wasteRadarCard — sans taux -> reste en $ (rate=1, hasRate=false)", () => {
  const r = CET.wasteRadarCard(wasteD([{ saving: 3 }]), 0);
  assert.equal(r.totalUsd, 3);
  assert.equal(r.totalEur, 3);   // rate défaut 1 -> valeur $ brute
  assert.equal(r.hasRate, false);
});

test("wasteRadarCard — top borné à 8", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ saving: 0.2, title: "t" + i }));
  const r = CET.wasteRadarCard(wasteD(many), 0.9);
  assert.equal(r.count, 30);
  assert.equal(r.top.length, 8);
});

// ---------- Boîte noire (boiteNoireCard) ----------
const anomD = (anoms) => ({ anomalies: anoms });

test("boiteNoireCard — [] -> null", () => {
  assert.equal(CET.boiteNoireCard({}), null);
  assert.equal(CET.boiteNoireCard(anomD([])), null);
  assert.equal(CET.boiteNoireCard(null), null);
});

test("boiteNoireCard — sous-agents dominants -> la phrase parle des sous-agents", () => {
  const r = CET.boiteNoireCard(anomD([{
    window: "w-1", z: 4.2, total: 5e8, sidechainShare: 0.72,
    cacheMiss5m: 0, cacheMiss1h: 0.1, topProject: "brandpulse-app",
  }]));
  assert.ok(r);
  assert.match(r.sentence, /sous-agents/);
  assert.match(r.sentence, /brandpulse-app/);
  assert.match(r.sentence, /72 %/);
  assert.equal(r.share, 72);
  assert.equal(r.severity, "mid");   // z=4.2 -> 3..5
});

test("boiteNoireCard — cacheMiss5m=0 -> ne MENT jamais sur le cache court", () => {
  // sous-agents faibles, cache5m nul, cache1h fort -> doit parler de 1h, pas des minutes
  const r = CET.boiteNoireCard(anomD([{
    window: "w-2", z: 6, total: 8e8, sidechainShare: 0.1,
    cacheMiss5m: 0, cacheMiss1h: 0.55, topProject: "serp-scraper",
  }]));
  assert.ok(r);
  assert.doesNotMatch(r.sentence, /quelques minutes/); // garde-fou anti-mensonge
  assert.match(r.sentence, /heure/);                   // parle bien de 1 h
  assert.equal(r.severity, "high");                    // z=6 >= 5
});

test("boiteNoireCard — cacheMiss5m significatif -> parle du contexte récent (minutes)", () => {
  const r = CET.boiteNoireCard(anomD([{
    window: "w-3", z: 3.5, total: 4e8, sidechainShare: 0.2,
    cacheMiss5m: 0.6, cacheMiss1h: 0.1, topProject: "kapman-news",
  }]));
  assert.match(r.sentence, /quelques minutes/);
});

test("boiteNoireCard — prend la plus grosse anomalie (z max)", () => {
  const r = CET.boiteNoireCard(anomD([
    { window: "a", z: 3.1, sidechainShare: 0.6, topProject: "petit" },
    { window: "b", z: 7.5, sidechainShare: 0.8, topProject: "gros" },
  ]));
  assert.equal(r.window, "b");
  assert.match(r.sentence, /gros/);
});
