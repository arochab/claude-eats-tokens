/* three-scenes.js — scènes 3D concrètes, chacune branchée sur les VRAIES données.
   Dépend de window.CET3D (three3d.js) et du global THREE.
   Expose window.CET3D.scenes = { hero, trend, models, hourly, projects }.

   Chaque fonction prend (el, data, opts) et renvoie un objet enregistré dans la
   boucle d'animation. Toutes vérifient CET3D.active() : si 3D off/non supporté,
   elles ne font rien (l'app garde sa version 2D Canvas/SVG). */
(function () {
  "use strict";
  if (!window.CET3D) return;
  var C = window.CET3D;
  var THREE = C.THREE;
  if (!THREE) { C.scenes = stubs(); return; }

  function stubs() {
    var noop = function () { return null; };
    return { hero: noop, trend: noop, models: noop, hourly: noop, projects: noop };
  }

  function baseScene(el, opts) {
    opts = opts || {};
    el.innerHTML = "";
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(opts.camX || 0, opts.camY || 0, opts.camZ || 6);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    C.fit(renderer, camera, el);
    var key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(3, 5, 4); scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-4, -2, 3); scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { C.fit(renderer, camera, el); }); ro.observe(el); }
    return {
      scene: scene, camera: camera, renderer: renderer,
      dispose: function () {
        if (ro) ro.disconnect();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); }
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clearGroup(g) {
    for (var i = g.children.length - 1; i >= 0; i--) {
      var o = g.children[i];
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); }
      g.remove(o);
    }
  }

  /* ---------- HÉRO : tore (anneau) 3D = % du budget mensuel réel ---------- */
  function hero(el, data) {
    if (!C.active() || !el) return null;
    var b = baseScene(el, { camZ: 5.2 });
    var track, arc, core;
    var trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: .9, metalness: 0 });
    track = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 24, 120), trackMat);
    b.scene.add(track);
    function buildArcCore(data) {
      var pct = data.pct;
      var col = C.ringColorHex(pct, data.warn);
      var frac = Math.max(0.001, Math.min(1, pct / 100));
      if (arc) { b.scene.remove(arc); arc.geometry.dispose(); arc.material.dispose(); }
      if (core) { b.scene.remove(core); core.geometry.dispose(); core.material.dispose(); }
      var arcMat = new THREE.MeshStandardMaterial({ color: col, roughness: .35, metalness: .15, emissive: col, emissiveIntensity: .12 });
      arc = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.2, 24, Math.max(8, Math.round(160 * frac)), Math.PI * 2 * frac), arcMat);
      arc.rotation.z = Math.PI / 2;
      b.scene.add(arc);
      var coreMat = new THREE.MeshStandardMaterial({ color: col, roughness: .25, metalness: .2 });
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(lerp(0.35, 0.95, frac), 2), coreMat);
      b.scene.add(core);
    }
    buildArcCore(data);
    var t0 = null;
    return C.register({
      el: el, key: "hero",
      update: function (d) { buildArcCore(d); },
      render: function (now) {
        if (t0 == null) t0 = now;
        var spin = C.reducedMotion() ? 0 : (now - t0) * 0.0004;
        track.rotation.z = spin * 0.3;
        arc.rotation.z = Math.PI / 2 + spin;
        core.rotation.y = spin * 1.6; core.rotation.x = spin * 0.8;
        var pulse = C.reducedMotion() ? 1 : 1 + Math.sin((now - t0) * 0.002) * 0.04;
        core.scale.setScalar(pulse);
        b.renderer.render(b.scene, b.camera);
      },
      dispose: b.dispose,
    });
  }

  /* ---------- COURBE 3D : ruban d'évolution = timeline réelle ---------- */
  function trend(el, rows) {
    if (!C.active() || !el || !rows || !rows.length) return null;
    var b = baseScene(el, { camY: 1.4, camZ: 6.5 });
    b.camera.lookAt(0, 0, 0);
    var grp = new THREE.Group(); b.scene.add(grp);
    function build(rows) {
      clearGroup(grp);
      if (!rows || !rows.length) return;
      var n = rows.length;
      var max = 1; rows.forEach(function (r) { if (r.total > max) max = r.total; });
      var W = 5.2, span = W / Math.max(1, n - 1);
      var pts = rows.map(function (r, i) {
        return new THREE.Vector3(-W / 2 + i * span, (r.total / max) * 2.0, 0);
      });
      if (pts.length >= 2) {
        var curve = new THREE.CatmullRomCurve3(pts);
        grp.add(new THREE.Mesh(
          new THREE.TubeGeometry(curve, Math.max(16, n * 4), 0.06, 10, false),
          new THREE.MeshStandardMaterial({ color: C.COL.terracotta, roughness: .3, metalness: .2, emissive: C.COL.terracotta, emissiveIntensity: .1 })
        ));
      }
      var dotGeo = new THREE.SphereGeometry(0.08, 12, 12);
      pts.forEach(function (p) {
        var d = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ color: C.COL.clay, roughness: .4 }));
        d.position.copy(p); grp.add(d);
      });
      var grid = new THREE.GridHelper(W + 1, n, 0x888888, 0x888888);
      grid.material.opacity = 0.12; grid.material.transparent = true; grid.position.y = -0.05;
      grp.add(grid);
    }
    build(rows);
    var t0 = null;
    return C.register({
      el: el, key: "trend",
      update: function (r) { build(r); },
      render: function (now) {
        if (t0 == null) t0 = now;
        var a = C.reducedMotion() ? -0.5 : Math.sin((now - t0) * 0.0003) * 0.6 - 0.2;
        b.camera.position.x = Math.sin(a) * 2.2;
        b.camera.position.z = Math.cos(a) * 6.5;
        b.camera.lookAt(0, 0.6, 0);
        b.renderer.render(b.scene, b.camera);
      },
      dispose: b.dispose,
    });
  }

  /* ---------- BARRES MODÈLES 3D = vraie part par modèle ---------- */
  function models(el, list) {
    if (!C.active() || !el || !list || !list.length) return null;
    var b = baseScene(el, { camY: 1.6, camZ: 6 });
    var palette = { opus: C.COL.terracotta, sonnet: C.COL.sky, haiku: C.COL.sage, fable: C.COL.clay, autre: 0x999088 };
    var grp = new THREE.Group(); b.scene.add(grp);
    function build(list) {
      clearGroup(grp);
      if (!list || !list.length) return;
      var max = 1; list.forEach(function (m) { if (m.total > max) max = m.total; });
      var k = Math.min(list.length, 6);
      var gap = 1.0, x0 = -((k - 1) * gap) / 2;
      for (var i = 0; i < k; i++) {
        var m = list[i];
        var hgt = Math.max(0.1, (m.total / max) * 2.6);
        var mat = new THREE.MeshStandardMaterial({ color: palette[m.model] || 0x999088, roughness: .35, metalness: .15 });
        var bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, hgt, 0.5), mat);
        bar.position.set(x0 + i * gap, hgt / 2 - 1, 0);
        grp.add(bar);
      }
    }
    build(list);
    var t0 = null;
    return C.register({
      el: el, key: "models",
      update: function (l) { build(l); },
      render: function (now) {
        if (t0 == null) t0 = now;
        var a = C.reducedMotion() ? 0.5 : (now - t0) * 0.0003;
        b.camera.position.x = Math.sin(a) * 2.4;
        b.camera.position.z = Math.cos(a) * 6;
        b.camera.position.y = 1.6;
        b.camera.lookAt(0, 0.2, 0);
        b.renderer.render(b.scene, b.camera);
      },
      dispose: b.dispose,
    });
  }

  /* ---------- HEATMAP HORAIRE 3D = relief jour×heure réel ---------- */
  function hourly(el, grid) {
    if (!C.active() || !el || !grid || !grid.length) return null;
    var b = baseScene(el, { camX: 4, camY: 4, camZ: 5 });
    b.camera.lookAt(0, 0, 0);
    var grp = new THREE.Group(); grp.position.y = -0.5; b.scene.add(grp);
    function build(grid) {
      clearGroup(grp);
      if (!grid || !grid.length) return;
      var max = 1;
      for (var d = 0; d < 7; d++) for (var h = 0; h < 24; h++) if (grid[d][h] > max) max = grid[d][h];
      var cell = 0.22, gap = 0.02;
      for (var dd = 0; dd < 7; dd++) {
        for (var hh = 0; hh < 24; hh++) {
          var v = grid[dd][hh] || 0;
          var r = v / max;
          var hgt = Math.max(0.02, r * 2.0);
          var c = r > .66 ? C.COL.danger : r > .33 ? C.COL.terracotta : C.COL.clay;
          var mat = new THREE.MeshStandardMaterial({ color: c, roughness: .6 });
          var box = new THREE.Mesh(new THREE.BoxGeometry(cell, hgt, cell), mat);
          box.position.set((hh - 12) * (cell + gap), hgt / 2, (dd - 3) * (cell + gap) * 4);
          grp.add(box);
        }
      }
    }
    build(grid);
    var t0 = null;
    return C.register({
      el: el, key: "hourly",
      update: function (g) { build(g); },
      render: function (now) {
        if (t0 == null) t0 = now;
        grp.rotation.y = C.reducedMotion() ? 0.4 : (now - t0) * 0.0002;
        b.renderer.render(b.scene, b.camera);
      },
      dispose: b.dispose,
    });
  }

  /* ---------- PROJETS 3D = colonnes, hauteur = vrais tokens ---------- */
  function projects(el, list) {
    if (!C.active() || !el || !list || !list.length) return null;
    var b = baseScene(el, { camY: 2, camZ: 7 });
    var grp = new THREE.Group(); b.scene.add(grp);
    function build(list) {
      clearGroup(grp);
      var items = (list || []).filter(function (p) { return !p.isOthers; }).slice(0, 8);
      if (!items.length) return;
      var max = 1; items.forEach(function (p) { if (p.total > max) max = p.total; });
      var k = items.length, gap = 0.85, x0 = -((k - 1) * gap) / 2;
      for (var i = 0; i < k; i++) {
        var p = items[i];
        var hgt = Math.max(0.15, (p.total / max) * 3.2);
        var hue = [C.COL.terracotta, C.COL.clay, C.COL.sky, C.COL.sage, C.COL.amber][i % 5];
        var mat = new THREE.MeshStandardMaterial({ color: hue, roughness: .4, metalness: .1 });
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, hgt, 24), mat);
        col.position.set(x0 + i * gap, hgt / 2 - 1.2, 0);
        grp.add(col);
      }
    }
    build(list);
    var t0 = null;
    return C.register({
      el: el, key: "projects",
      update: function (l) { build(l); },
      render: function (now) {
        if (t0 == null) t0 = now;
        var a = C.reducedMotion() ? 0.4 : (now - t0) * 0.00025;
        b.camera.position.x = Math.sin(a) * 3;
        b.camera.position.z = Math.cos(a) * 7;
        b.camera.position.y = 2;
        b.camera.lookAt(0, 0.3, 0);
        b.renderer.render(b.scene, b.camera);
      },
      dispose: b.dispose,
    });
  }

  C.scenes = { hero: hero, trend: trend, models: models, hourly: hourly, projects: projects };
})();
