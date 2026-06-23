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
    projects: []
  };
  var KEY = "tokenTracker.settings.v4";   // v4 : seuils opt-in, plus d'auto
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

  var DATA = null, VIEW = null, period = "7", trendChart = null, donutChart = null, weekCmpChart = null;
  var SUPPORTED_SCHEMA = 3;  // version max de usage.json comprise par ce front

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
    var demo = !!d.demo || (d.source && d.source.claudeCodeDir === null);
    var fr = $("firstrun"); if (fr) fr.hidden = !demo;
    if (demo) {
      setStatus("Démonstration — lance la synchro pour tes vrais chiffres", "demo");
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

    /* héro HONNÊTE (v3) : ce mois-ci en chiffres bruts + ratio à ta médiane
       3 mois (PAS un budget inventé). L'anneau = ce ratio, plafonné à 100% du
       tour pour rester lisible. */
    var ratio3m = (d.month && typeof d.month.ratio3m === "number") ? d.month.ratio3m : null;
    var median3m = d.month ? d.month.median3m : null;
    $("hero-lab").textContent = "Ce mois-ci";
    if (ratio3m != null) {
      var ringPct = Math.min(100, ratio3m);  // remplissage visuel borné
      var col = ratio3m >= 150 ? "#B5563A" : ratio3m >= 100 ? "#C8923D" : "#7E9E6D";
      $("hero-ring-2d").innerHTML = ringSVG(ringPct, 120, 11, "rgba(240,238,230,.14)", col,
        '<div class="pct"><b>' + ratio3m + '%</b><small>vs médiane</small></div>');
      $("hero-rest").textContent = "Médiane 3 mois : " + fmt(median3m || 0);
    } else {
      // pas assez d'historique -> on n'invente pas de comparaison
      $("hero-ring-2d").innerHTML = ringSVG(0, 120, 11, "rgba(240,238,230,.14)", "#7E9E6D",
        '<div class="pct"><b>' + fmt(month).replace(/ .*/, '') + '</b><small>ce mois</small></div>');
      $("hero-rest").textContent = "Pas encore de mois précédent pour comparer";
    }
    $("hero-used").classList.remove("sk");
    $("hero-used").textContent = fmt(month) + " tokens";
    if (d.month) $("hero-reset").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg> Jour ' + d.month.dayOfMonth + " / " + d.month.daysInMonth;

    /* verdict (panneau d'alarme) + alertes */
    renderVerdict(d, dayU, weekU);
    renderAlerts(d, 0, dayU, weekU);

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

    /* projets (liste complète, drill-down porte le donut + modèles) */
    renderProjects(DATA);

    var src = demo ? "démonstration" : (d.source.claudeCodeDir || "logs locaux");
    var asOf = (d.source && d.source.pricingAsOf) ? (" (tarifs " + d.source.pricingAsOf + ")") : "";
    var rateInfo = rateValue() ? (" · " + rateFreshness()) : " · coût en $ (taux €/$ indisponible)";
    $("foot").innerHTML = "Source : <b>" + esc(short(src)) + "</b>" + (d.source && d.source.apiConnected ? " · API connectée" : "") +
      "<br/>Valeur théorique au tarif API" + asOf + " — sur Max tu paies un forfait fixe" + rateInfo + ".";

    updateChartA11y(d, month);
  }

  // descriptions accessibles dynamiques des graphes/jauges (A3-4/A3-11)
  function updateChartA11y(d, month) {
    function setLabel(id, txt) { var el = $(id); if (el) el.setAttribute("aria-label", txt); }
    var rows = periodRows();
    var sum = sumRows(rows);
    var ratio = (d.month && d.month.ratio3m != null) ? (d.month.ratio3m + "% de ta médiane 3 mois") : "pas de comparaison";
    setLabel("hero-ring", "Ce mois : " + fmt(month) + " tokens, " + ratio + ".");
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

  function renderVerdict(d, dayU, weekU) {
    // VERDICT HONNÊTE (schéma v3) : rang percentile du jour dans TON historique.
    // Zéro budget inventé. Le "score" = "plus chargé que X% de tes journées".
    var pace = d.pace || {};
    var rank = (typeof pace.todayRank === "number") ? pace.todayRank : null;
    var v = $("verdict");
    if (rank == null) {
      // pas assez d'historique : on n'invente rien
      v.className = "verdict ok";
      $("vscore-n").textContent = "—";
      $("vstate").textContent = "Démarrage";
      $("vsub").textContent = "Pas encore assez d'historique pour te situer.";
      return;
    }
    // ton = position relative à TA médiane (pas un plafond) : >85e = pic, <50e = calme
    var tone = rank >= 90 ? "bad" : rank >= 70 ? "warn" : "ok";
    var state = rank >= 90 ? "Grosse journée" : rank >= 70 ? "Ça monte" : (rank >= 40 ? "Journée normale" : "Journée calme");
    var med = pace.medianPerDay || 0;
    var todayT = pace.todayTotal != null ? pace.todayTotal : dayU;
    var sub = "Aujourd'hui " + fmt(todayT) + " — plus chargée que " + rank +
              "% de tes journées passées (médiane : " + fmt(med) + "/j).";
    v.className = "verdict " + tone;
    $("vscore-n").textContent = rank;
    $("vstate").textContent = state;
    $("vsub").textContent = sub;
  }

  function renderApiCard(d) {
    var box = $("apicard"); if (!box) return;
    var theo = d.totals ? d.totals.cost : 0;
    box.innerHTML =
      '<div class="at" style="display:flex;align-items:center;gap:12px;width:100%">' +
      '<div style="width:36px;height:36px;border-radius:9px;background:var(--cream-2);display:grid;place-items:center;flex:0 0 auto;color:var(--muted)">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>' +
      '<div style="min-width:0"><p class="k" style="margin:0 0 2px">Valeur consommee <span style="font-weight:400">(theorique)</span></p>' +
      '<p class="v" style="margin:0">' + eur(theo) + '</p>' +
      '<p class="s" style="margin:3px 0 0">Sur Max tu paies un forfait fixe : tu ne paies <b>rien de plus</b>. Equivalent au tarif API, a titre indicatif.</p></div></div>';
  }

  function renderAlerts(d, _unused, dayU, weekU) {
    // Alertes UNIQUEMENT sur des seuils que TU as saisis (sinon aucun budget
    // inventé). Un seuil = un nombre > 0 dans les réglages.
    var a = [], warn = settings.warnPct || 80;
    function check(name, used, threshold) {
      if (!threshold || threshold <= 0) return;  // pas de seuil saisi -> rien
      var p = pct(used, threshold);
      if (p >= 100) a.push({ t: "bad", m: "<b>" + name + "</b> : seuil dépassé (" + p + "% de " + fmt(threshold) + ")." });
      else if (p >= warn) a.push({ t: "warn", m: "<b>" + name + "</b> : " + p + "% de ton seuil (" + fmt(threshold) + ")." });
    }
    check("Aujourd'hui", dayU, settings.day);
    check("Cette semaine", weekU, settings.week);
    check("Ce mois", d.month ? d.month.currentMonth : 0, settings.month);
    if (d.windows) { check("Fenêtre 5 h", d.windows.w5h.total, settings.w5h); }
    var html = "";
    if (a.length) a.slice(0, 3).forEach(function (x) { html += banner(x.t, x.m); });
    // pas de seuil et pas d'alerte -> on n'affiche rien (la div reste vide)
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

  function renderModels(d) {
    var box = $("models"); box.innerHTML = "";
    var max = Math.max.apply(null, (d.models || []).map(function (m) { return m.total; }).concat([1]));
    (d.models || []).forEach(function (m) {
      var c = modelColor(m.label), w = Math.max(3, Math.round((m.total / max) * 100));
      var el = document.createElement("div"); el.className = "model";
      el.innerHTML = '<div class="row"><span class="name"><span class="swatch" style="background:' + c + '"></span>' + esc(m.label) +
        '</span><span class="val"><b>' + fmt(m.total) + "</b> · " + money(m.cost) + "</span></div>" +
        '<div class="bar"><span style="width:' + w + "%;background:" + c + '"></span></div>';
      box.appendChild(el);
    });
    if (!(d.models || []).length) box.innerHTML = '<p style="color:var(--muted);font-size:13px">Aucune donnée.</p>';
  }
  var projSort = "tokens";
  function renderProjects(d) {
    var pbox = $("projects"); pbox.innerHTML = "";
    var projects = (d.projects || []).slice();
    if (!projects.length) {
      pbox.innerHTML = emptyState("Aucun projet détecté",
        "Lance la synchro (push_usage.py) pour voir tes projets Claude Code regroupés ici.");
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
        el.addEventListener("click", function () { openProjSheet(p); });
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

  function renderComplexity(restMonth) {
    var card = $("complexity-card"), box = $("complexity");
    var ps = settings.projects || [];
    if (!ps.length) { card.style.display = "none"; return; }
    card.style.display = "";
    var need = ps.reduce(function (a, p) { return a + (Number(p.weight) || 0); }, 0);
    var ratio = restMonth ? need / restMonth : 99;
    var tone = ratio > 1 ? "bad" : ratio > 0.8 ? "warn" : "ok";
    var verdict = ratio > 1 ? "Tes projets en cours pèsent <b>plus</b> que ton budget mensuel restant." :
      ratio > 0.8 ? "Tes projets en cours consommeront presque tout ton budget restant." :
      "Ton budget restant couvre tes projets en cours.";
    var rows = ps.map(function (p) {
      var w = pct(Number(p.weight) || 0, need || 1);
      return '<div class="model"><div class="row"><span class="name">' + esc(p.name) + '</span><span class="val"><b>' + fmt(Number(p.weight) || 0) + "</b></span></div>" +
        '<div class="bar"><span style="width:' + Math.max(3, w) + '%;background:var(--clay)"></span></div></div>';
    }).join("");
    box.innerHTML = banner(tone, verdict + " Besoin estimé : <b>" + fmt(need) + "</b> · reste ce mois : <b>" + fmt(restMonth) + "</b>.") + rows;
  }

  /* ---------- charts ---------- */
  function drawTrend(rows) {
    var ctx = $("trend").getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, "rgba(204,120,92,.28)"); g.addColorStop(1, "rgba(204,120,92,0)");
    var cfg = {
      type: "line",
      data: { labels: rows.map(function (r) { return dayLabel(r.date); }), datasets: [{ data: rows.map(function (r) { return r.total; }), borderColor: "#CC785C", borderWidth: 2.5, backgroundColor: g, fill: true, tension: .38, pointRadius: rows.length <= 2 ? 5 : 0, pointBackgroundColor: "#CC785C", pointHoverRadius: 5, pointHoverBackgroundColor: "#CC785C", pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", padding: 10, displayColors: false, callbacks: { label: function (c) { return fmtFull(c.parsed.y) + " tokens"; } } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { grid: { color: "rgba(128,128,128,.12)" }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxTicksLimit: 4, callback: function (v) { return fmt(v); } } } } }
    };
    // mémoïsation : on met à jour en place plutôt que détruire/recréer (A2-2)
    if (trendChart) {
      trendChart.data.labels = cfg.data.labels;
      trendChart.data.datasets[0].data = cfg.data.datasets[0].data;
      trendChart.data.datasets[0].backgroundColor = g;
      trendChart.data.datasets[0].pointRadius = rows.length <= 2 ? 5 : 0;  // "today" = point visible
      trendChart.update("none");
      return;
    }
    trendChart = new Chart(ctx, cfg);
  }
  function drawDonut(t) {
    var ctx = $("donut").getContext("2d");
    var data = [t.input, t.output, t.cacheCreate, t.cacheRead];
    var labels = ["Entrée", "Sortie", "Cache créé", "Cache lu"];
    var cols = [TONE.input, TONE.output, TONE.cacheCreate, TONE.cacheRead];
    if (donutChart) {
      donutChart.data.datasets[0].data = data;
      donutChart.update("none");
    } else {
      donutChart = new Chart(ctx, {
        type: "doughnut",
        data: { labels: labels, datasets: [{ data: data, backgroundColor: cols, borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: "64%", plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", callbacks: { label: function (c) { return c.label + " : " + fmt(c.parsed); } } } } }
      });
    }
    var tot = data.reduce(function (a, b) { return a + b; }, 0) || 1;
    $("donut-legend").innerHTML = labels.map(function (l, i) {
      return '<span><i style="background:' + cols[i] + '"></i>' + l + " " + Math.round(data[i] / tot * 100) + "%</span>";
    }).join("");
  }
  function drawHeat(tl) {
    var max = Math.max.apply(null, tl.map(function (r) { return r.total; }).concat([1]));
    function color(v) { if (!v) return "var(--cream-2)"; var r = v / max; return r > .75 ? "#B5563A" : r > .5 ? "#CC785C" : r > .25 ? "#D88E6E" : "#E8C5B5"; }
    // grille par semaines (colonnes) x 7 jours
    var byDate = {}; tl.forEach(function (r) { byDate[r.date] = r.total; });
    var days = tl.slice(-70); // ~10 semaines
    if (!days.length) { $("heat").innerHTML = ""; return; }
    var first = new Date(days[0].date + "T00:00:00Z");
    var offset = (first.getUTCDay() + 6) % 7;
    var cells = [];
    for (var i = 0; i < offset; i++) cells.push(null);
    days.forEach(function (r) { cells.push(r); });
    var cols = [], col = [];
    cells.forEach(function (c, i) { col.push(c); if (col.length === 7) { cols.push(col); col = []; } });
    if (col.length) cols.push(col);
    $("heat").innerHTML = cols.map(function (c) {
      return '<div class="col">' + c.map(function (cell) {
        if (!cell) return '<div class="cell" style="background:transparent"></div>';
        return '<div class="cell" title="' + dayLabel(cell.date) + " : " + fmtFull(cell.total) + ' tokens" style="background:' + color(cell.total) + '"></div>';
      }).join("") + '</div>';
    }).join("");
  }

  /* ---------- AXE 4 : heures de pointe (jour de semaine × heure) ---------- */
  var WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  function drawHourHeat(hourly) {
    var box = $("hourheat"); if (!box) return;
    var grid = hourly && hourly.weekdayHour;
    if (!grid || !grid.length) { box.innerHTML = emptyState("Pas encore de données horaires", "Reviens après quelques sessions."); $("hourheat-note").textContent = ""; return; }
    var max = 1, peak = { d: 0, h: 0, v: 0 }, byHourTotal = new Array(24).fill(0);
    for (var d = 0; d < 7; d++) for (var h = 0; h < 24; h++) {
      var v = grid[d][h] || 0; if (v > max) max = v;
      byHourTotal[h] += v;
      if (v > peak.v) peak = { d: d, h: h, v: v };
    }
    function col(v) { if (!v) return "var(--cream-2)"; var r = v / max; return r > .75 ? "#B5563A" : r > .5 ? "#CC785C" : r > .25 ? "#D88E6E" : "#E8C5B5"; }
    // en-tête heures (0,6,12,18) + grille
    var html = '<div class="hh-grid">';
    for (var dd = 0; dd < 7; dd++) {
      html += '<div class="hh-row"><span class="hh-day">' + WEEKDAYS[dd] + '</span>';
      for (var hh = 0; hh < 24; hh++) {
        var val = grid[dd][hh] || 0;
        html += '<span class="hh-cell" title="' + WEEKDAYS[dd] + " " + hh + "h : " + fmtFull(val) + ' tokens" style="background:' + col(val) + '"></span>';
      }
      html += '</div>';
    }
    html += '<div class="hh-row hh-axis"><span class="hh-day"></span>' +
      [0, 6, 12, 18].map(function (h) { return '<span class="hh-axis-lbl">' + h + 'h</span>'; }).join("") + '</div>';
    html += '</div>';
    box.innerHTML = html;
    // note : créneau le plus chargé
    var topHour = byHourTotal.indexOf(Math.max.apply(null, byHourTotal));
    $("hourheat-note").textContent = peak.v
      ? "Pic le " + WEEKDAYS[peak.d] + " vers " + peak.h + "h · créneau le plus chargé : " + topHour + "h–" + ((topHour + 1) % 24) + "h."
      : "";
  }

  /* ---------- AXE 4 : comparaison semaine vs semaine ---------- */
  function drawWeekCmp(weekly) {
    var weeks = (weekly && weekly.weeks) || [];
    var card = $("weekcmp-card");
    if (weeks.length < 2) { if (card) card.style.display = "none"; return; }
    if (card) card.style.display = "";
    var last = weeks.slice(-8);
    var labels = last.map(function (w) { return w.week.replace(/^\d+-/, ""); }); // "S25"
    var data = last.map(function (w) { return w.total; });
    var cols = data.map(function (_, i) { return i === data.length - 1 ? "#CC785C" : "#D4A27F"; });
    var ctx = $("weekcmp").getContext("2d");
    if (weekCmpChart) {
      weekCmpChart.data.labels = labels; weekCmpChart.data.datasets[0].data = data;
      weekCmpChart.data.datasets[0].backgroundColor = cols; weekCmpChart.update("none");
      return;
    }
    weekCmpChart = new Chart(ctx, {
      type: "bar",
      data: { labels: labels, datasets: [{ data: data, backgroundColor: cols, borderRadius: 6, maxBarThickness: 38 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1A1915", displayColors: false, callbacks: { label: function (c) { return fmtFull(c.parsed.y) + " tokens"; } } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 } } }, y: { grid: { color: "rgba(128,128,128,.12)" }, border: { display: false }, ticks: { color: "#9A988C", font: { size: 10 }, maxTicksLimit: 4, callback: function (v) { return fmt(v); } } } } }
    });
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
  function fetchTimeout(url, ms) {
    if (typeof AbortController === "undefined") return fetch(url, { cache: "no-store" });
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { cache: "no-store", signal: ctrl.signal })
      .finally(function () { clearTimeout(to); });
  }
  function setStatus(msg, kind) {
    var el = $("status-txt"); if (el) el.textContent = msg;
    var dot = $("status") && $("status").querySelector(".dot");
    if (dot) { dot.classList.remove("demo", "err"); if (kind) dot.classList.add(kind); }
  }

  function load(silent) {
    var sources = [];
    if (PUSH_SERVER) sources.push({ url: PUSH_SERVER.replace(/\/$/, "") + "/usage.json", remote: true });
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
              : "Aucune donnée à afficher. Lance la synchro sur ton PC.", "err");
          });
      }
      var src = sources[i];
      return fetchTimeout(src.url, src.remote ? 12000 : 8000)
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (d) {
          if (!d || !d.totals || !d.totals.total) throw new Error("empty");
          // garde de schéma : un format inconnu (futur v3) ne doit pas crasher
          // le front en silence -> on le signale et on garde la dernière vue.
          var sc = d.schema || 1;
          if (sc > SUPPORTED_SCHEMA) {
            setStatus("Format de données plus récent (" + sc + ") — mets l'app à jour.", "err");
            throw new Error("schema-too-new");
          }
          DATA = d; render(); checkThresholds(d);
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
    [].forEach.call($("period").children, function (x) {
      var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    period = b.getAttribute("data-p");
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
  $("refresh").addEventListener("click", function () { this.style.transform = "rotate(360deg)"; var s = this; setTimeout(function () { s.style.transform = ""; }, 400); load(); });
  if ($("export-csv")) $("export-csv").addEventListener("click", exportCSV);
  if ($("export-png")) $("export-png").addEventListener("click", exportPNG);

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
    var f = _focusables(sheet);
    if (f.length) f[0].focus();
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
    renderProjEditor();
  }
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
      checks.push(["fenêtre 5 h", d.windows.w5h.total, settings.w5h]);
      checks.push(["fenêtre 7 j", d.windows.w7d.total, settings.w7d]);
    }
    var marks = [100, settings.warnPct, 50];
    checks.forEach(function (c) {
      var name = c[0], p = pct(c[1], c[2]);
      var hit = null;
      for (var i = 0; i < marks.length; i++) { if (p >= marks[i]) { hit = marks[i]; break; } }
      if (hit == null) return;
      var key = name + ":" + hit;
      if (state[key]) return;
      state[key] = 1;
      var msg = hit >= 100 ? "Plafond atteint (" + p + "%)." : hit + "% du budget consommé (" + p + "%).";
      fireNotif("Tokens — " + name, msg);
    });
    setNotified(state);
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

  ensureNotifPermission();
  loadEurRate();
  load();
  startLive();
  var SW_FILE = "sw.v10.js";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      // 1) désenregistre tout SW qui n'est pas la version courante (purge les fantômes)
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          var u = (r.active && r.active.scriptURL) || "";
          if (u.indexOf(SW_FILE) < 0) { r.unregister(); }
        });
        // 2) enregistre la version courante (nom de fichier neuf = jamais en cache)
        navigator.serviceWorker.register(SW_FILE, { scope: "./" }).catch(function () {});
      }).catch(function () {
        navigator.serviceWorker.register(SW_FILE, { scope: "./" }).catch(function () {});
      });
      var refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (refreshed) return; refreshed = true; window.location.reload();
      });
    });
  }
})();
