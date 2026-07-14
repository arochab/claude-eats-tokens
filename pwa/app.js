/* Token Tracker V2 — logique front. Dépendance : Chart.js (CDN). */
(function () {
  "use strict";
  /* ---------- Couleurs sémantiques (source unique, C2) ----------
     Une seule définition des couleurs d'état, alignée sur les tokens CSS de
     :root (--sage / --amber / --danger). À GARDER SYNCHRO avec pwa/styles.css.
     Évite les hex d'état dispersés et divergents dans le JS (jauges du feu et
     du forfait). ok = vert, warn = ambre, danger = rouge. */
  var CET_COLORS = { ok: "#7E9466", warn: "#C8923D", danger: "#A8432F" };
  /* ---------- source des données ----------
     Renseigne l'URL de ton serveur Render ci-dessous (ou laisse vide).
     Ordre d'essai : serveur Render -> data/usage.json (GitHub Pages) -> démo. */
  var PUSH_SERVER = window.CLAUDE_EATS_TOKENS_SERVER || ""; // ex: "https://claude-eats-tokens.onrender.com"

  /* Wake-up Render dès le boot : Render free s'endort après 15 min d'inactivité,
     le cold start prend ~40-50s. On fire-and-forget un ping sur "/" dès que l'IIFE
     démarre, avant même que load() ne tente la vraie requête. Comme ça, quand le
     timeout de 25s de load() commence à tourner, Render est déjà en train de
     chauffer et répond dans les temps. */
  if (PUSH_SERVER && window.CET_API_KEY) {
    try { fetch(PUSH_SERVER.replace(/\/$/, "") + "/", { method: "GET", mode: "cors" }).catch(function(){}); } catch (e) {}
  }

  /* Flag "premier vrai chiffre" — pour le moment aha. */
  var AHA_KEY = "tokenTracker.ahaShown.v1";
  var _ahaShown = false;
  try { _ahaShown = !!localStorage.getItem(AHA_KEY); } catch (e) {}

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
  /* t(key, vars) — proxy vers CETI18N.t ; si pas encore chargé, renvoie la clé */
  function t(key, vars) { return window.CETI18N ? window.CETI18N.t(key, vars) : key; }
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
    if (!eurState.rate) return t("app.rate.unavail");
    if (eurState.manual) return t("app.rate.manual", { r: eurState.rate.toFixed(3) });
    var age = Date.now() - eurState.fetchedAt;
    var old = age > 86400000;
    var freshness = eurState.rate.toFixed(3) + " · " + (old ? t("app.rate.cached", { ago: ago(new Date(eurState.fetchedAt).toISOString()) }) : "maj " + ago(new Date(eurState.fetchedAt).toISOString()));
    return t("app.rate.fresh", { freshness: freshness });
  }
  function _loc() { return window.CETI18N ? window.CETI18N.locale() : "fr-FR"; }
  function eur(usd) {
    var rate = rateValue();
    if (!rate) return "≈ $" + (usd || 0).toLocaleString(_loc(), { maximumFractionDigits: 0 });  // pas de taux -> on reste en $
    return (usd * rate).toLocaleString(_loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
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
      setStatus(t("app.status.demo"), "demo");
    } else {
      // alerte de fraîcheur : si les données du serveur sont vieilles (>1h), on le dit.
      var stale = (typeof d.serverAgeSeconds === "number" && d.serverAgeSeconds > 3600);
      var msg = t("app.status.synced", { ago: ago(d.generatedAt), n: fmtFull(d.source.messages) });
      if (stale) msg = t("app.status.stale", { ago: ago(d.generatedAt) });
      setStatus(msg, stale ? "err" : null);
    }

    var month = d.month ? d.month.currentMonth : (d.last30Days ? d.last30Days.total : 0);
    var dayU = d.today ? d.today.total : 0;
    var weekU = d.weekly ? d.weekly.currentWeek : (d.last7Days ? d.last7Days.total : 0);

    /* héro HONNÊTE & HUMAIN : ce mois-ci en chiffres bruts + "X fois plus que
       d'habitude". Le RADAR (3 fenêtres) remplace l'anneau mensuel. */
    var ratio3m = (d.month && typeof d.month.ratio3m === "number") ? d.month.ratio3m : null;
    var median3m = d.month ? d.month.median3m : null;
    $("hero-lab").textContent = t("app.hero.lab");
    if (ratio3m != null) {
      var rMx = ratio3m / 100;  // 1 = comme d'habitude
      $("hero-rest").textContent = t("app.hero.compare", { median: fmt(median3m || 0) });
    } else {
      $("hero-rest").textContent = t("app.hero.nohistory");
    }
    $("hero-used").classList.remove("sk");
    $("hero-used").textContent = fmt(month) + " tokens";
    if (d.month) $("hero-reset").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg> ' + t("app.hero.day", { d: d.month.dayOfMonth, total: d.month.daysInMonth });

    /* forfait d'abord (calcule les %, expose CET_FORFAIT_PCT pour le radar de repli),
       puis « Mes fenêtres » (officiel) qui peut masquer le forfait, puis le feu. */
    renderForfait(d);
    renderWindows(d);

    /* RADAR : reçoit TOUT l'objet (pour lire windowsOfficial). Une seule voix. */
    if (window.CETRadar) { try { window.CETRadar.setData(d); } catch (e) {} }
    renderHeroLegend(d);   // micro-légende des 3 fenêtres sous le radar (≥1024 only, CSS)

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
    var plabel = { today: t("html.chart.today"), "7": t("html.chart.7d"), "30": t("html.chart.30d"), all: t("html.chart.all") }[period] || "";
    if ($("chart-hint")) $("chart-hint").textContent = plabel + " · " + fmt(ptot) + " tokens";

    /* projets — MÊME source que le reste du dashboard (respecte le filtre projet) */
    renderProjects(filteredData());

    var src = demo ? t("app.status.demo").split(/\s*[—:-]\s+/)[0] : (d.source.claudeCodeDir || "logs locaux");
    var asOf = (d.source && d.source.pricingAsOf) ? (" (" + d.source.pricingAsOf + ")") : "";
    var rateInfo = rateValue() ? (" · " + rateFreshness()) : (" · " + t("app.rate.unavail"));
    $("foot").innerHTML = t("app.foot.source", { src: "<b>" + esc(short(src)) + "</b>" }) +
      (d.source && d.source.apiConnected ? " · " + t("app.foot.api") : "") +
      "<br/>" + t("app.foot.cost", { asOf: asOf, rateInfo: rateInfo });

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
    var rad = t("html.radar.aria");
    setLabel("hero-radar", rad);
    setLabel("trend", t("app.chart.aria", { total: fmt(sum.total), days: rows.length }));
    var tot = sum.total || 1;
    var donutLabels = [t("app.drill.input"), t("app.drill.output"), t("app.drill.cacheWrite"), t("app.drill.cacheRead")];
    setLabel("donut", donutLabels[0] + " " + Math.round(sum.input / tot * 100) + "%, " +
      donutLabels[1] + " " + Math.round(sum.output / tot * 100) + "%, " +
      donutLabels[2] + " " + Math.round(sum.cacheCreate / tot * 100) + "%, " +
      donutLabels[3] + " " + Math.round(sum.cacheRead / tot * 100) + "%.");
  }
  function short(s) { s = String(s); return s.length > 40 ? "..." + s.slice(-38) : s; }

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
      hint.textContent = w.stale ? t("app.windows.badge.stale") : t("app.windows.badge.exact");
      hint.className = w.stale ? "hint hint--est" : "hint hint--off";
    }

    // chaque fenêtre : libellé mono, barre fine, % serif, reset relatif
    var html = w.rows.map(function (r) {
      var resetTxt = "";
      if (r.resetAt) {
        // until() renvoie déjà une phrase complète ("resets in 9 h 29 min" /
        // "se remet à zéro dans …" / "reset"). On l'utilise telle quelle, et on
        // ne remplace QUE le cas "vient de se réinitialiser" par le libellé doux.
        // (Avant : on re-préfixait avec app.windows.in => "resets resets in …" en
        // EN, car le replace /^reset / ne matchait pas "resets in".)
        var u = until(new Date(r.resetAt).toISOString(), now);
        var done = u === t("until.done");
        resetTxt = done ? t("app.windows.zero") : u;
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
      var capTxt = w.capturedAt ? ago(new Date(w.capturedAt).toISOString(), now) : ago(new Date(0).toISOString());
      html += '<p class="win-note">' + esc(t("app.windows.freshness", { ago: capTxt })) + '</p>';
    }
    // le conseil utile du forfait (masqué quand l'officiel prime) atterrit ici :
    // on garde la meilleure ligne d'action, sans dupliquer les barres.
    if (FORFAIT_ADVICE_HTML) {
      html += '<div class="win-advice">' + FORFAIT_ADVICE_HTML + '</div>';
    }
    body.innerHTML = html;
  }

  /* ---------- MICRO-LÉGENDE DU HÉRO (≥1024) ----------
     Sous le radar, en desktop, on nomme les 3 fenêtres (5 h · semaine · mois) avec
     leur % et la pastille de couleur de l'arc correspondant. But : donner du CONTENU
     réel au bas du héro pour qu'il se ferme à hauteur de « Mes fenêtres » au lieu de
     laisser un grand vide sous le donut (jury altman/amodei/musk). Le CSS la masque
     sous 1024px (mobile pixel-identique). Pur affichage, aucune logique métier. */
  function renderHeroLegend(d) {
    var el = $("hero-legend"); if (!el) return;
    var w = CET.windowsCard ? CET.windowsCard(d, Date.now()) : null;
    var rows = (w && w.rows && w.rows.length) ? w.rows : null;
    if (!rows || !rows.length) { el.innerHTML = ""; return; }
    el.innerHTML = rows.slice(0, 3).map(function (r) {
      return '<span class="hl-item">' +
        '<span class="hl-dot" style="background:' + (r.color || "#9FB382") + '"></span>' +
        '<span class="hl-lab">' + esc(r.label) + '</span>' +
        '<span class="hl-pct">' + (r.pct != null ? r.pct + '%' : '') + '</span>' +
        '</span>';
    }).join("");
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
    // reset 5h en clair : until() renvoie déjà la phrase complète, on l'utilise
    // telle quelle (fix du doublon "resets resets in …" en EN).
    var reset5h;
    if (win.w5hResetAt) {
      var u = until(win.w5hResetAt);
      reset5h = (u === t("until.done")) ? t("app.windows.zero") : u;
    } else { reset5h = t("app.windows.zero"); }

    function bar(label, p, resetTxt, accent) {
      if (p == null) {
        return '<div class="fbar"><div class="fbar-top"><span class="fbar-lab">' + esc(label) +
          '</span><button class="fbar-set" type="button">' + esc(t("app.forfait.set")) + '</button></div>' +
          '<div class="fbar-track"><span style="width:0"></span></div></div>';
      }
      var col = p >= 100 ? CET_COLORS.danger : p >= (settings.warnPct || 80) ? CET_COLORS.warn : (accent || CET_COLORS.ok);
      return '<div class="fbar"><div class="fbar-top"><span class="fbar-lab">' + esc(label) +
        '</span><span class="fbar-pct" style="color:' + col + '">' + p + '%</span></div>' +
        '<div class="fbar-sub">' + esc(resetTxt) + '</div>' +
        '<div class="fbar-track"><span style="width:' + Math.max(2, p) + '%;background:' + col + '"></span></div></div>';
    }
    // la barre Opus ne s'affiche QUE si Opus chauffe vraiment (sinon 3e barre
    // inutile à lire en régime vert ; le conseil la fait ressortir au bon moment).
    var warnP = settings.warnPct || 80;
    var weekResetTxt = t("app.forfait.reset.week", { date: weekReset });
    var opusBar = (pOpus != null && pOpus >= warnP)
      ? bar(t("app.forfait.opus"), pOpus, weekResetTxt, "#CC785C") : "";
    var fb = $("forfait-bars");
    fb.innerHTML =
      bar(t("app.forfait.5h"), p5h, reset5h) +
      bar(t("app.forfait.7d"), pAll, weekResetTxt) +
      opusBar;
    // Animer le remplissage au PREMIER affichage seulement (flag sur le conteneur
    // stable), pas à chaque tick de polling — sinon lecture nerveuse (B3).
    if (!fb.dataset.filled) {
      fb.classList.add("bars-animate");
      fb.dataset.filled = "1";
      setTimeout(function () { fb.classList.remove("bars-animate"); }, 700);
    }

    // mention d'honnêteté
    $("forfait-note").innerHTML = t("app.forfait.note");

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
      msg = t("app.advice.max");
    } else if ((pOpus || 0) >= 95 && (p5h || 0) < warn) {
      tone = "bad";
      msg = t("app.advice.opus", { reset: weekReset });
    } else if ((pOpus || 0) === worst && (pOpus || 0) >= 70) {
      tone = "warn";
      msg = t("app.advice.opus70");
    } else if ((p5h || 0) === worst && (p5h || 0) >= warn) {
      tone = "warn";
      msg = t("app.advice.5h", { reset: reset5h });
    } else if (worst >= 50) {
      tone = "warn";
      msg = t("app.advice.mid");
    } else {
      tone = "ok";
      msg = t("app.advice.ok");
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

    var i18n = window.CETI18N;
    var tiers = CET.POSITION_TIERS;  // clés i18n : ["html.pos.tiers.0", ...]
    // spectre : 4 segments + un marqueur positionné à markerPct
    var segs = tiers.map(function (key, i) {
      var on = i === p.tierIndex;
      var label = i18n ? i18n.t(key) : key;
      return '<div class="pos-seg' + (on ? " on" : "") + '"><span>' + esc(label) + '</span></div>';
    }).join("");
    $("pos-spectrum").innerHTML =
      '<div class="pos-track">' + segs +
      '<div class="pos-marker" style="left:' + p.markerPct + '%">' +
        '<span class="pos-dot"></span><span class="pos-mlabel">' + esc(t("app.pos.you")) + ' · ' + fmt(p.effWeek) + '</span>' +
      '</div></div>';

    // verdict : honnête et POSITIF (intensif = bonne nouvelle)
    var verdict;
    var tierLabel = i18n ? i18n.t(p.tierLabel) : p.tierLabel;
    if (p.tierIndex >= 2) {       // Intensif / Power-user
      verdict = i18n ? i18n.t("app.pos.verdict.heavy", { tier: esc(tierLabel.toLowerCase()) })
        : "Tu es dans les utilisateurs <b>" + esc(tierLabel.toLowerCase()) + "s</b> de Claude Max, tu sors vraiment la valeur de ton forfait.";
    } else {                      // Découverte / Régulier
      verdict = i18n ? i18n.t("app.pos.verdict.light") : "Tu utilises Claude tranquillement, dans la norme.";
    }
    $("pos-verdict").innerHTML = verdict;

    // repères concrets (réutilise les vrais chiffres)
    var rep = [];
    if (p.ratioMedian >= 1.5) {
      var rr = p.ratioMedian < 10 ? Math.round(p.ratioMedian * 10) / 10 : Math.round(p.ratioMedian);
      rep.push(i18n ? i18n.t("app.pos.repere.ratio", { r: String(rr).replace(".", ",") })
        : "≈ " + String(rr).replace(".", ",") + "× ta semaine habituelle");
    }
    if (p.brushes5h) rep.push(i18n ? i18n.t("app.pos.repere.5h") : "Ton pic sur 5 h frôle la limite Max estimée.");
    rep.push(i18n ? i18n.t("app.pos.repere.envel", { pct: p.pctEnveloppe })
      : "≈ " + p.pctEnveloppe + " % de l'enveloppe hebdo estimée.");
    $("pos-reperes").innerHTML = rep.map(function (r) { return "<li>" + r + "</li>"; }).join("");

    // Desktop (≥1024) : la carte « Où je me situe » s'ouvre d'emblée pour montrer
    // le spectre réel plutôt qu'une barre-teaser repliée qui lit comme un
    // placeholder inachevé (jury round 3 : jobs/ive/altman). Sur mobile/tablette
    // elle reste repliée (économie de scroll). Une seule fois, sans écraser un
    // repli manuel de l'utilisateur.
    try {
      var det = card.querySelector(".pos-details");
      if (det && !det.dataset.autoOpened && window.matchMedia &&
          window.matchMedia("(min-width:1024px)").matches) {
        det.open = true;
        det.dataset.autoOpened = "1";
      }
    } catch (e) {}
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
      st = { level: "red", title: t("status.title.red"),
        msg: t("app.advice.max"), gauges: st.gauges };
    } else if (fWorst >= warn && st.level === "green") {
      st = { level: "orange", title: t("status.title.orange"),
        msg: t("app.advice.mid"), gauges: st.gauges };
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
    // En démo : badge « Exemple » + bannière d'avertissement en haut du verdict.
    var demoBanner = $("verdict-demo-banner");
    if (demo) {
      $("vstate").innerHTML = esc(st.title) + ' <span class="demo-badge">' + esc(t("app.verdict.badge.demo")) + '</span>';
      if (demoBanner) demoBanner.hidden = false;
    } else {
      $("vstate").textContent = st.title;
      if (demoBanner) demoBanner.hidden = true;
    }
    // quand le feu n'est pas vert, la vraie question est "jusqu'à quand ?" :
    // on colle l'heure de reset 5h direct dans la phrase, sans scroller.
    var sub = st.msg;
    if (st.level !== "green" && d.windows && d.windows.w5hResetAt && !/remet à zéro|repart|resets/i.test(sub)) {
      var u = until(d.windows.w5hResetAt, Date.now());
      if (/réinitialis|^reset$/i.test(u)) sub += " " + t("app.verdict.reset.now");
      else sub += " " + t("app.verdict.reset.in", { u: u.replace(/^reset /, "") });
    }
    if (demo) sub = t("app.verdict.demo") + " " + sub;
    $("vsub").textContent = sub;
    // 3 jauges : fenêtre 5h / semaine / mois
    var gz = $("vgauges");
    if (gz) {
      gz.innerHTML = (st.gauges || []).map(function (g) {
        var col = g.level === "red" ? CET_COLORS.danger : g.level === "orange" ? CET_COLORS.warn : CET_COLORS.ok;
        // Canal NON-chromatique : un glyphe + suffixe pour que le niveau ne soit
        // pas porté par la couleur seule (WCAG 1.4.1 — daltonisme).
        var mark = g.level === "red" ? "● " : g.level === "orange" ? "⚠ " : "";
        var suffix = g.level === "red" ? ", " + t("app.gauge.full") : g.level === "orange" ? ", " + t("app.gauge.hot") : "";
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
    var nTxt = w.count + " " + t(w.count > 1 ? "app.proj.sessions.many" : "app.proj.sessions.one");
    var moneyTxt = w.hasRate
      ? w.totalEur.toLocaleString(_loc(), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"
      : t("app.waste.noRate");
    $("waste-verdict").textContent = t("app.waste.verdict", { money: moneyTxt, n: nTxt });

    /* APERÇU INLINE (≥1024, CSS) : 2 tâches candidates à droite du bandeau pour
       remplir la largeur quand la carte est seule sur sa rangée — plus jamais un
       bandeau à 55% de vide (jury musk/altman). Masqué sous 1024px + quand la carte
       est appariée à la boîte noire (voir styles.css). */
    var prev = $("waste-preview");
    if (prev) {
      var okSet = wasteOkSet();
      var items = (w.top || []).filter(function (it) { return !(it.sessionId && okSet[it.sessionId]); }).slice(0, 2);
      if (!items.length) { prev.innerHTML = ""; }
      else prev.innerHTML = items.map(function (it) {
        var money = w.hasRate
          ? "≈ " + it.savingEur.toLocaleString(_loc(), { maximumFractionDigits: 0 }) + " €"
          : "≈ $" + it.savingUsd.toLocaleString(_loc(), { maximumFractionDigits: 0 });
        return '<span class="wp-item">' +
          '<span class="wp-title">' + esc(it.title) + '</span>' +
          '<span class="wp-money">' + money + '</span></span>';
      }).join("");
    }
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
      list.innerHTML = emptyState(t("app.waste.empty.title"), t("app.waste.empty.hint"));
    } else {
      list.innerHTML = visible.map(function (item) {
        var m = item.savingEur;
        var moneyTxt = w.hasRate
          ? "≈ " + m.toLocaleString(_loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
          : "≈ $" + item.savingUsd.toLocaleString(_loc(), { maximumFractionDigits: 2 });
        var outputLbl = item.outputTokens ? fmt(item.outputTokens) + " " + t("app.drill.output").toLowerCase() : "";
        var meta = [item.project ? esc(item.project) : "", "Opus",
                    outputLbl].filter(Boolean).join(" · ");
        return '<div class="waste-row" data-id="' + esc(item.sessionId || "") + '">' +
          '<div class="waste-row-top"><span class="waste-row-title">' + esc(item.title) + '</span>' +
          '<span class="waste-row-money">' + moneyTxt + '</span></div>' +
          (meta ? '<div class="waste-row-meta">' + meta + '</div>' : '') +
          (item.reason ? '<div class="waste-row-reason">' + esc(item.reason) + '</div>' : '') +
          '<button type="button" class="waste-ok" data-id="' + esc(item.sessionId || "") + '">' + esc(t("app.waste.justified")) + '</button>' +
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
      '<span class="pro-pitch">' + esc(opts.pitch || t("app.pro.pitch.default")) + '</span>' +
      '<button type="button" class="pro-unlock">' + esc(opts.cta || t("app.pro.cta")) + '</button>';
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
      pitch: t("app.pro.pitch.pace"), cta: t("app.pro.cta") });
    // Waste Radar & Boîte noire : teaser flou (seulement si la carte est visible)
    var wc = $("waste-card");
    if (wc && !wc.hidden) gateProFeature(wc, { mode: "blur",
      pitch: t("app.pro.pitch.waste"), cta: t("app.pro.cta") });
    else if (wc) gateProFeature(wc, {});  // masquée -> nettoyage
    var bc = $("boite-card");
    if (bc && !bc.hidden) gateProFeature(bc, { mode: "blur",
      pitch: t("app.pro.pitch.boite"), cta: t("app.pro.cta") });
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
      if (p >= 100) perso.push({ t: "bad", m: "<b>" + name + "</b> : " + t("app.alert.over", { p: p }) });
      else if (p >= warn) perso.push({ t: "warn", m: "<b>" + name + "</b> : " + t("app.alert.pct", { p: p }) });
    }
    check(t("app.ms.today"), dayU, settings.day);
    check(t("app.hero.lab"), d.month ? d.month.currentMonth : 0, settings.month);
    if (perso.length && !html) {
      // un seul repère perso, le plus grave (bad avant warn)
      perso.sort(function (a, b) { return (a.t === "bad" ? 0 : 1) - (b.t === "bad" ? 0 : 1); });
      html += '<p class="alerts-sub">' + esc(t("app.pos.repere.perso")) + '</p>' + banner(perso[0].t, perso[0].m);
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
    setTrend("t-today", today, yest, t("app.ms.vs.yesterday"));
    var thisW = d.weekly ? d.weekly.currentWeek : 0;
    var prevW = sumRows(tl.slice(-14, -7)).total;
    setTrend("t-week", thisW, prevW, t("app.ms.vs.lastweek"));
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
      var tp0 = $("t-pace"); if (tp0) { tp0.className = "trend"; tp0.textContent = t("app.ms.month"); }
      if (paceBox) paceBox.innerHTML = "";
      return;
    }
    // mini-stat "au rythme actuel" = projection fin de mois (pente 7 derniers j)
    if ($("s-pace")) $("s-pace").textContent = fmt(ps.projection);
    var tp = $("t-pace");
    if (tp) { tp.className = "trend"; tp.textContent = "±" + fmt(ps.marginHigh - ps.projection); }
    // bandeau honnête : fourchette + comparaison au mois précédent RÉEL
    var prevMonth = d.month.median3m;  // médiane des mois précédents (réelle)
    var cmp = prevMonth ? (" " + t("app.pace.prev", { median: fmt(prevMonth) })) : "";
    var verdict = t("app.pace.banner", { slope: fmt(ps.slope), proj: fmt(ps.projection), lo: fmt(ps.marginLow), hi: fmt(ps.marginHigh), prev: cmp });
    if (paceBox) paceBox.innerHTML = banner("ok", verdict +
      " <span style='opacity:.75'>" + esc(t("app.pace.caveat")) + "</span>");
  }

  var projSort = "tokens";
  function renderProjects(d) {
    var pbox = $("projects"); pbox.innerHTML = "";
    var projects = (d.projects || []).slice();
    if (!projects.length) {
      pbox.innerHTML = emptyState(t("app.proj.empty.title"), t("app.proj.empty.hint"));
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
      var name = p.name || p.project || t("app.proj.noname");
      var isOthers = !!p.isOthers;
      var sessTxt = p.sessionCount != null ? p.sessionCount + " " + t(p.sessionCount > 1 ? "app.proj.sessions.many" : "app.proj.sessions.one") : "";
      var lastTxt = p.lastActivity ? " · " + ago(p.lastActivity) : "";
      var el = document.createElement(isOthers ? "div" : "button");
      el.className = "proj" + (isOthers ? " others" : "");
      if (!isOthers) {
        el.setAttribute("type", "button");
        el.setAttribute("aria-label", t("app.proj.aria", { name: name, total: fmt(p.total) }));
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
    var name = p.name || p.project || t("app.proj.noname");
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
      ? '<div class="grouplabel">' + esc(t("app.drill.where")) + '</div>' +
        '<div class="donut-wrap" style="margin:0 auto 4px"><canvas id="proj-donut" role="img" aria-label="' + esc(t("app.drill.aria")) + '"></canvas></div>' +
        '<div class="legend" id="proj-donut-legend"></div>' : '';
    body.innerHTML =
      '<div class="psum"><div><p class="k">' + esc(t("app.drill.total")) + '</p><p class="vbig">' + fmt(p.total) + '</p></div>' +
      '<div><p class="k">' + esc(t("app.drill.value")) + '</p><p class="vbig">' + eur(p.cost) + '</p></div>' +
      '<div><p class="k">' + esc(t("app.drill.sessions")) + '</p><p class="vbig">' + (p.sessionCount || 0) + '</p></div></div>' + paths +
      (models ? '<div class="grouplabel">' + esc(t("app.drill.models")) + '</div>' + models : '') +
      donutBlock +
      (sessions ? '<div class="grouplabel">' + esc(t("app.drill.recent")) + '</div>' + sessions : '');
    var filterBtn = $("projsheet-filter");
    filterBtn.onclick = function () { setProjectFilter(name); closeProjSheet(); };
    openSheet("projsheet");
    if (hasBreakdown) drawProjDonut(p);
  }
  var projDonutChart = null;
  function drawProjDonut(p) {
    var cv = $("proj-donut"); if (!cv) return;
    var data = [p.input || 0, p.output || 0, p.cacheCreate || 0, p.cacheRead || 0];
    var labels = [t("app.drill.input"), t("app.drill.output"), t("app.drill.cacheWrite"), t("app.drill.cacheRead")];
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
  /* Repères d'aire (jury musk) : ligne de MOYENNE en pointillé + PIC annoté, pour
     que la largeur du graphe porte de l'info et non un grand aplat vide. Plugin
     Chart.js pur (aucune dépendance neuve), dessiné sous la courbe. Discret : gris
     chaud pour la moyenne, terracotta pour le libellé du pic. */
  var trendGuides = {
    id: "cetTrendGuides",
    afterDatasetsDraw: function (chart) {
      var ds = chart.data.datasets[0]; if (!ds || !ds.data || ds.data.length < 4) return;
      var meta = chart.getDatasetMeta(0); var pts = meta.data; if (!pts || !pts.length) return;
      var vals = ds.data, area = chart.chartArea, c = chart.ctx;
      var sum = 0, max = -Infinity, maxI = 0;
      for (var i = 0; i < vals.length; i++) { sum += vals[i]; if (vals[i] > max) { max = vals[i]; maxI = i; } }
      var avg = sum / vals.length;
      var ySc = chart.scales.y; if (!ySc) return;
      var avgY = ySc.getPixelForValue(avg);
      var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches;
      var faint = dark ? "rgba(240,238,230,.34)" : "rgba(26,25,21,.30)";
      var ink = dark ? "rgba(240,238,230,.62)" : "#7A766A";
      // ligne de moyenne (pointillé)
      c.save();
      c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = faint;
      c.beginPath(); c.moveTo(area.left, avgY); c.lineTo(area.right, avgY); c.stroke();
      c.setLineDash([]);
      // étiquette « moy. » calée à gauche, au-dessus de la ligne
      c.font = '10px ' + "ui-monospace,'Spline Sans Mono',Menlo,monospace";
      c.fillStyle = ink; c.textBaseline = "bottom";
      c.fillText((typeof t === "function" ? t("app.chart.avg") : "moy.") + " " + fmt(avg), area.left + 2, avgY - 4);
      // pic annoté : petit halo + valeur
      var pk = pts[maxI]; if (pk) {
        c.beginPath(); c.arc(pk.x, pk.y, 3.2, 0, Math.PI * 2);
        c.fillStyle = "#CC785C"; c.fill();
        c.strokeStyle = dark ? "#141310" : "#FBFAF6"; c.lineWidth = 2; c.stroke();
        var lbl = fmt(max);
        c.font = '600 10px ' + "ui-monospace,'Spline Sans Mono',Menlo,monospace";
        var tw = c.measureText(lbl).width;
        var lx = Math.min(Math.max(pk.x - tw / 2, area.left), area.right - tw);
        var ly = pk.y - 8; if (ly < area.top + 10) ly = pk.y + 18;
        c.fillStyle = dark ? "#E8A48C" : "#A8432F"; c.textBaseline = "bottom"; c.textAlign = "left";
        c.fillText(lbl, lx, ly);
      }
      c.restore();
    }
  };

  function drawTrend(rows) {
    var ctx = $("trend").getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 170); g.addColorStop(0, "rgba(204,120,92,.28)"); g.addColorStop(1, "rgba(204,120,92,0)");
    var cfg = {
      type: "line",
      data: { labels: rows.map(function (r) { return dayLabel(r.date); }), datasets: [{ data: rows.map(function (r) { return r.total; }), borderColor: "#CC785C", borderWidth: 2.5, backgroundColor: g, fill: true, tension: .38, pointRadius: rows.length <= 2 ? 5 : 0, pointBackgroundColor: "#CC785C", pointHoverRadius: 5, pointHoverBackgroundColor: "#CC785C", pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", padding: 10, displayColors: false, callbacks: { label: function (c) { return fmtFull(c.parsed.y) + " tokens"; } } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { grid: { color: "rgba(128,128,128,.12)" }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxTicksLimit: 4, callback: function (v) { return fmt(v); } } } } },
      plugins: [trendGuides]
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
        setStatus(t("app.share.copied"), null);
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

  /* Moment aha : première fois qu'on reçoit de vraies données (pas démo).
     Déclenche une animation d'entrée sur le verdict. Une seule fois. */
  function triggerAha() {
    if (_ahaShown) return;
    _ahaShown = true;
    try { localStorage.setItem(AHA_KEY, "1"); } catch (e) {}
    var v = $("verdict");
    if (!v) return;
    v.classList.add("aha-enter");
    setTimeout(function () { v.classList.remove("aha-enter"); }, 800);
  }

  /* État "réveil Render" : quand on a une clé et que ça prend du temps,
     on affiche un message clair plutôt que le silence ou la démo. */
  var _wakeTimer = null;
  function showWakeStatus() {
    setStatus(t("app.status.waking"), "waking");
    var bar = $("wake-bar"); if (bar) bar.hidden = false;
  }
  function hideWakeStatus() {
    var bar = $("wake-bar"); if (bar) bar.hidden = true;
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
    // Si clé présente et serveur distant : après 4s sans réponse, on informe
    if (apiKey && PUSH_SERVER && !silent) {
      _wakeTimer = setTimeout(showWakeStatus, 4000);
    }

    function tryAt(i) {
      if (i >= sources.length) {
        // dernier repli : démo. On nuance le message selon ce qu'on a vu.
        // Si on avait une clé mais que le serveur n'a pas répondu, on réessaie
        // une fois avec un timeout plus long avant de tomber en démo.
        if (sawRemoteTimeout && apiKey && PUSH_SERVER) {
          if (!silent) showWakeStatus();
          return fetchTimeout(PUSH_SERVER.replace(/\/$/, "") + "/usage.json?key=" + encodeURIComponent(apiKey), 45000, { headers: { "X-Api-Key": apiKey } })
            .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
            .then(function (d) {
              if (!d || !d.totals || !d.totals.total) throw new Error("empty");
              hideWakeStatus();
              DATA = d; render(); try { checkThresholds(d); } catch (e) {}
              if (!d.demo && d.source && d.source.claudeCodeDir !== null) triggerAha();
            })
            .catch(function () {
              hideWakeStatus();
              return fetchTimeout("data/usage.demo.json", 8000)
                .then(function (r) { return r.json(); })
                .then(function (d) { DATA = d; render(); })
                .catch(function () { if (!silent) setStatus(t("app.status.sleeping"), "err"); });
            });
        }
        hideWakeStatus();
        return fetchTimeout("data/usage.demo.json", 8000)
          .then(function (r) { return r.json(); })
          .then(function (d) { DATA = d; render(); /* render() pose le bandeau démo */ })
          .catch(function () {
            if (!silent) setStatus(
              navigator.onLine === false ? t("app.status.offline")
              : sawRemoteTimeout ? t("app.status.sleeping")
              : t("app.status.nodata"), "err");
          });
      }
      var src = sources[i];
      var fetchOpts = {};
      // Passer l'API key en header aussi (pour les requêtes multi-tenant)
      if (src.withKey && apiKey) fetchOpts.headers = { "X-Api-Key": apiKey };
      return fetchTimeout(src.url, src.remote ? 25000 : 8000, fetchOpts)
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (d) {
          if (!d || !d.totals || !d.totals.total) throw new Error("empty");
          // Le schéma est ADDITIF : une version plus récente ne fait qu'ajouter
          // des champs. On AFFICHE quand même (le front ignore ce qu'il ne connaît
          // pas) au lieu de bloquer l'app — on note juste qu'une MAJ est dispo.
          var sc = d.schema || 1;
          clearTimeout(_wakeTimer); hideWakeStatus();
          DATA = d; render(); try { checkThresholds(d); } catch (e) {}
          // Moment aha : première vraie donnée (non-démo)
          if (!d.demo && d.source && d.source.claudeCodeDir !== null) triggerAha();
          if (sc > SUPPORTED_SCHEMA) {
            setStatus(t("app.status.update", { sc: sc }), "warn");
          }
        })
        .catch(function (e) {
          if (src.remote && e && e.name === "AbortError") { clearTimeout(_wakeTimer); sawRemoteTimeout = true; }
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
    var label = { today: t("html.chart.today"), "7": t("html.chart.7d"), "30": t("html.chart.30d"), all: t("html.chart.all") }[period] || "";
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
    document.body.classList.add("sheet-open");
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
    document.body.classList.remove("sheet-open");
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
    if (window.CETI18N) window.CETI18N.markLangButtons();
    renderProjEditor();
  }
  // sélecteur de langue EN/FR
  var langSeg = $("lang-seg");
  if (langSeg) {
    langSeg.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-lang]");
      if (!btn) return;
      if (window.CETI18N) {
        window.CETI18N.switchLang(btn.getAttribute("data-lang"));
        if (DATA) render();
      }
    });
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
      [t("app.notif.period.month"), d.month ? d.month.currentMonth : 0, settings.month],
      [t("app.notif.period.day"),   d.today ? d.today.total : 0, settings.day],
      [t("app.notif.period.week"),  d.weekly ? d.weekly.currentWeek : 0, settings.week]
    ];
    if (d.windows) {
      // défensif : un payload tronqué (windows sans w5h/w7d) ne doit pas planter
      if (d.windows.w5h) checks.push([t("windows.alert.key.5h"), d.windows.w5h.total || 0, settings.w5h]);
      if (d.windows.w7d) checks.push([t("app.notif.period.7d"),  d.windows.w7d.total || 0, settings.w7d]);
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
      var msg = hit >= 100 ? t("app.notif.body.hit100", { p: p }) : t("app.notif.body.hitMark", { hit: hit, p: p });
      // en Free, la notif du mur invite à anticiper avec Pro.
      if (!pro && hit >= 100) msg += " " + t("app.notif.hint.free");
      fireNotif(t("app.notif.title.budget", { name: name }), msg);
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
        if (a.mark >= 100) fireNotif(t("app.notif.win.full.title", { label: a.label }),
          pro ? t("app.notif.win.full.body", { pct: a.pct }) : t("app.notif.win.full.body.free", { pct: a.pct }));
        else if (!pro) return;  // Free : aucun palier d'anticipation
        else if (a.mark >= 90) fireNotif(t("app.notif.win.90.title", { label: a.label, mark: a.mark }), t("app.notif.win.90.body", { pct: a.pct }));
        else if (a.mark >= 75) fireNotif(t("app.notif.win.75.title", { label: a.label, mark: a.mark }), t("app.notif.win.75.body", { pct: a.pct }));
        else fireNotif(t("app.notif.win.low.title", { label: a.label, mark: a.mark }), t("app.notif.win.low.body", { pct: a.pct }));
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
          var who = b.share != null && b.share > 50 ? t("app.notif.anomaly.body.agents") : t("app.notif.anomaly.body.generic");
          fireNotif(t("app.notif.anomaly.title", { z: b.zStr }),
            who.charAt(0).toUpperCase() + who.slice(1));
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
    if (!("Notification" in window)) { this.textContent = t("app.notif.unsupported"); return; }
    var btn = this;
    Notification.requestPermission().then(function (p) {
      btn.textContent = p === "granted" ? t("app.notif.perm.granted") : (p === "denied" ? t("app.notif.perm.denied") : t("html.settings.notif.enable"));
      if (p === "granted") fireNotif(t("app.notif.activated.title"), t("app.notif.activated.body"));
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
              if (d.email) $("auth-logged-email").textContent = " : " + d.email;
              var plan = d.plan || "free";
              if ($("auth-logged-plan")) $("auth-logged-plan").textContent = plan;
              // statut d'abonnement : "actif jusqu'au JJ/MM" quand résilié en cours
              var statusEl = $("auth-logged-status");
              if (statusEl) {
                var extra = "";
                if (d.plan_status === "cancelled" && d.plan_renews_at) {
                  var dt = new Date(d.plan_renews_at);
                  if (!isNaN(dt.getTime())) {
                    extra = " " + t("app.auth.status.until", { date: dt.toLocaleDateString(_loc(), { day: "2-digit", month: "2-digit" }) });
                  } else extra = " " + t("app.auth.status.cancel");
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
        $("auth-error").textContent = t("app.auth.error.email");
        $("auth-error").style.display = "block";
        return;
      }
      $("auth-error").style.display = "none";
      $("auth-submit").textContent = t("app.auth.creating");
      $("auth-submit").disabled = true;

      fetch(PUSH_SERVER.replace(/\/$/, "") + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          $("auth-submit").textContent = t("html.auth.submit");
          $("auth-submit").disabled = false;
          if (!res.ok) {
            $("auth-error").textContent = res.data.error || t("app.auth.error.generic");
            $("auth-error").style.display = "block";
            return;
          }
          // Succès : afficher la clé
          window.CET_setApiKey(res.data.api_key);
          $("auth-key-display").value = res.data.api_key;
          $("auth-form").style.display = "none";
          $("auth-success").style.display = "block";
          // Proposer les notifs juste après la connexion (Notification API dispo + pas encore accordé)
          if ("Notification" in window && Notification.permission === "default") {
            var np = $("notif-prompt"); if (np) np.hidden = false;
          }
          load();  // recharger les données avec la clé
        })
        .catch(function () {
          $("auth-submit").textContent = t("html.auth.submit");
          $("auth-submit").disabled = false;
          $("auth-error").textContent = t("app.auth.error.network");
          $("auth-error").style.display = "block";
        });
    });

    // Copier la clé
    if ($("auth-copy-key")) $("auth-copy-key").addEventListener("click", function () {
      var key = $("auth-key-display").value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(key).then(function () {
          $("auth-copy-key").textContent = t("app.auth.copied");
        });
      } else {
        $("auth-key-display").select();
        document.execCommand("copy");
        $("auth-copy-key").textContent = t("app.auth.copied");
      }
    });

    // Activer les notifs depuis le prompt post-connexion
    if ($("notif-prompt-btn")) $("notif-prompt-btn").addEventListener("click", function () {
      var btn = this;
      Notification.requestPermission().then(function (p) {
        var np = $("notif-prompt");
        if (p === "granted") {
          btn.textContent = t("app.notif.perm.granted");
          setTimeout(function () { if (np) np.hidden = true; }, 1400);
        } else {
          if (np) np.hidden = true;
        }
      });
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
        $("auth-error").textContent = t("app.auth.error.keyformat");
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

  /* ---------- Onboarding à étapes (#setup-sheet) ----------
     5 étapes, une seule visible. Réutilise openSheet/closeSheet (focus-trap +
     Échap + retour focus). L'étape 2 rappelle le MÊME endpoint que l'auth
     (POST /auth/register) et le même window.CET_setApiKey — pas de 2e sheet. */
  (function initSetupWizard() {
    var sheet = $("setup-sheet");
    if (!sheet) return;

    var TOTAL = 5, step = 1;
    var steps = [].slice.call(sheet.querySelectorAll(".setup-step"));
    var barFill = $("setup-bar-fill"), bar = $("setup-bar"), stepno = $("setup-stepno");
    var prevBtn = $("setup-prev"), nextBtn = $("setup-next"), finishBtn = $("setup-finish");
    var live = $("setup-live");

    function announce(msg) { if (live) live.textContent = msg || ""; }

    function show(n) {
      step = Math.max(1, Math.min(TOTAL, n));
      steps.forEach(function (el) {
        el.hidden = (+el.getAttribute("data-step") !== step);
      });
      var pct = Math.round(step / TOTAL * 100);
      if (barFill) barFill.style.width = pct + "%";
      if (bar) bar.setAttribute("aria-valuenow", String(step));
      if (stepno) stepno.textContent = t("app.setup.stepno", { step: step, total: TOTAL });
      prevBtn.disabled = (step === 1);
      var last = (step === TOTAL);
      nextBtn.hidden = last;
      finishBtn.hidden = !last;
      var cur = steps[step - 1];
      if (cur && cur.focus) cur.focus();
    }

    function open() { show(1); openSheet("setup-sheet"); }
    function close() { closeSheet("setup-sheet"); }
    window.CET_openSetup = open;

    nextBtn.addEventListener("click", function () { show(step + 1); });
    prevBtn.addEventListener("click", function () { show(step - 1); });
    finishBtn.addEventListener("click", close);
    if ($("close-setup")) $("close-setup").addEventListener("click", close);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });

    var server = (window.CLAUDE_EATS_TOKENS_SERVER || "").replace(/\/$/, "");

    function showKey(key) {
      window.CET_setApiKey(key);
      if ($("setup-key-value")) $("setup-key-value").textContent = key;
      if ($("setup-auth-form")) $("setup-auth-form").hidden = true;
      if ($("setup-auth-done")) $("setup-auth-done").hidden = false;
      announce(t("app.setup.key.ready"));
      if (DATA) load();
    }

    if ($("setup-auth-submit")) $("setup-auth-submit").addEventListener("click", function () {
      var email = ($("setup-email").value || "").trim();
      if (!email || email.indexOf("@") < 0) { announce(t("app.auth.error.email")); $("setup-email").focus(); return; }
      var btn = this;
      btn.disabled = true; btn.textContent = t("app.auth.creating"); announce(t("app.setup.creating"));
      fetch(server + "/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          btn.disabled = false; btn.textContent = t("html.auth.submit");
          if (!res.ok || !res.data.api_key) { announce(res.data && res.data.error ? res.data.error : t("app.auth.error.generic")); return; }
          showKey(res.data.api_key);
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = t("html.auth.submit");
          announce(t("app.auth.error.network"));
        });
    });

    if ($("setup-have-key")) $("setup-have-key").addEventListener("click", function () {
      var f = $("setup-have-key-form");
      if (f) { f.hidden = !f.hidden; if (!f.hidden) $("setup-key-input").focus(); }
    });
    if ($("setup-key-submit")) $("setup-key-submit").addEventListener("click", function () {
      var key = ($("setup-key-input").value || "").trim();
      if (key.indexOf("cet_") !== 0) { announce(t("app.auth.error.keyformat")); $("setup-key-input").focus(); return; }
      showKey(key);
    });

    if ($("setup-copy-key")) $("setup-copy-key").addEventListener("click", function () {
      var btn = this, key = $("setup-key-value").textContent;
      function ok() { btn.textContent = t("app.auth.copied"); btn.classList.add("done"); announce(t("app.setup.key.copied")); }
      if (navigator.clipboard) navigator.clipboard.writeText(key).then(ok).catch(ok);
      else { try { var r = document.createRange(); r.selectNode($("setup-key-value")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); s.removeAllRanges(); } catch (e) {} ok(); }
    });

    if (window.CET_API_KEY && $("setup-key-value")) {
      $("setup-key-value").textContent = window.CET_API_KEY;
      if ($("setup-auth-form")) $("setup-auth-form").hidden = true;
      if ($("setup-auth-done")) $("setup-auth-done").hidden = false;
    }
  })();

  // Ouvertures de l'onboarding depuis le bandeau démo et les réglages.
  if ($("firstrun-setup")) $("firstrun-setup").addEventListener("click", function () {
    if (window.CET_openSetup) window.CET_openSetup();
  });
  if ($("settings-setup")) $("settings-setup").addEventListener("click", function () {
    closeSheet("settings"); if (window.CET_openSetup) window.CET_openSetup();
  });

  /* ---------- Brancher mon ordinateur (#pair-sheet) — device-pairing ----------
     Flow : `claude-push` sur le PC affiche un code XXXX-XXXX dans le terminal ET
     ouvre le navigateur sur l'app avec ?pair=<code>. Ici on montre CE code en gros
     et on invite l'utilisateur à le comparer VISUELLEMENT à celui de son terminal
     (anti-phishing) avant de confirmer. Confirmer = POST {SERVER}/pair/confirm
     {code, api_key}. Il faut être connecté (window.CET_API_KEY) : sinon on route
     d'abord vers l'auth puis on revient. Fire-and-forget propre, aucun crash. */
  (function initPairing() {
    var sheet = $("pair-sheet");
    if (!sheet) return;
    var server = (window.CLAUDE_EATS_TOKENS_SERVER || "").replace(/\/$/, "");
    var pending = null;   // code en attente (ex. mémorisé pendant la connexion)
    var live = $("pair-live");
    function announce(m) { if (live) live.textContent = m || ""; }

    // Normalise un code brut vers "XXXX-XXXX" (majuscules, un seul tiret). Renvoie
    // "" si ça ne ressemble pas à un code (8 caractères alphanumériques).
    function normCode(raw) {
      var s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (s.length !== 8) return "";
      return s.slice(0, 4) + "-" + s.slice(4);
    }

    function showState(which) {
      ["pair-need-auth", "pair-confirm", "pair-success"].forEach(function (id) {
        var el = $(id); if (el) el.hidden = (id !== which);
      });
    }
    function showError(msg) {
      var box = $("pair-error");
      if (box) { box.textContent = msg; box.hidden = false; }
      announce(msg);
    }
    function clearError() { var box = $("pair-error"); if (box) box.hidden = true; }

    // Ouvre le sheet sur le bon état. code optionnel (pré-rempli depuis l'URL) ;
    // sinon on montre le champ manuel pour taper le code du terminal.
    function open(code) {
      var norm = code ? normCode(code) : "";
      pending = norm || null;
      clearError();
      var manual = $("pair-manual");
      if (norm) {
        $("pair-code").textContent = norm;
        $("pair-code").hidden = false;
        if (manual) manual.hidden = true;
      } else {
        $("pair-code").hidden = true;         // pas de code connu -> saisie manuelle
        if (manual) manual.hidden = false;
        if ($("pair-code-input")) $("pair-code-input").value = "";
      }
      // pas de compte -> on demande d'abord la connexion
      if (!window.CET_API_KEY) { showState("pair-need-auth"); }
      else { showState("pair-confirm"); }
      openSheet("pair-sheet");
      if ($("pair-code-input") && !norm && window.CET_API_KEY) {
        setTimeout(function () { try { $("pair-code-input").focus(); } catch (e) {} }, 60);
      }
    }
    function close() { closeSheet("pair-sheet"); }
    // Exposé : le boot (détection ?pair=) et les points d'entrée s'en servent.
    window.CET_openPair = open;

    // Récupère le code à confirmer : soit pré-rempli (pending), soit tapé à la main.
    function currentCode() {
      if (pending) return pending;
      var inp = $("pair-code-input");
      return inp ? normCode(inp.value) : "";
    }

    // Le bouton "Me connecter" : on garde le code en mémoire, on ouvre l'auth,
    // et au retour (clé posée) on rouvre le pairing sur l'état confirmation.
    if ($("pair-goto-auth")) $("pair-goto-auth").addEventListener("click", function () {
      var keep = pending;
      close();
      if (typeof window.CET_openAuth === "function") window.CET_openAuth();
      // sonde légère : dès qu'une clé apparaît, on revient au pairing.
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (window.CET_API_KEY) { clearInterval(iv); open(keep); }
        else if (tries > 600) { clearInterval(iv); }  // ~5 min max, puis on lâche
      }, 500);
    });
    if ($("pair-cancel-auth")) $("pair-cancel-auth").addEventListener("click", close);
    if ($("pair-cancel")) $("pair-cancel").addEventListener("click", close);
    if ($("close-pair")) $("close-pair").addEventListener("click", close);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });

    if ($("pair-done")) $("pair-done").addEventListener("click", function () {
      close();
      load();  // recharge : les vrais chiffres du PC fraîchement branché arrivent
    });

    if ($("pair-confirm-btn")) $("pair-confirm-btn").addEventListener("click", function () {
      clearError();
      var code = currentCode();
      if (!code) { showError(t("app.pair.error.missing")); return; }
      // sécurité : sans compte on ne peut rien lier -> on renvoie vers l'auth
      if (!window.CET_API_KEY) { pending = code; showState("pair-need-auth"); return; }
      if (!server) { showError(t("app.pair.error.noserver")); return; }
      var btn = this;
      btn.disabled = true; btn.textContent = t("app.pair.pending"); announce(t("app.pair.pending"));
      fetch(server + "/pair/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": window.CET_API_KEY },
        body: JSON.stringify({ code: code, api_key: window.CET_API_KEY }),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; });
        })
        .then(function (res) {
          btn.disabled = false; btn.textContent = t("app.pair.confirm.btn");
          if (res.ok && res.data && res.data.ok) {
            pending = null;
            showState("pair-success");
            announce(t("app.pair.success"));
            return;
          }
          // messages clairs selon le code HTTP
          if (res.status === 404) showError(t("app.pair.error.404"));
          else if (res.status === 410) showError(t("app.pair.error.410"));
          else if (res.status === 400) showError(t("app.pair.error.400"));
          else showError((res.data && res.data.error) || t("app.pair.error.generic"));
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = t("app.pair.confirm.btn");
          showError(t("app.pair.error.network"));
        });
    });

    // Entrée = confirmer, depuis le champ manuel.
    if ($("pair-code-input")) $("pair-code-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); $("pair-confirm-btn").click(); }
    });
  })();

  // Points d'entrée manuels du pairing : réglages + dernière étape de l'onboarding.
  if ($("settings-pair")) $("settings-pair").addEventListener("click", function () {
    closeSheet("settings"); if (window.CET_openPair) window.CET_openPair();
  });
  if ($("setup-pair-link")) $("setup-pair-link").addEventListener("click", function () {
    closeSheet("setup-sheet"); if (window.CET_openPair) window.CET_openPair();
  });

  // Expose render pour que CETI18N.switchLang() puisse re-render après changement de langue.
  window.CET_RERENDER = function () { if (DATA) render(); };

  ensureNotifPermission();
  loadEurRate();
  load();
  startLive();
  // RADAR des fenêtres derrière le héro (lazy, dégradation gracieuse). Le script
  // radar-hero.js (defer) s'auto-monte aussi sur #hero-radar ; mount() est
  // idempotent, donc cet appel précoce est sans risque s'il existe déjà.
  if (window.CETRadar) { try { window.CETRadar.mount(document.getElementById("hero-radar")); } catch (e) {} }

  // Beacon d'instrumentation GTM (0-PII) : si l'URL a un ?ref=, on ping une
  // fois le serveur (comptage par canal). Fire-and-forget, sans bloquer, sans
  // erreur si offline/pas de serveur. Aucune donnée perso, aucun cookie.
  try {
    var _ref = (new URLSearchParams(location.search).get("ref") || "").toLowerCase();
    if (PUSH_SERVER && /^[a-z0-9-]{1,32}$/.test(_ref)) new Image().src = PUSH_SERVER.replace(/\/$/, "") + "/beacon?ref=" + _ref;
  } catch (e) {}

  // Device-pairing : `claude-push` sur le PC ouvre l'app avec ?pair=XXXX-XXXX.
  // On ouvre l'écran de confirmation avec le code pré-rempli, puis on NETTOIE
  // l'URL (comme le beacon) pour ne pas rejouer le pairing à un refresh/partage.
  try {
    var _pair = new URLSearchParams(location.search).get("pair");
    if (_pair && /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(_pair.trim())) {
      if (window.CET_openPair) window.CET_openPair(_pair.trim());
      if (window.history && history.replaceState) {
        var _u = new URL(location.href); _u.searchParams.delete("pair");
        history.replaceState(null, "", _u.pathname + _u.search + _u.hash);
      }
    }
  } catch (e) {}

  var SW_FILE = "sw.v40.js";
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
