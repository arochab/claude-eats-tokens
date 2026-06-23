// Tests des helpers purs front (tests/test_format.mjs).
// Lance : node --test tests/test_format.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
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
  assert.match(w5.msg, /Fenêtre 5 h/);
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
  assert.match(bd.msg, /95%/);
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
