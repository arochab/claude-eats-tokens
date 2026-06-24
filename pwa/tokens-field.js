/* tokens-field.js — « CHAMP DE TOKENS » derrière le héro (WebGL natif, 0 dépendance).
   Direction « DA Anthropic side-project » : une nappe de points (= des tokens) qui
   dérivent du chaos (à gauche) et se CRISTALLISENT lentement sur une grille technique
   (à droite). Lent, calme, premium — jamais agité. Sa teinte EST l'état du budget
   (mêmes seuils que l'anneau 2D / ringColor de format.js).

   Pourquoi WebGL pur et pas three.js : on dessine un seul nuage de points avec un
   vertex shader qui interpole chaque point entre sa position « chaos » et sa cible
   « grille ». 1 seul draw call, ~0 poids mort. three.js (~670 Ko) serait du gâchis.

   Garde-fous (copiés du pattern éprouvé d'aurora.js — non négociables) :
   - UN SEUL contexte WebGL, créé une fois (mount idempotent). Jamais recréé au render.
   - Init paresseuse après le 1er paint (requestIdleCallback + setTimeout de secours :
     rIC ne fire pas toujours — onglet en fond, navigateurs headless).
   - 1re frame TOUJOURS peinte même si document.hidden (les previews se disent cachées).
   - Boucle en pause quand l'onglet passe en fond (visibilitychange).
   - prefers-reduced-motion -> 1 frame statique, aucune boucle.
   - Pas de WebGL / échec shader -> le héro garde son fond CSS sombre, 0 erreur console.
   - dispose() complet avec WEBGL_lose_context (pas de fuite).
   - Teinte pilotée par les VRAIS chiffres, lerp doux (~700 ms), jamais de saut sec.

   API : window.CETField = { mount(el), setData({monthPct, warn}), dispose() }. */
(function (root) {
  "use strict";

  var gl = null, canvas = null, prog = null, ro = null, rafId = null;
  var host = null, inited = false, disposed = false;
  var u = {}, posBuf = null, gridBuf = null, seedBuf = null, N = 0;
  var t0 = 0;
  var cur = [0.49, 0.58, 0.40];                 // teinte courante (sauge par défaut)
  var from = cur.slice(), to = cur.slice(), toneT = 1;
  var reveal = 0;
  var mq = (root.matchMedia && root.matchMedia("(prefers-reduced-motion:reduce)")) || null;

  // ringColorHex : MIROIR EXACT du seuillage budget. Couleurs de la nouvelle DA
  // (sage #7E9466 / ambre #C8923D / brique #A8432F) — alignées sur ringColor.
  function ringColorHex(p, warn) {
    return p >= 100 ? "#A8432F" : (p >= warn || p >= 50) ? "#C8923D" : "#7E9466";
  }
  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function reduced() { return !!(mq && mq.matches); }

  // bruit déterministe (pas de Math.random runtime) : hash entier -> [0,1)
  function rnd(i) {
    var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // Vertex : interpole chaque point entre sa position « chaos » et sa cible
  // « grille », selon une phase de cristallisation qui balaie de gauche à droite
  // (la grille apparaît côté droit). gl_PointSize varie doucement (respiration).
  var VERT = [
    "precision mediump float;",
    "attribute vec2 aChaos;",            // position désordonnée de départ (clip -1..1)
    "attribute vec2 aGrid;",             // cible alignée sur la grille (clip -1..1)
    "attribute float aSeed;",            // graine par point (déphasage)
    "uniform float uTime;uniform float uReveal;uniform vec2 uRes;",
    "varying float vTwinkle;varying float vCryst;",
    "void main(){",
    // x de la grille en 0..1 (gauche=0, droite=1) -> pilote l'avancée de la cristallisation
    "  float gx=aGrid.x*0.5+0.5;",
    // vague de cristallisation lente qui balaie vers la droite puis respire
    "  float wave=0.5+0.5*sin(uTime*0.18+aSeed*6.2831);",
    "  float cryst=smoothstep(0.0,1.0, (1.0-gx)*0.55 + wave*0.6 );",
    "  cryst=clamp(cryst,0.0,1.0);",
    // dérive lente du chaos (mouvement brownien doux, jamais agité)
    "  vec2 drift=vec2(sin(uTime*0.07+aSeed*9.0),cos(uTime*0.06+aSeed*7.0))*0.05;",
    "  vec2 chaos=aChaos+drift;",
    "  vec2 pos=mix(chaos,aGrid,cryst);",
    "  gl_Position=vec4(pos,0.,1.);",
    "  vCryst=cryst;",
    "  vTwinkle=0.6+0.4*sin(uTime*0.9+aSeed*30.0);",
    // points plus nets/denses une fois cristallisés ; taille suit le DPR via uRes
    "  float dpr=clamp(uRes.y/400.0,1.0,2.0);",
    "  gl_PointSize=(mix(1.6,2.6,cryst))*dpr*uReveal;",
    "}",
  ].join("\n");

  // Fragment : point doux (disque atténué), teinté par le budget. Les points
  // cristallisés brillent un peu plus -> la grille « prend » visuellement.
  var FRAG = [
    "precision mediump float;",
    "uniform vec3 uTone;uniform float uReveal;",
    "varying float vTwinkle;varying float vCryst;",
    "void main(){",
    "  vec2 d=gl_PointCoord-vec2(0.5);",
    "  float r=length(d);",
    "  float a=smoothstep(0.5,0.0,r);",        // disque doux
    "  a*=mix(0.30,0.85,vCryst)*vTwinkle*uReveal;",
    "  vec3 col=uTone*mix(0.9,1.5,vCryst);",
    "  gl_FragColor=vec4(col*a,a);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader");
    return s;
  }

  // Génère le nuage : chaque token a une position chaos + une cible sur une
  // grille technique régulière. Déterministe (seedé) -> jamais de scintillement
  // de layout entre frames, et reproductible.
  function buildField() {
    var COLS = 26, ROWS = 11;
    N = COLS * ROWS;
    var chaos = new Float32Array(N * 2);
    var grid = new Float32Array(N * 2);
    var seed = new Float32Array(N);
    var i = 0;
    for (var ry = 0; ry < ROWS; ry++) {
      for (var rx = 0; rx < COLS; rx++) {
        // cible grille : centrée, marge intérieure pour ne pas coller aux bords
        var gx = (rx + 0.5) / COLS;            // 0..1
        var gyv = (ry + 0.5) / ROWS;
        grid[i * 2]     = (gx * 1.7 - 0.85);    // -0.85..0.85
        grid[i * 2 + 1] = (gyv * 1.5 - 0.75);   // -0.75..0.75
        // chaos : dispersion plus large, biaisée vers la gauche (le désordre y règne)
        var a = rnd(i + 1) * 6.2831, rr = 0.4 + rnd(i + 7) * 0.9;
        chaos[i * 2]     = -0.4 + Math.cos(a) * rr - rnd(i + 3) * 0.4;
        chaos[i * 2 + 1] = Math.sin(a) * rr * 0.9;
        seed[i] = rnd(i + 11);
        i++;
      }
    }
    posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, chaos, gl.STATIC_DRAW);
    var lc = gl.getAttribLocation(prog, "aChaos");
    gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);

    gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
    var lg = gl.getAttribLocation(prog, "aGrid");
    gl.enableVertexAttribArray(lg); gl.vertexAttribPointer(lg, 2, gl.FLOAT, false, 0, 0);

    seedBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
    var ls = gl.getAttribLocation(prog, "aSeed");
    gl.enableVertexAttribArray(ls); gl.vertexAttribPointer(ls, 1, gl.FLOAT, false, 0, 0);
  }

  function initGL() {
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none";
    var opts = { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power", depth: false, preserveDrawingBuffer: true };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) throw new Error("nogl");

    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(prog);

    buildField();

    u.time = gl.getUniformLocation(prog, "uTime");
    u.tone = gl.getUniformLocation(prog, "uTone");
    u.reveal = gl.getUniformLocation(prog, "uReveal");
    u.res = gl.getUniformLocation(prog, "uRes");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);          // additif doux

    host.appendChild(canvas);
    fit();
  }

  function fit() {
    if (!gl || !host) return;
    var dpr = Math.min(root.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(host.clientWidth * dpr));
    var h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
  }

  function draw() {
    if (!gl) return;
    var now = performance.now();
    if (t0 === 0) t0 = now;
    var elapsed = (now - t0) / 1000;
    gl.uniform1f(u.time, elapsed);
    if (toneT < 1) {
      toneT = Math.min(1, toneT + 0.016 / 0.7);  // ~700 ms
      var e = toneT * toneT * (3 - 2 * toneT);
      cur[0] = from[0] + (to[0] - from[0]) * e;
      cur[1] = from[1] + (to[1] - from[1]) * e;
      cur[2] = from[2] + (to[2] - from[2]) * e;
    }
    gl.uniform3f(u.tone, cur[0], cur[1], cur[2]);
    if (reveal < 1) reveal = Math.min(1, reveal + 0.016 / 1.3);  // fondu d'apparition lent
    gl.uniform1f(u.reveal, reveal);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
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
    if (reduced()) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } reveal = 1; toneT = 1; cur = to.slice(); try { draw(); } catch (e) {} }
    else wake();
  }

  function mount(el) {
    if (inited || disposed) return;
    if (!("WebGLRenderingContext" in root) || !el) return;   // no-WebGL : on ne touche à rien
    host = el;
    var start = function () {
      if (inited || disposed) return;
      try { initGL(); inited = true; } catch (e) {
        // échec WebGL / shader -> abandon silencieux, le héro garde son fond CSS
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        gl = null; canvas = null; return;
      }
      if (ro === null && root.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }
      document.addEventListener("visibilitychange", onVis);
      if (mq && mq.addEventListener) mq.addEventListener("change", onReduced);
      // 1re frame TOUJOURS peinte (même si l'onglet se dit caché au montage,
      // ex. preview headless). reduced-motion s'arrête là ; sinon on anime.
      reveal = reduced() ? 1 : 0.001;
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

  // setData : pilote la teinte par l'état du budget mensuel (même seuil que l'anneau).
  function setData(o) {
    o = o || {};
    var pct = +o.monthPct || 0, warn = +o.warn || 80;
    var rgb = hexToRgb(ringColorHex(pct, warn));
    if (!inited) { to = rgb.slice(); cur = rgb.slice(); return; }
    if (rgb[0] === to[0] && rgb[1] === to[1] && rgb[2] === to[2]) return;
    from = cur.slice(); to = rgb; toneT = 0;
    if (reduced() || document.hidden) { cur = to.slice(); toneT = 1; try { draw(); } catch (e) {} }
    else { wake(); }
  }

  function dispose() {
    disposed = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener("visibilitychange", onVis);
    if (mq && mq.removeEventListener) mq.removeEventListener("change", onReduced);
    if (ro) { ro.disconnect(); ro = null; }
    if (gl) {
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    gl = null; canvas = null; prog = null; inited = false;
    posBuf = gridBuf = seedBuf = null;
  }

  root.CETField = { mount: mount, setData: setData, dispose: dispose };

  // auto-montage (comme aurora.js) : app.js s'exécute avant ce script (defer),
  // donc on monte nous-mêmes sur #hero-field. mount() est idempotent.
  function selfMount() {
    var el = document.getElementById("hero-field");
    if (el) mount(el);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", selfMount, { once: true });
  } else { selfMount(); }
})(typeof window !== "undefined" ? window : this);
