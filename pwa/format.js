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

  /* ---------- "Utilisation du forfait" (style page Claude) ----------
     Tokens EFFECTIFS : le cache lu est quasi gratuit -> pondéré (kCache=0.1).
     Sinon on afficherait 300% là où Claude affiche 11%. */
  function effectiveTokens(acc, kCache) {
    if (!acc) return 0;
    var k = (kCache == null) ? 0.1 : kCache;
    return (acc.input || 0) + (acc.cacheCreate || 0) + (acc.output || 0) + k * (acc.cacheRead || 0);
  }
  // prochain reset hebdo (par défaut lundi 00:00 local). nowMs injectable (testable).
  function nextWeeklyReset(nowMs, resetDay, resetHour) {
    var now = nowMs == null ? Date.now() : nowMs;
    var rd = (resetDay == null) ? 1 : resetDay;   // 1 = lundi
    var rh = (resetHour == null) ? 0 : resetHour;
    var dt = new Date(now);
    dt.setHours(rh, 0, 0, 0);
    // jours jusqu'au prochain resetDay (JS: 0=dim..6=sam ; on veut 1=lun)
    var cur = dt.getDay() === 0 ? 7 : dt.getDay();
    var delta = ((rd - cur) + 7) % 7;
    if (delta === 0 && dt.getTime() <= now) delta = 7;  // si on est pile dessus/passé -> +7j
    dt.setDate(dt.getDate() + delta);
    return dt.getTime();
  }
  function weeklyResetLabel(ms) {
    return new Date(ms).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  }

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

    // --- 2) Grosse journée vs ton habitude : POSITIF (tu avances bien) ---
    var rank = pace.todayRank, med = pace.medianPerDay || pace.medianDay || 0;
    var hourLocal = new Date(now).getHours();
    if (typeof rank === "number" && rank >= 90 && hourLocal < 18) {
      var ratioMed = med ? (pace.todayTotal || 0) / med : 0;
      out.push({
        id: "bigday", level: "info",
        title: "Belle journée de travail",
        msg: "Aujourd'hui tu utilises Claude " + (ratioMed ? xtimes(ratioMed) : "beaucoup") + ", et il n'est que " + hourLocal + " h. Tu avances bien.",
        why: "C'est ton rythme du jour — rien ne te bloque.",
      });
    }

    // --- 3) Beaucoup d'Opus cette semaine : POSITIF (tu sors le grand jeu) ---
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
          id: "opusweek", level: "info", title: "Tu montes en puissance avec Opus",
          msg: "Cette semaine tu utilises Claude " + xtimes(ratioSem) + ", surtout Opus, le modèle le plus puissant. Tu prends de l'élan.",
          why: "Bon à savoir : Opus est le modèle premium. Le seul moment où il peut te ralentir, c'est si tu satures la fenêtre de 5 h.",
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
      // si on a le VRAI % officiel (serveur), on l'affiche tel quel — un % se lit,
      // pas un nombre de tokens bruts rempli sur un repère maison estimé.
      var off = d && d.windowsOfficial;
      var hasOffPct = off && typeof off.w5hPct === "number" && isFinite(off.w5hPct);
      gauges.push({ key: "5h", label: "Là, maintenant",
        fill: hasOffPct ? Math.min(100, Math.round(off.w5hPct)) : pctFill, level: lvl,
        sub: hoursLeft != null ? (hoursLeft <= 0.02 ? "se remet à zéro" : "se remet à zéro dans " + hms(hoursLeft)) : "",
        value: hasOffPct ? (Math.round(off.w5hPct) + "%") : fmt(w5) });
      bump(lvl, msg);
    }

    // --- Cette semaine : INFO seulement. Sur Max, la semaine n'est pas un mur
    //     dur : une semaine intense = tu montes en puissance, pas une alerte.
    //     Elle ne fait JAMAIS virer le feu -> on note juste si ça grimpe fort. ---
    var weeks = (d && d.weekly && d.weekly.weeks) ? d.weekly.weeks.map(function (w) { return w.total; }) : [];
    var growing = false, growRatio = 0;
    if (weeks.length >= 3 && win.w7d) {
      var w7 = win.w7d.total, medW = median(weeks.slice(0, -1));
      if (medW > 0) {
        var rW = w7 / medW;
        growing = rW >= 2.5; growRatio = rW;
        gauges.push({ key: "7d", label: "Cette semaine", fill: Math.min(100, Math.round(rW / 3 * 100)),
          level: "green", sub: xtimesShort(rW), value: fmt(w7) });
      }
    }

    // --- Ce mois : INFO seulement (jamais d'alerte non plus) ---
    if (d && d.month && typeof d.month.ratio3m === "number") {
      var rM = d.month.ratio3m / 100;  // ratio (1 = comme d'habitude)
      if (rM >= 2.5) { growing = true; growRatio = Math.max(growRatio, rM); }
      gauges.push({ key: "month", label: "Ce mois", fill: Math.min(100, Math.round(rM / 3 * 100)),
        level: "green", sub: xtimesShort(rM), value: fmt(d.month.currentMonth || 0) });
    }

    // Vert "montée en puissance" : seulement si le feu reste vert (5 h calme)
    // mais que la semaine/mois grimpe fort. C'est une bonne nouvelle, pas une alerte.
    if (worst === "green" && growing) {
      return {
        level: "green",
        title: "Belle semaine — tu montes en puissance",
        msg: "Tu utilises Claude " + xtimes(growRatio) + " en ce moment. C'est normal : tu prends de l'élan. Rien ne te bloque.",
        gauges: gauges,
      };
    }

    var titles = {
      green: "Tout roule",
      orange: "Ça chauffe sur les 5 dernières heures",
      red: "Lève le pied un moment",
    };
    return {
      level: worst,
      title: titles[worst],
      msg: worstSignal || (gauges.length ? "Tu peux continuer tranquille, rien ne te freine." : "Pas encore assez d'historique pour évaluer."),
      gauges: gauges,
    };
  }

  /* ---------- "OÙ JE ME SITUE" (positionnement vs autres abonnés Max) ----------
     Place l'utilisateur sur un spectre Découverte → Régulier → Intensif →
     Power-user, à partir de sa SEMAINE EFFECTIVE (cache lu pondéré, comme la
     carte "Utilisation du forfait"). IMPORTANT : les seuils sont des ESTIMATIONS
     PUBLIQUES, pas des chiffres officiels Anthropic (qui ne publie aucun quota
     chiffré). Le vrai signal "Max" reste le pic 5 h vs la limite de fenêtre.
     Pur, testable sous Node. bench = {decouverte, regulier, intensif, lim5h,
     enveloppeHebdo, kCache}. */
  var POSITION_BENCH = {
    // tokens EFFECTIFS / semaine — repères de FAIBLE confiance, à recalibrer
    decouverte: 0.3e9,   // en-dessous : on essaie, quelques sessions
    regulier: 2e9,       // usage quotidien installé
    intensif: 6e9,       // au-delà : power-user
    // réutilisés depuis le forfait (Max 20x par défaut), pas dupliqués côté front
    lim5h: 600e6,
    enveloppeHebdo: 9500e6,
    kCache: 0.1,
  };
  var POSITION_TIERS = ["Découverte", "Régulier", "Intensif", "Power-user"];

  function position(d, bench, nowMs) {
    var b = Object.assign({}, POSITION_BENCH, bench || {});
    var win = (d && d.windows) || {};
    if (!win.w7d) return null;                       // pas assez de données
    var effWeek = effectiveTokens(win.w7d, b.kCache);
    var eff5h = win.w5h ? effectiveTokens(win.w5h, b.kCache) : 0;

    // palier de base d'après la semaine effective
    var tierIndex = effWeek < b.decouverte ? 0
                  : effWeek < b.regulier ? 1
                  : effWeek < b.intensif ? 2 : 3;
    // le pic 5 h est le VRAI signal Max : s'il frôle/dépasse la limite -> power-user
    var brushes5h = b.lim5h > 0 && eff5h >= b.lim5h * 0.8;
    if (brushes5h || effWeek >= b.intensif) tierIndex = Math.max(tierIndex, 3);

    // position du marqueur sur le spectre (échelle LOG, ~2 ordres de grandeur)
    var lo = Math.log10(Math.max(1, b.decouverte));
    var hi = Math.log10(Math.max(b.decouverte * 10, b.intensif * 1.6));
    var lv = Math.log10(Math.max(1, effWeek));
    var markerPct = Math.max(2, Math.min(100, Math.round((lv - lo) / (hi - lo) * 100)));

    // ratio vs la semaine médiane (réutilise la même médiane que status())
    var weeks = (d && d.weekly && d.weekly.weeks) ? d.weekly.weeks.map(function (w) { return w.total; }) : [];
    var medW = weeks.length >= 2 ? median(weeks.slice(0, -1)) : 0;
    var ratioMedian = medW > 0 ? win.w7d.total / medW : 0;

    var pctEnveloppe = b.enveloppeHebdo > 0 ? Math.round(effWeek / b.enveloppeHebdo * 100) : 0;
    var pct5h = b.lim5h > 0 ? Math.round(eff5h / b.lim5h * 100) : 0;

    return {
      tierIndex: tierIndex,
      tierLabel: POSITION_TIERS[tierIndex],
      markerPct: markerPct,
      effWeek: effWeek,
      eff5h: eff5h,
      ratioMedian: ratioMedian,
      pctEnveloppe: pctEnveloppe,
      pct5h: pct5h,
      brushes5h: brushes5h,
    };
  }

  /* ---------- "MES FENÊTRES" (les VRAIS % officiels) ----------
     Construit les lignes à afficher à partir de d.windowsOfficial (schéma v4) :
     {w5hPct, w5hResetAt, w7dPct, w7dResetAt, w7dOpusPct?, w7dOpusResetAt?,
      capturedAt, source, stale}. Les resets sont en SECONDES epoch (capturés
      par le moteur côté PC) -> convertis en ms ici, une bonne fois.
     Pur, testable : retourne null si pas de données officielles, sinon
     { stale, capturedAt(ms), rows:[{key,label,pct,resetAt(ms),level,color}] }.
     On n'invente JAMAIS de chiffre : une fenêtre absente (pct null/undefined)
     est simplement omise. Seuils : sage <50, ambre 50–85, brique >85. */
  function windowsLevel(p) {
    return p > 85 ? "brick" : (p >= 50 ? "amber" : "sage");
  }
  var WINDOWS_COLORS = { sage: "#7E9466", amber: "#C8923D", brick: "#A8432F" };
  function windowsCard(d, nowMs) {
    var w = d && d.windowsOfficial;
    if (!w) return null;                       // pas de capture officielle -> état vide
    var secToMs = function (s) { return (typeof s === "number" && isFinite(s)) ? s * 1000 : null; };
    var defs = [
      { key: "w5h", label: "Fenêtre 5 h", pct: w.w5hPct, resetAt: w.w5hResetAt },
      { key: "w7d", label: "Cette semaine · tous modèles", pct: w.w7dPct, resetAt: w.w7dResetAt },
      { key: "w7dOpus", label: "Cette semaine · Opus", pct: w.w7dOpusPct, resetAt: w.w7dOpusResetAt },
    ];
    var rows = [];
    defs.forEach(function (def) {
      if (typeof def.pct !== "number" || !isFinite(def.pct)) return;  // fenêtre absente -> omise
      var p = Math.max(0, Math.min(100, Math.round(def.pct)));
      var level = windowsLevel(p);
      rows.push({
        key: def.key, label: def.label, pct: p,
        resetAt: secToMs(def.resetAt), level: level, color: WINDOWS_COLORS[level],
      });
    });
    return {
      stale: !!w.stale,
      source: w.source || null,
      capturedAt: secToMs(w.capturedAt),
      rows: rows,
    };
  }

  /* ---------- NOTIFICATIONS PAR PALIERS (vrai % officiel 5h / 7j) ----------
     Paliers demandés : 25 / 50 / 75 / 90 / 95 / 100 %. On notifie au
     FRANCHISSEMENT (passage au-dessus), une seule fois par palier et par
     fenêtre, tant que la fenêtre n'a pas été remise à zéro (reset -> on oublie
     les paliers franchis). Pur et testable : on ne déclenche que sur le VRAI %
     officiel (d.windowsOfficial), jamais sur une estimation.
     fired = état mémorisé { "5h:1750000000:75":1, ... } (clé = fenêtre+reset+palier).
     Retourne { alerts:[{key,label,pct,mark}], fired } — fired mis à jour. */
  var WINDOW_MARKS = [25, 50, 75, 90, 95, 100];

  function windowAlerts(d, fired) {
    fired = fired || {};
    var out = [];
    var off = d && d.windowsOfficial;
    if (!off || off.stale) return { alerts: out, fired: fired };  // pas de notif sur estimation
    function check(pctKey, resetKey, label) {
      var p = off[pctKey];
      if (typeof p !== "number" || !isFinite(p)) return;
      // identifiant de fenêtre = son reset (change à chaque nouvelle fenêtre)
      var win = label + ":" + (off[resetKey] || 0);
      for (var i = 0; i < WINDOW_MARKS.length; i++) {
        var m = WINDOW_MARKS[i];
        if (p >= m) {
          var key = win + ":" + m;
          if (!fired[key]) { fired[key] = 1; out.push({ key: key, label: label, pct: Math.round(p), mark: m }); }
        }
      }
    }
    check("w5hPct", "w5hResetAt", "fenêtre 5 h");
    check("w7dPct", "w7dResetAt", "fenêtre hebdo");
    // purge des clés d'anciennes fenêtres (reset passé) pour ne pas gonfler indéfiniment
    var keep = {};
    var active5 = "fenêtre 5 h:" + (off.w5hResetAt || 0);
    var active7 = "fenêtre hebdo:" + (off.w7dResetAt || 0);
    Object.keys(fired).forEach(function (k) {
      if (k.indexOf(active5) === 0 || k.indexOf(active7) === 0) keep[k] = fired[k];
    });
    return { alerts: out, fired: keep };
  }

  /* ---------- GATING PRO (fail-open délibéré) ----------
     Règle d'or : on ne bride QUE l'utilisateur HÉBERGÉ (clé API présente) dont
     le serveur dit explicitement plan="free". Tout le reste — self-hosted,
     legacy, démo, dev sans clé — retourne "pro" et voit TOUT. Le front ne
     sécurise rien (le serveur tronque déjà le payload free) : ceci ne pilote
     que le confort d'affichage. Pur & testable : pas de DOM, pas de window. */
  function planFromData(apiKey, d) {
    var hosted = !!apiKey;
    if (hosted && d && d.user && d.user.plan) return d.user.plan;
    return "pro";  // fail-open : jamais de flou hors du cas hébergé+plan connu
  }

  /* ---------- WASTE RADAR (Pro) — lit d.wasteSuspects[] ----------
     Le serveur a déjà calculé (top 30, en USD) les tâches où de l'Opus a servi
     là où un modèle plus léger aurait suffi. Ici : somme des `saving` -> total €
     récupérable + nb de tâches. GARDE-FOU : on ne juge JAMAIS, on liste des
     "candidats à vérifier". Retourne null si vide ou < 0.5 $ cumulé (rien à
     signaler = pas d'alarmisme). rateEurUsd = taux €/$ des réglages (0 = pas de
     taux -> on reste implicitement en $, totalEur porte alors la valeur $ brute).
     Pur, testable. */
  function wasteRadarCard(d, rateEurUsd) {
    var list = (d && d.wasteSuspects) || [];
    if (!list.length) return null;
    var rate = (rateEurUsd && rateEurUsd > 0) ? rateEurUsd : 1;  // pas de taux -> $ tel quel
    var totalUsd = 0;
    list.forEach(function (s) { totalUsd += (s && s.saving) || 0; });
    if (totalUsd < 0.5) return null;                 // trop peu -> rien à signaler
    var top = list.slice(0, 8).map(function (s) {
      return {
        sessionId: s.sessionId || null,
        title: s.title || "tâche",
        project: s.project || null,
        opusCost: s.opusCost || 0,
        sonnetCost: s.sonnetCost || 0,
        savingUsd: s.saving || 0,
        savingEur: (s.saving || 0) * rate,
        outputTokens: s.outputTokens || 0,
        messageCount: s.messageCount || 0,
        reason: s.reason || "",
      };
    });
    return {
      totalUsd: totalUsd,
      totalEur: totalUsd * rate,
      hasRate: !!(rateEurUsd && rateEurUsd > 0),
      count: list.length,
      top: top,
    };
  }

  /* ---------- BOÎTE NOIRE (Pro) — lit d.anomalies[] ----------
     Le serveur a détecté des pics de fenêtre anormaux (z-score élevé) avec la
     décomposition RÉELLE : part sous-agents (sidechainShare), cache-miss 5 min /
     1 h, projet dominant. On prend la plus grosse anomalie et on GÉNÈRE la phrase
     par TEMPLATE DÉTERMINISTE branché sur les valeurs réelles.
     GARDE-FOU ANTI-MENSONGE CRITIQUE : on ne parle du "cache 5 min expiré" que si
     cacheMiss5m est réellement significatif ; sinon on parle de 1 h ou de
     cache-miss général selon ce qui est vrai. Retourne null si [].
     Pur, testable. */
  function boiteNoireCard(d) {
    var list = (d && d.anomalies) || [];
    if (!list.length) return null;
    // la plus grosse : z-score le plus élevé (à défaut, le plus gros total)
    var a = list.slice().sort(function (x, y) {
      return (y.z || 0) - (x.z || 0) || (y.total || 0) - (x.total || 0);
    })[0];
    if (!a) return null;

    var z = a.z || 0;
    var zTxt = z >= 10 ? Math.round(z) : Math.round(z * 10) / 10;
    var zStr = String(zTxt).replace(".", ",");
    var project = a.topProject || null;
    var share = typeof a.sidechainShare === "number" ? Math.round(a.sidechainShare * 100) : null;
    var miss5 = typeof a.cacheMiss5m === "number" ? a.cacheMiss5m : null;
    var miss1h = typeof a.cacheMiss1h === "number" ? a.cacheMiss1h : null;
    var severity = z >= 5 ? "high" : (z >= 3 ? "mid" : "low");

    var title, sentence;
    // 1) sous-agents dominants : accroche factuelle sur les sous-agents
    if (share != null && a.sidechainShare > 0.5) {
      title = "Ce sont tes sous-agents, pas toi";
      sentence = "Sur " + (project ? project : "ce pic") + ", tes sous-agents ont brûlé " + share +
        " % de cette fenêtre. C'est pour ça qu'elle a fondu " + zStr + "× plus vite que d'habitude.";
    // 2) cache-miss 5 min RÉELLEMENT significatif -> on peut en parler
    } else if (miss5 != null && miss5 >= 0.3) {
      var m5 = Math.round(miss5 * 100);
      title = "Ton contexte est reparti de zéro";
      sentence = "Un gros bout de ta fenêtre (" + m5 + " %) est passé à recréer du cache expiré (5 min)" +
        (project ? " sur " + project : "") + ". Résultat : elle a fondu " + zStr + "× plus vite.";
    // 3) cache-miss 1 h significatif -> on parle de 1 h (jamais de 5 min si miss5≈0)
    } else if (miss1h != null && miss1h >= 0.3) {
      var m1 = Math.round(miss1h * 100);
      title = "Beaucoup de cache à reconstruire";
      sentence = "Environ " + m1 + " % de cette fenêtre est parti à reconstruire du cache d'il y a plus d'une heure" +
        (project ? " sur " + project : "") + ". Elle a fondu " + zStr + "× plus vite que ta normale.";
    // 4) fallback factuel : on constate le pic sans inventer de cause
    } else {
      title = "Ta fenêtre a fondu plus vite";
      sentence = (project ? "Sur " + project + ", cette" : "Cette") + " fenêtre a fondu " + zStr +
        "× plus vite que d'habitude" + (share != null ? " (dont " + share + " % de sous-agents)" : "") + ".";
    }
    return {
      window: a.window || null,
      title: title,
      sentence: sentence,
      share: share,
      project: project,
      z: z,
      zStr: zStr,
      severity: severity,
    };
  }

  var api = {
    COLORS: COLORS, modelColor: modelColor, fmt: fmt, fmtFull: fmtFull,
    pct: pct, esc: esc, ringColor: ringColor, toneOf: toneOf, ago: ago,
    until: until, dayLabel: dayLabel, ringSVG: ringSVG,
    median: median, assistant: assistant, status: status,
    effectiveTokens: effectiveTokens, nextWeeklyReset: nextWeeklyReset, weeklyResetLabel: weeklyResetLabel,
    position: position, POSITION_BENCH: POSITION_BENCH, POSITION_TIERS: POSITION_TIERS,
    xtimes: xtimes, xtimesShort: xtimesShort,
    windowsCard: windowsCard, WINDOWS_COLORS: WINDOWS_COLORS,
    windowAlerts: windowAlerts, WINDOW_MARKS: WINDOW_MARKS,
    planFromData: planFromData, wasteRadarCard: wasteRadarCard, boiteNoireCard: boiteNoireCard,
  };

  root.CET = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
