/* ArkiPlan – interactive 3-D view (three.js, bundled in www/lib).
 * The building comes from AP.model3D (same faces as the perspective). three.js axes: x = plan x, y = up, z = plan y.
 * One finger / left mouse: orbit. Two fingers: pinch to zoom, move to pan. Wheel: zoom. Right mouse: pan.
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  let V = null; // viewer state

  // world [x, -y, z] (as in model3D) -> three.js [x, z, y]
  const T3 = p => [p[0], p[2], -p[1]];

  function init(host) {
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xeaf2f8);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = renderer.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
    host.appendChild(cv);
    const scene = new THREE.Scene();
    // sky: soft gradient like SketchUp
    const sk = document.createElement('canvas'); sk.width = 2; sk.height = 256;
    const sg = sk.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#9fc3e6'); gr.addColorStop(0.65, '#dfeaf4'); gr.addColorStop(1, '#f1f4f6');
    sg.fillStyle = gr; sg.fillRect(0, 0, 2, 256);
    scene.background = new THREE.CanvasTexture(sk);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8bc, 0.78));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 2000);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xd3d9c8 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    V = { host, renderer, cv, scene, camera, ground, sun, model: null, target: new THREE.Vector3(), r: 20, th: 0.6, ph: 1.0, pts: new Map(), g: null, need: false };
    // pointer: orbit / pan / pinch
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      V.pts.set(e.pointerId, [e.clientX, e.clientY]);
      V.g = { pan: e.button === 2 || e.shiftKey, last: [e.clientX, e.clientY], pinch: null };
      if (V.pts.size === 2) { const [a, b] = [...V.pts.values()]; V.g.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), r: V.r, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }
    });
    cv.addEventListener('pointermove', e => {
      if (!V.pts.has(e.pointerId) || !V.g) return;
      V.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (V.pts.size >= 2 && V.g.pinch) {
        const [a, b] = [...V.pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        V.r = Math.min(400, Math.max(0.05, V.g.pinch.r * V.g.pinch.d / Math.max(dd, 1)));
        pan(mid[0] - V.g.pinch.mid[0], mid[1] - V.g.pinch.mid[1]); V.g.pinch.mid = mid;
      } else if (V.pts.size === 1) {
        const dx = e.clientX - V.g.last[0], dy = e.clientY - V.g.last[1];
        if (V.g.pan) pan(dx, dy);
        else { V.th -= dx * 0.008; V.ph = Math.min(V.r < 1 ? Math.PI - 0.2 : Math.PI / 2 - 0.02, Math.max(0.02, V.ph - dy * 0.008)); }
      }
      V.g.last = [e.clientX, e.clientY];
      place(); ask();
    });
    const up = e => { V.pts.delete(e.pointerId); if (V.pts.size === 1) { const [a] = [...V.pts.values()]; V.g = { last: a, pan: false }; } else if (!V.pts.size) V.g = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { e.preventDefault(); V.r = Math.min(400, Math.max(0.05, V.r * Math.exp(e.deltaY * 0.0012))); place(); ask(); }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(() => { size(); ask(); }).observe(host);
  }
  // move the target in the screen plane
  function pan(dx, dy) {
    const THREE = window.THREE, k = V.r * 0.0016;
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    V.camera.matrix.extractBasis(right, upv, new THREE.Vector3());
    V.target.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
  }
  function place() {
    const c = V.camera, t = V.target;
    c.position.set(t.x + V.r * Math.sin(V.ph) * Math.sin(V.th), t.y + V.r * Math.cos(V.ph), t.z + V.r * Math.sin(V.ph) * Math.cos(V.th));
    const fov = V.r < 1 ? 72 : 40; // wide angle when standing inside a room
    if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
    c.lookAt(t); c.updateMatrix(); c.updateMatrixWorld();
  }
  function size() {
    const w = V.host.clientWidth || 300, h = V.host.clientHeight || 300;
    V.renderer.setSize(w, h, false); V.camera.aspect = w / h; V.camera.updateProjectionMatrix();
  }
  function ask() { if (V.need) return; V.need = true; requestAnimationFrame(() => { V.need = false; V.renderer.render(V.scene, V.camera); }); }

  /* ---------- the building as solids (SketchUp style): thick walls cut around the doors & windows, glass,
   * door leaves, gable walls, slabs, posts, stairs, furniture & fixtures as blocks, black edges, shadows.
   * Roof surfaces come from AP.model3D. One group per floor (L<i>) and per roof level (R<i>). ---------- */
  function build(P) {
    const THREE = window.THREE, S = P.settings, RL = AP.roofs(P), C = AP.columns(P);
    const groups = new Map();
    const G = key => { if (!groups.has(key)) groups.set(key, { pos: [], col: [], glass: [], ln: [], roofPos: [], roofCol: [] }); return groups.get(key); };
    const col3 = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
    // plan (x, y, z up) -> three (x, z, y)
    const Q = (x, y, z) => [x, z, y];
    const tri = (arr, carr, c, a, b, d) => { arr.push(...a, ...b, ...d); if (carr) for (let i = 0; i < 3; i++) carr.push(...c); };
    const quad = (g, a, b, c, d, color, glass) => {
      const k = col3(color), arr = glass ? g.glass : g.pos, carr = glass ? null : g.col;
      tri(arr, carr, k, a, b, c); tri(arr, carr, k, a, c, d);
    };
    const edge = (g, a, b) => g.ln.push(...a, ...b);
    // axis-aligned block, plan coordinates; top colour may differ
    const box = (g, x0, y0, x1, y1, z0, z1, color, o) => {
      o = o || {};
      if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
      const P8 = [Q(x0, y0, z0), Q(x1, y0, z0), Q(x1, y1, z0), Q(x0, y1, z0), Q(x0, y0, z1), Q(x1, y0, z1), Q(x1, y1, z1), Q(x0, y1, z1)];
      const F = [[4, 5, 6, 7, o.top || color], [3, 2, 1, 0, color], [0, 1, 5, 4, color], [2, 3, 7, 6, color], [1, 2, 6, 5, color], [3, 0, 4, 7, color]];
      for (const [i, j, k, l, c] of F) quad(g, P8[i], P8[j], P8[k], P8[l], c, o.glass);
      if (o.noEdges) return;
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) edge(g, P8[i], P8[j]);
    };
    // block given by its footprint corners (any rotation)
    const prism = (g, pts, z0, z1, color, o) => {
      o = o || {};
      const n = pts.length, lo = pts.map(p => Q(p[0], p[1], z0)), hi = pts.map(p => Q(p[0], p[1], z1));
      const tr = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []), k = col3(o.top || color), kc = col3(color);
      for (const t of tr) { tri(g.pos, g.col, k, hi[t[0]], hi[t[1]], hi[t[2]]); tri(g.pos, g.col, kc, lo[t[2]], lo[t[1]], lo[t[0]]); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(g, lo[i], lo[j], hi[j], hi[i], color); edge(g, lo[i], lo[j]); edge(g, hi[i], hi[j]); edge(g, lo[i], hi[i]); }
    };
    const WALL = '#f2efe8', WALL0 = WALL, WALL_TOP = '#cfc8b8', GLASS = '#9cc3dc', DOOR = '#8a5a3b', FRAME = '#f7f7f7';
    const floors = P.floors.map((f, i) => ({ f, i })).filter(e => e.f.rooms.length);
    for (const { f: fl, i: fi } of floors) {
      const g = G('L' + fi), z0 = AP.levelZ(P, fi), zt = z0 + AP.floorH(P, fi), walls = AP.computeWalls(fl, S);
      // floor slabs (ground floor on the plinth), coloured by room
      for (const r of fl.rooms) {
        const c = (AP.ROOM_TYPES[r.type] || {}).color || '#eeeeee';
        box(g, r.x, r.y, r.x + r.w, r.y + r.l, fi === 0 ? -S.plinth : z0 - AP.slabThk(r, S), z0 - AP.floorDrop(r), '#bdbdb5', { top: c });
        // ceiling board (own group, switched on in the 3D toolbar)
        if (AP.hasCeiling(r)) { const zc = z0 + AP.ceilHt(r, S); box(G('C' + fi), r.x, r.y, r.x + r.w, r.y + r.l, zc, zc + 0.012, '#f6f5f1'); }
      }
      // walls: pieces between the openings, sill / lintel pieces, glass panes, door leaves
      for (const w of walls) {
        const WALL = w.mat ? AP.wallMat(w.mat).c3 : WALL0; // a drawn wall's material
        const a = w.a - w.ea, b = w.b + w.eb;
        if (!w.t || w.kind === 'edge') {
          if (w.kind === 'edge') { // open side: beam only
            const h = 0.1; if (w.o === 'h') box(g, a, w.c - h, b, w.c + h, zt - S.beamDepth, zt, WALL); else box(g, w.c - h, a, w.c + h, b, zt - S.beamDepth, zt, WALL);
          }
          continue;
        }
        const ext = w.kind === 'ext', h = w.t / 2, zb = ext && fi === 0 ? -S.plinth : z0;
        // a parapet where a box roof sits on this wall
        const mid = AP.wallPt(w.o, w.c, (w.a + w.b) / 2), Rw = ext && AP.roofAt(P, fi, mid[0], mid[1], RL);
        const ztop = w.h ? z0 + w.h : (Rw && Rw.box ? zt + S.parapet : zt) + (Rw && Rw.zoff > 0 ? Rw.zoff : 0);
        const B = (s0, s1, za, zz, color, th, o) => { const k = (th || w.t) / 2; if (w.o === 'h') box(g, s0, w.c - k, s1, w.c + k, za, zz, color, o); else box(g, w.c - k, s0, w.c + k, s1, za, zz, color, o); };
        const ops = [];
        for (const op of fl.openings) {
          const Ro = AP.resolveOp(fl, op);
          if (!Ro || Ro.o !== w.o || !AP.eq(Ro.c, w.c) || Ro.s < w.a - 1e-3 || Ro.s > w.b + 1e-3) continue;
          ops.push({ op, s0: Ro.s - Ro.w / 2, s1: Ro.s + Ro.w / 2 });
        }
        ops.sort((p, q) => p.s0 - q.s0);
        let s0 = a;
        for (const e of ops) {
          if (e.s0 > s0 + 0.005) B(s0, e.s0, zb, ztop, WALL, 0, { top: WALL_TOP });
          const sill = z0 + AP.opSill(e.op, S), head = Math.min(sill + e.op.h, zt);
          if (sill > zb + 0.01) B(e.s0, e.s1, zb, sill, WALL, 0, { top: WALL_TOP });
          if (head < ztop - 0.01) B(e.s0, e.s1, head, ztop, WALL, 0, { top: WALL_TOP });
          if (e.op.kind === 'window') {
            B(e.s0 + 0.04, e.s1 - 0.04, sill + 0.04, head - 0.04, GLASS, 0.02, { glass: true, noEdges: true });
            // frame
            B(e.s0, e.s1, sill, sill + 0.04, FRAME, 0.06); B(e.s0, e.s1, head - 0.04, head, FRAME, 0.06);
            B(e.s0, e.s0 + 0.04, sill, head, FRAME, 0.06); B(e.s1 - 0.04, e.s1, sill, head, FRAME, 0.06);
            if (e.s1 - e.s0 > 0.9) B((e.s0 + e.s1) / 2 - 0.02, (e.s0 + e.s1) / 2 + 0.02, sill, head, FRAME, 0.06);
          } else {
            const st = AP.tplOf(e.op).style;
            if (st === 'sliding') B(e.s0 + 0.03, e.s1 - 0.03, z0, head - 0.03, GLASS, 0.03, { glass: true });
            else B(e.s0 + 0.02, e.s1 - 0.02, z0, head - 0.02, st === 'rollup' ? '#9aa0a6' : DOOR, 0.045);
          }
          s0 = Math.max(s0, e.s1);
        }
        if (b > s0 + 0.005) B(s0, b, zb, ztop, WALL, 0, { top: WALL_TOP });
        // gable end: the wall goes on up to the roof at the roof's edge
        if (ext) {
          const R = AP.roofAt(P, fi, mid[0], mid[1], RL);
          const atEdge = R && !R.box && AP.roofEdgeWall(R, w.o, w.c, (w.a + w.b) / 2, S);
          if (atEdge) {
            const N = 24, prof = [];
            for (let i = 0; i <= N; i++) { const sv = a + (b - a) * i / N, p = AP.wallPt(w.o, w.c, sv); prof.push([sv, Math.max(zt, R.z(p[0], p[1]) - 0.12)]); }
            if (Math.max(...prof.map(q => q[1])) > zt + 0.05) {
              const pl = [[a, zt], ...prof.slice().reverse().map(q => q), [b, zt]].reverse();
              const shape = [[a, zt], [b, zt], ...prof.slice().reverse()].filter((q, i, A) => i === 0 || Math.hypot(q[0] - A[i - 1][0], q[1] - A[i - 1][1]) > 1e-4);
              void pl;
              while (shape.length > 3 && Math.hypot(shape[0][0] - shape[shape.length - 1][0], shape[0][1] - shape[shape.length - 1][1]) < 1e-4) shape.pop();
              // extrude the profile through the wall thickness
              const toW = (sv, z, n) => (w.o === 'h' ? Q(sv, w.c + n, z) : Q(w.c + n, sv, z));
              const tr = THREE.ShapeUtils.triangulateShape(shape.map(q => new THREE.Vector2(q[0], q[1])), []), kc = col3(WALL);
              for (const t of tr) { tri(g.pos, g.col, kc, ...t.map(i => toW(shape[i][0], shape[i][1], -h))); tri(g.pos, g.col, kc, ...t.slice().reverse().map(i => toW(shape[i][0], shape[i][1], h))); }
              for (let i = 0; i < shape.length; i++) {
                const j = (i + 1) % shape.length, A1 = toW(shape[i][0], shape[i][1], -h), B1 = toW(shape[j][0], shape[j][1], -h), A2 = toW(shape[i][0], shape[i][1], h), B2 = toW(shape[j][0], shape[j][1], h);
                quad(g, A1, B1, B2, A2, WALL);
                if (i > 0) { edge(g, A1, B1); edge(g, A2, B2); }
              }
            }
          }
        }
      }
      // posts on open sides (columns not hidden in a wall)
      for (const c of C.cols) {
        if (c.top < fi) continue;
        const onEdge = walls.some(w => w.kind === 'edge' && (w.o === 'h' ? AP.eq(c.y, w.c) && c.x >= w.a - 1e-3 && c.x <= w.b + 1e-3 : AP.eq(c.x, w.c) && c.y >= w.a - 1e-3 && c.y <= w.b + 1e-3));
        if (!onEdge) continue;
        const hx = c.size / 2, hy = (c.d || c.size) / 2;
        box(g, c.x - hx, c.y - hy, c.x + hx, c.y + hy, fi === 0 ? -S.plinth : z0, zt - S.beamDepth, '#f5f2ea');
      }
      // stairs: steps along the long side of the stair room (not on the top floor)
      for (const r of fl.rooms) if (r.type === 'stairs' && P.floors[fi + 1] && P.floors[fi + 1].rooms.length) {
        const along = r.w >= r.l, run = along ? r.w : r.l, n = Math.max(2, Math.floor((run - 0.3) / 0.25)), rise = AP.floorH(P, fi) / (n + 1), tr = Math.min(0.25, (run - 0.3) / n);
        for (let i = 0; i <= n; i++) {
          const a0 = 0.15 + i * tr, a1 = i < n ? a0 + tr : run - 0.02, zz = z0 + (i + 1) * rise;
          if (along) box(g, r.x + a0, r.y + 0.05, r.x + a1, r.y + r.l - 0.05, z0, zz, '#d9d4c8'); else box(g, r.x + 0.05, r.y + a0, r.x + r.w - 0.05, r.y + a1, z0, zz, '#d9d4c8');
        }
      }
      // furniture & fixtures as blocks
      const HT = { tv: 0.55, sofa3: 0.8, sofa2: 0.8, arm: 0.8, coffee: 0.42, cabinet: 0.9, dine4: 0.75, dine6: 0.75, dine8: 0.75, ref: 1.7, sink2: 0.9, sink1: 0.9, stove: 0.9, counter: 0.9, counterL: 0.9,
        bedQ: 0.55, bedF: 0.55, bedS: 0.55, bedM: 0.55, closet: 2.0, desk: 0.75, dresser: 0.8, wm: 0.9, tub: 0.55, wc: 0.4, lav: 0.85, shower: 0.03, ltub: 0.85, fd: 0.01, car: 1.4,
        bed: 0.55, table: 0.45, dtable: 0.75, sofa: 0.8, sink: 0.9, washer: 0.9 };
      const FC = k => (/^(wc|lav|tub|ltub|sink|sink1|sink2|shower|fd|stove|wm|washer|ref)$/.test(k) ? '#fbfbfb' : /counter/.test(k) ? '#d8cfc0' : /^bed/.test(k) ? '#ece6da' : k === 'car' ? '#8fa3b5' : '#cbbfae');
      const lPts = (L, s0, s1, n0, n1, leg, dd) => {
        const a = leg === 'right' ? s1 - dd : s0, b2 = a + dd;
        const pts = leg === 'right' ? [[s0, n0], [s1, n0], [s1, n1], [a, n1], [a, n0 + dd], [s0, n0 + dd]] : [[s0, n0], [s1, n0], [s1, n0 + dd], [b2, n0 + dd], [b2, n1], [s0, n1]];
        return pts.map(p => L(p[0], p[1]));
      };
      for (const f of fl.furniture || []) {
        const [w, l] = AP.furnSize(f), T = AP.furnXf(f).T, hh = HT[f.kind] || 0.75;
        let pts;
        if (f.kind === 'counterL') { const dd = Math.min(f.d || 0.6, w, l), m = f.mir ? -1 : 1, X = x => m * x; pts = [T(X(-w / 2), -l / 2), T(X(w / 2), -l / 2), T(X(w / 2), -l / 2 + dd), T(X(-w / 2 + dd), -l / 2 + dd), T(X(-w / 2 + dd), l / 2), T(X(-w / 2), l / 2)]; if (f.mir) pts.reverse(); }
        else pts = [T(-w / 2, -l / 2), T(w / 2, -l / 2), T(w / 2, l / 2), T(-w / 2, l / 2)];
        // keep the footprint counter-clockwise for the triangulation
        let ar = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; }
        if (ar < 0) pts.reverse();
        prism(g, pts, z0, z0 + hh, FC(f.kind), { top: f.kind === 'shower' ? '#b9d4e6' : null });
      }
      for (const r of fl.rooms) for (const f of AP.fixtures(fl, r, S)) {
        if (f.kind === 'stairs' || f.kind === 'drain') continue;
        if (f.kind === 'car') { const [x, y, w, l] = f.world; box(g, x + 0.1, y + 0.1, x + w - 0.1, y + l - 0.1, z0, z0 + 1.4, '#8fa3b5'); continue; }
        if (f.s0 == null) continue;
        const L = AP.frame(r, f.side), hh = HT[f.kind] || 0.75;
        let pts = f.kind === 'counterL' ? lPts(L, f.s0, f.s1, f.n0, f.n1, f.leg, f.d || 0.6) : [L(f.s0, f.n0), L(f.s1, f.n0), L(f.s1, f.n1), L(f.s0, f.n1)];
        let ar = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; }
        if (ar < 0) pts = pts.reverse();
        prism(g, pts, z0, z0 + hh, FC(f.kind), { top: f.kind === 'shower' ? '#b9d4e6' : null });
      }
    }
    // walls on the roof beams
    { const nF = AP.nLevels(P), zRB = AP.levelZ(P, nF), g = G('L' + (nF - 1));
      // one solid along the wall's top line (stopped under the roof, or through it for a fire wall)
      for (const w of AP.roofWalls(P)) {
        const prof = AP.roofWallProfile(P, w, RL), k = w.t / 2, WALL = w.mat ? AP.wallMat(w.mat).c3 : WALL0;
        const X = (s, n, z) => (w.o === 'h' ? Q(s, w.c + n, z) : Q(w.c + n, s, z));
        const two = (p1, p2, p3, p4, c) => { quad(g, p1, p2, p3, p4, c); quad(g, p4, p3, p2, p1, c); };
        for (let i = 0; i + 1 < prof.length; i++) {
          const [s0, z0] = prof[i], [s1, z1] = prof[i + 1];
          for (const n of [-k, k]) { two(X(s0, n, zRB), X(s1, n, zRB), X(s1, n, z1), X(s0, n, z0), WALL); edge(g, X(s0, n, z0), X(s1, n, z1)); edge(g, X(s0, n, zRB), X(s1, n, zRB)); }
          two(X(s0, -k, z0), X(s1, -k, z1), X(s1, k, z1), X(s0, k, z0), WALL_TOP);
        }
        for (const [s, z] of [prof[0], prof[prof.length - 1]]) { two(X(s, -k, zRB), X(s, k, zRB), X(s, k, z), X(s, -k, z), WALL); for (const n of [-k, k]) edge(g, X(s, n, zRB), X(s, n, z)); }
      } }
    // roofs (surface, fascia, clerestory glass) from the shared model, edges only where the roof folds
    const M = AP.model3D(P);
    for (const f of M.faces) {
      if (!f.rf) continue;
      const g = G('R' + f.rl), pts = f.pts.map(T3), k = col3(f.color);
      if (pts.length < 3) continue;
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), [u, v] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[u], p[v])), []); } catch (e) { continue; }
      const glass = f.color === '#8fb4cc';
      for (const t of tris) { if (glass) g.glass.push(...pts[t[0]], ...pts[t[1]], ...pts[t[2]]); else { g.roofPos.push(...pts[t[0]], ...pts[t[1]], ...pts[t[2]]); g.roofCol.push(...k, ...k, ...k); } }
      if (f.edge) for (let i = 0; i < pts.length; i++) edge(g, pts[i], pts[(i + 1) % pts.length]);
    }
    for (const l of M.lines) { const g = G('R' + l.rl), q = l.pts.map(T3); for (let i = 0; i < q.length - 1; i++) edge(g, q[i], q[i + 1]); }
    // meshes
    const root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const matG = new THREE.MeshLambertMaterial({ color: 0x9cc3dc, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const matL = new THREE.LineBasicMaterial({ color: 0x1e1e1e });
    const mk = (pos, col, m, shadow) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, m); me.castShadow = !!shadow; me.receiveShadow = !!shadow;
      return me;
    };
    for (const [key, g] of groups) {
      const grp = new THREE.Group(); grp.name = key;
      if (g.pos.length) grp.add(mk(g.pos, g.col, mat, true));
      if (g.roofPos.length) grp.add(mk(g.roofPos, g.roofCol, mat, true));
      if (g.glass.length) grp.add(mk(g.glass, null, matG, false));
      if (g.ln.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.ln, 3)); grp.add(new THREE.LineSegments(geo, matL)); }
      root.add(grp);
    }
    return root;
  }
  function disposeModel() {
    if (!V.model) return;
    V.scene.remove(V.model);
    V.model.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    V.model = null;
  }
  // which floors / roofs are shown: 'all', or a floor index (that floor and below, roofs below it)
  function applyShow(show) {
    if (!V.model) return;
    for (const g of V.model.children) {
      const lv = +g.name.slice(1), roof = g.name[0] === 'R', ceil = g.name[0] === 'C';
      g.visible = ceil ? !!V.ceil && (show === 'all' || show == null || lv <= show) : show === 'all' || show == null ? true : roof ? lv < show : lv <= show;
    }
  }
  const PRESET = { '3d': [0.6, 1.0], front: [0, 1.48], back: [Math.PI, 1.48], left: [-Math.PI / 2, 1.48], right: [Math.PI / 2, 1.48], top: [0, 0.02] };

  AP.view3D = {
    supported() { return !!window.THREE && (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })(); },
    // show the model of P in host (rebuilt every call); opt: {show, fit}
    show(host, P, opt) {
      opt = opt || {};
      if (!V || V.host !== host) init(host);
      V.cv.style.display = 'block';
      disposeModel();
      V.model = build(P);
      V.scene.add(V.model);
      V.ceil = !!opt.ceil;
      applyShow(opt.show);
      const box = new window.THREE.Box3().setFromObject(V.model);
      if (!box.isEmpty()) {
        const c = box.getCenter(new window.THREE.Vector3()), s = box.getSize(new window.THREE.Vector3()), D = Math.max(s.x, s.z, 4);
        V.ground.scale.set(D * 8, D * 8, 1); V.ground.position.set(c.x, -P.settings.plinth - 0.01, c.z);
        // sun from the front-left, above; its shadow box covers the house
        const sd = V.sun.shadow.camera, ext = Math.max(s.x, s.y, s.z) * 0.9 + 2;
        V.sun.position.set(c.x - D * 0.8, D * 1.6 + s.y, c.z + D * 1.1); V.sun.target.position.copy(c);
        sd.left = -ext; sd.right = ext; sd.top = ext; sd.bottom = -ext; sd.near = 0.5; sd.far = D * 6 + 20; sd.updateProjectionMatrix();
        if (opt.fit || !V.fitted) { V.target.set(c.x, s.y * 0.35, c.z); V.r = Math.max(s.x, s.y, s.z) * 1.6; V.fitted = true; }
        V.size = Math.max(s.x, s.y, s.z); V.center = [c.x, s.y * 0.35, c.z];
        // standing inside a room at eye height: turning looks at each wall
        if (opt.inside) { V.target.set(opt.inside.x, AP.levelZ(P, opt.inside.fi) + 1.55, opt.inside.y); V.r = 0.05; V.ph = Math.PI / 2; V.th = 0; }
      }
      size(); place(); ask();
    },
    view(name) {
      if (!V) return;
      const p = PRESET[name] || PRESET['3d']; V.th = p[0]; V.ph = p[1];
      if (V.center) V.target.set(...V.center);
      if (V.size) V.r = V.size * (name === 'top' ? 1.7 : 1.6);
      place(); ask();
    },
    hide() { if (V) V.cv.style.display = 'none'; },
    snapshot() { if (!V) return null; V.renderer.render(V.scene, V.camera); return V.cv.toDataURL('image/png'); }
  };
})(window.AP);
