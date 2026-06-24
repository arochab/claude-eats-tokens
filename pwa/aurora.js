/* aurora.js — AMBIANCE « Aurore Liquide » derrière le héro (WebGL natif, 0 dépendance).
   Direction retenue à l'unanimité du jury : un voile d'aurore procédural peint par
   UN fragment shader sur UN quad plein-cadre = 1 seul draw call. Sa teinte EST l'état
   du budget (même seuils que l'anneau 2D, ringColor de format.js), et un vignettage
   interne garde la zone du texte lisible.

   Choix d'ingénierie : WebGL pur plutôt que three.js. L'effet (1 plan + 1 shader)
   n'a besoin d'aucun moteur 3D ; three.js (~670 Ko) serait du poids mort sur mobile.

   Garde-fous (non négociables) :
   - UN SEUL contexte WebGL, créé une fois (idempotent). Jamais recréé au render.
   - Dégradation gracieuse : pas de WebGL / échec shader -> hero gradient CSS, 0 erreur.
   - prefers-reduced-motion -> 1 frame statique teintée, aucune boucle.
   - Pause dure quand l'onglet est caché (0 frame en fond).
   - Teinte pilotée par les VRAIS chiffres, lerp doux (~600 ms), jamais de saut sec.
   - dispose() complet (pas de fuite). Bruit déterministe (pas de Math.random runtime).

   API : window.CETAurora = { mount(el), setTone(pct, warn), dispose() }. */
(function (root) {
  "use strict";

  var gl = null, canvas = null, prog = null, ro = null, rafId = null;
  var host = null, inited = false, disposed = false;
  var u = {};                      // uniform locations
  var t0 = 0;                       // origine temps
  var cur = [0.49, 0.62, 0.43];     // teinte courante (rgb 0..1) — sauge par défaut
  var from = cur.slice(), to = cur.slice(), toneT = 1; // interpolation de teinte
  var reveal = 0;                   // fondu d'apparition 0..1
  var mq = (root.matchMedia && root.matchMedia("(prefers-reduced-motion:reduce)")) || null;

  // ringColorHex : MIROIR EXACT de format.js (ringColor) — une seule source de vérité.
  function ringColorHex(p, warn) {
    return p >= 100 ? "#B5563A" : (p >= warn || p >= 50) ? "#C8923D" : "#7E9E6D";
  }
  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function reduced() { return !!(mq && mq.matches); }

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  // Fragment shader « aurore » : value-noise déterministe (fbm 3 octaves) -> rubans
  // ondulés, luminance plafonnée (jamais de blanc), dither anti-banding, vignettage
  // de lisibilité (alpha->0 sous le texte). uTone = couleur du budget.
  var FRAG = [
    "precision mediump float;",
    "uniform vec2 uRes;uniform float uTime;uniform vec3 uTone;uniform float uReveal;uniform float uSpeed;",
    "float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 x){vec2 i=floor(x),f=fract(x);float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));vec2 u=f*f*(3.-2.*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}",
    "float fbm(vec2 x){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(x);x*=2.03;a*=.5;}return v;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;",                 // 0..1, repère stable
    "  float asp=uRes.x/uRes.y;",
    "  vec2 p=vec2(uv.x*asp,uv.y);",                    // espace bruit (aspect corrigé)
    "  float tm=uTime*uSpeed;",
    // deux nappes de profondeur (parallaxe) : fond lent + avant un peu plus vif
    "  float n1=fbm(p*vec2(1.6,2.4)+vec2(tm*0.06,tm*0.10));",
    "  float n2=fbm(p*vec2(2.8,3.6)-vec2(tm*0.04,tm*0.13)+5.2);",
    // rubans adoucis -> matière lumineuse (un peu plus présents = 'bluffant')
    "  float band=smoothstep(0.25,0.80,n1)*0.85+smoothstep(0.35,0.92,n2)*0.6;",
    "  float lum=min(band,0.62);",                      // plafond (assez visible, jamais de blanc franc)
    // dither animé : casse le banding du dégradé sombre
    "  lum+=(hash(gl_FragCoord.xy+floor(uTime*8.))-0.5)/170.;",
    // vignettage de lisibilité en UV : foyer haut-gauche large, atténué sur la
    // zone du texte (droite/bas) pour garder les chiffres nets.
    "  float dx=uv.x-0.32, dy=uv.y-0.60;",
    "  float d=sqrt(dx*dx*1.1+dy*dy);",
    "  float mask=smoothstep(1.05,0.05,d);",            // halo plus large
    "  float a=clamp(lum*mask*uReveal,0.0,0.92);",
    "  gl_FragColor=vec4(uTone*lum*mask*1.9,a);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader");
    return s;
  }

  function initGL() {
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none";
    var opts = { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: "low-power", depth: false, preserveDrawingBuffer: true };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) throw new Error("nogl");

    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    u.res = gl.getUniformLocation(prog, "uRes");
    u.time = gl.getUniformLocation(prog, "uTime");
    u.tone = gl.getUniformLocation(prog, "uTone");
    u.reveal = gl.getUniformLocation(prog, "uReveal");
    u.speed = gl.getUniformLocation(prog, "uSpeed");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);           // additif doux

    host.appendChild(canvas);
    fit();
  }

  function fit() {
    if (!gl || !host) return;
    var dpr = Math.min(root.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(host.clientWidth * dpr * 0.75));   // rendu 0.75x, upscalé en CSS
    var h = Math.max(1, Math.round(host.clientHeight * dpr * 0.75));
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
      toneT = Math.min(1, toneT + 0.016 / 0.6);   // ~600 ms
      var e = toneT * toneT * (3 - 2 * toneT);
      cur[0] = from[0] + (to[0] - from[0]) * e;
      cur[1] = from[1] + (to[1] - from[1]) * e;
      cur[2] = from[2] + (to[2] - from[2]) * e;
    }
    gl.uniform3f(u.tone, cur[0], cur[1], cur[2]);
    if (reveal < 1) reveal = Math.min(1, reveal + 0.016 / 1.0);
    gl.uniform1f(u.reveal, reveal);
    // rouge (budget cramé) -> ondulation un poil plus vive, imperceptible
    var redness = Math.max(0, (cur[0] - cur[1]));
    gl.uniform1f(u.speed, 1 + redness * 0.6);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop() {
    if (disposed || reduced() || document.hidden) { rafId = null; return; }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  function wake() { if (!rafId && !reduced() && !document.hidden && !disposed) rafId = requestAnimationFrame(loop); }

  function onVis() {
    if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    else { reveal = 1; wake(); }
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
        // échec WebGL / shader -> abandon silencieux, hero reste le gradient CSS
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        gl = null; canvas = null; return;
      }
      if (ro === null && root.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }
      document.addEventListener("visibilitychange", onVis);
      if (mq && mq.addEventListener) mq.addEventListener("change", onReduced);
      // 1re frame TOUJOURS peinte (image présente même si l'onglet est "caché"
      // au montage, ex. preview headless). reduced-motion s'arrête là ; sinon on
      // anime via la boucle (qui se mettra en pause si l'onglet passe en fond).
      reveal = 1;
      try { draw(); } catch (e) {}
      if (!reduced()) wake();
    };
    // lazy : après le 1er paint, hors chemin critique. requestIdleCallback en
    // optimisation, MAIS toujours un setTimeout de secours (rIC ne fire pas
    // toujours : onglet en fond, navigateurs headless…).
    var started = false;
    var go = function () { if (started) return; started = true; start(); };
    var schedule = function () {
      if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 1500 });
      setTimeout(go, 300);                 // filet de sécurité : fire toujours
    };
    if (document.readyState === "complete") schedule();
    else root.addEventListener("load", schedule, { once: true });
  }

  function setTone(pct, warn) {
    if (!inited) { var r0 = hexToRgb(ringColorHex(+pct || 0, +warn || 80)); to = r0.slice(); cur = r0.slice(); return; }
    var rgb = hexToRgb(ringColorHex(+pct || 0, +warn || 80));
    if (rgb[0] === to[0] && rgb[1] === to[1] && rgb[2] === to[2]) return;
    from = cur.slice(); to = rgb; toneT = 0;
    if (reduced() || document.hidden) {
      // pas de boucle active : on applique direct + 1 frame (pas d'interpolation invisible)
      cur = to.slice(); toneT = 1; try { draw(); } catch (e) {}
    } else { wake(); }
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
  }

  root.CETAurora = { mount: mount, setTone: setTone, dispose: dispose };

  // auto-montage : app.js (sans defer) s'exécute AVANT ce script (defer), donc son
  // appel à mount() trouve CETAurora indéfini. On monte donc nous-mêmes ici, sur
  // l'élément #hero-aurora. mount() est idempotent : aucun risque de double contexte.
  function selfMount() {
    var el = document.getElementById("hero-aurora");
    if (el) mount(el);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", selfMount, { once: true });
  } else { selfMount(); }
})(typeof window !== "undefined" ? window : this);
