/* format.js — helpers de formatage/calcul PURS (sans DOM, sans état).
   Chargé via <script> avant app.js : expose window.CET.
   Aussi importable en Node (tests/test_format.mjs) : module.exports.
   Aucune dépendance. */
(function (root) {
  "use strict";

  var COLORS = { opus: "#CC785C", sonnet: "#6A8CAF", haiku: "#7E9E6D", default: "#D4A27F" };

  function modelColor(l) {
    l = (l || "").toLowerCase();
    return l.indexOf("opus") >= 0 ? COLORS.opus
      : l.indexOf("sonnet") >= 0 ? COLORS.sonnet
      : l.indexOf("haiku") >= 0 ? COLORS.haiku : COLORS.default;
  }

  // Nombre compact FR : 1 234 567 -> "1,2 M", 2.1e9 -> "2,1 Md".
  function fmt(n) {
    n = n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " Md";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + " k";
    return String(Math.round(n));
  }

  function fmtFull(n) { return (n || 0).toLocaleString("fr-FR"); }

  // Pourcentage borné [0..999] ; 0 si budget nul.
  function pct(a, b) { return b ? Math.min(999, Math.round((a / b) * 100)) : 0; }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  // Couleur d'anneau selon le % et le seuil d'alerte (warnPct).
  function ringColor(p, warnPct) {
    return p >= 100 ? "#B5563A" : p >= warnPct ? "#C8923D" : (p >= 50 ? "#C8923D" : "#7E9E6D");
  }

  function toneOf(p, warnPct) {
    return p >= 100 ? "bad" : p >= warnPct ? "bad" : (p >= 50 ? "warn" : "ok");
  }

  // "il y a X min/h/j" à partir d'un ISO et d'un now (ms) injectable (testable).
  function ago(iso, nowMs) {
    if (!iso) return "—";
    var now = nowMs == null ? Date.now() : nowMs;
    var m = (now - new Date(iso).getTime()) / 60000;
    if (m < 1) return "à l'instant";
    if (m < 60) return "il y a " + Math.round(m) + " min";
    if (m < 1440) return "il y a " + Math.round(m / 60) + " h";
    return "il y a " + Math.round(m / 1440) + " j";
  }

  // "reset dans X" à partir d'un ISO futur et d'un now injectable.
  function until(iso, nowMs) {
    if (!iso) return "";
    var now = nowMs == null ? Date.now() : nowMs;
    var m = (new Date(iso).getTime() - now) / 60000;
    if (m <= 0) return "réinitialisée";
    if (m < 60) return "reset dans " + Math.round(m) + " min";
    return "reset dans " + Math.round(m / 60) + " h " + Math.round(m % 60) + " min";
  }

  function dayLabel(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  // Anneau de progression SVG. Pur : ne dépend que des arguments.
  function ringSVG(p, size, stroke, track, fg, centerHTML) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(p, 100) / 100);
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + track + '" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + fg + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      (centerHTML || "");
  }

  var api = {
    COLORS: COLORS, modelColor: modelColor, fmt: fmt, fmtFull: fmtFull,
    pct: pct, esc: esc, ringColor: ringColor, toneOf: toneOf, ago: ago,
    until: until, dayLabel: dayLabel, ringSVG: ringSVG,
  };

  root.CET = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
