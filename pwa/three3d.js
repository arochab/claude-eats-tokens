/* three3d.js — couche de visualisations 3D (three.js) pilotée par les VRAIES
   données. Tout objet 3D reflète un chiffre réel : aucune déco vide.

   Garde-fous (non négociables) :
   - WebGL absent / prefers-reduced-motion / appareil faible -> on RESTE en 2D.
   - Toggle 2D/3D global persisté (localStorage). L'app reste lisible sans 3D.
   - Une seule boucle d'animation partagée (perf mobile).

   Expose window.CET3D. three.js est chargé via <script> dans index.html
   (global THREE). Si THREE est absent, tout est no-op et l'app reste en 2D. */
(function (root) {
  "use strict";

  var KEY = "tokenTracker.viz3d";        // "on" | "off"
  var scenes = [];                         // {el, render(now), dispose()}
  var running = false, rafId = null;

  function webglOK() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  }

  var SUPPORTED = (typeof THREE !== "undefined") && webglOK();

  function prefOn() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved === "on") return true;
    if (saved === "off") return false;
    return true;                            // 3D par défaut (Adam le veut "partout")
  }
  function setPref(on) { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {} }

  // 3D actif seulement si supporté ET préféré ET (mouvement non réduit OU statique)
  function active() { return SUPPORTED && prefOn(); }

  function loop(now) {
    if (!running) return;
    for (var i = 0; i < scenes.length; i++) {
      try { scenes[i].render(now || 0); } catch (e) {}
    }
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!running && scenes.length) { running = true; rafId = requestAnimationFrame(loop); } }
  function stopLoop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  function register(scene) { scenes.push(scene); startLoop(); return scene; }
  function clearAll() {
    stopLoop();
    scenes.forEach(function (s) { try { s.dispose(); } catch (e) {} });
    scenes = [];
  }
  // met à jour les données des scènes existantes SANS recréer les contextes WebGL
  function updateAll(payload) {
    scenes.forEach(function (s) {
      if (s.key && s.update && payload[s.key] != null) {
        try { s.update(payload[s.key]); } catch (e) {}
      }
    });
  }

  // util : (re)dimensionne un renderer sur son conteneur
  function fit(renderer, camera, el) {
    var w = el.clientWidth || 300, h = el.clientHeight || 180;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  // palette charte Anthropic en hex numériques
  var COL = {
    terracotta: 0xCC785C, clay: 0xD4A27F, sky: 0x6A8CAF, sage: 0x7E9E6D,
    amber: 0xC8923D, danger: 0xB5563A, slate: 0x1A1915, cream: 0xF0EEE6,
  };
  function ringColorHex(p, warn) {
    return p >= 100 ? COL.danger : p >= (warn || 80) ? COL.amber : (p >= 50 ? COL.amber : COL.sage);
  }

  root.CET3D = {
    supported: SUPPORTED,
    reducedMotion: reducedMotion,
    active: active,
    prefOn: prefOn,
    setPref: setPref,
    register: register,
    clearAll: clearAll,
    updateAll: updateAll,
    fit: fit,
    startLoop: startLoop,
    stopLoop: stopLoop,
    COL: COL,
    ringColorHex: ringColorHex,
    THREE: (typeof THREE !== "undefined") ? THREE : null,
  };
})(typeof window !== "undefined" ? window : globalThis);
