/* radar-hero.js — « RADAR DES FENÊTRES » à droite du héro (Canvas2D natif, 0 dépendance).
   Remplace tokens-field.js (rendu trop subtil/invisible). Direction validée par Adam :
   un radar BOLD, clairement présent, qui montre d'un coup d'œil les 3 fenêtres Max.

   Visuel : 3 arcs concentriques sur la nuit chaude du héro (#16150F).
     - ARC EXTÉRIEUR = fenêtre 5 h.
     - ARC MILIEU    = cette semaine (7 j).
     - ARC INTÉRIEUR = ce mois.
   Chaque arc se remplit dans le sens horaire depuis le haut (12 h) jusqu'à son vrai %,
   avec un petit point lumineux au bout. Une piste pleine (cercle faible) derrière chaque
   arc. Couleurs par niveau (mêmes seuils que ringColor de format.js) :
     sage #9FB382 (<50%) · amber #C8923D (50–85%) · terracotta #C15F3C (>85%).
   Respiration premium très lente (~0.0003 rad/frame) + remplissage animé au chargement
   (ease 0 -> cible sur ~900 ms). Pensé pour être INTENTIONNEL et riche, jamais un voile.

   Choix Canvas2D plutôt que WebGL : 3 arcs + points = du dessin vectoriel trivial, net
   sur tout mobile, sans le moindre risque de shader muet. Le but n°1 est la VISIBILITÉ.

   Garde-fous (copiés du pattern éprouvé d'aurora.js — non négociables) :
   - UN SEUL contexte 2D, créé une fois (mount idempotent). Jamais recréé au render.
   - Init paresseuse après le 1er paint (requestIdleCallback + setTimeout de secours :
     rIC ne fire pas toujours — onglet en fond, navigateurs headless).
   - 1re frame TOUJOURS peinte même si document.hidden (les previews se disent cachées).
   - Boucle en pause quand l'onglet passe en fond (visibilitychange).
   - prefers-reduced-motion -> 1 frame statique (arcs pleins, aucune boucle).
   - Pas de canvas/2D -> le héro garde son fond CSS sombre, 0 erreur console.
   - dispose() complet (pas de fuite).

   API : window.CETRadar = { mount(el), setData(d), dispose() }. */
(function (root) {
  "use strict";

  var ctx = null, canvas = null, ro = null, rafId = null;
  var host = null, inited = false, disposed = false;
  var t0 = 0;                         // origine temps (respiration)
  var fillT = 0;                      // progression du remplissage 0..1 (anim de chargement)
  var reveal = 0;                     // fondu d'apparition 0..1
  var W = 0, H = 0, dpr = 1;
  var mq = (root.matchMedia && root.matchMedia("(prefers-reduced-motion:reduce)")) || null;

  // 3 fenêtres : extérieur (5 h) -> milieu (semaine) -> intérieur (mois).
  // pct = cible réelle [0..100] ; cur = valeur affichée (lerp à l'init).
  var arcs = [
    { key: "w5h",   pct: 0 },   // anneau le plus externe
    { key: "w7d",   pct: 0 },   // milieu
    { key: "month", pct: 0 },   // le plus interne
  ];

  // ringColorHex : MIROIR des seuils de format.js (ringColor), mais avec les
  // couleurs « fenêtres » validées : sage / ambre / terracotta. <50 / 50–85 / >85.
  function levelColor(p) {
    return p > 85 ? "#C15F3C" : (p >= 50 ? "#C8923D" : "#9FB382");
  }
  function reduced() { return !!(mq && mq.matches); }

  // -------- lecture des données : windowsOfficial (v4) prioritaire, sinon estimations --------
  // On ne laisse JAMAIS le radar vide : à défaut d'officiel, on dérive des %.
  function clampPct(v) {
    v = +v;
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(100, v));
  }
  function readData(d) {
    var next = { w5h: null, w7d: null, month: null };
    var wo = d && d.windowsOfficial;
    if (wo) {
      next.w5h = clampPct(wo.w5hPct);
      next.w7d = clampPct(wo.w7dPct);
      // Opus optionnel : sert d'appui pour l'arc « mois » s'il existe, sinon on
      // garde l'estimation mensuelle ci-dessous.
      if (typeof wo.w7dOpusPct === "number") next.month = clampPct(wo.w7dOpusPct);
    }
    // Estimations de repli (jamais d'arc blanc) :
    var win = d && d.windows;
    // % « forfait » estimés si le front les a posés (renderForfait), sinon dérive douce.
    var est = (root.CET_FORFAIT_PCT) || null;
    if (next.w5h == null) {
      next.w5h = est && est.p5h != null ? clampPct(est.p5h)
        : (win && win.w5h ? clampPct(win.w5h.total / 6e6) : 0);
    }
    if (next.w7d == null) {
      next.w7d = est && est.pAll != null ? clampPct(est.pAll)
        : (win && win.w7d ? clampPct(win.w7d.total / 95e6) : 0);
    }
    if (next.month == null) {
      // mois : ratio vs habitude (héro), borné. ratio3m=100 -> 33% de remplissage.
      var r3 = d && d.month && typeof d.month.ratio3m === "number" ? d.month.ratio3m / 100 : null;
      next.month = r3 != null ? clampPct(Math.round(r3 / 3 * 100))
        : (est && est.pOpus != null ? clampPct(est.pOpus) : 0);
    }
    return next;
  }

  function initCtx() {
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none";
    ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no2d");
    host.appendChild(canvas);
    fit();
  }

  function fit() {
    if (!ctx || !host) return;
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(host.clientWidth * dpr));
    var h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    W = w; H = h;
  }

  // easing doux (smoothstep)
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  function draw() {
    if (!ctx) return;
    var now = performance.now();
    if (t0 === 0) t0 = now;
    var elapsed = (now - t0);

    // remplissage : ease de 0 -> 1 sur ~900 ms. MAIS si aucune boucle ne va
    // avancer l'animation (reduced-motion OU onglet caché — les previews headless
    // se disent cachées), on snappe à l'état FINAL : la frame statique unique doit
    // montrer les arcs PLEINS, jamais un radar vide. (gotcha aurora.js.)
    if (reduced() || document.hidden) { fillT = 1; reveal = 1; }
    else if (fillT < 1) fillT = Math.min(1, fillT + 0.016 / 0.9);
    var fe = ease(fillT);

    // fondu d'apparition
    if (reveal < 1) reveal = Math.min(1, reveal + 0.016 / 0.6);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = reveal;

    // centre + rayon : le radar occupe la moitié droite-ish du bloc héro.
    var cx = W * 0.5, cy = H * 0.5;
    var rMax = Math.min(W, H) * 0.42;
    // respiration premium très lente (rotation imperceptible de l'ensemble)
    var breath = reduced() ? 0 : (elapsed * 0.0003) % (Math.PI * 2);
    // léger souffle d'échelle (±1.5%) pour que ça « vive » sans bouger franchement
    var pulse = reduced() ? 1 : (1 + Math.sin(elapsed * 0.0009) * 0.015);

    var stroke = Math.max(5, rMax * 0.115);            // épaisseur d'arc nette/bold
    var gap = stroke * 1.65;                            // espacement entre anneaux
    var TOP = -Math.PI / 2;                             // 12 h
    var TRACK = "rgba(244,241,233,.10)";               // piste faible (spec)

    for (var i = 0; i < arcs.length; i++) {
      var a = arcs[i];
      var r = (rMax - i * gap) * pulse;
      if (r < stroke) continue;
      var p = Math.max(0, Math.min(100, a.pct)) * fe;  // anim de remplissage
      var col = levelColor(a.pct);                      // couleur = cible (pas la valeur animée)
      var a0 = TOP + breath;
      var a1 = a0 + (p / 100) * Math.PI * 2;

      // piste pleine (cercle complet faible) derrière l'arc
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = TRACK;
      ctx.lineWidth = stroke;
      ctx.lineCap = "round";
      ctx.stroke();

      if (p > 0.1) {
        // halo doux sous l'arc (présence « riche », jamais criard)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a1, false);
        ctx.strokeStyle = col;
        ctx.lineWidth = stroke;
        ctx.lineCap = "round";
        ctx.shadowColor = col;
        ctx.shadowBlur = stroke * 1.1;
        ctx.globalAlpha = reveal * 0.95;
        ctx.stroke();
        ctx.restore();

        // point lumineux au bout de l'arc
        var ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r;
        ctx.beginPath();
        ctx.arc(ex, ey, stroke * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = "#F4F1E9";
        ctx.shadowColor = col;
        ctx.shadowBlur = stroke * 1.4;
        ctx.fill();
        ctx.shadowBlur = 0;
        // anneau coloré autour du point pour l'ancrer à sa fenêtre
        ctx.beginPath();
        ctx.arc(ex, ey, stroke * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, stroke * 0.22);
        ctx.stroke();
      }
    }

    // marqueur central discret (12 h) — signe que le départ est en haut
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, rMax * 0.04), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(244,241,233,.22)";
    ctx.fill();

    ctx.restore();
  }

  function loop() {
    if (disposed || reduced() || document.hidden) { rafId = null; return; }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  function wake() { if (!rafId && !reduced() && !document.hidden && !disposed) rafId = requestAnimationFrame(loop); }

  function onVis() {
    if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    else { reveal = Math.max(reveal, 1); wake(); }
  }
  function onReduced() {
    if (reduced()) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } reveal = 1; fillT = 1; try { draw(); } catch (e) {} }
    else wake();
  }

  function mount(el) {
    if (inited || disposed) return;
    if (!el) return;
    host = el;
    var start = function () {
      if (inited || disposed) return;
      try { initCtx(); inited = true; } catch (e) {
        // échec 2D -> abandon silencieux, le héro garde son fond CSS
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        ctx = null; canvas = null; return;
      }
      if (ro === null && root.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }
      document.addEventListener("visibilitychange", onVis);
      if (mq && mq.addEventListener) mq.addEventListener("change", onReduced);
      // 1re frame TOUJOURS peinte (même si l'onglet se dit caché au montage,
      // ex. preview headless). reduced-motion s'arrête là ; sinon on anime.
      reveal = reduced() ? 1 : 0.001;
      if (reduced()) fillT = 1;
      try { draw(); } catch (e) {}
      if (!reduced()) wake();
    };
    // paresseux : après le 1er paint, hors chemin critique. rIC = optimisation,
    // MAIS toujours un setTimeout de secours (rIC ne fire pas toujours).
    var started = false;
    var go = function () { if (started) return; started = true; start(); };
    var schedule = function () {
      if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 1500 });
      setTimeout(go, 300);                 // filet de sécurité : fire toujours
    };
    if (document.readyState === "complete") schedule();
    else root.addEventListener("load", schedule, { once: true });
  }

  // setData : reçoit TOUT l'objet data (pour lire windowsOfficial). Met à jour les
  // cibles des 3 arcs. Relance le remplissage animé si les valeurs changent.
  function setData(d) {
    var vals = readData(d || {});
    var changed = false;
    var map = { w5h: vals.w5h, w7d: vals.w7d, month: vals.month };
    arcs.forEach(function (a) {
      var nv = map[a.key];
      if (nv == null) nv = 0;
      if (nv !== a.pct) { a.pct = nv; changed = true; }
    });
    if (!inited) return;                 // valeurs mémorisées, le 1er draw les peindra
    if (!changed) return;
    if (reduced() || document.hidden) { fillT = 1; try { draw(); } catch (e) {} }
    else { wake(); }
  }

  function dispose() {
    disposed = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener("visibilitychange", onVis);
    if (mq && mq.removeEventListener) mq.removeEventListener("change", onReduced);
    if (ro) { ro.disconnect(); ro = null; }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    ctx = null; canvas = null; inited = false;
  }

  root.CETRadar = { mount: mount, setData: setData, dispose: dispose };

  // auto-montage (comme aurora.js / tokens-field.js) : app.js s'exécute avant ce
  // script (defer), donc on monte nous-mêmes sur #hero-radar. mount() est idempotent.
  function selfMount() {
    var el = document.getElementById("hero-radar");
    if (el) mount(el);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", selfMount, { once: true });
  } else { selfMount(); }
})(typeof window !== "undefined" ? window : this);
