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

  // ---------- stats robustes (pour l'assistant) ----------
  function median(a) { var s = a.filter(function (v) { return v != null; }).sort(function (x, y) { return x - y; }); var n = s.length; if (!n) return 0; var m = n >> 1; return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  /* ---------- ASSISTANT TOKEN INTELLIGENT ----------
     Conçu par une équipe d'experts (séries temporelles, rate-limits Max, UX).
     Compare Adam à LUI-MÊME (stats robustes), jamais à un quota inventé.
     Retourne un tableau ordonné de signaux {id, level, title, msg, why}.
     100% pur : nowMs injectable, lecture défensive, [] si données insuffisantes. */
  function assistant(d, nowMs) {
    var out = [];
    if (!d) return out;
    var now = nowMs == null ? Date.now() : nowMs;
    var pace = d.pace || {};
    var win = d.windows || {};
    var base5h = pace.baseline5h || null;       // {base, high, medianLog, madLog, nDays}
    var w5h = win.w5h ? win.w5h.total : 0;

    // --- 1) Saturation de la fenêtre 5h (la vraie limite Max) ---
    if (base5h && base5h.base > 0 && win.w5hResetAt) {
      var ratioFen = w5h / base5h.base;
      var resetMs = Date.parse(win.w5hResetAt);
      var hoursLeft = isFinite(resetMs) ? Math.max(0, (resetMs - now) / 3600000) : 0;
      // débit récent : on approxime par w5h / heures écoulées dans la fenêtre (5 - hoursLeft)
      var hoursElapsed = Math.max(0.2, 5 - hoursLeft);
      var burn = w5h / hoursElapsed;                       // tokens/h
      var proj = w5h + burn * hoursLeft;                   // valeur au reset si le rythme tient
      var marge = base5h.high - w5h;
      var etaH = burn > 0 ? marge / burn : Infinity;       // ETA avant zone inhabituelle
      if (hoursLeft >= 0.5 && ratioFen >= 2) {
        var bad = (proj >= base5h.high && etaH < hoursLeft);
        out.push({
          id: "w5h", level: bad ? "bad" : "warn",
          title: bad ? "Tu vas peut-être être ralenti" : "Tu utilises beaucoup Claude là",
          msg: "Ces 5 dernières heures, tu utilises Claude " + xtimes(ratioFen) + ". "
            + (bad ? "Si tu continues à ce rythme, Claude pourrait te ralentir dans ~" + hms(etaH) + " (avant que ça se remette à zéro à " + clock(resetMs) + "). Pour les grosses tâches, attends ce moment-là."
                   : "Ça se remet à zéro à " + clock(resetMs) + "."),
          why: "Sur Claude Max, c'est ça qui peut te ralentir : trop d'usage en 5 h. On te prévient avant.",
        });
      }
    }

    // --- 2) Grosse journée vs ton habitude ---
    var rank = pace.todayRank, med = pace.medianPerDay || pace.medianDay || 0;
    var hourLocal = new Date(now).getHours();
    if (typeof rank === "number" && rank >= 90 && hourLocal < 18) {
      var ratioMed = med ? (pace.todayTotal || 0) / med : 0;
      out.push({
        id: "bigday", level: rank >= 97 ? "warn" : "info",
        title: "Grosse journée",
        msg: "Aujourd'hui tu utilises Claude " + (ratioMed ? xtimes(ratioMed) : "beaucoup") + ", et il n'est que " + hourLocal + " h.",
        why: "Juste pour info — rien ne te bloque, c'est ton rythme du jour.",
      });
    }

    // --- 3) Beaucoup d'Opus cette semaine (modèle au quota le plus serré) ---
    var w7d = win.w7d ? win.w7d.total : 0;
    var models = d.models || [];
    var totalTok = models.reduce(function (a, m) { return a + (m.total || 0); }, 0) || 1;
    var opus = models.filter(function (m) { return (m.model || "").indexOf("opus") >= 0; })
                     .reduce(function (a, m) { return a + (m.total || 0); }, 0);
    var partOpus = Math.round(opus / totalTok * 100);
    var weeks = (d.weekly && d.weekly.weeks) ? d.weekly.weeks.map(function (w) { return w.total; }) : [];
    if (weeks.length >= 3 && w7d > 0 && partOpus >= 80) {
      var medW = median(weeks.slice(0, -1));
      var ratioSem = medW ? w7d / medW : 0;
      if (ratioSem >= 2) {
        out.push({
          id: "opusweek", level: "info", title: "Beaucoup d'Opus cette semaine",
          msg: "Cette semaine tu utilises Claude " + xtimes(ratioSem) + ", surtout le modèle Opus (le plus puissant).",
          why: "Opus a la limite hebdomadaire la plus serrée sur Max — bon à savoir si grosse fin de semaine.",
        });
      }
    }

    // tri par gravité (bad > warn > info), max 3
    var order = { bad: 0, warn: 1, info: 2 };
    out.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return out.slice(0, 3);
  }
  function hms(h) { if (!isFinite(h)) return "—"; if (h <= 0) return "à l'instant"; if (h < 1) return Math.round(h * 60) + " min"; return Math.floor(h) + " h " + Math.round((h % 1) * 60) + " min"; }
  function clock(ms) { var dt = new Date(ms); return dt.getHours() + " h" + (dt.getMinutes() ? String(dt.getMinutes()).padStart(2, "0") : ""); }
  // multiple en langage HUMAIN : "comme d'habitude" / "2 fois plus que d'habitude"
  function xtimes(ratio) {
    if (ratio < 1.25) return "comme d'habitude";
    if (ratio < 1.75) return "un peu plus que d'habitude";
    var r = ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio);
    return String(r).replace(".", ",") + " fois plus que d'habitude";
  }
  function xtimesShort(ratio) {
    if (ratio < 1.25) return "comme d'habitude";
    var r = ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio);
    return "×" + String(r).replace(".", ",") + " vs d'habitude";
  }

  /* ---------- FEU TRICOLORE UNIFIÉ (user-first) ----------
     UNE réponse : "je peux continuer ?" = le PIRE risque parmi tes 3 horizons
     (fenêtre 5 h, semaine glissante, mois). Sur Max, seule la fenêtre 5 h peut
     vraiment te RALENTIR -> elle seule peut virer au rouge ; semaine/mois = info.
     Retourne {level:'green'|'orange'|'red', title, msg, gauges:[...]}.
     Pur, nowMs injectable, dégradé propre si données manquantes. */
  function status(d, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var pace = (d && d.pace) || {}, win = (d && d.windows) || {};
    var gauges = [], worst = "green", worstSignal = null;
    var LV = { green: 0, orange: 1, red: 2 };
    function bump(level, sig) { if (LV[level] > LV[worst]) { worst = level; worstSignal = sig; } }

    // --- "Là, maintenant" (5 dernières heures) : la SEULE qui peut te ralentir ---
    var base5h = pace.baseline5h;
    if (base5h && base5h.base > 0) {
      var w5 = win.w5h ? win.w5h.total : 0;
      var ratio5 = w5 / base5h.base;
      var resetMs = win.w5hResetAt ? Date.parse(win.w5hResetAt) : NaN;
      var hoursLeft = isFinite(resetMs) ? Math.max(0, (resetMs - now) / 3600000) : null;
      var resetTxt = hoursLeft != null ? (hoursLeft <= 0.02 ? " Ça se remet à zéro maintenant." : " Ça se remet à zéro dans " + hms(hoursLeft) + ".") : "";
      var lvl, msg, pctFill = Math.min(100, Math.round((w5 / base5h.high) * 100));
      if (w5 >= base5h.high * 0.85) {
        lvl = "red"; msg = "Tu as beaucoup utilisé Claude ces 5 dernières heures — il pourrait te ralentir bientôt." + resetTxt;
      } else if (ratio5 >= 4 || (w5 >= base5h.high * 0.6)) {
        lvl = "orange"; msg = "Tu utilises Claude " + xtimes(ratio5) + " ces 5 dernières heures. Finis ce que tu fais, puis souffle un peu." + resetTxt;
      } else {
        lvl = "green"; msg = "Rien à signaler : tu peux continuer tranquille.";
      }
      gauges.push({ key: "5h", label: "Là, maintenant", fill: pctFill, level: lvl,
        sub: hoursLeft != null ? (hoursLeft <= 0.02 ? "se remet à zéro" : "se remet à zéro dans " + hms(hoursLeft)) : "", value: fmt(w5) });
      bump(lvl, msg);
    }

    // --- Cette semaine : info (orange max, jamais rouge : pas un mur dur ici) ---
    var weeks = (d && d.weekly && d.weekly.weeks) ? d.weekly.weeks.map(function (w) { return w.total; }) : [];
    if (weeks.length >= 3 && win.w7d) {
      var w7 = win.w7d.total, medW = median(weeks.slice(0, -1));
      if (medW > 0) {
        var rW = w7 / medW;
        var lvlW = rW >= 2.5 ? "orange" : "green";
        gauges.push({ key: "7d", label: "Cette semaine", fill: Math.min(100, Math.round(rW / 3 * 100)),
          level: lvlW, sub: xtimesShort(rW), value: fmt(w7) });
        if (lvlW === "orange") bump("orange", "Cette semaine, tu utilises Claude " + xtimes(rW) + ".");
      }
    }

    // --- Ce mois : info (orange max) ---
    if (d && d.month && typeof d.month.ratio3m === "number") {
      var rM = d.month.ratio3m / 100;  // ratio (1 = comme d'habitude)
      var lvlM = rM >= 2.5 ? "orange" : "green";
      gauges.push({ key: "month", label: "Ce mois", fill: Math.min(100, Math.round(rM / 3 * 100)),
        level: lvlM, sub: xtimesShort(rM), value: fmt(d.month.currentMonth || 0) });
      if (lvlM === "orange") bump("orange", "Ce mois, tu utilises Claude " + xtimes(rM) + ".");
    }

    var titles = {
      green: "Tout va bien, continue",
      orange: "Tu y vas fort — garde un œil",
      red: "Lève le pied un moment",
    };
    return {
      level: worst,
      title: titles[worst],
      msg: worstSignal || (gauges.length ? "Tu utilises Claude normalement, rien à signaler." : "Pas encore assez d'historique pour évaluer."),
      gauges: gauges,
    };
  }

  var api = {
    COLORS: COLORS, modelColor: modelColor, fmt: fmt, fmtFull: fmtFull,
    pct: pct, esc: esc, ringColor: ringColor, toneOf: toneOf, ago: ago,
    until: until, dayLabel: dayLabel, ringSVG: ringSVG,
    median: median, assistant: assistant, status: status,
  };

  root.CET = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
