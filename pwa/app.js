/* Token Tracker V2 — logique front. Dépendance : Chart.js (CDN). */
(function () {
  "use strict";
  /* ---------- source des données ----------
     Renseigne l'URL de ton serveur Render ci-dessous (ou laisse vide).
     Ordre d'essai : serveur Render -> data/usage.json (GitHub Pages) -> démo. */
  var PUSH_SERVER = window.CLAUDE_EATS_TOKENS_SERVER || ""; // ex: "https://claude-eats-tokens.onrender.com"

  /* ---------- Réglages (localStorage) ---------- */
  // Seuils d'alerte OPTIONNELS (0 = pas de seuil = pas d'alerte inventée).
  // Plus aucun budget auto-calibré : le jury scientifique l'a supprimé.
  var DEFAULTS = {
    day: 0, week: 0, month: 0, w5h: 0, w7d: 0,
    apiCredits: 5, eurRate: 0, warnPct: 80,
    projects: [],
    // "Utilisation du forfait" : limites EFFECTIVES (cache lu pondéré). Presets Max 20x.
    plan: "20x", kCache: 0.1,
    lim: { w5h: 600e6, weekAll: 9500e6, weekOpus: 900e6 },
  };
  // presets de limites par plan (tokens effectifs) — issus des vrais chiffres Max officiels
  var PLAN_PRESETS = {
    "20x": { w5h: 600e6, weekAll: 9500e6, weekOpus: 900e6 },
    "5x":  { w5h: 150e6, weekAll: 5500e6, weekOpus: 600e6 },
  };
  var KEY = "tokenTracker.settings.v5";   // v5 : limites forfait
  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved) return Object.assign({}, DEFAULTS, saved);
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }
  function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  var settings = loadSettings();


  /* L'auto-calibrage des budgets a été SUPPRIMÉ (jury scientifique) : il
     inventait des plafonds avec des multiplicateurs arbitraires ×1,5/×1,6.
     Désormais : aucun budget par défaut, seuils d'alerte 100% opt-in. */

  /* ---------- utilitaires ----------
     Les helpers PURS vivent dans pwa/format.js (window.CET, testé sous Node).
     Ici on garde des alias fins, dont ceux qui dépendent de `settings`. */
  var CET = window.CET;
  var TONE = { input: "#6A8CAF", output: "#CC785C", cacheCreate: "#D4A27F", cacheRead: "#7E9E6D" };
  var modelColor = CET.modelColor, fmt = CET.fmt, fmtFull = CET.fmtFull,
      pct = CET.pct, esc = CET.esc, dayLabel = CET.dayLabel, ringSVG = CET.ringSVG;
  /* ----- taux €/$ LIVE (API gratuite, cache 24h) — fini le 0,92 figé ----- */
  var RATE_KEY = "tokenTracker.eurRate.v1";
  var eurState = { rate: 0, fetchedAt: 0, stale: false };
  (function initRate() {
    try { var c = JSON.parse(localStorage.getItem(RATE_KEY) || "null"); if (c && c.rate) { eurState = c; } } catch (e) {}
    // override manuel prioritaire si l'utilisateur a saisi un taux
    if (settings.eurRate && settings.eurRate > 0) eurState = { rate: settings.eurRate, fetchedAt: Date.now(), manual: true };
  })();
  function loadEurRate() {
    // override manuel : on ne touche pas au réseau
    if (settings.eurRate && settings.eurRate > 0) { eurState = { rate: settings.eurRate, fetchedAt: Date.now(), manual: true }; return Promise.resolve(); }
    var fresh = eurState.rate && (Date.now() - eurState.fetchedAt < 86400000);
    if (fresh) return Promise.resolve();
    return fetch("https://api.exchangerate-api.com/v4/latest/USD", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var rate = j && j.rates && j.rates.EUR;
        if (rate) { eurState = { rate: rate, fetchedAt: Date.now(), stale: false };
          try { localStorage.setItem(RATE_KEY, JSON.stringify(eurState)); } catch (e) {}
          if (DATA) render();
        }
      })
      .catch(function () { eurState.stale = true; });  // garde le cache, signalera ⚠
  }
  function rateValue() { return (eurState.rate && eurState.rate > 0) ? eurState.rate : 0; }
  function rateFreshness() {
    if (!eurState.rate) return "taux indisponible";
    if (eurState.manual) return "taux manuel " + eurState.rate.toFixed(3);
    var age = Date.now() - eurState.fetchedAt;
    var old = age > 86400000;
    return "taux " + eurState.rate.toFixed(3) + " · " + (old ? "⚠ en cache, " : "") + "maj " + ago(new Date(eurState.fetchedAt).toISOString());
  }
  function eur(usd) {
    var rate = rateValue();
    if (!rate) return "≈ $" + (usd || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 });  // pas de taux -> on reste en $
    return (usd * rate).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }
  function money(usd) { return "≈ " + eur(usd); }
  function ago(iso) { return CET.ago(iso); }
  function until(iso) { return CET.until(iso); }
  function ringColor(p) { return CET.ringColor(p, settings.warnPct); }
  function toneOf(p) { return CET.toneOf(p, settings.warnPct); }
  var $ = function (id) { return document.getElementById(id); };

  var DATA = null, VIEW = null, period = "7", trendChart = null;
  var SUPPORTED_SCHEMA = 5;  // v5 : sessions enrichies + wasteSuspects[] + anomalies[]

  /* ---------- PLAN / GATING PRO (point de vérité unique) ----------
     window.CET_PLAN et isPro() sont dérivés dans render() à partir de
     CET.planFromData (pur, testé). RÈGLE D'OR : on ne bride QUE l'utilisateur
     HÉBERGÉ (clé API) dont le serveur dit plan="free". Legacy / self-hosted /
     démo / dev -> "pro" -> TOUT visible, aucun flou. Le front ne sécurise rien
     (confort) : le serveur tronque déjà le payload free. */
  window.CET_PLAN = "pro";
  function isPro() { return window.CET_PLAN !== "free"; }

  /* ---------- filtre projet : recompose une vue DATA-compatible ----------
     Quand un projet est sélectionné, on recalcule timeline / totals / today /
     semaine / mois / modèles à partir des seules données de ce projet. Aucune
     donnée inventée : on n'utilise que ce que le moteur a réellement agrégé. */
  function filteredData() {
    if (!projectFilter || !DATA) return DATA;
    var p = (DATA.projects || []).filter(function (x) {
      return (x.name || x.project) === projectFilter && !x.isOthers;
    })[0];
    if (!p) return DATA;
    var tl = (p.timeline || []).map(function (r) {
      // on ne connaît que le total/jour du projet -> on remplit le total,
      // les sous-catégories restent agrégées au niveau projet (donut global).
      return { date: r.date, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: r.total };
    });
    var byDate = {}; tl.forEach(function (r) { byDate[r.date] = r.total; });
    var todayStr = new Date().toISOString().slice(0, 10);
    function sumLast(n) { var s = 0; tl.slice(-n).forEach(function (r) { s += r.total; }); return s; }
    var monthPrefix = todayStr.slice(0, 7);
    var monthTotal = tl.filter(function (r) { return r.date.slice(0, 7) === monthPrefix; })
                       .reduce(function (a, r) { return a + r.total; }, 0);
    return Object.assign({}, DATA, {
      _filtered: projectFilter,
      timeline: tl,
      totals: { input: p.input || 0, output: p.output || 0, cacheCreate: p.cacheCreate || 0,
                cacheRead: p.cacheRead || 0, total: p.total || 0, cost: p.cost || 0 },
      today: { total: byDate[todayStr] || 0, cost: 0 },
      last7Days: { total: sumLast(7) }, last30Days: { total: sumLast(30) },
      weekly: { weeks: DATA.weekly ? DATA.weekly.weeks : [], currentWeek: sumLast(7) },
      month: Object.assign({}, DATA.month, { currentMonth: monthTotal }),
      models: (p.models || []).map(function (m) {
        return { model: m.model, label: m.label, total: m.total, cost: m.cost,
                 input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
      }),
      // windows non recalculables par projet : on les neutralise proprement
      windows: null,
    });
  }

  /* ---------- sélection de période ---------- */
  function periodRows() {
    var tl = (VIEW || DATA).timeline || [];
    if (period === "today") return tl.slice(-1);
    if (period === "7") return tl.slice(-7);
    if (period === "30") return tl.slice(-30);
    return tl;
  }
  function sumRows(rows) { var t = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 }; rows.forEach(function (r) { t.input += r.input; t.output += r.output; t.cacheCreate += r.cacheCreate; t.cacheRead += r.cacheRead; t.total += r.total; }); return t; }

  /* ---------- rendu ---------- */
  function render() {
    VIEW = filteredData();
    var d = VIEW;
    /* PLAN dérivé ICI, une seule fois (point de vérité unique). isHosted =
       clé API présente. FAIL-OPEN : sans clé (legacy/self-hosted/dev) ou en démo
       (pas de d.user.plan), planFromData renvoie "pro" -> tout ouvert. Seul un
       utilisateur hébergé dont le serveur dit plan="free" est bridé. */
    var isHosted = !!window.CET_API_KEY;
    window.CET_PLAN = CET.planFromData(isHosted ? window.CET_API_KEY : null, d);
    var demo = !!d.demo || (d.source && d.source.claudeCodeDir === null);
    var fr = $("firstrun"); if (fr) fr.hidden = !demo;
    if (demo) {
      setStatus("Démonstration — lance le moteur sur ton PC pour voir tes vrais chiffres", "demo");
    } else {
      // alerte de fraîcheur : si les données du serveur sont vieilles (>1h), on le dit.
      var stale = (typeof d.serverAgeSeconds === "number" && d.serverAgeSeconds > 3600);
      var msg = "Synchronisé " + ago(d.generatedAt) + " · " + fmtFull(d.source.messages) + " messages";
      if (stale) msg = "⚠ Données possiblement périmées (" + ago(d.generatedAt) + ")";
      setStatus(msg, stale ? "err" : null);
    }

    var month = d.month ? d.month.currentMonth : (d.last30Days ? d.last30Days.total : 0);
    var dayU = d.today ? d.today.total : 0;
    var weekU = d.weekly ? d.weekly.currentWeek : (d.last7Days ? d.last7Days.total : 0);

    /* héro HONNÊTE & HUMAIN : ce mois-ci en chiffres bruts + "X fois plus que
       d'habitude". Le RADAR (3 fenêtres) remplace l'anneau mensuel. */
    var ratio3m = (d.month && typeof d.month.ratio3m === "number") ? d.month.ratio3m : null;
    var median3m = d.month ? d.month.median3m : null;
    $("hero-lab").textContent = "Ce mois-ci";
    if (ratio3m != null) {
      var rMx = ratio3m / 100;  // 1 = comme d'habitude
      $("hero-rest").textContent = "D'habitude tu fais : " + fmt(median3m || 0);
    } else {
      $("hero-rest").textContent = "Pas encore de mois précédent pour comparer";
    }
    $("hero-used").classList.remove("sk");
    $("hero-used").textContent = fmt(month) + " tokens";
    if (d.month) $("hero-reset").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg> Jour ' + d.month.dayOfMonth + " / " + d.month.daysInMonth;

    /* forfait d'abord (calcule les %, expose CET_FORFAIT_PCT pour le radar de repli),
       puis « Mes fenêtres » (officiel) qui peut masquer le forfait, puis le feu. */
    renderForfait(d);
    renderWindows(d);

    /* RADAR : reçoit TOUT l'objet (pour lire windowsOfficial). Une seule voix. */
    if (window.CETRadar) { try { window.CETRadar.setData(d); } catch (e) {} }

    renderVerdict(d, dayU, weekU, demo);
    renderBoiteNoire(d);   // Boîte noire (Pro) : sous le feu, conditionnelle
    renderWasteRadar(d);   // Waste Radar (Pro) : sous le feu
    renderAlerts(d, 0, dayU, weekU);
    renderPosition(d);

    /* mini-stats : aujourd'hui · semaine · rythme/projection */
    $("s-today").textContent = fmt(dayU);
    $("s-week").textContent = fmt(weekU);
    renderTrends(d);
    renderPace(d, month);

    /* graphe d'évolution selon période */
    var rows = periodRows();
    drawTrend(rows);
    // libellé de période + total (pour que le sélecteur ait un effet VISIBLE)
    var ptot = rows.reduce(function (a, r) { return a + r.total; }, 0);
    var plabel = { today: "aujourd'hui", "7": "7 jours", "30": "30 jours", all: "tout l'historique" }[period] || "";
    if ($("chart-hint")) $("chart-hint").textContent = plabel + " · " + fmt(ptot) + " tokens";

    /* projets — MÊME source que le reste du dashboard (respecte le filtre projet) */
    renderProjects(filteredData());

    var src = demo ? "démonstration" : (d.source.claudeCodeDir || "logs locaux");
    var asOf = (d.source && d.source.pricingAsOf) ? (" (tarifs " + d.source.pricingAsOf + ")") : "";
    var rateInfo = rateValue() ? (" · " + rateFreshness()) : " · coût en $ (taux €/$ indisponible)";
    $("foot").innerHTML = "Source : <b>" + esc(short(src)) + "</b>" + (d.source && d.source.apiConnected ? " · API connectée" : "") +
      "<br/>Valeur théorique au tarif API" + asOf + " — sur Max tu paies un forfait fixe" + rateInfo + ".";

    updateChartA11y(d, month);

    /* PASSE DE GATING — rejouée à chaque render (idempotente). En Free hébergé,
       elle floute les features Pro (teaser). En Pro, elle retire tout overlay. */
    applyGating();
  }

  // descriptions accessibles dynamiques des graphes/jauges (A3-4/A3-11)
  function updateChartA11y(d, month) {
    function setLabel(id, txt) { var el = $(id); if (el) el.setAttribute("aria-label", txt); }
    var rows = periodRows();
    var sum = sumRows(rows);
    var ratio = (d.month && d.month.ratio3m != null) ? (d.month.ratio3m + "% de ta médiane 3 mois") : "pas de comparaison";
    // radar des fenêtres : décrit les 3 arcs (5 h / semaine / mois) si dispo
    var rad = "Radar des fenêtres. Ce mois : " + fmt(month) + " tokens, " + ratio + ".";
    var wo = d.windowsOfficial;
    if (wo) {
      if (typeof wo.w5hPct === "number") rad += " Fenêtre 5 h : " + Math.round(wo.w5hPct) + "%.";
      if (typeof wo.w7dPct === "number") rad += " Cette semaine : " + Math.round(wo.w7dPct) + "%.";
    }
    setLabel("hero-radar", rad);
    setLabel("trend", "Évolution : " + fmt(sum.total) + " tokens sur la période sélectionnée (" + rows.length + " jours).");
    var tot = sum.total || 1;
    setLabel("donut", "Répartition : entrée " + Math.round(sum.input / tot * 100) + "%, sortie " +
      Math.round(sum.output / tot * 100) + "%, cache créé " + Math.round(sum.cacheCreate / tot * 100) +
      "%, cache lu " + Math.round(sum.cacheRead / tot * 100) + "%.");
  }
  function short(s) { s = String(s); return s.length > 40 ? "…" + s.slice(-38) : s; }

  function miniRing(label, used, budget, sub) {
    var p = pct(used, budget);
    return '<div class="mr"><div class="mring">' + ringSVG(p, 58, 7, "var(--cream-2)", ringColor(p), '<div class="mp" style="color:' + ringColor(p) + '">' + p + '%</div>') + '</div>' +
      '<div class="mt"><p class="k">' + esc(label) + '</p><p class="v">' + fmt(used) + '</p><p class="s">/ ' + fmt(budget) + (sub ? " · " + esc(sub) : "") + '</p></div></div>';
  }
  function miniRingMoney(label, usedUsd, budgetUsd) {
    var p = pct(usedUsd, budgetUsd);
    return '<div class="mr"><div class="mring">' + ringSVG(p, 58, 7, "var(--cream-2)", ringColor(p), '<div class="mp" style="color:' + ringColor(p) + '">' + p + '%</div>') + '</div>' +
      '<div class="mt"><p class="k">' + esc(label) + '</p><p class="v">' + eur(usedUsd) + '</p><p class="s">/ ' + eur(budgetUsd) + '</p></div></div>';
  }

  /* ---------- "Utilisation du forfait" (style page Claude) ----------
     3 barres : limite 5h / cette semaine (tous) / cette semaine (Opus), avec le
     % d'une vraie limite Max + reset clair + UN conseil smart. Honnête :
     estimation maison (Anthropic ne partage pas ces % avec les applis). */
  /* ---------- « Mes fenêtres » (les VRAIS % officiels) ----------
     Source : d.windowsOfficial (schéma v4), capturé par le moteur quand Claude
     Code tourne. On n'invente RIEN : pas de capture -> état vide calme. Le calcul
     des lignes est pur (CET.windowsCard) ; ici on ne fait que peindre. */
  function renderWindows(d) {
    var card = $("windows-card"); if (!card) return;
    var hint = $("windows-hint"), body = $("windows-body");
    var now = Date.now();
    var w = CET.windowsCard ? CET.windowsCard(d, now) : null;

    // DÉDUP : pas de capture officielle -> on masque « Mes fenêtres » et on laisse
    // « Utilisation du forfait » (l'estimation de repli) porter les 5 h / semaine.
    // Exactement UNE des deux cartes affiche ces % — jamais les deux.
    if (!w || !w.rows.length) {
      card.style.display = "none";
      return;
    }
    card.style.display = "";

    // badge coloré : la fiabilité du chiffre = la valeur de l'app. Vert = officiel
    // (ton PC tourne), terracotta = estimation (moteur endormi) -> impossible à rater.
    if (hint) {
      hint.textContent = w.stale ? "estimation · en pause" : "chiffre exact";
      hint.className = w.stale ? "hint hint--est" : "hint hint--off";
    }

    // chaque fenêtre : libellé mono, barre fine, % serif, reset relatif
    var html = w.rows.map(function (r) {
      var resetTxt = "";
      if (r.resetAt) {
        var u = until(new Date(r.resetAt).toISOString(), now);
        resetTxt = /réinitialis/i.test(u) ? "vient de se remettre à zéro"
                 : "se remet à zéro " + u.replace(/^reset /, "");
      }
      return '<div class="win">' +
        '<div class="win-top"><span class="win-lab">' + esc(r.label) + '</span>' +
        '<span class="win-pct" style="color:' + r.color + '">' + r.pct + '%</span></div>' +
        '<div class="win-track"><span style="width:' + Math.max(2, r.pct) + '%;background:' + r.color + '"></span></div>' +
        (resetTxt ? '<div class="win-reset">' + esc(resetTxt) + '</div>' : '') +
        '</div>';
    }).join("");

    // périmé : on garde les valeurs MAIS on prévient honnêtement
    if (w.stale) {
      var capTxt = w.capturedAt ? ago(new Date(w.capturedAt).toISOString(), now) : "il y a un moment";
      html += '<p class="win-note">estimation — dernière capture ' + esc(capTxt) + '</p>';
    }
    // le conseil utile du forfait (masqué quand l'officiel prime) atterrit ici :
    // on garde la meilleure ligne d'action, sans dupliquer les barres.
    if (FORFAIT_ADVICE_HTML) {
      html += '<div class="win-advice">' + FORFAIT_ADVICE_HTML + '</div>';
    }
    body.innerHTML = html;
  }

  var FORFAIT_LAST = { p5h: 0, pAll: 0, pOpus: 0 };  // exposé au verdict
  var FORFAIT_ADVICE_HTML = "";                       // repris par « Mes fenêtres » si forfait masqué
  function renderForfait(d) {
    var card = $("forfait-card"); if (!card) return;
    var win = d.windows;
    FORFAIT_ADVICE_HTML = "";
    window.CET_FORFAIT_PCT = null;
    // vue filtrée projet : pas de fenêtres -> on masque la carte forfait
    if (!win) { card.style.display = "none"; return; }
    // DÉDUP : si les % OFFICIELS sont présents (et frais), « Mes fenêtres » prime
    // et REMPLACE cette carte. On calcule quand même les % (verdict + radar de
    // repli) mais on masque la carte et on délègue le conseil à « Mes fenêtres ».
    var ofc = CET.windowsCard ? CET.windowsCard(d, Date.now()) : null;
    var officialSupersedes = !!(ofc && ofc.rows.length && !ofc.stale);
    var k = settings.kCache != null ? settings.kCache : 0.1;
    var lim = settings.lim || {};

    var eff5h = CET.effectiveTokens(win.w5h, k);
    var effWeek = CET.effectiveTokens(win.w7d, k);
    // part Opus (proxy sur l'historique global, en attendant un champ serveur)
    var models = d.models || [];
    var totM = models.reduce(function (a, m) { return a + (m.total || 0); }, 0) || 1;
    var opusTot = models.filter(function (m) { return (m.model || "").indexOf("opus") >= 0; })
                        .reduce(function (a, m) { return a + (m.total || 0); }, 0);
    var opusShare = opusTot / totM;
    var effOpusWeek = effWeek * opusShare;

    function barPct(eff, limit) { return (limit && limit > 0) ? Math.min(100, Math.round(eff / limit * 100)) : null; }
    var p5h = barPct(eff5h, lim.w5h), pAll = barPct(effWeek, lim.weekAll), pOpus = barPct(effOpusWeek, lim.weekOpus);
    FORFAIT_LAST = { p5h: p5h || 0, pAll: pAll || 0, pOpus: pOpus || 0 };
    // exposé au RADAR (estimation de repli si pas de % officiels)
    window.CET_FORFAIT_PCT = { p5h: p5h, pAll: pAll, pOpus: pOpus };

    // reset hebdo (prochain lundi par défaut) + reset 5h
    var weekReset = CET.weeklyResetLabel(CET.nextWeeklyReset(Date.now(), settings.weekResetDay, settings.weekResetHour));
    // reset 5h en clair (until() renvoie "réinitialisée"/"reset dans X" -> on humanise)
    var reset5h;
    if (win.w5hResetAt) {
      var u = until(win.w5hResetAt);
      reset5h = /réinitialis/i.test(u) ? "vient de se remettre à zéro"
              : "se remet à zéro " + u.replace(/^reset /, "");
    } else { reset5h = "se remet à zéro à la fin de la fenêtre"; }

    function bar(label, p, resetTxt, accent) {
      if (p == null) {
        return '<div class="fbar"><div class="fbar-top"><span class="fbar-lab">' + esc(label) +
          '</span><button class="fbar-set" type="button">définir ma limite</button></div>' +
          '<div class="fbar-track"><span style="width:0"></span></div></div>';
      }
      var col = p >= 100 ? "#B5563A" : p >= (settings.warnPct || 80) ? "#C8923D" : (accent || "#7E9E6D");
      return '<div class="fbar"><div class="fbar-top"><span class="fbar-lab">' + esc(label) +
        '</span><span class="fbar-pct" style="color:' + col + '">' + p + '%</span></div>' +
        '<div class="fbar-sub">' + esc(resetTxt) + '</div>' +
        '<div class="fbar-track"><span style="width:' + Math.max(2, p) + '%;background:' + col + '"></span></div></div>';
    }
    // la barre Opus ne s'affiche QUE si Opus chauffe vraiment (sinon 3e barre
    // inutile à lire en régime vert ; le conseil la fait ressortir au bon moment).
    var warnP = settings.warnPct || 80;
    var opusBar = (pOpus != null && pOpus >= warnP)
      ? bar("Cette semaine · Opus", pOpus, "se remet à zéro " + weekReset, "#CC785C") : "";
    $("forfait-bars").innerHTML =
      bar("Limite de 5 heures", p5h, reset5h) +
      bar("Cette semaine · tous les modèles", pAll, "se remet à zéro " + weekReset) +
      opusBar;

    // mention d'honnêteté
    $("forfait-note").innerHTML = "Estimation d'après ce que tu as déjà consommé — pas le chiffre exact d'Anthropic (ils ne le partagent pas avec les applis), mais un bon repère.";

    // UN conseil smart selon la barre la plus haute (toujours calculé)
    var adviceHTML = forfaitAdvice(p5h, pAll, pOpus, reset5h, weekReset);
    $("forfait-advice").innerHTML = adviceHTML;

    // bouton "définir ma limite" -> réglages
    var setBtn = $("forfait-bars").querySelector(".fbar-set");
    if (setBtn) setBtn.addEventListener("click", openSettings);

    // DÉDUP : si l'officiel prime, on masque le forfait et on transmet SON conseil
    // (la meilleure ligne) à « Mes fenêtres » pour ne rien perdre d'utile.
    if (officialSupersedes) {
      card.style.display = "none";
      FORFAIT_ADVICE_HTML = adviceHTML;
    } else {
      card.style.display = "";
    }
  }
  function forfaitAdvice(p5h, pAll, pOpus, reset5h, weekReset) {
    var warn = settings.warnPct || 80;
    var worst = Math.max(p5h || 0, pAll || 0, pOpus || 0);
    var tone, msg;
    if (worst >= 100) {
      tone = "bad";
      msg = "Tu as atteint une de tes limites. Pas de panique : ça se débloque tout seul. En attendant, lève le pied ou passe sur un modèle plus léger (Sonnet) pour avancer.";
    } else if ((pOpus || 0) >= 95 && (p5h || 0) < warn) {
      tone = "bad";
      msg = "Attendre ta limite courte ne changera rien cette fois : c'est ta limite de la semaine sur Opus qui est au bout. Elle repart " + weekReset + ". D'ici là, Sonnet reste dispo si tu veux continuer.";
    } else if ((pOpus || 0) === worst && (pOpus || 0) >= 70) {
      tone = "warn";
      msg = "C'est Opus qui chauffe cette semaine — ta ressource la plus rare. Pour le débroussaillage et les tâches carrées, Sonnet fait pareil et te garde Opus pour quand ça compte vraiment.";
    } else if ((p5h || 0) === worst && (p5h || 0) >= warn) {
      tone = "warn";
      msg = "Tu pousses fort depuis un moment. Pas de panique : ta limite courte " + reset5h + ". Si ce n'est pas urgent, une petite pause et tu repars à neuf.";
    } else if (worst >= 50) {
      tone = "warn";
      msg = "Ça monte tranquillement, tu es encore loin du plafond. Rien à changer — juste un œil de temps en temps si tu enchaînes les grosses sessions.";
    } else {
      tone = "ok";
      msg = "Tu es large partout. Aucune limite proche, Opus tranquille. Rien à surveiller — vas-y franchement.";
    }
    return banner(tone, msg);
  }

  // "Où je me situe" : place Adam sur le spectre Découverte→Power-user, à partir
  // des estimations publiques (réutilise ses limites de forfait pour cohérence).
  function renderPosition(d) {
    var card = $("position-card"); if (!card) return;
    var lim = settings.lim || {};
    var bench = {
      lim5h: lim.w5h || 600e6,
      enveloppeHebdo: lim.weekAll || 9500e6,
      kCache: settings.kCache != null ? settings.kCache : 0.1,
    };
    var p = CET.position ? CET.position(d, bench, Date.now()) : null;
    if (!p) { card.hidden = true; return; }
    card.hidden = false;

    var tiers = CET.POSITION_TIERS;  // ["Découverte","Régulier","Intensif","Power-user"]
    // spectre : 4 segments + un marqueur positionné à markerPct
    var segs = tiers.map(function (t, i) {
      var on = i === p.tierIndex;
      return '<div class="pos-seg' + (on ? " on" : "") + '"><span>' + esc(t) + '</span></div>';
    }).join("");
    $("pos-spectrum").innerHTML =
      '<div class="pos-track">' + segs +
      '<div class="pos-marker" style="left:' + p.markerPct + '%">' +
        '<span class="pos-dot"></span><span class="pos-mlabel">Toi · ' + fmt(p.effWeek) + '</span>' +
      '</div></div>';

    // verdict : honnête et POSITIF (intensif = bonne nouvelle)
    var verdict;
    if (p.tierIndex >= 2) {       // Intensif / Power-user
      verdict = "Tu es dans les utilisateurs <b>" + esc(p.tierLabel.toLowerCase()) + "s</b> de Claude Max — tu sors vraiment la valeur de ton forfait. "
        + "C'est une bonne nouvelle, pas une alerte : tu utilises à plein ce que tu paies déjà. Rien ne se bloque tant que la fenêtre de 5 h ne sature pas.";
    } else {                      // Découverte / Régulier
      verdict = "Tu utilises Claude tranquillement, dans la norme. De la marge partout — tu peux y aller plus franchement si tu veux.";
    }
    $("pos-verdict").innerHTML = verdict;

    // repères concrets (réutilise les vrais chiffres)
    var rep = [];
    if (p.ratioMedian >= 1.5) {
      var rr = p.ratioMedian < 10 ? Math.round(p.ratioMedian * 10) / 10 : Math.round(p.ratioMedian);
      rep.push("≈ " + String(rr).replace(".", ",") + "× ta semaine habituelle — tu montes en puissance");
    }
    if (p.brushes5h) rep.push("Ton pic sur 5 h frôle la limite Max estimée : c'est le seul moment où Claude peut te ralentir un peu.");
    rep.push("≈ " + p.pctEnveloppe + " % de l'enveloppe hebdo estimée « tous modèles » d'un forfait Max — il te reste de la marge.");
    $("pos-reperes").innerHTML = rep.map(function (r) { return "<li>" + r + "</li>"; }).join("");
  }

  var VERDICT_LEVEL = "green";   // exposé à renderAlerts pour la dédup
  function renderVerdict(d, dayU, weekU, demo) {
    var v = $("verdict");
    // En mode DÉMO : on montre le VRAI feu, calculé par CET.status sur les
    // chiffres de démonstration (honnête, pas mis en scène) — pour faire ressentir
    // la valeur avant l'effort d'installation. Un badge « Exemple » + un sous-titre
    // disent clairement que ce n'est pas encore ton verdict. On ne fabrique aucune
    // urgence : la couleur sort du calcul, badgée « Exemple ».
    // FEU TRICOLORE UNIFIÉ : "je peux continuer ?" = pire risque parmi
    // fenêtre 5h / semaine / mois. Calculé dans CET.status (pur, testé).
    var st = CET.status ? CET.status(d, Date.now()) : null;
    if (!st) { v.className = "verdict ok"; VERDICT_LEVEL = "green"; return; }
    // Les vraies limites Max (forfait) priment : si une barre est au plafond,
    // le feu passe au rouge ; si elle chauffe, au moins orange.
    var f = FORFAIT_LAST, fWorst = Math.max(f.p5h, f.pAll, f.pOpus);
    var warn = settings.warnPct || 80;
    if (fWorst >= 100 && st.level !== "red") {
      st = { level: "red", title: "Lève le pied un moment",
        msg: "Tu as atteint une de tes limites Max. Ça se débloque tout seul — en attendant, lève le pied ou passe sur un modèle plus léger.", gauges: st.gauges };
    } else if (fWorst >= warn && st.level === "green") {
      st = { level: "orange", title: "Tu y vas fort — garde un œil",
        msg: "Tu approches d'une de tes limites Max. Regarde la section « Utilisation du forfait » juste en dessous.", gauges: st.gauges };
    }
    // mapping feu -> tons du design system
    var toneMap = { green: "ok", orange: "warn", red: "bad" };
    var iconMap = {
      green: '<path d="M20 6 9 17l-5-5"/>',                         // check
      orange: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', // triangle
      red: '<rect x="6" y="6" width="12" height="12" rx="2"/>',     // stop
    };
    VERDICT_LEVEL = st.level;   // green | orange | red — pour la dédup des alertes
    v.className = "verdict " + (toneMap[st.level] || "ok") + (demo ? " is-demo" : "");
    $("vlight").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + iconMap[st.level] + '</svg>';
    // En démo : badge « Exemple » sur le titre pour que ce vrai verdict ne soit
    // jamais pris pour celui de l'utilisateur.
    if (demo) {
      $("vstate").innerHTML = esc(st.title) + ' <span class="demo-badge">Exemple</span>';
    } else {
      $("vstate").textContent = st.title;
    }
    // quand le feu n'est pas vert, la vraie question est "jusqu'à quand ?" :
    // on colle l'heure de reset 5h direct dans la phrase, sans scroller.
    var sub = st.msg;
    if (st.level !== "green" && d.windows && d.windows.w5hResetAt && !/remet à zéro|repart/i.test(sub)) {
      var u = until(d.windows.w5hResetAt, Date.now());
      if (/réinitialis/i.test(u)) sub += " Ça repart maintenant.";
      else sub += " Ça repart " + u.replace(/^reset /, "") + ".";
    }
    if (demo) sub = "Voilà le verdict que tu verras avec tes vraies données. " + sub;
    $("vsub").textContent = sub;
    // 3 jauges : fenêtre 5h / semaine / mois
    var gz = $("vgauges");
    if (gz) {
      gz.innerHTML = (st.gauges || []).map(function (g) {
        var col = g.level === "red" ? "#B5563A" : g.level === "orange" ? "#C8923D" : "#7E9E6D";
        // Canal NON-chromatique : un glyphe + suffixe pour que le niveau ne soit
        // pas porté par la couleur seule (WCAG 1.4.1 — daltonisme).
        var mark = g.level === "red" ? "● " : g.level === "orange" ? "⚠ " : "";
        var suffix = g.level === "red" ? " — plein" : g.level === "orange" ? " — ça chauffe" : "";
        return '<div class="vg"><div class="vg-top"><span class="vg-lab">' + esc(g.label) + '</span>' +
          '<span class="vg-val">' + mark + esc(g.value) + suffix + '</span></div>' +
          '<div class="vg-bar"><span style="width:' + Math.max(3, g.fill) + '%;background:' + col + '"></span></div>' +
          (g.sub ? '<div class="vg-sub">' + esc(g.sub) + '</div>' : '') + '</div>';
      }).join("");
    }
  }

  /* ---------- WASTE RADAR (Pro) ----------
     Carte-teaser sous le feu : "X € récupérables cette semaine · N tâches".
     Tape -> #waste-sheet listant les tâches candidates. Calcul pur dans
     CET.wasteRadarCard (retourne null si rien de significatif -> carte discrète). */
  var WASTE_CARD = null;
  function renderWasteRadar(d) {
    var card = $("waste-card"); if (!card) return;
    var w = CET.wasteRadarCard ? CET.wasteRadarCard(d, rateValue()) : null;
    WASTE_CARD = w;
    if (!w) {
      // rien à signaler : on masque proprement (jamais d'alarmisme).
      card.hidden = true;
      return;
    }
    card.hidden = false;
    // Produit européen : on affiche en €, jamais en $. Le taux €/$ LIVE (API
    // gratuite, cache 24h) couvre quasi tous les cas ; le bref instant où il
    // n'est pas encore chargé, on montre "~€" sans inventer de taux figé — le
    // montant exact apparaît dès que loadEurRate() a résolu (re-render).
    var nTxt = w.count + (w.count > 1 ? " tâches" : " tâche");
    var moneyTxt = w.hasRate
      ? w.totalEur.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"
      : "quelques € (taux en cours)";
    $("waste-verdict").textContent = moneyTxt + " récupérables cette semaine · " + nTxt;
  }

  // tâches marquées "justifiées" localement (masquées de la liste) — localStorage
  var WASTE_OK_KEY = "tokenTracker.wasteOk.v1";
  function wasteOkSet() { try { return JSON.parse(localStorage.getItem(WASTE_OK_KEY) || "{}"); } catch (e) { return {}; } }
  function markWasteOk(id) { var s = wasteOkSet(); s[id] = 1; try { localStorage.setItem(WASTE_OK_KEY, JSON.stringify(s)); } catch (e) {} }

  function openWasteSheet() {
    var w = WASTE_CARD; if (!w) return;
    var okSet = wasteOkSet();
    var list = $("waste-list");
    var visible = w.top.filter(function (t) { return !(t.sessionId && okSet[t.sessionId]); });
    if (!visible.length) {
      list.innerHTML = emptyState("Tout est validé",
        "Tu as marqué toutes ces tâches comme justifiées. Rien à revoir.");
    } else {
      list.innerHTML = visible.map(function (t) {
        var m = t.savingEur;
        var moneyTxt = w.hasRate
          ? "≈ " + m.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
          : "≈ $" + t.savingUsd.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
        var meta = [t.project ? esc(t.project) : "", "Opus",
                    t.outputTokens ? fmt(t.outputTokens) + " sortie" : ""].filter(Boolean).join(" · ");
        return '<div class="waste-row" data-id="' + esc(t.sessionId || "") + '">' +
          '<div class="waste-row-top"><span class="waste-row-title">' + esc(t.title) + '</span>' +
          '<span class="waste-row-money">' + moneyTxt + '</span></div>' +
          (meta ? '<div class="waste-row-meta">' + meta + '</div>' : '') +
          (t.reason ? '<div class="waste-row-reason">' + esc(t.reason) + '</div>' : '') +
          '<button type="button" class="waste-ok" data-id="' + esc(t.sessionId || "") + '">c\'était justifié</button>' +
          '</div>';
      }).join("");
      [].forEach.call(list.querySelectorAll(".waste-ok"), function (b) {
        b.addEventListener("click", function () {
          var id = this.getAttribute("data-id");
          if (id) markWasteOk(id);
          var row = this.closest(".waste-row"); if (row) row.style.display = "none";
        });
      });
    }
    openSheet("waste-sheet");
  }

  /* ---------- BOÎTE NOIRE (Pro) ----------
     Carte CONDITIONNELLE (visible seulement si une anomalie réelle existe).
     Phrase générée par template déterministe (CET.boiteNoireCard, testé) branché
     sur les valeurs RÉELLES -> jamais de mensonge sur la cause. Tape -> #pro-sheet
     en Free (via gating), sinon reste informative (pas de sheet dédié). */
  function renderBoiteNoire(d) {
    var card = $("boite-card"); if (!card) return;
    var b = CET.boiteNoireCard ? CET.boiteNoireCard(d) : null;
    if (!b) { card.hidden = true; return; }
    card.hidden = false;
    card.setAttribute("data-severity", b.severity);
    $("boite-title").textContent = b.title;
    $("boite-sentence").textContent = " " + b.sentence;
  }

  /* ---------- GATING PRO (overlay teaser idempotent) ----------
     gateProFeature(el, {mode, pitch, cta}) : en Free, ajoute .pro-locked + un
     overlay .pro-overlay (badge PRO + pitch + bouton -> #pro-sheet). En Pro,
     retire tout. Rejoué à chaque render -> re-nettoie si redevenu pro.
     mode "blur" = teaser (on voit derrière, ça donne envie) ; "hide" = masqué. */
  function gateProFeature(el, opts) {
    if (!el) return;
    opts = opts || {};
    var existing = el.querySelector(":scope > .pro-overlay");
    if (isPro()) {
      el.classList.remove("pro-locked", "pro-blur", "pro-hide");
      if (existing) existing.remove();
      return;
    }
    el.classList.add("pro-locked");
    el.classList.toggle("pro-blur", opts.mode !== "hide");
    el.classList.toggle("pro-hide", opts.mode === "hide");
    if (existing) return;  // déjà posé, idempotent
    var ov = document.createElement("div");
    ov.className = "pro-overlay";
    ov.innerHTML =
      '<span class="pro-badge">PRO</span>' +
      '<span class="pro-pitch">' + esc(opts.pitch || "Débloque cette vue avec Pro.") + '</span>' +
      '<button type="button" class="pro-unlock">' + esc(opts.cta || "Passer à Pro") + '</button>';
    ov.querySelector(".pro-unlock").addEventListener("click", function (e) {
      e.stopPropagation(); openSheet("pro-sheet");
    });
    el.appendChild(ov);
  }

  /* Une passe de gating à la fin de render() : câble les features Pro en mode
     BLUR (teaser). En Pro, tout est nettoyé. */
  function applyGating() {
    // classe globale pour les micro-affordances CSS (pastilles PRO) : seulement en Free
    document.body.classList.toggle("is-free", !isPro());
    // projection fin de mois : teaser flou
    gateProFeature($("pace-banner"), { mode: "blur",
      pitch: "Vois où tu atterris en fin de mois.", cta: "Passer à Pro" });
    // Waste Radar & Boîte noire : teaser flou (seulement si la carte est visible)
    var wc = $("waste-card");
    if (wc && !wc.hidden) gateProFeature(wc, { mode: "blur",
      pitch: "Découvre où part ton Opus — et ce que tu pourrais récupérer.", cta: "Passer à Pro" });
    else if (wc) gateProFeature(wc, {});  // masquée -> nettoyage
    var bc = $("boite-card");
    if (bc && !bc.hidden) gateProFeature(bc, { mode: "blur",
      pitch: "Comprends pourquoi ta fenêtre fond.", cta: "Passer à Pro" });
    else if (bc) gateProFeature(bc, {});
  }

  function renderAlerts(d, _unused, dayU, weekU) {
    // DÉ-DOUBLONNAGE RADICAL : le feu tricolore (verdict) porte déjà le diagnostic
    // ("X fois plus que d'habitude", niveau global). Ici on n'affiche AU PLUS
    // qu'UNE alerte, et seulement si elle apporte une info NEUVE (typiquement
    // l'ETA / le reset de la fenêtre 5 h). Si le 1er signal ne fait que répéter
    // le verdict, on n'affiche rien.
    var html = "";
    var signals = (CET.assistant ? CET.assistant(d, Date.now()) : []) || [];
    // le seul signal qui ajoute une info actionnable absente du verdict, c'est la
    // saturation 5 h (avec son ETA / heure de reset). Les signaux "info" (belle
    // journée, montée Opus) ne font que reformuler le verdict -> on les écarte.
    var s = null;
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].id === "w5h") { s = signals[i]; break; }
    }
    // redondant si le verdict couvre déjà ce niveau de risque sans détail neuf :
    // on n'affiche le signal 5 h que s'il porte une heure de reset (info en plus).
    var addsNewInfo = s && /se remet à zéro|ralentir dans/i.test(s.msg || "");
    if (s && addsNewInfo) {
      html += '<div class="alert ' + s.level + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        (s.level === "bad" ? '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' :
         '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>') + '</svg>' +
        '<div><b>' + esc(s.title) + '</b><br/>' + esc(s.msg) +
        '<span class="why">' + esc(s.why) + '</span></div></div>';
    }
    // seuils perso opt-in (repères choisis par Adam, pas une limite Claude). Ils
    // ne doublonnent jamais le verdict -> on garde le PLUS critique, un seul.
    var perso = [], warn = settings.warnPct || 80;
    function check(name, used, threshold) {
      if (!threshold || threshold <= 0) return;
      var p = pct(used, threshold);
      if (p >= 100) perso.push({ t: "bad", m: "<b>" + name + "</b> : ton repère dépassé (" + p + "%)." });
      else if (p >= warn) perso.push({ t: "warn", m: "<b>" + name + "</b> : " + p + "% de ton repère perso." });
    }
    check("Aujourd'hui", dayU, settings.day);
    check("Ce mois", d.month ? d.month.currentMonth : 0, settings.month);
    if (perso.length && !html) {
      // un seul repère perso, le plus grave (bad avant warn)
      perso.sort(function (a, b) { return (a.t === "bad" ? 0 : 1) - (b.t === "bad" ? 0 : 1); });
      html += '<p class="alerts-sub">Ton repère perso (pas une limite Claude)</p>' + banner(perso[0].t, perso[0].m);
    }
    // rien de neuf à dire -> on ne met RIEN (le verdict suffit). Plus de filler.
    $("alerts").innerHTML = html;
  }
  function banner(t, m) {
    var ic = t === "ok" ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>';
    return '<div class="alert ' + t + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ic + '</svg><div>' + m + '</div></div>';
  }

  function renderTrends(d) {
    var tl = d.timeline || [];
    var today = tl.length ? tl[tl.length - 1].total : 0;
    var yest = tl.length > 1 ? tl[tl.length - 2].total : 0;
    setTrend("t-today", today, yest, "vs hier");
    var thisW = d.weekly ? d.weekly.currentWeek : 0;
    var prevW = sumRows(tl.slice(-14, -7)).total;
    setTrend("t-week", thisW, prevW, "vs sem. préc.");
  }
  function setTrend(id, cur, prev, lbl) {
    var el = $(id);
    if (!prev) { el.className = "trend"; el.innerHTML = "&nbsp;"; return; }
    var diff = Math.round(((cur - prev) / prev) * 100);
    var up = diff >= 0;
    el.className = "trend " + (up ? "up" : "down");
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      (up ? '<path d="M7 17 17 7M9 7h8v8"/>' : '<path d="M7 7l10 10M9 17h8V9"/>') + '</svg>' +
      (up ? "+" : "") + diff + "% " + lbl;
  }

  function renderPace(d, month) {
    var paceBox = $("pace-banner");
    var ps = (d.month && d.month.projSlope) ? d.month.projSlope : null;
    if (!ps) {
      // pas assez d'historique pour projeter -> chiffre brut, zéro invention
      if ($("s-pace")) $("s-pace").textContent = fmt(month);
      var tp0 = $("t-pace"); if (tp0) { tp0.className = "trend"; tp0.textContent = "ce mois"; }
      if (paceBox) paceBox.innerHTML = "";
      return;
    }
    // mini-stat "au rythme actuel" = projection fin de mois (pente 7 derniers j)
    if ($("s-pace")) $("s-pace").textContent = fmt(ps.projection);
    var tp = $("t-pace");
    if (tp) { tp.className = "trend"; tp.textContent = "±" + fmt(ps.marginHigh - ps.projection) + " selon régularité"; }
    // bandeau honnête : fourchette + comparaison au mois précédent RÉEL
    var prevMonth = d.month.median3m;  // médiane des mois précédents (réelle)
    var cmp = prevMonth ? (" Mois précédents (médiane) : <b>" + fmt(prevMonth) + "</b>.") : "";
    var verdict = "Au rythme des 7 derniers jours (" + fmt(ps.slope) + "/j) : " +
      "<b>~" + fmt(ps.projection) + "</b> fin de mois (entre " + fmt(ps.marginLow) + " et " + fmt(ps.marginHigh) + ")." + cmp;
    if (paceBox) paceBox.innerHTML = banner("ok", verdict +
      " <span style='opacity:.75'>Valable si le rythme reste constant ; Max = fenêtres 5 h, pas de plafond mensuel officiel.</span>");
  }

  var projSort = "tokens";
  function renderProjects(d) {
    var pbox = $("projects"); pbox.innerHTML = "";
    var projects = (d.projects || []).slice();
    if (!projects.length) {
      pbox.innerHTML = emptyState("Aucun projet détecté",
        "Lance le moteur sur ton PC (double-clic sur DEMARRER.bat) : tes projets Claude Code apparaîtront ici, regroupés.");
      return;
    }
    // tri
    if (projSort === "recent") {
      projects.sort(function (a, b) {
        return (b.lastActivity || "").localeCompare(a.lastActivity || "");
      });
    } else {
      projects.sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    }
    var grand = projects.reduce(function (s, p) { return s + (p.total || 0); }, 0) || 1;
    projects.forEach(function (p, i) {
      var share = Math.round((p.total / grand) * 100);
      var name = p.name || p.project || "Sans projet";
      var isOthers = !!p.isOthers;
      var sessTxt = p.sessionCount != null ? p.sessionCount + (p.sessionCount > 1 ? " sessions" : " session") : "";
      var lastTxt = p.lastActivity ? " · " + ago(p.lastActivity) : "";
      var el = document.createElement(isOthers ? "div" : "button");
      el.className = "proj" + (isOthers ? " others" : "");
      if (!isOthers) {
        el.setAttribute("type", "button");
        el.setAttribute("aria-label", "Détails du projet " + name + ", " + fmt(p.total) + " tokens");
        el.dataset.idx = i;
        el.addEventListener("click", function () {
          // GATING : le drill-down projet est Pro. En Free -> sheet, pas d'ouverture.
          if (!isPro()) { openSheet("pro-sheet"); return; }
          openProjSheet(p);
        });
      }
      el.innerHTML =
        '<span class="pn"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>' +
          '<span class="t"><span class="pname">' + esc(name) + '</span>' +
          (sessTxt || lastTxt ? '<span class="pmeta">' + esc(sessTxt + lastTxt) + '</span>' : '') + '</span></span>' +
        '<span class="pv"><b>' + fmt(p.total) + '</b><span class="pshare">' + share + '%</span>' +
          '<span class="pcost">' + money(p.cost) + '</span></span>' +
        '<span class="pbar"><span style="width:' + Math.max(2, share) + '%"></span></span>';
      pbox.appendChild(el);
    });
  }

  function openProjSheet(p) {
    var name = p.name || p.project || "Sans projet";
    $("projsheet-title").childNodes[0].nodeValue = name + " ";
    var body = $("projsheet-body");
    var models = (p.models || []).map(function (m) {
      var c = modelColor(m.label || m.model);
      return '<div class="model"><div class="row"><span class="name"><span class="swatch" style="background:' + c + '"></span>' +
        esc(m.label || m.model) + '</span><span class="val"><b>' + fmt(m.total) + '</b> · ' + money(m.cost) + '</span></div></div>';
    }).join("");
    var sessions = (p.sessions || []).slice(0, 12).map(function (s) {
      var title = s.title || s.sessionId || "session";
      return '<div class="sessrow"><span class="st">' + esc(title) + '</span>' +
        '<span class="sv">' + fmt(s.tokens) + (s.lastActivity ? ' · ' + ago(s.lastActivity) : '') + '</span></div>';
    }).join("");
    var paths = (p.paths && p.paths.length > 1)
      ? '<p class="psub">' + p.paths.length + ' emplacements regroupés sous ce nom.</p>' : '';
    // donut "où partent les tokens" pour CE projet (fusion AXE 4)
    var hasBreakdown = (p.input || p.output || p.cacheCreate || p.cacheRead);
    var donutBlock = hasBreakdown
      ? '<div class="grouplabel">Où partent les tokens</div>' +
        '<div class="donut-wrap" style="margin:0 auto 4px"><canvas id="proj-donut" role="img" aria-label="Répartition des tokens du projet"></canvas></div>' +
        '<div class="legend" id="proj-donut-legend"></div>' : '';
    body.innerHTML =
      '<div class="psum"><div><p class="k">Total</p><p class="vbig">' + fmt(p.total) + '</p></div>' +
      '<div><p class="k">Valeur (théorique)</p><p class="vbig">' + eur(p.cost) + '</p></div>' +
      '<div><p class="k">Sessions</p><p class="vbig">' + (p.sessionCount || 0) + '</p></div></div>' + paths +
      (models ? '<div class="grouplabel">Modèles utilisés</div>' + models : '') +
      donutBlock +
      (sessions ? '<div class="grouplabel">Discussions récentes</div>' + sessions : '');
    var filterBtn = $("projsheet-filter");
    filterBtn.onclick = function () { setProjectFilter(name); closeProjSheet(); };
    openSheet("projsheet");
    if (hasBreakdown) drawProjDonut(p);
  }
  var projDonutChart = null;
  function drawProjDonut(p) {
    var cv = $("proj-donut"); if (!cv) return;
    var data = [p.input || 0, p.output || 0, p.cacheCreate || 0, p.cacheRead || 0];
    var labels = ["Entrée", "Sortie", "Cache créé", "Cache lu"];
    var cols = [TONE.input, TONE.output, TONE.cacheCreate, TONE.cacheRead];
    if (projDonutChart) { try { projDonutChart.destroy(); } catch (e) {} projDonutChart = null; }
    projDonutChart = new Chart(cv.getContext("2d"), {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: data, backgroundColor: cols, borderWidth: 0, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "64%", animation: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", callbacks: { label: function (c) { return c.label + " : " + fmt(c.parsed); } } } } }
    });
    var tot = data.reduce(function (a, b) { return a + b; }, 0) || 1;
    var lg = $("proj-donut-legend");
    if (lg) lg.innerHTML = labels.map(function (l, i) {
      return '<span><i style="background:' + cols[i] + '"></i>' + l + " " + Math.round(data[i] / tot * 100) + "%</span>";
    }).join("");
  }
  function closeProjSheet() { closeSheet("projsheet"); }

  /* ---------- charts ---------- */
  function drawTrend(rows) {
    var ctx = $("trend").getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, "rgba(204,120,92,.28)"); g.addColorStop(1, "rgba(204,120,92,0)");
    var cfg = {
      type: "line",
      data: { labels: rows.map(function (r) { return dayLabel(r.date); }), datasets: [{ data: rows.map(function (r) { return r.total; }), borderColor: "#CC785C", borderWidth: 2.5, backgroundColor: g, fill: true, tension: .38, pointRadius: rows.length <= 2 ? 5 : 0, pointBackgroundColor: "#CC785C", pointHoverRadius: 5, pointHoverBackgroundColor: "#CC785C", pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", padding: 10, displayColors: false, callbacks: { label: function (c) { return fmtFull(c.parsed.y) + " tokens"; } } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { grid: { color: "rgba(128,128,128,.12)" }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxTicksLimit: 4, callback: function (v) { return fmt(v); } } } } }
    };
    // mémoïsation : on met à jour en place plutôt que détruire/recréer (A2-2).
    // MAIS si le graphe a été créé alors que sa carte n'était pas encore mise
    // en page (largeur 0, bug Chart.js connu), update() ne récupère jamais la
    // taille -> on le recrée proprement une fois la carte visible.
    if (trendChart && $("trend").width > 0) {
      trendChart.data.labels = cfg.data.labels;
      trendChart.data.datasets[0].data = cfg.data.datasets[0].data;
      trendChart.data.datasets[0].backgroundColor = g;
      trendChart.data.datasets[0].pointRadius = rows.length <= 2 ? 5 : 0;  // "today" = point visible
      trendChart.update("none");
      return;
    }
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    trendChart = new Chart(ctx, cfg);
  }
  /* ---------- AXE 4 : export CSV & PNG ---------- */
  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportCSV() {
    if (!isPro()) { openSheet("pro-sheet"); return; }
    if (!DATA) return;
    var rows = [["date", "input", "output", "cacheCreate", "cacheRead", "total"]];
    (DATA.timeline || []).forEach(function (r) {
      rows.push([r.date, r.input, r.output, r.cacheCreate, r.cacheRead, r.total]);
    });
    rows.push([]);
    rows.push(["projet", "tokens", "cout_usd", "sessions"]);
    (DATA.projects || []).forEach(function (p) {
      rows.push([(p.name || p.project), p.total, p.cost, p.sessionCount || ""]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { var s = String(c == null ? "" : c); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",");
    }).join("\n");
    download("claude-eats-tokens_" + new Date().toISOString().slice(0, 10) + ".csv",
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  }
  function exportPNG() {
    if (!isPro()) { openSheet("pro-sheet"); return; }
    // Capture le graphe d'évolution (canvas natif -> PNG, sans dépendance).
    var canvas = $("trend");
    if (!canvas) return;
    // compose sur fond crème pour un PNG lisible
    var out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height;
    var c = out.getContext("2d");
    c.fillStyle = getComputedStyle(document.body).backgroundColor || "#F0EEE6";
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(canvas, 0, 0);
    out.toBlob(function (blob) {
      if (blob) download("claude-eats-tokens_evolution_" + new Date().toISOString().slice(0, 10) + ".png", blob);
    });
  }

  /* ---------- partage (navigator.share + repli presse-papier) ---------- */
  function shareApp() {
    var url = (window.CLAUDE_EATS_TOKENS_SHARE_URL) || location.href.split("#")[0];
    var data = { title: "Claude Eats Tokens", text: "Mon suivi de conso de tokens Claude Code", url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        setStatus("Lien copié dans le presse-papier ✓", null);
        setTimeout(function () { if (DATA) render(); }, 1800);
      }).catch(function () {});
    }
  }
  if ($("share-app")) $("share-app").addEventListener("click", shareApp);

  /* ---------- chargement ---------- */
  // fetch avec timeout (corrige REL-001 : Render endormi ne fige plus l'app)
  function fetchTimeout(url, ms, opts) {
    var o = Object.assign({ cache: "no-store" }, opts || {});
    if (opts && opts.headers) {
      o.headers = Object.assign({}, opts.headers);
    }
    if (typeof AbortController === "undefined") return fetch(url, o);
    var ctrl = new AbortController();
    o.signal = ctrl.signal;
    var to = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, o)
      .finally(function () { clearTimeout(to); });
  }
  function setStatus(msg, kind) {
    var el = $("status-txt"); if (el) el.textContent = msg;
    var dot = $("status") && $("status").querySelector(".dot");
    if (dot) { dot.classList.remove("demo", "err"); if (kind) dot.classList.add(kind); }
  }

  function load(silent) {
    var sources = [];
    // Multi-tenant : si une API key est définie, on passe par le serveur avec la clé
    var apiKey = window.CET_API_KEY;
    if (PUSH_SERVER) {
      var remoteUrl = PUSH_SERVER.replace(/\/$/, "") + "/usage.json";
      if (apiKey) remoteUrl += "?key=" + encodeURIComponent(apiKey);
      sources.push({ url: remoteUrl, remote: true, withKey: !!apiKey });
    }
    sources.push({ url: "data/usage.json", remote: false });
    var sawRemoteTimeout = false;

    function tryAt(i) {
      if (i >= sources.length) {
        // dernier repli : démo. On nuance le message selon ce qu'on a vu.
        return fetchTimeout("data/usage.demo.json", 8000)
          .then(function (r) { return r.json(); })
          .then(function (d) { DATA = d; render(); /* render() pose le bandeau démo */ })
          .catch(function () {
            if (!silent) setStatus(
              navigator.onLine === false ? "Hors-ligne — aucune donnée en cache."
              : sawRemoteTimeout ? "Serveur endormi et aucune donnée locale. Réessaie dans ~1 min."
              : "Aucune donnée pour l'instant. Vérifie que le moteur tourne sur ton PC.", "err");
          });
      }
      var src = sources[i];
      var fetchOpts = {};
      // Passer l'API key en header aussi (pour les requêtes multi-tenant)
      if (src.withKey && apiKey) fetchOpts.headers = { "X-Api-Key": apiKey };
      return fetchTimeout(src.url, src.remote ? 12000 : 8000, fetchOpts)
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (d) {
          if (!d || !d.totals || !d.totals.total) throw new Error("empty");
          // Le schéma est ADDITIF : une version plus récente ne fait qu'ajouter
          // des champs. On AFFICHE quand même (le front ignore ce qu'il ne connaît
          // pas) au lieu de bloquer l'app — on note juste qu'une MAJ est dispo.
          var sc = d.schema || 1;
          DATA = d; render(); try { checkThresholds(d); } catch (e) {}
          if (sc > SUPPORTED_SCHEMA) {
            setStatus("Une mise à jour de l'app est disponible (format " + sc + ").", "warn");
          }
        })
        .catch(function (e) {
          if (src.remote && e && e.name === "AbortError") sawRemoteTimeout = true;
          if (e && e.message === "schema-too-new") return;  // message déjà posé
          return tryAt(i + 1);
        });
    }
    return tryAt(0);
  }
  /* ---------- événements ---------- */
  function selectPeriod(b) {
    // GATING : 30 jours & tout l'historique sont Pro. En Free, on ouvre la sheet
    // et on NE change PAS la vue (le bouton actif reste sur 7 jours).
    var p = b.getAttribute("data-p");
    if (!isPro() && (p === "30" || p === "all")) { openSheet("pro-sheet"); return; }
    [].forEach.call($("period").children, function (x) {
      var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    period = p;
    // libellé clair + total de la période, pour qu'on VOIE l'effet du clic
    var rows = periodRows();
    var tot = rows.reduce(function (a, r) { return a + r.total; }, 0);
    var label = { today: "aujourd'hui", "7": "7 jours", "30": "30 jours", all: "tout l'historique" }[period] || "";
    $("chart-hint").textContent = label + " · " + fmt(tot) + " tokens";
    if (DATA) { drawTrend(rows); }
  }
  $("period").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) selectPeriod(b);
  });
  // navigation clavier flèches gauche/droite entre les périodes (A3-7)
  $("period").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var btns = [].slice.call(this.children);
    var cur = btns.indexOf(document.activeElement);
    if (cur < 0) return;
    e.preventDefault();
    var next = e.key === "ArrowRight" ? (cur + 1) % btns.length : (cur - 1 + btns.length) % btns.length;
    btns[next].focus(); selectPeriod(btns[next]);
  });
  $("refresh").addEventListener("click", function () {
    // Tourne TANT que ça charge (Render peut dormir ~50 s), s'arrête à la donnée
    // reçue — pas un timeout fixe qui ment sur la durée réelle.
    var s = this; s.classList.add("spinning");
    Promise.resolve(load()).finally(function () { s.classList.remove("spinning"); });
  });
  if ($("export-csv")) $("export-csv").addEventListener("click", exportCSV);
  if ($("export-png")) $("export-png").addEventListener("click", exportPNG);

  /* ----- Pro : checkout + sheet + cartes ----- */
  // Hook de paiement : ouvre le checkout serveur si serveur+clé présents.
  window.CET_startCheckout = function () {
    var server = window.CLAUDE_EATS_TOKENS_SERVER, key = window.CET_API_KEY;
    if (server && key) {
      window.open(server.replace(/\/$/, "") + "/billing/checkout?key=" + encodeURIComponent(key), "_blank", "noopener");
    } else {
      // Pas de compte : ne jamais router le feedback dans .status (invisible
      // derrière la sheet ouverte). On enchaîne directement vers la connexion.
      if (typeof closeSheet === "function") closeSheet("pro-sheet");
      if (typeof window.CET_openAuth === "function") window.CET_openAuth();
      else if ($("auth-sheet")) $("auth-sheet").classList.add("open");
    }
  };
  if ($("pro-checkout")) $("pro-checkout").addEventListener("click", window.CET_startCheckout);
  if ($("close-pro")) $("close-pro").addEventListener("click", function () { closeSheet("pro-sheet"); });
  if ($("pro-sheet")) $("pro-sheet").addEventListener("click", function (e) { if (e.target === this) closeSheet("pro-sheet"); });

  // Waste Radar : la carte -> sheet en Pro ; en Free l'overlay gère le tap.
  if ($("waste-btn")) $("waste-btn").addEventListener("click", function () {
    if (!isPro()) { openSheet("pro-sheet"); return; }
    openWasteSheet();
  });
  if ($("close-waste")) $("close-waste").addEventListener("click", function () { closeSheet("waste-sheet"); });
  if ($("waste-sheet")) $("waste-sheet").addEventListener("click", function (e) { if (e.target === this) closeSheet("waste-sheet"); });

  // Boîte noire : en Free, le tap ouvre la sheet Pro (l'overlay est par-dessus).
  if ($("boite-btn")) $("boite-btn").addEventListener("click", function () {
    if (!isPro()) openSheet("pro-sheet");
  });

  // CTA "Passer à Pro" dans l'état connecté du compte
  if ($("auth-go-pro")) $("auth-go-pro").addEventListener("click", window.CET_startCheckout);

  /* ----- système de "sheets" accessible (focus trap + Échap) — AXE 3 ----- */
  var _sheetReturnFocus = null;
  function _focusables(root) {
    return [].slice.call(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }
  function openSheet(id) {
    var sheet = $(id);
    _sheetReturnFocus = document.activeElement;
    sheet.classList.add("open");
    // Focus sur le dialogue lui-même (pas le bouton Fermer) pour que le lecteur
    // d'écran lise le titre du sheet à l'ouverture (A8).
    sheet.setAttribute("tabindex", "-1");
    sheet.focus();
    sheet._keyHandler = function (e) {
      if (e.key === "Escape") { closeSheet(id); return; }
      if (e.key === "Tab") {
        var items = _focusables(sheet); if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    sheet.addEventListener("keydown", sheet._keyHandler);
  }
  function closeSheet(id) {
    var sheet = $(id);
    sheet.classList.remove("open");
    if (sheet._keyHandler) { sheet.removeEventListener("keydown", sheet._keyHandler); sheet._keyHandler = null; }
    if (_sheetReturnFocus && _sheetReturnFocus.focus) { _sheetReturnFocus.focus(); _sheetReturnFocus = null; }
  }

  function emptyState(title, hint) {
    return '<div class="emptystate"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' +
      '<p class="es-t">' + esc(title) + '</p><p class="es-h">' + esc(hint) + '</p></div>';
  }

  /* ----- réglages ----- */
  function openSettings() { fillSettings(); openSheet("settings"); }
  function closeSettings() { closeSheet("settings"); }
  $("open-settings").addEventListener("click", openSettings);
  $("close-settings").addEventListener("click", closeSettings);
  $("settings").addEventListener("click", function (e) { if (e.target === this) closeSettings(); });

  /* ----- drill-down projet + tri + filtre ----- */
  $("close-projsheet").addEventListener("click", closeProjSheet);
  $("projsheet").addEventListener("click", function (e) { if (e.target === this) closeProjSheet(); });
  $("projects-card").querySelector(".proj-sort").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    projSort = b.getAttribute("data-sort");
    [].forEach.call(this.children, function (x) {
      var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (DATA) renderProjects(filteredData());
  });

  /* filtre projet : recalcule TOUTES les vues (AXE 3) */
  var projectFilter = null;
  function setProjectFilter(name) {
    projectFilter = name || null;
    var box = $("projfilter");
    if (projectFilter) { box.hidden = false; $("projfilter-name").textContent = projectFilter; }
    else box.hidden = true;
    if (DATA) render();
  }
  $("projfilter-clear").addEventListener("click", function () { setProjectFilter(null); });
  function fillSettings() {
    $("b-day").value = settings.day; $("b-week").value = settings.week; $("b-month").value = settings.month;
    $("b-w5h").value = settings.w5h; $("b-w7d").value = settings.w7d; $("b-api").value = settings.apiCredits;
    $("b-eur").value = settings.eurRate; $("b-warn").value = settings.warnPct;
    $("b-calib").value = "";
    markPlanSeg(settings.plan || "20x");
    renderProjEditor();
  }
  // toggle de plan (Max 5x / 20x) -> pré-remplit les limites du forfait
  function markPlanSeg(plan) {
    [].forEach.call($("plan-seg").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-plan") === plan);
    });
  }
  [].forEach.call(document.querySelectorAll("#plan-seg button"), function (b) {
    b.addEventListener("click", function () {
      var plan = b.getAttribute("data-plan");
      settings.plan = plan;
      settings.lim = Object.assign({}, PLAN_PRESETS[plan] || PLAN_PRESETS["20x"]);
      markPlanSeg(plan);
    });
  });
  function renderProjEditor() {
    var box = $("proj-editor"); box.innerHTML = "";
    (settings.projects || []).forEach(function (p, i) {
      var row = document.createElement("div"); row.className = "proj-edit";
      row.innerHTML = '<input class="pname" type="text" value="' + esc(p.name) + '" placeholder="Nom du projet" />' +
        '<input class="pweight" type="number" inputmode="numeric" value="' + (p.weight || 0) + '" placeholder="tokens" />' +
        '<button class="del" data-i="' + i + '" aria-label="Supprimer"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>';
      box.appendChild(row);
    });
    [].forEach.call(box.querySelectorAll(".del"), function (b) { b.addEventListener("click", function () { settings.projects.splice(+this.getAttribute("data-i"), 1); renderProjEditor(); }); });
  }
  $("add-proj").addEventListener("click", function () { collectProjects(); settings.projects.push({ name: "Nouveau projet", weight: 1000000 }); renderProjEditor(); });
  function collectProjects() {
    var rows = $("proj-editor").querySelectorAll(".proj-edit");
    settings.projects = [].map.call(rows, function (r) { return { name: r.querySelector(".pname").value || "Projet", weight: Number(r.querySelector(".pweight").value) || 0 }; });
  }
  $("save-settings").addEventListener("click", function () {
    settings.day = +$("b-day").value || 0; settings.week = +$("b-week").value || 0; settings.month = +$("b-month").value || 0;
    settings.w5h = +$("b-w5h").value || 0; settings.w7d = +$("b-w7d").value || 0; settings.apiCredits = +$("b-api").value || 0;
    settings.eurRate = +$("b-eur").value || 0; settings.warnPct = +$("b-warn").value || 80;
    // calage sur la vraie barre 5h d'Anthropic : si Claude affiche X%, alors
    // ma limite = ce que je consomme là / (X/100). Recale tout sur sa réalité.
    var calib = +$("b-calib").value;
    if (calib > 0 && calib <= 100 && DATA && DATA.windows && DATA.windows.w5h) {
      var eff = CET.effectiveTokens(DATA.windows.w5h, settings.kCache != null ? settings.kCache : 0.1);
      if (eff > 0) { settings.lim = settings.lim || {}; settings.lim.w5h = Math.round(eff / (calib / 100)); }
    }
    collectProjects(); saveSettings(settings); closeSettings(); if (DATA) render();
  });
  $("reset-settings").addEventListener("click", function () { settings = Object.assign({}, DEFAULTS, { projects: DEFAULTS.projects.slice(), auto: true }); saveSettings(settings); fillSettings(); if (DATA) render(); });


  /* ---------- notifications + live ---------- */
  var LIVE_MS = 30000, liveTimer = null, NOTE_KEY = "tokenTracker.notified.v2";
  function notifiedState() { try { return JSON.parse(localStorage.getItem(NOTE_KEY) || "{}"); } catch (e) { return {}; } }
  function setNotified(o) { localStorage.setItem(NOTE_KEY, JSON.stringify(o)); }

  function ensureNotifPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // on demande à la première interaction utile
      Notification.requestPermission().catch(function () {});
    }
  }
  function fireNotif(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title, { body: body, icon: "pwa/icon-192.png", badge: "pwa/icon-192.png", tag: "token-budget" });
        });
      } else {
        new Notification(title, { body: body, icon: "pwa/icon-192.png" });
      }
    } catch (e) {}
  }

  // Vérifie les franchissements de seuils (50/80/100%) une fois par jour et par budget.
  function checkThresholds(d) {
    var today = new Date().toISOString().slice(0, 10);
    var state = notifiedState();
    if (state._day !== today) { state = { _day: today }; } // reset quotidien
    var checks = [
      ["mois", d.month ? d.month.currentMonth : 0, settings.month],
      ["jour", d.today ? d.today.total : 0, settings.day],
      ["semaine", d.weekly ? d.weekly.currentWeek : 0, settings.week]
    ];
    if (d.windows) {
      // défensif : un payload tronqué (windows sans w5h/w7d) ne doit pas planter
      if (d.windows.w5h) checks.push(["fenêtre 5 h", d.windows.w5h.total || 0, settings.w5h]);
      if (d.windows.w7d) checks.push(["fenêtre 7 j", d.windows.w7d.total || 0, settings.w7d]);
    }
    // GATING NOTIFS : en Free, on ne garde que le palier >=100 % (le mur).
    // Les paliers d'anticipation (25/50/75/90) sont la valeur Pro.
    var pro = isPro();
    var marks = pro ? [100, settings.warnPct, 50] : [100];
    checks.forEach(function (c) {
      var name = c[0], p = pct(c[1], c[2]);
      var hit = null;
      for (var i = 0; i < marks.length; i++) { if (p >= marks[i]) { hit = marks[i]; break; } }
      if (hit == null) return;
      var key = name + ":" + hit;
      if (state[key]) return;
      state[key] = 1;
      var msg = hit >= 100 ? "Plafond atteint (" + p + "%)." : hit + "% du budget consommé (" + p + "%).";
      // en Free, la notif du mur invite à anticiper avec Pro.
      if (!pro && hit >= 100) msg += " Pro te prévient dès 75 % — avant le mur.";
      fireNotif("Tokens — " + name, msg);
    });
    setNotified(state);

    // --- NOTIFS PAR PALIERS sur le VRAI % officiel (5h + hebdo) ---
    // paliers 25/50/75/90/95/100 %, une fois chacun par fenêtre (clé = reset).
    // GATING : en Free, on ne notifie QUE le mur (>=100 %).
    if (CET.windowAlerts) {
      var firedKey = "tokenTracker.winAlerts.v1";
      var fired = {};
      try { fired = JSON.parse(localStorage.getItem(firedKey) || "{}"); } catch (e) {}
      var res = CET.windowAlerts(d, fired);
      res.alerts.forEach(function (a) {
        if (a.mark >= 100) fireNotif("⛔ " + a.label + " — plein",
          "Tu es à " + a.pct + "%. Claude risque de te ralentir. Ça repart au reset." +
          (!pro ? " Pro te prévient dès 75 % — avant le mur." : ""));
        else if (!pro) return;  // Free : aucun palier d'anticipation
        else if (a.mark >= 90) fireNotif("🔴 " + a.label + " — " + a.mark + "%", "Tu es à " + a.pct + "%. Lève le pied, tu approches du plafond.");
        else if (a.mark >= 75) fireNotif("🟠 " + a.label + " — " + a.mark + "%", "Tu es à " + a.pct + "%. Garde un œil dessus.");
        else fireNotif("🟢 " + a.label + " — " + a.mark + "%", "Tu es à " + a.pct + "% de ta fenêtre.");
      });
      try { localStorage.setItem(firedKey, JSON.stringify(res.fired)); } catch (e) {}
    }

    // --- NOTIF BOÎTE NOIRE (Pro uniquement) : nouvelle anomalie détectée ---
    // Une seule fois par anomalie (clé = window). PAS en Free.
    if (pro && CET.boiteNoireCard) {
      var b = CET.boiteNoireCard(d);
      if (b && b.window) {
        var anomKey = "tokenTracker.anomFired.v1";
        var anomFired = {};
        try { anomFired = JSON.parse(localStorage.getItem(anomKey) || "{}"); } catch (e) {}
        if (!anomFired[b.window]) {
          anomFired[b.window] = 1;
          var who = b.share != null && b.share > 50 ? "ce sont tes sous-agents, pas toi" : "regarde la Boîte noire";
          fireNotif("Ta fenêtre fond ×" + b.zStr + " la normale",
            who.charAt(0).toUpperCase() + who.slice(1) + ". Ouvre pour voir.");
          try { localStorage.setItem(anomKey, JSON.stringify(anomFired)); } catch (e) {}
        }
      }
    }
  }

  function startLive() {
    var _d = document.querySelector('#status .dot'); if (_d) _d.classList.add('live');
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(function () { load(true); }, LIVE_MS);
    // pause quand l'onglet est caché, reprise au retour
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (liveTimer) clearInterval(liveTimer); liveTimer = null; }
      else if (!liveTimer) { load(true); liveTimer = setInterval(function () { load(true); }, LIVE_MS); }
    });
  }

  var _enb = $("enable-notif");
  if (_enb) _enb.addEventListener("click", function () {
    if (!("Notification" in window)) { this.textContent = "Non supporté"; return; }
    var btn = this;
    Notification.requestPermission().then(function (p) {
      btn.textContent = p === "granted" ? "Activées ✓" : (p === "denied" ? "Refusées" : "Activer");
      if (p === "granted") fireNotif("Tokens", "Notifications activées. Tu seras prévenu aux seuils.");
    }).catch(function () {});
  });

  /* ---------- auth multi-tenant ---------- */
  (function initAuth() {
    var sheet = $("auth-sheet");
    if (!sheet) return;

    function openAuth() { sheet.classList.add("open"); updateAuthUI(); }
    function closeAuth() { sheet.classList.remove("open"); }
    // Exposé pour que le CTA "Passer à Pro" sans compte enchaîne vers la connexion (A5).
    window.CET_openAuth = openAuth;

    function updateAuthUI() {
      var apiKey = window.CET_API_KEY;
      var form = $("auth-form"), success = $("auth-success"), logged = $("auth-logged");
      if (!form) return;
      if (apiKey) {
        form.style.display = "none";
        success.style.display = "none";
        logged.style.display = "block";
        // Charger le profil
        if (PUSH_SERVER) {
          fetch(PUSH_SERVER.replace(/\/$/, "") + "/auth/me", { headers: { "X-Api-Key": apiKey } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.email) $("auth-logged-email").textContent = " — " + d.email;
              var plan = d.plan || "free";
              if ($("auth-logged-plan")) $("auth-logged-plan").textContent = plan;
              // statut d'abonnement : "actif jusqu'au JJ/MM" quand résilié en cours
              var statusEl = $("auth-logged-status");
              if (statusEl) {
                var extra = "";
                if (d.plan_status === "cancelled" && d.plan_renews_at) {
                  var dt = new Date(d.plan_renews_at);
                  if (!isNaN(dt.getTime())) {
                    extra = " — actif jusqu'au " + dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                  } else extra = " — résiliation programmée";
                } else if (d.plan_status && d.plan_status !== "active") {
                  extra = " (" + d.plan_status + ")";
                }
                statusEl.textContent = extra;
              }
              // bouton "Passer à Pro" visible seulement si plan free
              var goPro = $("auth-go-pro");
              if (goPro) goPro.style.display = (plan === "free") ? "block" : "none";
            }).catch(function () {});
        }
      } else {
        form.style.display = "block";
        success.style.display = "none";
        logged.style.display = "none";
      }
    }

    if ($("open-auth")) $("open-auth").addEventListener("click", openAuth);
    if ($("close-auth")) $("close-auth").addEventListener("click", closeAuth);

    // S'inscrire
    if ($("auth-submit")) $("auth-submit").addEventListener("click", function () {
      var email = ($("auth-email").value || "").trim();
      if (!email || email.indexOf("@") < 0) {
        $("auth-error").textContent = "Email invalide.";
        $("auth-error").style.display = "block";
        return;
      }
      $("auth-error").style.display = "none";
      $("auth-submit").textContent = "Création…";
      $("auth-submit").disabled = true;

      fetch(PUSH_SERVER.replace(/\/$/, "") + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          $("auth-submit").textContent = "Obtenir ma clé API";
          $("auth-submit").disabled = false;
          if (!res.ok) {
            $("auth-error").textContent = res.data.error || "Erreur.";
            $("auth-error").style.display = "block";
            return;
          }
          // Succès : afficher la clé
          window.CET_setApiKey(res.data.api_key);
          $("auth-key-display").value = res.data.api_key;
          $("auth-form").style.display = "none";
          $("auth-success").style.display = "block";
          load();  // recharger les données avec la clé
        })
        .catch(function () {
          $("auth-submit").textContent = "Obtenir ma clé API";
          $("auth-submit").disabled = false;
          $("auth-error").textContent = "Erreur réseau. Le serveur dort peut-être (~50s).";
          $("auth-error").style.display = "block";
        });
    });

    // Copier la clé
    if ($("auth-copy-key")) $("auth-copy-key").addEventListener("click", function () {
      var key = $("auth-key-display").value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(key).then(function () {
          $("auth-copy-key").textContent = "Copié ✓";
        });
      } else {
        $("auth-key-display").select();
        document.execCommand("copy");
        $("auth-copy-key").textContent = "Copié ✓";
      }
    });

    // Fermer après copie
    if ($("auth-done")) $("auth-done").addEventListener("click", function () {
      closeAuth();
      updateAuthUI();
    });

    // Se connecter avec une clé existante
    if ($("auth-key-submit")) $("auth-key-submit").addEventListener("click", function () {
      var key = ($("auth-key-input").value || "").trim();
      if (!key || key.indexOf("cet_") !== 0) {
        $("auth-error").textContent = "La clé doit commencer par cet_";
        $("auth-error").style.display = "block";
        return;
      }
      $("auth-error").style.display = "none";
      window.CET_setApiKey(key);
      closeAuth();
      load();  // recharger avec la clé
    });

    // Déconnexion
    if ($("auth-logout")) $("auth-logout").addEventListener("click", function () {
      window.CET_clearApiKey();
      updateAuthUI();
      load();  // recharger sans clé (retour au mode legacy/démo)
    });

    // Fermer avec Escape
    sheet.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAuth(); });
    // Fermer en cliquant le backdrop
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeAuth(); });

    // Indicateur visuel : bouton compte rempli si connecté
    var authBtn = $("open-auth");
    if (authBtn && window.CET_API_KEY) {
      authBtn.style.background = "var(--terracotta)";
      authBtn.style.color = "#fff";
      authBtn.style.borderColor = "var(--terracotta)";
    }
  })();

  ensureNotifPermission();
  loadEurRate();
  load();
  startLive();
  // RADAR des fenêtres derrière le héro (lazy, dégradation gracieuse). Le script
  // radar-hero.js (defer) s'auto-monte aussi sur #hero-radar ; mount() est
  // idempotent, donc cet appel précoce est sans risque s'il existe déjà.
  if (window.CETRadar) { try { window.CETRadar.mount(document.getElementById("hero-radar")); } catch (e) {} }
  var SW_FILE = "sw.v26.js";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (refreshed) return; refreshed = true; window.location.reload();
      });
      // 1) purge tout SW fantôme (autre que la version courante)
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          var u = (r.active && r.active.scriptURL) || "";
          if (u.indexOf(SW_FILE) < 0) { r.unregister(); }
        });
        // 2) enregistre la version courante + force la recherche de MAJ
        navigator.serviceWorker.register(SW_FILE, { scope: "./" }).then(function (reg) {
          reg.update();  // vérifie tout de suite s'il y a du neuf côté serveur
          // si une nouvelle version s'installe, on l'active et on recharge auto
          reg.addEventListener("updatefound", function () {
            var sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", function () {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                // nouvelle version prête derrière l'ancienne -> on la prend
                if (reg.waiting) reg.waiting.postMessage("skipWaiting");
              }
            });
          });
        }).catch(function () {});
      }).catch(function () {
        navigator.serviceWorker.register(SW_FILE, { scope: "./" }).catch(function () {});
      });
    });
  }
})();
