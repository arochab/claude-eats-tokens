/* three-scenes.js — AMBIANCE 3D premium (décor derrière le héro uniquement).
   Choix produit : pas de 3D sur les data-viz. Ici, un champ de particules lent
   et une lueur douce aux couleurs Anthropic, dont la teinte suit l'état du
   budget (vert/ambre/rouge). Discret, jamais au premier plan, respecte
   prefers-reduced-motion. Dépend de window.CET3D + global THREE. */
(function () {
  "use strict";
  if (!window.CET3D) return;
  var C = window.CET3D;
  var THREE = C.THREE;
  if (!THREE) { C.scenes = { ambiance: function () { return null; } }; return; }

  function ambiance(el, tone) {
    if (!C.active() || !el) return null;
    el.innerHTML = "";
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    C.fit(renderer, camera, el);

    // teinte d'ambiance selon le budget réel
    function hueFor(t) { return C.ringColorHex(t ? t.pct : 0, t ? t.warn : 80); }
    var color = new THREE.Color(hueFor(tone));

    // champ de particules doux
    var N = 90;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.cos(i * 2.39996) * (1 + (i % 7))) * 0.7;     // spirale déterministe (pas de random)
      pos[i * 3 + 1] = (Math.sin(i * 2.39996) * (1 + (i % 7))) * 0.7;
      pos[i * 3 + 2] = -2 - (i % 11) * 0.5;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: color, size: 0.13, transparent: true, opacity: 0.5, depthWrite: false });
    var pts = new THREE.Points(geo, mat);
    scene.add(pts);

    // lueur centrale très douce (halo)
    var glowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.10, depthWrite: false });
    var glow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 24), glowMat);
    scene.add(glow);

    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { C.fit(renderer, camera, el); }); ro.observe(el); }
    var t0 = null;
    return C.register({
      el: el, key: "ambiance",
      update: function (t) {
        var c = new THREE.Color(hueFor(t));
        mat.color.copy(c); glowMat.color.copy(c);
      },
      render: function (now) {
        if (t0 == null) t0 = now;
        if (!C.reducedMotion()) {
          var s = (now - t0) * 0.00004;
          pts.rotation.z = s; pts.rotation.x = Math.sin(s) * 0.15;
          glow.scale.setScalar(1 + Math.sin((now - t0) * 0.0006) * 0.05);
        }
        renderer.render(scene, camera);
      },
      dispose: function () {
        if (ro) ro.disconnect();
        geo.dispose(); mat.dispose(); glowMat.dispose(); glow.geometry.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    });
  }

  C.scenes = { ambiance: ambiance };
})();
