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
