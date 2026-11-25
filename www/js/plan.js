/* ArkiPlan – plan-type views: floor plan, roof plan, foundation plan, beam plan.
 * ts = model metres per 1 mm of paper at the view's plot scale (1:100 -> 0.1).
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  const PI = Math.PI;
  // line weights in paper mm
  const LW = { thick: 0.5, med: 0.35, thin: 0.18, fine: 0.13 };
  AP.LW = LW;
  const st = (ts, w, extra) => Object.assign({ w: w * ts }, extra || {});

  /* ---------- shared annotation helpers ---------- */
  AP.bubble = function (d, x, y, label, ts, r) {
    r = (r || 4) * ts;
    d.circle(x, y, r, st(ts, LW.med, { fill: '#ffffff', layer: 'GRID' }));
    d.text(x, y, label, 3.6 * ts, { anchor: 'middle', v: 'middle', layer: 'GRID' });
  };

  // chain dimension. o='h': horizontal line at y=at; o='v': vertical line at x=at
  // out: which side of the line is away from the building (-1 above / left, +1 below / right)
  AP.dimChain = function (d, pos, at, o, ts, out) {
    pos = [...new Set(pos.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
    if (pos.length < 2) return;
    const s = st(ts, LW.fine, { layer: 'DIMS' }), sk = st(ts, LW.med, { layer: 'DIMS' });
    const P = (a, b) => (o === 'h' ? [a, at + b] : [at + b, a]);
    d.lineP(P(pos[0] - 1.5 * ts, 0), P(pos[pos.length - 1] + 1.5 * ts, 0), s);
    for (const p of pos) {
      d.lineP(P(p, -2 * ts), P(p, 2 * ts), s);
      d.lineP(o === 'h' ? [p - ts, at + ts] : [at + ts, p - ts], o === 'h' ? [p + ts, at - ts] : [at - ts, p + ts], sk);
    }
    let flip = false;
    const n = pos.length - 1;
    for (let i = 0; i < n; i++) {
      let m = (pos[i] + pos[i + 1]) / 2;
      const v = AP.mm(pos[i + 1] - pos[i]), tw = AP.textWidth(v, 2.4 * ts);
      const short = pos[i + 1] - pos[i] < tw + 0.8 * ts;
      // a short piece at either end of the string: its number goes just past the end, on a run-out of the line
      if (short && n > 1 && (i === 0 || i === n - 1)) {
        const end = i === 0 ? pos[0] : pos[n], dir = i === 0 ? -1 : 1;
        m = end + dir * (tw / 2 + 1.8 * ts);
        d.lineP(P(end, 0), P(end + dir * (tw + 2.5 * ts), 0), s);
        flip = false;
        if (o === 'h') d.text(m, at - 1.0 * ts, v, 2.4 * ts, { anchor: 'middle', layer: 'DIMS' });
        else d.text(at - 1.0 * ts, m, v, 2.4 * ts, { anchor: 'middle', rot: -90, layer: 'DIMS' });
        continue;
      }
      flip = short ? !flip : false;
      const off = !flip ? -1.0 * ts : (out > 0 ? 3.4 : -4.4) * ts; // short pieces alternate, staggered away from the walls
      if (o === 'h') d.text(m, at + off, v, 2.4 * ts, { anchor: 'middle', layer: 'DIMS' });
      else d.text(at + off, m, v, 2.4 * ts, { anchor: 'middle', rot: -90, layer: 'DIMS' });
    }
  };

  // grid bubbles in one row: close grids keep their bubbles apart (a pair: the first stays on its line, the next
  // moves over; more: centred over them) -> bubble positions; the grid line jogs over to its bubble (AP.gridJog)
  AP.spreadBubbles = function (vals, ts) {
    const gap = 9 * ts, idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]), G = [];
    for (const i of idx) {
      G.push({ items: [i], c: vals[i] });
      for (;;) {
        const b = G[G.length - 1], a = G[G.length - 2];
        if (!a || a.c + (a.items.length - 1) * gap / 2 + gap <= b.c - (b.items.length - 1) * gap / 2) break;
        const items = a.items.concat(b.items);
        G.splice(-2, 2, { items, c: items.reduce((s, q) => s + vals[q], 0) / items.length });
      }
    }
    const pos = vals.slice();
    G.forEach((g, gi) => {
      const m = g.items.length, prev = G[gi - 1];
      let c = g.c;
      if (m === 2) { const c2 = vals[g.items[0]] + gap / 2; if (!prev || prev.right + gap <= c2 - gap / 2) c = c2; }
      g.items.forEach((i, k) => { pos[i] = c + (k - (m - 1) / 2) * gap; });
      g.right = pos[g.items[m - 1]];
    });
    return { pos, jog: pos.some((p, i) => Math.abs(p - vals[i]) > 1e-6) };
  };
  // a grid line from its bubble: straight out of the bubble at b, a slant over to the grid at v, then on along the grid.
  // a0 = bubble edge, a1 = where the slant starts, a2 = where it meets the grid, a3 = the far end (along the line);
  // o = 'x' for vertical grid lines (x = b / v), 'y' for horizontal ones
  AP.gridJog = function (d, o, v, b, a0, a1, a2, a3, s) {
    const P = (u, a) => (o === 'x' ? [u, a] : [a, u]);
    if (Math.abs(b - v) < 1e-6) { d.lineP(P(v, a0), P(v, a3), s); return; }
    d.poly([P(b, a0), P(b, a1), P(v, a2), P(v, a3)], false, s);
  };
  // extra outward offset per grid bubble so close grid lines don't overlap their bubbles
  AP.stagger = function (vals, ts) {
    const gap = 8.6 * ts, last = [-Infinity, -Infinity, -Infinity];
    return vals.map(v => {
      let lv = last.findIndex(p => v - p >= gap);
      if (lv < 0) lv = 0;
      last[lv] = v;
      return lv * 9 * ts;
    });
  };

  AP.sectionCuts = function (P) {
    const bb = AP.projectBBox(P) || { x0: 0, y0: 0, x1: 10, y1: 8 };
    const all = P.floors.flatMap(f => f.rooms);
    const t = all.find(r => r.type === 'toilet');
    let A = P.sections.A, B = P.sections.B;
    if (A == null) A = t ? t.y + t.l / 2 : (bb.y0 + bb.y1) / 2;
    if (B == null) B = t ? t.x + t.w / 2 : (bb.x0 + bb.x1) / 2;
    const clearOf = (v, edges) => { for (const e of edges) if (Math.abs(v - e) < 0.12) return v + 0.3; return v; };
    A = clearOf(A, all.flatMap(r => [r.y, r.y + r.l]));
    B = clearOf(B, all.flatMap(r => [r.x, r.x + r.w]));
    return { A, B };
  };

  // grid lines + bubbles + dimension strings around a plan
  AP.drawGrids = function (d, P, ts, opt) {
    opt = opt || {};
    const G = AP.grids(P), bb = AP.projectBBox(P);
    if (!bb || !G.x.length) return;
    const R = opt.overhang ? AP.roofsExtent(P, opt.level) : null;
    const showOH = R && R.oh > 0;
    const ex0 = showOH ? Math.min(bb.x0, R.x0) : bb.x0, ex1 = showOH ? Math.max(bb.x1, R.x1) : bb.x1, ey0 = showOH ? Math.min(bb.y0, R.y0) : bb.y0, ey1 = showOH ? Math.max(bb.y1, R.y1) : bb.y1;
    const opn = opt.fl && P.settings.dimOpenings !== false ? openingStops(P, opt.fl) : null;
    const rd = !!(opt.roofDims && showOH); // roof plans: one more string outside, the roof overall (eave to eave)
    // strings 7 apart, all measured from the outer edge (eaves when they show): doors & windows, column to column,
    // then overhang + overall (first to last grid) + overhang on one string
    const t0 = 7 * ts, o1 = (opn ? 14 : 9) * ts, o2 = (opn ? 21 : 16) * ts, o3 = o2 + 7 * ts, ob = (opn ? 30 : rd ? 32 : 25) * ts;
    const bub = P.settings.gridBubbles !== false;
    const gs = st(ts, LW.fine, { stroke: '#7a7a7a', dash: [8 * ts, 1.5 * ts, 1 * ts, 1.5 * ts], layer: 'GRID' });
    // bubbles in one row; where close grids pushed a bubble aside, its line jogs over just outside the dimension strings
    const SX = AP.spreadBubbles(G.x.map(g => g.v), ts), SY = AP.spreadBubbles(G.y.map(g => g.v), ts);
    const dimOut = (rd ? o3 : o2) + 3 * ts; // past the outermost string and its numbers
    G.x.forEach((g, i) => {
      const o = ob + (SX.jog ? 7 * ts : 0), b = SX.pos[i];
      if (!bub) { d.line(g.v, ey0 - (o2 - 2 * ts), g.v, ey1 + 4 * ts, gs); return; }
      const mid = (ey0 + ey1) / 2;
      AP.gridJog(d, 'x', g.v, b, ey0 - (o - 4 * ts), ey0 - (o - 5 * ts), ey0 - dimOut, mid, gs);
      if (opt.bottom) AP.gridJog(d, 'x', g.v, b, ey1 + (o - 4 * ts), ey1 + (o - 5 * ts), ey1 + dimOut, mid, gs);
      else d.line(g.v, mid, g.v, ey1 + 4 * ts, gs);
      AP.bubble(d, b, ey0 - o, g.label, ts);
      if (opt.bottom) AP.bubble(d, b, ey1 + o, g.label, ts);
    });
    G.y.forEach((g, i) => {
      const o = ob + (SY.jog ? 7 * ts : 0), b = SY.pos[i];
      if (!bub) { d.line(ex0 - (o2 - 2 * ts), g.v, ex1 + 4 * ts, g.v, gs); return; }
      const mid = (ex0 + ex1) / 2;
      AP.gridJog(d, 'y', g.v, b, ex0 - (o - 4 * ts), ex0 - (o - 5 * ts), ex0 - dimOut, mid, gs);
      if (opt.right) AP.gridJog(d, 'y', g.v, b, ex1 + (o - 4 * ts), ex1 + (o - 5 * ts), ex1 + dimOut, mid, gs);
      else d.line(mid, g.v, ex1 + 4 * ts, g.v, gs);
      AP.bubble(d, ex0 - o, b, g.label, ts);
      if (opt.right) AP.bubble(d, ex1 + o, b, g.label, ts);
    });
    const gx = G.x.map(g => g.v), gy = G.y.map(g => g.v);
    // inner: column to column; outer: overhang | overall (grid to grid) | overhang
    const ohx = showOH ? [ex0, ex1] : [], ohy = showOH ? [ey0, ey1] : [];
    AP.dimChain(d, gx, ey0 - o1, 'h', ts);
    AP.dimChain(d, [gx[0], gx[gx.length - 1], ...ohx], ey0 - o2, 'h', ts);
    AP.dimChain(d, gy, ex0 - o1, 'v', ts);
    AP.dimChain(d, [gy[0], gy[gy.length - 1], ...ohy], ex0 - o2, 'v', ts);
    if (rd) { AP.dimChain(d, [ex0, ex1], ey0 - o3, 'h', ts); AP.dimChain(d, [ey0, ey1], ex0 - o3, 'v', ts); }
    // nearest the walls: doors & windows between the grid lines, on every side that has them
    if (opn) {
      const fx = [gx[0], gx[gx.length - 1]], fy = [gy[0], gy[gy.length - 1]];
      const chain = (stops, grid, lim) => [...grid, ...stops.filter(v => v > lim[0] + 1e-3 && v < lim[1] - 1e-3)];
      if (opn.N.length) AP.dimChain(d, chain(opn.N, gx, fx), ey0 - t0, 'h', ts);
      if (opn.S.length) AP.dimChain(d, chain(opn.S, gx, fx), ey1 + t0, 'h', ts, 1);
      if (opn.W.length) AP.dimChain(d, chain(opn.W, gy, fy), ex0 - t0, 'v', ts);
      if (opn.E.length) AP.dimChain(d, chain(opn.E, gy, fy), ex1 + t0, 'v', ts, 1);
    }
  };
  // edges of the doors & windows in the outside walls, per side of the building
  function openingStops(P, fl) {
    const out = { N: [], S: [], E: [], W: [] }, walls = AP.computeWalls(fl, P.settings);
    for (const op of fl.openings) {
      const Ro = AP.resolveOp(fl, op); if (!Ro) continue;
      const w = walls.find(q => q.kind === 'ext' && q.o === Ro.o && AP.eq(q.c, Ro.c) && Ro.s >= q.a - 1e-3 && Ro.s <= q.b + 1e-3);
      if (!w || !out[w.out]) continue;
      out[w.out].push(Ro.s - Ro.w / 2, Ro.s + Ro.w / 2);
    }
    return out.N.length || out.S.length || out.E.length || out.W.length ? out : null;
  }

  function wallRect(d, w, s) {
    const a = w.a - w.ea, b = w.b + w.eb, h = w.t / 2;
    if (w.o === 'h') d.rect2(a, w.c - h, b, w.c + h, s); else d.rect2(w.c - h, a, w.c + h, b, s);
  }

  /* ---------- openings in plan ---------- */
  AP.drawOpeningPlan = function (d, fl, walls, op, ts, mark, hi) {
    const R = AP.resolveOp(fl, op);
    if (!R) return;
    const { o, c, s, w } = R;
    const k = R.k * (op.flip ? -1 : 1);
    const wall = AP.wallAt(walls, o, c, s);
    const t = wall && wall.t ? wall.t : 0.15;
    const P = (sv, n) => (o === 'h' ? [sv, c + n] : [c + n, sv]);
    const s0 = s - w / 2, s1 = s + w / 2;
    const layer = op.kind === 'door' ? 'DOORS' : 'WINDOWS';
    const thin = st(ts, LW.thin, { layer }), med = st(ts, LW.med, { layer });
    d.poly([P(s0, -t / 2 - 0.003), P(s1, -t / 2 - 0.003), P(s1, t / 2 + 0.003), P(s0, t / 2 + 0.003)], true, { fill: '#ffffff', stroke: 'none', layer: 'CUT' });
    d.lineP(P(s0, -t / 2), P(s0, t / 2), thin); d.lineP(P(s1, -t / 2), P(s1, t / 2), thin);
    const style = AP.tplOf(op).style;
    if (op.kind === 'door') {
      const leaf = (hs, dir, lw) => {
        const H = P(hs, k * t / 2), L = P(hs, k * (t / 2 + lw)), J = P(hs + dir * lw, k * t / 2);
        d.lineP(H, L, med);
        AP.arcShort(d, H, L, J, st(ts, LW.fine, { layer }));
      };
      if (style === 'double') { leaf(s0, 1, w / 2); leaf(s1, -1, w / 2); }
      else if (style === 'sliding') {
        d.poly([P(s0, -t / 6 - 0.02), P(s + 0.04, -t / 6 - 0.02), P(s + 0.04, -t / 6 + 0.02), P(s0, -t / 6 + 0.02)], true, thin);
        d.poly([P(s - 0.04, t / 6 - 0.02), P(s1, t / 6 - 0.02), P(s1, t / 6 + 0.02), P(s - 0.04, t / 6 + 0.02)], true, thin);
      } else if (style === 'rollup') {
        d.lineP(P(s0, 0), P(s1, 0), st(ts, LW.thin, { layer, dash: [2 * ts, 1 * ts] }));
        d.lineP(P(s0, k * t / 2), P(s1, k * t / 2), thin);
      } else {
        const dir = op.hand ? -1 : 1;
        leaf(s - dir * w / 2, dir, w);
      }
    } else {
      d.lineP(P(s0, -t / 2), P(s1, -t / 2), thin); d.lineP(P(s0, t / 2), P(s1, t / 2), thin);
      if (style === 'sliding') {
        d.lineP(P(s0, -t / 7), P(s + 0.05, -t / 7), med); d.lineP(P(s - 0.05, t / 7), P(s1, t / 7), med);
      } else {
        d.lineP(P(s0, -0.012), P(s1, -0.012), thin); d.lineP(P(s0, 0.012), P(s1, 0.012), thin);
      }
    }
    // exit door: EXIT and an arrow on the side it swings to (outside)
    if (op.kind === 'door' && AP.tplOf(op).exit) {
      const q = P(s, k * (t / 2 + w + 2.6 * ts)), ex = st(ts, LW.thin, { layer: 'DOORS', stroke: '#c0392b' });
      d.text(q[0], q[1], 'EXIT', 2.2 * ts, { anchor: 'middle', v: 'middle', bold: true, fill: '#c0392b', layer: 'DOORS' });
      const a = P(s, k * (t / 2 + 0.15)), b = P(s, k * (t / 2 + w + 0.4 * ts));
      d.lineP(a, b, ex);
    }
    // tag
    if (mark) {
      const tp = P(s, (op.kind === 'door' ? -k : -R.k) * (t / 2 + 3.4 * ts));
      const r = 2.6 * ts;
      if (op.kind === 'door') d.circle(tp[0], tp[1], r, st(ts, LW.fine, { fill: '#ffffff', layer }));
      else {
        const hx = []; for (let i = 0; i < 6; i++) hx.push([tp[0] + r * 1.15 * Math.cos(i * PI / 3), tp[1] + r * 0.85 * Math.sin(i * PI / 3)]);
        d.poly(hx, true, st(ts, LW.fine, { fill: '#ffffff', layer }));
      }
      d.text(tp[0], tp[1], mark.replace('-', ''), 1.9 * ts, { anchor: 'middle', v: 'middle', layer });
    }
    if (hi) {
      const sel = { stroke: '#1677ff', w: 0.5 * ts, fill: 'none', layer: 'SEL' };
      d.poly([P(s0 - 0.05, -t / 2 - 0.08), P(s1 + 0.05, -t / 2 - 0.08), P(s1 + 0.05, t / 2 + 0.08), P(s0 - 0.05, t / 2 + 0.08)], true, sel);
    }
  };

  /* ---------- temporary dimensions (Revit style) ----------
   * t: {o, c, k (room side), s, w, L, R, wallT, centered, ok}
   */
  AP.drawTempDims = function (d, t, ts) {
    const col = !t.ok ? '#d4380d' : t.centered ? '#13a10e' : '#1677ff';
    const s = { w: 0.35 * ts, stroke: col, layer: 'TEMP' };
    const n = t.k * (t.wallT / 2 + 6 * ts);
    const P = (sv, nn) => (t.o === 'h' ? [sv, t.c + nn] : [t.c + nn, sv]);
    const a = t.s - t.w / 2, b = t.s + t.w / 2;
    const seg = (p, q) => {
      if (q - p < 0.005) return;
      d.lineP(P(p, n), P(q, n), s);
      for (const v of [p, q]) {
        d.lineP(P(v, t.k * t.wallT / 2), P(v, n + t.k * 1.2 * ts), { w: 0.18 * ts, stroke: col, layer: 'TEMP' });
        d.lineP(P(v - 0.8 * ts, n + 0.8 * ts), P(v + 0.8 * ts, n - 0.8 * ts), s);
      }
      const m = P((p + q) / 2, n + t.k * (t.k > 0 ? 3.6 : 1.2) * ts);
      d.text(m[0], m[1], AP.mm(q - p), 2.6 * ts, { anchor: 'middle', bold: true, fill: col, rot: t.o === 'v' ? -90 : 0, layer: 'TEMP' });
    };
    if (t.ok) { seg(t.L, a); seg(b, t.R); } else seg(t.L, t.R); // too big: show the clear span available
    // opening width, one row further out
    const n2 = n + t.k * 6 * ts;
    d.lineP(P(a, n2), P(b, n2), { w: 0.18 * ts, stroke: '#8a96a3', layer: 'TEMP' });
    const m2 = P(t.s, n2 + t.k * (t.k > 0 ? 3.4 : 1.0) * ts);
    const tag = !t.ok ? 'DOES NOT FIT' : t.centered ? 'EQ  ·  CENTERED' : 'W ' + AP.mm(t.w);
    d.text(m2[0], m2[1], tag, 2.2 * ts, { anchor: 'middle', bold: true, fill: t.centered || !t.ok ? col : '#5b6672', rot: t.o === 'v' ? -90 : 0, layer: 'TEMP' });
  };

  /* ---------- template blocks (AP.BLOCKS from the user's DWG template) ---------- */
  // draw a block through a transform T(x, y) -> [X, Y] (block coords: metres, origin lower-left, Y up)
  AP.drawBlock = function (d, name, T, s) {
    const B = AP.BLOCKS && AP.BLOCKS[name]; if (!B) return false;
    for (const p of B.p) {
      const pts = []; for (let i = 1; i < p.length; i += 2) pts.push(T(p[i], p[i + 1]));
      d.poly(pts, p[0] === 1, s);
    }
    for (const c of B.c) { const q = T(c[0], c[1]), q2 = T(c[0] + c[2], c[1]); d.circle(q[0], q[1], Math.hypot(q2[0] - q[0], q2[1] - q[1]), s); }
    return true;
  };
  // place a block in a fixture zone of a wall frame L(s, n); 'wall' = the block side that touches the wall
  AP.blockOnWall = function (d, name, L, f, wall, s, stretch) {
    const B = AP.BLOCKS && AP.BLOCKS[name]; if (!B) return false;
    const rot = wall === 'left';
    const bw = rot ? B.h : B.w, bd = rot ? B.w : B.h;
    const zw = f.s1 - f.s0, zd = f.n1 - f.n0;
    let ks = Math.min(1, zw / bw, zd / bd), kn = ks;
    if (stretch) { ks = zw / bw; kn = zd / bd; }
    const off = f.s0 + (zw - bw * ks) / 2;
    const T = (x, y) => {
      let su, nv;
      if (wall === 'top') { su = x; nv = B.h - y; } else if (wall === 'bottom') { su = B.w - x; nv = y; } else { su = y; nv = x; }
      return L(off + su * ks, f.n0 + nv * kn);
    };
    return AP.drawBlock(d, name, T, s);
  };

  AP.drawColumn = function (d, c, sty, pad) {
    pad = pad || 0;
    if (c.shape === 'circle') d.circle(c.x, c.y, c.size / 2 + pad, sty);
    else d.rect(c.x - c.size / 2 - pad, c.y - (c.d || c.size) / 2 - pad, c.size + 2 * pad, (c.d || c.size) + 2 * pad, sty);
  };

  /* ---------- furniture added by the user: {id, kind, x, y (centre), rot 0/90/180/270, w, l} ---------- */
  // local frame: lx across the piece, ly from its back (-l/2) to its front (+l/2); rot turns it clockwise
  AP.furnXf = function (f) {
    const a = (f.rot || 0) * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    return {
      T: (lx, ly) => [f.x + lx * c - ly * s, f.y + lx * s + ly * c],
      inv: (x, y) => { const dx = x - f.x, dy = y - f.y; return [dx * c + dy * s, -dx * s + dy * c]; }
    };
  };
  AP.furnSize = f => { const F = AP.FURN[f.kind] || { w: 1, l: 1 }; return [f.w || F.w, f.l || F.l]; };
  AP.drawFurniture = function (d, f, ts, selected) {
    const F = AP.FURN[f.kind]; if (!F) return;
    const [w, l] = AP.furnSize(f), { T } = AP.furnXf(f);
    const s = st(ts, LW.thin, { layer: 'FURNITURE' }), sf = st(ts, LW.fine, { layer: 'FURNITURE' });
    const R = (x0, y0, x1, y1, sty) => d.poly([T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)], true, sty || s);
    const L = (x0, y0, x1, y1, sty) => d.lineP(T(x0, y0), T(x1, y1), sty || sf);
    const hw = w / 2, hl = l / 2;
    let done = false;
    if (F.block && AP.BLOCKS && AP.BLOCKS[F.block]) {
      const Lf = (u, n) => T(u - hw, n - hl);
      done = AP.blockOnWall(d, F.block, Lf, { s0: 0, s1: w, n0: 0, n1: l }, F.bw, s, !!F.stretch);
    }
    if (!done) switch (f.kind) {
      case 'tv':
        R(-hw, -hl, hw, hl); R(-hw * 0.8, -hl + 0.05, hw * 0.8, -hl + 0.11, Object.assign({ fill: '#333333' }, s));
        d.text(...T(0, 0.08), 'TV', 1.8 * ts, { anchor: 'middle', v: 'middle', layer: 'FURNITURE' }); break;
      case 'arm':
        R(-hw, -hl, hw, hl); R(-hw, -hl, hw, -hl + 0.18); R(-hw, -hl + 0.18, -hw + 0.15, hl); R(hw - 0.15, -hl + 0.18, hw, hl); break;
      case 'coffee': case 'cabinet': case 'dresser': case 'counter':
        R(-hw, -hl, hw, hl); if (f.kind !== 'coffee') L(-hw, -hl + 0.04, hw, -hl + 0.04); if (f.kind === 'counter') L(-hw, hl - 0.05, hw, hl - 0.05); break;
      case 'closet':
        R(-hw, -hl, hw, hl); L(-hw + 0.05, 0, hw - 0.05, 0, s);
        for (let x = -hw + 0.12; x < hw - 0.05; x += 0.12) L(x - 0.03, -0.12, x + 0.03, 0.12);
        L(-hw, hl, hw, -hl, st(ts, LW.fine, { layer: 'FURNITURE', dash: [1 * ts, 0.8 * ts] })); break;
      case 'desk':
        R(-hw, -hl, hw, hl); R(-0.22, hl + 0.05, 0.22, hl + 0.45); L(-0.22, hl + 0.38, 0.22, hl + 0.38); break;
      case 'counterL': { // back run along the wall + a leg down one side (f.mir: leg on the right)
        const dd = Math.min(f.d || 0.6, w, l), m = f.mir ? -1 : 1, X = x => m * x;
        d.poly([T(X(-hw), -hl), T(X(hw), -hl), T(X(hw), -hl + dd), T(X(-hw + dd), -hl + dd), T(X(-hw + dd), hl), T(X(-hw), hl)], true, s);
        d.poly([T(X(hw), -hl + dd - 0.05), T(X(-hw + dd - 0.05), -hl + dd - 0.05), T(X(-hw + dd - 0.05), hl)], false, sf);
        break;
      }
      case 'ltub':
        R(-hw, -hl, hw, hl); R(-hw + 0.05, -hl + 0.05, hw - 0.05, hl - 0.05, sf); d.circle(...T(0, 0), 0.03, sf); break;
      case 'fd': { const c = T(0, 0); d.circle(c[0], c[1], Math.min(hw, hl), s); L(-hw * 0.7, -hl * 0.7, hw * 0.7, hl * 0.7); L(-hw * 0.7, hl * 0.7, hw * 0.7, -hl * 0.7); break; }
      case 'shower': R(-hw, -hl, hw, hl, st(ts, LW.thin, { layer: 'FURNITURE', dash: [1.5 * ts, 0.8 * ts] })); L(-hw, -hl, hw, hl); L(-hw, hl, hw, -hl); d.circle(...T(0, 0), 0.05, s); break;
      case 'sink1': R(-hw, -hl, hw, hl, sf); R(-hw + 0.05, -hl + 0.05, hw - 0.05, hl - 0.05, sf); break;
      case 'car': {
        R(-hw + 0.1, -hl + 0.3, hw - 0.1, hl - 0.3);
        d.poly([T(-hw + 0.1, -hl + 0.3), T(-hw + 0.3, -hl + 0.05), T(hw - 0.3, -hl + 0.05), T(hw - 0.1, -hl + 0.3)], false, s);
        d.poly([T(-hw + 0.1, hl - 0.3), T(-hw + 0.3, hl - 0.05), T(hw - 0.3, hl - 0.05), T(hw - 0.1, hl - 0.3)], false, s);
        R(-hw + 0.25, -hl + 1.0, hw - 0.25, -hl + 1.5, sf); R(-hw + 0.25, hl - 1.6, hw - 0.25, hl - 1.2, sf); break;
      }
      default: R(-hw, -hl, hw, hl); L(-hw, -hl, hw, hl); L(-hw, hl, hw, -hl);
    }
    if (selected) R(-hw - 0.05, -hl - 0.05, hw + 0.05, hl + 0.05, { stroke: '#1677ff', w: 0.7 * ts, fill: 'none', dash: [2 * ts, 1 * ts], layer: 'SEL' });
  };

  /* ---------- fixtures in plan ---------- */
  function ellipse(L, cs, cn, rs, rn, n) {
    const p = []; n = n || 28;
    for (let i = 0; i < n; i++) { const a = 2 * PI * i / n; p.push(L(cs + rs * Math.cos(a), cn + rn * Math.sin(a))); }
    return p;
  }
  AP.drawFixtures = function (d, fl, r, S, ts, only) {
    const s = st(ts, LW.thin, { layer: 'FIXTURES', stroke: '#333333' });
    const sf = st(ts, LW.fine, { layer: 'FIXTURES', stroke: '#555555' });
    for (const f of AP.fixtures(fl, r, S)) {
      if (only && only.indexOf(f.kind) < 0) continue;
      if (f.kind === 'car') {
        const [x, y, w, l] = f.world;
        d.rect(x, y, w, l, st(ts, LW.thin, { layer: 'FIXTURES', dash: [2 * ts, 1 * ts], stroke: '#666666' }));
        continue;
      }
      if (f.kind === 'stairs') { drawStairs(d, r, ts, fl, S); continue; }
      const L = AP.frame(r, f.side);
      const R = (a0, a1, b0, b1, sty) => d.poly([L(a0, b0), L(a1, b0), L(a1, b1), L(a0, b1)], true, sty || s);
      const cs = (f.s0 + f.s1) / 2, ws = f.s1 - f.s0, dn = f.n1 - f.n0;
      // fixtures & furniture from the user's template blocks
      const TB = { wc: ['WC-S', 'top'], lav: ['LAV1-P', 'top'], shower: ['SH-1PLAN', 'top', true], sink: ['KS-1', 'top'], stove: ['HOB-4', 'top'], washer: ['WM-1', 'top'] }[f.kind];
      if (TB && AP.blockOnWall(d, TB[0], L, f, TB[1], s, TB[2])) continue;
      if (f.block && AP.blockOnWall(d, f.block, L, f, f.blockWall || 'top', s)) continue;
      switch (f.kind) {
        case 'wc':
          R(f.s0, f.s1, f.n0, f.n0 + 0.18);
          d.poly(ellipse(L, cs, f.n0 + 0.18 + (dn - 0.18) / 2, ws / 2 - 0.02, (dn - 0.18) / 2), true, s);
          d.poly(ellipse(L, cs, f.n0 + 0.18 + (dn - 0.18) / 2, ws / 2 - 0.07, (dn - 0.18) / 2 - 0.06), true, sf);
          break;
        case 'lav':
          R(f.s0, f.s1, f.n0, f.n1);
          d.poly(ellipse(L, cs, f.n0 + dn * 0.55, ws * 0.36, dn * 0.32), true, sf);
          break;
        case 'shower': {
          R(f.s0, f.s1, f.n0, f.n1, st(ts, LW.thin, { layer: 'FIXTURES', dash: [1.5 * ts, 0.8 * ts] }));
          const c = L(cs, (f.n0 + f.n1) / 2);
          d.circle(c[0], c[1], 0.05, s);
          d.lineP(L(f.s0, f.n0), L(f.s1, f.n1), sf); d.lineP(L(f.s1, f.n0), L(f.s0, f.n1), sf);
          break;
        }
        case 'drain': { const c = L(f.s0, f.n0); d.circle(c[0], c[1], 0.05, s); break; }
        case 'counter': R(f.s0, f.s1, f.n0, f.n1); break;
        case 'counterL': { // back run + leg at the left (s0) or right (s1) end
          const dd = f.d || 0.6, a = f.leg === 'right' ? f.s1 - dd : f.s0, b = a + dd;
          const pts = f.leg === 'right'
            ? [[f.s0, f.n0], [f.s1, f.n0], [f.s1, f.n1], [a, f.n1], [a, f.n0 + dd], [f.s0, f.n0 + dd]]
            : [[f.s0, f.n0], [f.s1, f.n0], [f.s1, f.n0 + dd], [b, f.n0 + dd], [b, f.n1], [f.s0, f.n1]];
          d.poly(pts.map(p => L(p[0], p[1])), true, s);
          break;
        }
        case 'sink':
          R(f.s0, f.s1, f.n0, f.n1, sf);
          R(f.s0 + 0.04, cs - 0.02, f.n0 + 0.04, f.n1 - 0.04, sf); R(cs + 0.02, f.s1 - 0.04, f.n0 + 0.04, f.n1 - 0.04, sf);
          break;
        case 'stove': {
          R(f.s0, f.s1, f.n0, f.n1, sf);
          for (const q of [0.28, 0.72]) { const c = L(f.s0 + ws * q, (f.n0 + f.n1) / 2); d.circle(c[0], c[1], 0.1, sf); }
          break;
        }
        case 'bed':
          R(f.s0, f.s1, f.n0, f.n1);
          if (ws > 1.4) { R(f.s0 + 0.08, cs - 0.05, f.n0 + 0.08, f.n0 + 0.38, sf); R(cs + 0.05, f.s1 - 0.08, f.n0 + 0.08, f.n0 + 0.38, sf); }
          else R(f.s0 + 0.1, f.s1 - 0.1, f.n0 + 0.08, f.n0 + 0.38, sf);
          d.lineP(L(f.s0, f.n0 + dn * 0.38), L(f.s1, f.n0 + dn * 0.38), sf);
          break;
        case 'table': R(f.s0, f.s1, f.n0, f.n1, sf); break;
        case 'sofa':
          R(f.s0, f.s1, f.n0, f.n1);
          R(f.s0 + 0.18, f.s1 - 0.18, f.n0 + 0.2, f.n1, sf);
          break;
        case 'dtable': {
          R(f.s0, f.s1, f.n0, f.n1);
          const nC = Math.max(2, Math.round(ws / 0.6));
          for (let i = 0; i < nC; i++) {
            const a = f.s0 + ws * (i + 0.5) / nC;
            R(a - 0.2, a + 0.2, f.n0 - 0.45, f.n0 - 0.05, sf); R(a - 0.2, a + 0.2, f.n1 + 0.05, f.n1 + 0.45, sf);
          }
          break;
        }
        case 'washer': { R(f.s0, f.s1, f.n0, f.n1); const c = L(cs, (f.n0 + f.n1) / 2); d.circle(c[0], c[1], ws * 0.33, sf); break; }
        case 'tub': R(f.s0, f.s1, f.n0, f.n1); R(f.s0 + 0.05, f.s1 - 0.05, f.n0 + 0.05, f.n1 - 0.05, sf); break;
      }
    }
  };
  let stairCtx = null; // { P, fi } while a floor plan is drawn: is there a stair below / above this one?
  function drawStairs(d, r, ts, fl, S) {
    const s = st(ts, LW.thin, { layer: 'FIXTURES' }), C = stairCtx;
    const over = q => q.type === 'stairs' && q.x < r.x + r.w - 0.05 && q.x + q.w > r.x + 0.05 && q.y < r.y + r.l - 0.05 && q.y + q.l > r.y + 0.05;
    const below = !!(C && C.fi > 0 && C.P.floors[C.fi - 1].rooms.some(over)), above = !!(C && C.P.floors[C.fi + 1] && C.P.floors[C.fi + 1].rooms.some(over));
    const down = below && !above; // the floor the stair arrives at: DN
    const fiG = C ? (down ? C.fi - 1 : C.fi) : 0, H = C ? AP.floorH(C.P, fiG) : (S.floorHt || 3);
    const g = AP.stairGeom(r, H), { alongX, run, wid } = g, rev = C ? AP.stairRev(C.P, r) : false;
    const P = (a, b) => { const aa = rev ? run - a : a; return alongX ? [r.x + aa, r.y + b] : [r.x + b, r.y + aa]; };
    const arrow = (pts, lab) => { // walking line with an arrow at its end and UP / DN at its start
      for (let k = 1; k < pts.length; k++) d.lineP(P(...pts[k - 1]), P(...pts[k]), s);
      const e = pts[pts.length - 1], f = pts[pts.length - 2], L = Math.hypot(e[0] - f[0], e[1] - f[1]) || 1, ua = (e[0] - f[0]) / L, ub = (e[1] - f[1]) / L;
      d.lineP(P(...e), P(e[0] - ua * 0.18 - ub * 0.1, e[1] - ub * 0.18 + ua * 0.1), s); d.lineP(P(...e), P(e[0] - ua * 0.18 + ub * 0.1, e[1] - ub * 0.18 - ua * 0.1), s);
      const tp = P(pts[0][0] + 0.12, pts[0][1]);
      d.text(tp[0] + (alongX ? 0 : 0.12), tp[1] + (alongX ? -0.12 : 0), lab, 2.2 * ts, { layer: 'FIXTURES', bold: true, anchor: 'start', v: 'middle' });
    };
    const note = (a, b) => { const p = P(a, b); d.text(p[0], p[1], g.risers + ' R @ ' + AP.mm(g.rise) + ' · ' + g.treads + ' T @ ' + AP.mm(g.t), 1.4 * ts, { anchor: 'middle', v: 'middle', layer: 'FIXTURES' }); };
    const dash = st(ts, LW.thin, { layer: 'FIXTURES', dash: [2 * ts, 1 * ts] });
    if (g.type === 'U') {
      const { fw, Ld, a0, n, t } = g, b2 = fw + 0.1, aL = a0 + n * t;
      for (let k = 0; k <= n; k++) { const a = a0 + k * t; d.lineP(P(a, 0.02), P(a, fw), s); d.lineP(P(a, b2), P(a, wid - 0.02), s); }
      d.lineP(P(a0, fw), P(aL, fw), s); d.lineP(P(a0, b2), P(aL, b2), s); // the well between the flights (handrails)
      d.lineP(P(aL, fw), P(aL, b2), s);
      const m1 = fw / 2, m2 = b2 + fw / 2, am = aL + Math.min(0.3, Ld * 0.22); // the walking line turns near the steps, clear of the name on the landing
      if (down) arrow([[a0 + 0.1, m2], [am, m2], [am, m1], [a0 + 0.1, m1]], 'DN');
      else {
        arrow([[a0 + 0.1, m1], [am, m1], [am, m2], [a0 + 0.1, m2]], 'UP');
        if (C) d.lineP(P(a0 + n * t * 0.62, 0.02), P(a0 + n * t * 0.38, fw), dash); // cut through the first flight
      }
      note(run - Math.min(0.14, Ld * 0.1), wid / 2); // along the far edge of the landing
    } else {
      const { a0, n, t } = g, a1 = Math.min(run - 0.2, a0 + n * t);
      for (let k = 0; k <= n; k++) { const a = a0 + k * t; if (a < run) d.lineP(P(a, 0.05), P(a, wid - 0.05), s); }
      if (!down) d.lineP(P(run * 0.55, 0.05), P(run * 0.45, wid - 0.05), dash);
      if (down) arrow([[a1, wid / 2], [a0 + 0.12, wid / 2]], 'DN'); else arrow([[a0 + 0.12, wid / 2], [a1, wid / 2]], 'UP');
      note(run / 2, wid / 2 + Math.min(0.35, wid * 0.3));
    }
    // railings (straight flight): on each long side of the flight that has no wall; a wall handrail when both sides are walled
    if (g.type === 'U') return;
    const sides = alongX ? [['N', 0], ['S', wid]] : [['W', 0], ['E', wid]];
    const walls = fl && S ? AP.computeWalls(fl, S) : [];
    const walled = ([sd, b]) => { const si = AP.sideInfo(r, sd); const w = AP.wallAt(walls, si.o, si.c, si.s0 + si.len / 2); return !!(w && w.t) && !AP.sideOpen(r, sd); };
    let open = sides.filter(sb => !walled(sb));
    const rs = st(ts, LW.thin, { layer: 'RAILING' }), post = st(ts, LW.thin, { layer: 'RAILING', fill: '#ffffff' });
    const e0 = 0.1, e1 = run - 0.05;
    for (const [, b] of open) {
      const k = b === 0 ? 1 : -1, b1 = b + k * 0.06, b2 = b + k * 0.11;
      d.lineP(P(e0, b1), P(e1, b1), rs); d.lineP(P(e0, b2), P(e1, b2), rs);
      const np = Math.max(1, Math.ceil((e1 - e0) / 1.2));
      for (let i = 0; i <= np; i++) { const p = P(e0 + (e1 - e0) * i / np, (b1 + b2) / 2); d.circle(p[0], p[1], 0.035, post); }
      const lp = P((e0 + e1) / 2, b2 + k * (1.2 * ts + 0.05));
      d.text(lp[0], lp[1], 'RAILING H=900', 1.5 * ts, { anchor: 'middle', v: 'middle', layer: 'RAILING', rot: alongX ? 0 : 90 });
    }
    if (!open.length) { // both sides walled: wall-mounted handrail on one side
      const b = wid - 0.07;
      d.lineP(P(e0, b), P(e1, b), rs);
      const lp = P((e0 + e1) / 2, b - 1.4 * ts);
      d.text(lp[0], lp[1], 'HANDRAIL', 1.5 * ts, { anchor: 'middle', v: 'middle', layer: 'RAILING', rot: alongX ? 0 : 90 });
    }
  }

  function tileHatch(d, r, ts, step, color) {
    const s = st(ts, LW.fine, { stroke: color || '#8fb8bf', layer: 'HATCH' });
    for (let x = r.x + step; x < r.x + r.w - 0.01; x += step) d.line(x, r.y, x, r.y + r.l, s);
    for (let y = r.y + step; y < r.y + r.l - 0.01; y += step) d.line(r.x, y, r.x + r.w, y, s);
  }

  // finish floor level mark: circle with two dark quarters + FFL elevation (m from the ground floor FFL ±0.00)
  AP.fflText = z => 'FFL ' + (Math.abs(z) < 0.0005 ? '±0.00' : (z > 0 ? '+' : '-') + Math.abs(z).toFixed(2));
  AP.levelSymbol = function (d, x, y, ts, r) {
    r = (r || 1.3) * ts;
    d.circle(x, y, r, { stroke: '#000000', w: LW.fine * ts, fill: '#ffffff', layer: 'TEXT' });
    const q = a0 => [[x, y], ...Array.from({ length: 7 }, (_, i) => [x + r * Math.cos(a0 + i * PI / 12), y + r * Math.sin(a0 + i * PI / 12)])];
    d.poly(q(-PI / 2), true, { fill: '#000000', stroke: 'none', layer: 'TEXT' }); // top-right quarter
    d.poly(q(PI / 2), true, { fill: '#000000', stroke: 'none', layer: 'TEXT' });  // bottom-left quarter
    d.line(x - r * 1.4, y, x + r * 1.4, y, { stroke: '#000000', w: LW.fine * ts, layer: 'TEXT' });
    d.line(x, y - r * 1.4, x, y + r * 1.4, { stroke: '#000000', w: LW.fine * ts, layer: 'TEXT' });
  };
  function fflMark(d, x, y, z, ts, h) {
    const t = AP.fflText(z), tw = AP.textWidth(t, h), sr = h * 0.5 / ts;
    const x0 = x - (tw + 2.6 * sr * ts) / 2;
    AP.levelSymbol(d, x0 + sr * ts, y - h * 0.3, ts, sr);
    d.text(x0 + 2.6 * sr * ts, y, t, h, { layer: 'TEXT' });
  }
  function roomLabel(d, r, ts, hideArea, top, ffl) {
    let cx = r.x + r.w / 2, cy = top ? r.y + Math.min(0.45, r.l * 0.2) : r.y + r.l / 2;
    let stairDy = r.type === 'stairs' ? -r.l * 0.25 : 0;
    if (r.type === 'stairs' && !top) { // U-type stair: the name on the landing, clear of the steps
      const g = AP.stairGeom(r, 3);
      if (g.type === 'U') {
        const rv = stairCtx && stairCtx.P.floors.some(f => f.rooms.indexOf(r) >= 0) ? AP.stairRev(stairCtx.P, r) : false;
        let a = g.a0 + g.n * g.t + g.Ld * 0.55; if (rv) a = g.run - a;
        if (g.alongX) { cx = r.x + a; cy = r.y + r.l / 2; } else { cx = r.x + r.w / 2; cy = r.y + a; } stairDy = 0;
      }
    }
    let h = 2.6 * ts;
    const name = (r.name || '').toUpperCase();
    const maxW = r.w * 0.88;
    const tw = AP.textWidth(name, h, true);
    if (tw > maxW) h = Math.max(1.3 * ts, h * maxW / tw);
    if (r.l < 2.6 * h * 1.6) hideArea = true;
    const dy = stairDy;
    d.text(cx, cy + dy - (hideArea ? 0 : 0.6 * h), name, h, { anchor: 'middle', v: 'middle', bold: true });
    if (!hideArea) d.text(cx, cy + dy + 1.1 * h, AP.area(r.w * r.l) + (AP.flText(r) ? '  ' + AP.flText(r) : ''), h * 0.72, { anchor: 'middle', v: 'middle' });
    if (ffl != null && !hideArea && r.type !== 'stairs' && r.l > 2.6 * h * 2.4) fflMark(d, cx, cy + dy + 2.9 * h, ffl, ts, h * 0.62);
  }

  /* ---------- FLOOR PLAN ---------- */
  AP.renderPlan = function (P, fi, o) {
    o = o || {};
    const ts = o.ts || 0.1, S = P.settings, d = new AP.Drawing(), fl = P.floors[fi];
    const walls = AP.computeWalls(fl, S);
    stairCtx = { P, fi };
    const C = AP.columns(P);
    const marks = AP.opMarks(P).marks;
    if (o.editor) {
      if (fi > 0) for (const r of P.floors[fi - 1].rooms)
        d.rect(r.x, r.y, r.w, r.l, { stroke: '#b0b8c4', w: 0.35 * ts, dash: [1.5 * ts, 1 * ts], layer: 'GHOST' });
      for (const r of fl.rooms) d.rect(r.x, r.y, r.w, r.l, { fill: (AP.ROOM_TYPES[r.type] || {}).color || '#f5f5f5', stroke: 'none', layer: 'FILL' });
    }
    // o.base = 'E' | 'P': light background plan for electrical / plumbing layouts
    const base = o.base;
    // floor tile pattern from the room's floor finish (e.g. 600x600, 300x300)
    if (!base) for (const r of fl.rooms) {
      const tz = AP.tileSize(AP.roomFinish(r).floor);
      if (tz) tileHatch(d, r, ts, tz[0], (AP.ROOM_TYPES[r.type] || {}).wet ? '#8fb8bf' : '#cfd8de');
    }
    if (base !== 'E') for (const r of fl.rooms) AP.drawFixtures(d, fl, r, S, ts, base === 'P' ? AP.PLUMB_KINDS : null);
    if (!base) for (const f of fl.furniture || []) AP.drawFurniture(d, f, ts, o.editor && o.sel && o.sel.type === 'furn' && o.sel.id === f.id);
    // plumbing layouts still show the toilet / kitchen / laundry pieces the user placed or moved
    else if (base === 'P') for (const f of fl.furniture || []) if (['wc', 'lav', 'shower', 'sink1', 'sink2', 'wm', 'ltub', 'tub', 'fd', 'counter', 'counterL'].indexOf(f.kind) >= 0) AP.drawFurniture(d, f, ts, false);
    // roof eave lines of the roofs sitting on this floor
    const RF = AP.roofs(P).filter(q => q.level === fi);
    // the eaves – also on the lighting & power layouts (lights outside under the roof)
    if (!base || base === 'E') for (const q of RF) if (q.oh > 0) { const es = st(ts, LW.thin, { dash: [3 * ts, 1.5 * ts], stroke: '#555555', layer: 'ROOF' }); if (q.poly) d.poly(q.poly, true, es); else d.rect2(q.X0, q.Y0, q.X1, q.Y1, es); }
    for (const w of walls) if (w.kind === 'edge') {
      const p = AP.wallPt(w.o, w.c, w.a), q = AP.wallPt(w.o, w.c, w.b);
      d.lineP(p, q, st(ts, LW.thin, { dash: [2 * ts, 1 * ts], stroke: '#555555', layer: 'WALLS' }));
    }
    for (const w of walls) if (w.t) wallRect(d, w, { fill: base ? '#b4b4b4' : w.mat ? AP.wallMat(w.mat).fill : '#6b6b6b', stroke: 'none', layer: 'WALLS' });
    // drawn walls of another material: its name along the wall
    if (!base) for (const w of walls) if (w.mat && w.mat !== 'chb' && w.b - w.a > 1.0) {
      const m = AP.wallPt(w.o, w.c, (w.a + w.b) / 2), vert = w.o === 'v', off = w.t / 2 + 1.6 * ts;
      d.text(m[0] + (vert ? off + 0.6 * ts : 0), m[1] - (vert ? 0 : off), AP.wallMat(w.mat).short + (w.h ? ' H=' + AP.mm(w.h) : ''), 1.5 * ts, { anchor: 'middle', rot: vert ? -90 : 0, layer: 'TEXT' });
    }
    for (const c of C.cols) if (c.top >= fi) AP.drawColumn(d, c, { fill: base ? '#7a7a7a' : '#111111', stroke: 'none', layer: 'COLUMNS' });
    for (const op of fl.openings) {
      const rr = fl.rooms.find(q => q.id === op.roomId);
      if (rr && AP.sideOpen(rr, op.side)) continue; // wall removed on that side
      AP.drawOpeningPlan(d, fl, walls, op, ts, base ? null : marks[op.id], o.sel && o.sel.id === op.id);
    }
    const showFFL = !base && S.showFFL !== false;
    for (const r of fl.rooms) roomLabel(d, r, ts, !!base, base === 'E', showFFL ? AP.levelZ(P, fi) - AP.floorDrop(r) : null);
    const padlock = (x, y, k) => {
      d.rect(x - k, y - k * 0.2, 2 * k, 1.5 * k, { fill: '#e8a33a', stroke: '#7a4b00', w: 0.3 * ts, layer: 'SEL' });
      d.arc(x, y - k * 0.2, k * 0.65, Math.PI, 2 * Math.PI, { stroke: '#7a4b00', w: 0.6 * ts, layer: 'SEL' });
    };
    if (o.editor) {
      for (const r of fl.rooms) if (r.locked) padlock(r.x + 0.25, r.y + 0.3, 0.09); // room: top-left corner
      for (const op of fl.openings) if (op.locked) { const R = AP.resolveOp(fl, op); if (R) { const p = AP.wallPt(R.o, R.c, R.s); padlock(p[0] + (R.o === 'v' ? 0.22 : 0), p[1] + (R.o === 'h' ? 0.22 : 0), 0.06); } }
      for (const f of fl.furniture || []) if (f.locked) padlock(f.x, f.y, 0.06);
    }
    if (o.editor && o.focus) { // room view: grey out everything outside the room
      const r = fl.rooms.find(q => q.id === o.focus);
      if (r) {
        const B = 200, f = { fill: 'rgba(240,243,247,0.82)', stroke: 'none', layer: 'SEL' };
        d.rect(r.x - B, r.y - B, 2 * B + r.w, B, f); d.rect(r.x - B, r.y + r.l, 2 * B + r.w, B, f);
        d.rect(r.x - B, r.y, B, r.l, f); d.rect(r.x + r.w, r.y, B, r.l, f);
        d.rect(r.x, r.y, r.w, r.l, { stroke: '#1677ff', w: 0.8 * ts, fill: 'none', layer: 'SEL' });
      }
    }
    if (o.editor && o.sel && o.sel.type === 'room') {
      const r = fl.rooms.find(q => q.id === o.sel.id);
      if (r) d.rect(r.x, r.y, r.w, r.l, { stroke: '#1677ff', w: 0.7 * ts, fill: 'none', dash: [2 * ts, 1 * ts], layer: 'SEL' });
    }
    if (fl.rooms.length) {
      AP.drawGrids(d, P, ts, { overhang: RF.length > 0, level: fi, fl: base ? null : fl });
      if (o.sections !== false && !base) drawSectionMarks(d, P, ts);
      if (!base && fi === 0) drawElevMarks(d, P, ts);
      if (!base) drawDetailCallouts(d, P, fl, ts);
      northArrow(d, P, ts);
    }
    return d;
  };

  /* reference bubble: view number (top) over the sheet it is drawn on (bottom) */
  AP.refBubble = function (d, cx, cy, top, bottom, ts, r) {
    r = r || 4 * ts;
    d.circle(cx, cy, r, st(ts, LW.thin, { fill: '#ffffff', layer: 'TEXT' }));
    d.line(cx - r, cy, cx + r, cy, st(ts, LW.thin, { layer: 'TEXT' }));
    d.text(cx, cy - 0.9 * ts, String(top), 2.6 * ts, { anchor: 'middle', bold: true });
    if (bottom) d.text(cx, cy + 2.6 * ts, bottom, 1.7 * ts, { anchor: 'middle' });
  };
  const refOf = key => (AP.REFS || {})[key] || null;
  // pointer triangle on the side of a bubble facing (dx,dy)
  function pointer(d, cx, cy, r, dx, dy) {
    d.poly([[cx + dx * r * 1.75, cy + dy * r * 1.75], [cx - dy * r * 0.75 + dx * r * 0.6, cy + dx * r * 0.75 + dy * r * 0.6], [cx + dy * r * 0.75 + dx * r * 0.6, cy - dx * r * 0.75 + dy * r * 0.6]], true, { fill: '#000000', stroke: 'none', layer: 'TEXT' });
  }
  function bbWithRoof(P) {
    const b0 = AP.projectBBox(P), R = AP.roofsExtent(P);
    return R && R.oh ? { x0: Math.min(b0.x0, R.x0), y0: Math.min(b0.y0, R.y0), x1: Math.max(b0.x1, R.x1), y1: Math.max(b0.y1, R.y1) } : b0;
  }
  // exterior elevation tags on the four sides of the ground floor plan
  function drawElevMarks(d, P, ts) {
    const bb = bbWithRoof(P), r = 4 * ts, cut = AP.sectionCuts(P);
    // along each side: the first of these spots that keeps the tag clear of the section line (and its tags)
    const pick = (lo, hi, avoid) => { for (const f of [0.3, 0.7, 0.5, 0.2, 0.8, 0.12, 0.88]) { const v = lo + (hi - lo) * f; if (avoid == null || Math.abs(v - avoid) > 13 * ts) return v; } return lo + (hi - lo) * 0.3; };
    const ax = pick(bb.x0, bb.x1, cut.B), ay = pick(bb.y0, bb.y1, cut.A);
    const tags = [['elS', ax, bb.y1 + 17 * ts, 0, -1], ['elN', ax, bb.y0 - 56 * ts, 0, 1], ['elW', bb.x0 - 56 * ts, ay, 1, 0], ['elE', bb.x1 + 17 * ts, ay, -1, 0]];
    for (const [k, x, y, dx, dy] of tags) {
      const ref = refOf(k); if (!ref) continue;
      pointer(d, x, y, r, dx, dy);
      AP.refBubble(d, x, y, ref.num, ref.sheet, ts, r);
    }
  }
  // dashed boundary + callout for every toilet that has an enlarged detail
  function drawDetailCallouts(d, P, fl, ts) {
    for (const r of fl.rooms) {
      if (r.type !== 'toilet') continue;
      const ref = refOf('toilet:' + AP.toiletKey(r)); if (!ref) continue;
      const m = 0.18;
      d.rect(r.x - m, r.y - m, r.w + 2 * m, r.l + 2 * m, st(ts, LW.thin, { dash: [2.5 * ts, 1 * ts, 0.6 * ts, 1 * ts], layer: 'TEXT', stroke: '#444444' }));
      const bx = r.x + r.w + m + 5 * ts, by = r.y - m - 5 * ts;
      d.line(r.x + r.w + m, r.y - m, bx - 2.8 * ts, by + 2.8 * ts, st(ts, LW.thin, { layer: 'TEXT' }));
      AP.refBubble(d, bx, by, ref.num, ref.sheet, ts, 3.6 * ts);
    }
  }

  function drawSectionMarks(d, P, ts) {
    const cut = AP.sectionCuts(P), bb = bbWithRoof(P);
    const s = st(ts, LW.thick, { layer: 'TEXT' });
    const r = 4 * ts;
    const mark = (cx, cy, lab, dx, dy) => {
      const ref = refOf('sec' + lab);
      pointer(d, cx, cy, r, dx, dy);
      AP.refBubble(d, cx, cy, lab, ref ? ref.sheet : '', ts, r);
    };
    // far ends sit beyond the grid bubbles (top/left), near ends just outside the building (bottom/right)
    // (further out when the grid bubbles moved out for jogged grid lines)
    const GG = AP.grids(P), jx = GG.x.length && AP.spreadBubbles(GG.x.map(g => g.v), ts).jog, jy = GG.y.length && AP.spreadBubbles(GG.y.map(g => g.v), ts).jog;
    const far = 45 * ts, farA = far + (jy ? 7 * ts : 0), farB = far + (jx ? 7 * ts : 0), near = (P.settings.dimOpenings !== false ? 17 : 7) * ts, stub = 4 * ts; // clear of the door & window string
    const ya = cut.A;
    d.line(bb.x0 - farA + r, ya, bb.x0 - farA + r + stub, ya, s); d.line(bb.x1 + 1.5 * ts, ya, bb.x1 + near - r, ya, s);
    mark(bb.x0 - farA, ya, 'A', 0, -1); mark(bb.x1 + near, ya, 'A', 0, -1);
    const xb = cut.B;
    d.line(xb, bb.y0 - farB + r, xb, bb.y0 - farB + r + stub, s); d.line(xb, bb.y1 + 1.5 * ts, xb, bb.y1 + near - r, s);
    mark(xb, bb.y0 - farB, 'B', 1, 0); mark(xb, bb.y1 + near, 'B', 1, 0);
  }
  function northArrow(d, P, ts) {
    const bb = AP.projectBBox(P), R = AP.roofsExtent(P);
    const x1 = R && R.oh ? Math.max(bb.x1, R.x1) : bb.x1, y0 = R && R.oh ? Math.min(bb.y0, R.y0) : bb.y0;
    const cx = x1 + 14 * ts, cy = y0 - 20 * ts, r = 5 * ts;
    // true north: the building is turned on the lot to face the road (Lot / Site), so north turns with it
    const n = AP.northVec(P), ca = -n[1], sa = n[0];
    const Q = (lx, ly) => [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca];
    d.circle(cx, cy, r, st(ts, LW.thin));
    d.poly([Q(0, -r * 1.2), Q(r * 0.45, r * 0.6), Q(0, r * 0.25), Q(-r * 0.45, r * 0.6)], true, { fill: '#000000', stroke: 'none' });
    const t = Q(0, -r * 1.75);
    d.text(t[0], t[1], 'N', 3.2 * ts, { anchor: 'middle', v: 'middle', bold: true });
  }
  // which way true north points on the floor plans (unit vector, Y down): straight up unless the building is turned on the lot
  AP.northVec = function (P) {
    let SP = null; try { SP = AP.sitePlacement && AP.sitePlacement(P); } catch (e) { /* no lot */ }
    if (!SP) return [0, -1];
    return [-Math.sin(SP.ang), -Math.cos(SP.ang)];
  };

  /* ---------- ROOF PLAN ---------- */
  AP.renderRoofPlan = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), RL = AP.roofs(P);
    if (!RL.length) return d;
    const E = AP.roofsExtent(P), notes = [];
    RL.slice().sort((a, b) => a.level - b.level).forEach(R => drawRoofOne(d, P, R, ts, notes, RL.length > 1));
    AP.drawRoofWalls(d, P, ts, null);
    notes.forEach((t, i) => d.text((E.x0 + E.x1) / 2, E.y1 + (5 + 3.5 * i) * ts, t, (i ? 1.8 : 2) * ts, { anchor: 'middle' }));
    AP.drawGrids(d, P, ts, { overhang: true, roofDims: true });
    return d;
  };
  // walls standing on the roof beams, hatched, with their height
  AP.drawRoofWalls = function (d, P, ts, selId) {
    for (const w of AP.roofWalls(P)) {
      const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b), h = w.t / 2, me = w.id === selId;
      const pts = w.o === 'h' ? [[a, w.c - h], [b, w.c - h], [b, w.c + h], [a, w.c + h]] : [[w.c - h, a], [w.c + h, a], [w.c + h, b], [w.c - h, b]];
      d.poly(pts, true, { fill: me ? 'rgba(22,119,255,0.5)' : w.mat ? AP.wallMat(w.mat).fill : '#9a9a9a', stroke: me ? '#1677ff' : '#000000', w: LW.thin * ts, layer: 'WALLS' });
      if (b - a > 1) {
        const m = AP.wallPt(w.o, w.c, (a + b) / 2), vert = w.o === 'v';
        d.text(m[0] + (vert ? h + 2.2 * ts : 0), m[1] - (vert ? 0 : h + 0.8 * ts), (w.mat && w.mat !== 'chb' ? AP.wallMat(w.mat).short + ' ' : '') + 'WALL H=' + AP.mm(w.h), 1.6 * ts, { anchor: 'middle', rot: vert ? -90 : 0, layer: 'TEXT' });
      }
    }
  };
  AP.ROOF_NAME = { hip: 'HIP ROOF', gable: 'GABLE ROOF', dutch: 'DUTCH GABLE ROOF', kubo: 'STEEP HIP ROOF', shed: 'SHED ROOF', clerestory: 'DOUBLE SHED ROOF (OPPOSITE SLOPES)', doubleshed: 'DOUBLE SHED ROOF', butterfly: 'BUTTERFLY ROOF', parapet: 'BOX ROOF', flat: 'R.C. ROOF DECK' };
  function drawRoofOne(d0, P, R, ts, notes, many) {
    const s = st(ts, LW.med, { layer: 'ROOF' }), sf = st(ts, LW.fine, { layer: 'ROOF', stroke: '#777777' });
    const { X0, X1, Y0, Y1 } = R;
    // an outline roof (L, T, U ...): drawn as a box roof, then cut to its outline
    const d = R.poly ? new AP.Drawing() : d0;
    if (R.poly) d0.poly(R.poly, true, Object.assign({ fill: '#ffffff' }, s)); else d.rect2(X0, Y0, X1, Y1, Object.assign({ fill: '#ffffff' }, s));
    const top = R.b;
    const addNote = t => { if (notes.indexOf(t) < 0) notes.push(t); };
    // local axes: a along the ridge (long side), c across it
    const { A0, A1, C0, C1, cm } = R, half = (C1 - C0) / 2, am = (A0 + A1) / 2;
    const L = (a, c) => (R.ridgeX ? [a, c] : [c, a]);
    const ln = (a1, c1, a2, c2, sty) => d.lineP(L(a1, c1), L(a2, c2), sty || s);
    const arw = (a, c, da, dc) => { const p = L(a, c), v = R.ridgeX ? [da, dc] : [dc, da]; arrow(d, p[0], p[1], v[0], v[1], ts); };
    const ribs = (a0, a1, c0, c1) => { for (let a = a0 + 0.2; a < a1; a += 0.25) ln(a, c0, a, c1, sf); };
    // ribs of one roof plane: poly in (a, c); along 'c' = lines of constant a (planes sloping across the ridge), 'a' = end planes
    const ribsIn = (poly, along) => {
      const I = along === 'c' ? 0 : 1, J = 1 - I, lo = Math.min(...poly.map(p => p[I])), hi = Math.max(...poly.map(p => p[I]));
      for (let v = lo + 0.125; v < hi; v += 0.25) {
        const xs = [];
        poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; if ((p[I] <= v) !== (q[I] <= v)) xs.push(p[J] + (v - p[I]) / (q[I] - p[I]) * (q[J] - p[J])); });
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) { if (I === 0) ln(v, xs[i], v, xs[i + 1], sf); else ln(xs[i], v, xs[i + 1], v, sf); }
      }
    };
    const note = t => addNote(t);
    const dash = st(ts, LW.med, { layer: 'ROOF', dash: [2 * ts, 1 * ts] });
    if (R.box) {
      const t = P.settings.extWall;
      if (R.poly) { d0.poly(R.wpoly, true, st(ts, LW.thin, { layer: 'ROOF' })); }
      else {
        d.rect2(top.x0 - t / 2, top.y0 - t / 2, top.x1 + t / 2, top.y1 + t / 2, s);
        d.rect2(top.x0 + t / 2, top.y0 + t / 2, top.x1 - t / 2, top.y1 - t / 2, s);
      }
      const c = [(X0 + X1) / 2, (Y0 + Y1) / 2];
      if (R.type === 'flat') {
        d.text(c[0], c[1], 'R.C. ROOF DECK', 2.6 * ts, { anchor: 'middle', v: 'middle', bold: true });
        d.text(c[0], c[1] + 4 * ts, 'SLOPE 1% TO ROOF DRAIN', 2 * ts, { anchor: 'middle', v: 'middle' });
      } else {
        const ia0 = (R.ridgeX ? top.x0 : top.y0) + t / 2, ia1 = (R.ridgeX ? top.x1 : top.y1) - t / 2;
        const ic0 = (R.ridgeX ? top.y0 : top.x0) + t / 2, ic1 = (R.ridgeX ? top.y1 : top.x1) - t / 2;
        for (let cc = ic0 + 0.2; cc < ic1; cc += 0.25) ln(ia0, cc, ia1, cc, sf);
        arw(am, cm, 1, 0);
        d.text(c[0], c[1] + 5 * ts, 'LONG SPAN ROOFING @ 5% SLOPE', 2.2 * ts, { anchor: 'middle', bold: true });
        d.text(c[0], c[1] + 8.5 * ts, 'CONCEALED BEHIND PARAPET, BOX GUTTER', 2 * ts, { anchor: 'middle' });
      }
    } else if (R.parts) {
      // ridges, hips and valleys where the roof planes meet, a slope arrow on every plane
      const cr = AP.roofCreases(R);
      for (const r of cr.ribs || []) d0.lineP(r[0], r[1], sf);
      for (const ln of cr.lines) d0.lineP(ln[0], ln[1], s);
      for (const f of cr.facets) if (f.n > 1.2) arrow(d0, f.c[0], f.c[1], f.dn[0], f.dn[1], ts);
      note(R.type === 'kubo' ? 'PRE-PAINTED LONG SPAN ROOFING / CLAY-LOOK TILE SPAN, STEEP PITCH' : 'PRE-PAINTED LONG SPAN G.I. ROOFING SHEET GA. 26');
      if (AP.drawGutters(d0, R, ts)) addNote('GUTTER: 150mm PRE-PAINTED G.I. GA. 24 W/ 75mm\u00d8 uPVC DOWNSPOUTS (DS)');
    } else {
      switch (R.type) {
        case 'shed':
          ribs(A0, A1, C0, C1); arw(am, cm, 0, R.fs); break;
        case 'gable':
          ln(A0, cm, A1, cm); ribs(A0, A1, C0, C1); arw(am, C0 + half / 2, 0, -1); arw(am, C1 - half / 2, 0, 1); break;
        case 'clerestory':
          ribs(A0, A1, C0, C1); ln(A0, cm, A1, cm); ln(A0 + R.oh, cm + 0.08, A1 - R.oh, cm + 0.08, dash);
          arw(am, C0 + half / 2, 0, -1); arw(am, C1 - half / 2, 0, 1);
          { const p = L(am, cm); d.text(p[0], p[1] - 1.5 * ts, 'CLERESTORY WINDOWS', 1.8 * ts, { anchor: 'middle', bold: true, rot: R.ridgeX ? 0 : -90 }); }
          break;
        case 'doubleshed':
          ribs(A0, A1, C0, C1); ln(A0, cm, A1, cm); ln(A0 + R.oh, cm + 0.08, A1 - R.oh, cm + 0.08, dash);
          arw(am, C0 + half / 2, 0, R.fs); arw(am, C1 - half / 2, 0, R.fs);
          { const hi = R.fs > 0 ? C0 + half / 2 : C1 - half / 2, lo = C0 + C1 - hi;
            const p = L(am, hi), q = L(am, lo), rr = R.ridgeX ? 0 : -90;
            d.text(p[0] + (R.ridgeX ? 0 : -2 * ts), p[1] - (R.ridgeX ? 2 * ts : 0), 'HIGH ROOF', 1.8 * ts, { anchor: 'middle', bold: true, rot: rr });
            d.text(q[0] + (R.ridgeX ? 0 : -2 * ts), q[1] - (R.ridgeX ? 2 * ts : 0), 'LOW ROOF', 1.8 * ts, { anchor: 'middle', bold: true, rot: rr });
            const c = L(am, cm); d.text(c[0], c[1] - 1.5 * ts, 'CLERESTORY WINDOWS', 1.6 * ts, { anchor: 'middle', rot: rr }); }
          break;
        case 'butterfly':
          ribs(A0, A1, C0, C1); ln(A0, cm, A1, cm, dash);
          arw(am, C0 + half / 2, 0, 1); arw(am, C1 - half / 2, 0, -1);
          { const p = L(am, cm); d.text(p[0], p[1] - 1.5 * ts, 'VALLEY GUTTER', 1.8 * ts, { anchor: 'middle', bold: true, rot: R.ridgeX ? 0 : -90 }); }
          break;
        case 'dutch': {
          const k = R.d0;
          ribsIn([[A0, C0], [A1, C0], [A1 - k, C0 + k], [A1 - k, cm], [A0 + k, cm], [A0 + k, C0 + k]], 'c');
          ribsIn([[A0, C1], [A1, C1], [A1 - k, C1 - k], [A1 - k, cm], [A0 + k, cm], [A0 + k, C1 - k]], 'c');
          ribsIn([[A0, C0], [A0 + k, C0 + k], [A0 + k, C1 - k], [A0, C1]], 'a');
          ribsIn([[A1, C0], [A1 - k, C0 + k], [A1 - k, C1 - k], [A1, C1]], 'a');
          for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) ln(a, c, a === A0 ? A0 + k : A1 - k, c === C0 ? C0 + k : C1 - k);
          ln(A0 + k, C0 + k, A0 + k, C1 - k); ln(A1 - k, C0 + k, A1 - k, C1 - k);
          ln(A0 + k, cm, A1 - k, cm);
          arw(am, C0 + half / 2, 0, -1); arw(am, C1 - half / 2, 0, 1); arw(A0 + k / 2, cm, -1, 0); arw(A1 - k / 2, cm, 1, 0);
          break;
        }
        default: { // hip, steep hip
          const h = Math.min(half, (A1 - A0) / 2);
          ribsIn([[A0, C0], [A1, C0], [A1 - h, cm], [A0 + h, cm]], 'c'); ribsIn([[A0, C1], [A1, C1], [A1 - h, cm], [A0 + h, cm]], 'c');
          ribsIn([[A0, C0], [A0 + h, cm], [A0, C1]], 'a'); ribsIn([[A1, C0], [A1 - h, cm], [A1, C1]], 'a');
          for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) ln(a, c, a === A0 ? A0 + h : A1 - h, cm);
          ln(A0 + h, cm, A1 - h, cm);
          arw(am, C0 + h / 2, 0, -1); arw(am, C1 - h / 2, 0, 1); arw(A0 + h / 2, cm, -1, 0); arw(A1 - h / 2, cm, 1, 0);
        }
      }
      note(R.type === 'kubo' ? 'PRE-PAINTED LONG SPAN ROOFING / CLAY-LOOK TILE SPAN, STEEP PITCH' : 'PRE-PAINTED LONG SPAN G.I. ROOFING SHEET GA. 26');
      if (AP.drawGutters(d0, R, ts)) addNote('GUTTER: 150mm PRE-PAINTED G.I. GA. 24 W/ 75mm\u00d8 uPVC DOWNSPOUTS (DS)');
    }
    // name, overall size (eave to eave) and slope of each roof
    const c = [(X0 + X1) / 2, (Y0 + Y1) / 2], k = Math.max(0.6, Math.min(1, (X1 - X0) / 16 / ts));
    const size = AP.mm(X1 - X0) + ' x ' + AP.mm(Y1 - Y0) + (R.box ? '' : ' · SLOPE ' + Math.round(Math.atan(R.pitch) * 180 / Math.PI) + '°');
    const lab = many ? (AP.ROOF_NAME[R.type] || 'ROOF') + (R.level < AP.topFloorIndex(P) ? ' (LOWER)' : '') : null;
    const yb = R.box ? c[1] + 8 * ts : c[1] + 3.2 * ts * k;
    if (lab) d.text(c[0], yb, lab, 1.8 * ts * k, { anchor: 'middle', bold: true });
    d.text(c[0], yb + (lab ? 2.6 : 0) * ts * k, size, 1.6 * ts * k, { anchor: 'middle' });
    if (R.poly) d0.append(d.clipTo((x, y) => R.inside(x, y)));
  }
  // gutter strip outside each eave (or along the valley) + downspouts at the ends
  AP.drawGutters = function (d, R, ts) {
    const E = AP.roofEaves(R); if (!E.length) return false;
    const g = AP.GUTTER_W, s = st(ts, LW.thin, { layer: 'ROOF', fill: '#ffffff' }), ds = st(ts, LW.thin, { layer: 'ROOF', fill: '#ffffff', stroke: '#2b6a2b' });
    const seen = [];
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    // the eave that meets this one at corner p (its gutter turns the corner with this one)
    const nextAt = (e, p) => E.find(f => f !== e && !f.valley && !e.valley && (same(f.p0, p) || same(f.p1, p)));
    for (const e of E) {
      const o = e.valley ? -g / 2 : 0, n = e.n;
      const q = (p, k) => [p[0] + n[0] * k, p[1] + n[1] * k];
      // outer edge runs to the mitred corner where two gutters meet, so the gutter is continuous
      const outer = p => { const f = nextAt(e, p); return f ? [p[0] + (n[0] + f.n[0]) * g, p[1] + (n[1] + f.n[1]) * g] : q(p, o + g); };
      d.poly([q(e.p0, o), q(e.p1, o), outer(e.p1), outer(e.p0)], true, s);
      for (const p of [e.p0, e.p1]) { // downspout in the corner of the gutter (or just inside a gable end)
        const t = [e.p1[0] - e.p0[0], e.p1[1] - e.p0[1]], L = Math.hypot(t[0], t[1]) || 1, sg = p === e.p0 ? 1 : -1, f = nextAt(e, p);
        const c = f ? [p[0] + (n[0] + f.n[0]) * g / 2, p[1] + (n[1] + f.n[1]) * g / 2] : q([p[0] + t[0] / L * sg * 0.2, p[1] + t[1] / L * sg * 0.2], o + g / 2);
        if (seen.some(z => Math.hypot(z[0] - c[0], z[1] - c[1]) < 0.4)) continue;
        seen.push(c);
        d.circle(c[0], c[1], 0.05, ds);
        d.text(c[0] + n[0] * (g + 1.2 * ts) + 0.8 * ts, c[1] + n[1] * (g + 1.2 * ts) + 0.6 * ts, 'DS', 1.5 * ts, { bold: true, anchor: n[0] < 0 ? 'end' : 'start' });
      }
    }
    return true;
  };
  function arrow(d, x, y, dx, dy, ts) {
    // a hollow block arrow down the slope: shaft + head, white inside so the ribs stop at it
    const L = 7 * ts, hl = 2.8 * ts, hw = 2.1 * ts, sw = 0.8 * ts, nx = -dy, ny = dx;
    const P = (a, b) => [x + dx * a + nx * b, y + dy * a + ny * b];
    d.poly([P(-L / 2, -sw), P(L / 2 - hl, -sw), P(L / 2 - hl, -hw), P(L / 2, 0), P(L / 2 - hl, hw), P(L / 2 - hl, sw), P(-L / 2, sw)], true,
      { fill: '#ffffff', stroke: '#000000', w: LW.med * ts, layer: 'ROOF' });
  }

  /* ---------- roofs drawn over the floor plan while editing them ---------- */
  AP.drawRoofEdit = function (d, P, fi, ts, selId) {
    const L = AP.roofs(P), specs = AP.roofSpecs(P);
    L.sort((a, b) => (a.level === fi) - (b.level === fi) || (a.id === selId) - (b.id === selId));
    for (const R of L) {
      const on = R.level === fi, me = R.id === selId, col = me ? '#1677ff' : on ? '#a3402e' : '#9a9a9a';
      const s = { stroke: col, w: (me ? 0.9 : 0.6) * ts, layer: 'ROOFEDIT' };
      const fillS = Object.assign({ fill: on ? (me ? 'rgba(22,119,255,0.16)' : 'rgba(163,64,46,0.16)') : 'none' }, s, on ? {} : { dash: [2 * ts, 1 * ts] });
      if (R.poly) d.poly(R.poly, true, fillS); else d.rect2(R.X0, R.Y0, R.X1, R.Y1, fillS);
      const t = P.settings.extWall / 2, wl = { stroke: col, w: 0.3 * ts, dash: [1 * ts, 0.8 * ts], layer: 'ROOFEDIT' };
      if (R.oh > 0) { if (R.fpoly) d.poly(R.fpoly, true, wl); else d.rect2(R.b.x0 - t, R.b.y0 - t, R.b.x1 + t, R.b.y1 + t, wl); }
      if (!R.box) for (const ln of AP.roofLines(R).slice(R.nOut || 4)) d.poly(ln, false, { stroke: col, w: 0.35 * ts, layer: 'ROOFEDIT' });
      // slope arrow on mono-slope roofs (down hill)
      if (R.type === 'shed' || R.type === 'doubleshed') {
        const am = (R.A0 + R.A1) / 2, c0 = R.cm - R.fs * (R.C1 - R.C0) * 0.15, c1 = R.cm + R.fs * (R.C1 - R.C0) * 0.15;
        const p = R.ridgeX ? [am, c0] : [c0, am], q = R.ridgeX ? [am, c1] : [c1, am], v = [q[0] - p[0], q[1] - p[1]], n = Math.hypot(v[0], v[1]) || 1, u = [v[0] / n, v[1] / n], h = 1.6 * ts;
        d.lineP(p, q, { stroke: col, w: 0.4 * ts, layer: 'ROOFEDIT' });
        d.poly([q, [q[0] - u[0] * h - u[1] * h * 0.6, q[1] - u[1] * h + u[0] * h * 0.6], [q[0] - u[0] * h + u[1] * h * 0.6, q[1] - u[1] * h - u[0] * h * 0.6]], true, { fill: col, stroke: 'none', layer: 'ROOFEDIT' });
      }
      // roof dimensions: overhang + wall to wall + overhang, and the overall eave to eave, on top and left
      if (on) {
        const t2 = P.settings.extWall / 2, xs = R.oh > 0 ? [R.X0, R.b.x0 - t2, R.b.x1 + t2, R.X1] : [R.X0, R.X1], ys = R.oh > 0 ? [R.Y0, R.b.y0 - t2, R.b.y1 + t2, R.Y1] : [R.Y0, R.Y1];
        AP.dimChain(d, xs, R.Y0 - 5 * ts, 'h', ts); AP.dimChain(d, ys, R.X0 - 5 * ts, 'v', ts);
        if (R.oh > 0) { AP.dimChain(d, [R.X0, R.X1], R.Y0 - 11 * ts, 'h', ts); AP.dimChain(d, [R.Y0, R.Y1], R.X0 - 11 * ts, 'v', ts); }
      }
      const n = specs.findIndex(q => q.id === R.id) + 1, c = [(R.X0 + R.X1) / 2, (R.Y0 + R.Y1) / 2];
      const t1 = 'ROOF ' + n + ' · ' + (AP.ROOF_NAME[R.type] || 'ROOF'), t2 = 'ON ' + (P.floors[R.level] ? P.floors[R.level].name.toUpperCase() : '') + (R.sp.poly ? ' · SKETCHED OUTLINE' : R.sp.fit || R.sp.x0 == null ? ' · FOLLOWS WALLS' : '');
      const h = Math.min(2.4 * ts, (R.X1 - R.X0) * 0.9 / Math.max(AP.textWidth(t1, 1, true), AP.textWidth(t2, 0.8, false)));
      d.text(c[0], c[1] - 0.2 * h, t1, h, { anchor: 'middle', bold: true, fill: col, layer: 'ROOFEDIT' });
      d.text(c[0], c[1] + 1.1 * h, t2, h * 0.8, { anchor: 'middle', fill: col, layer: 'ROOFEDIT' });
    }
  };

  /* ---------- FOUNDATION PLAN ---------- */
  AP.renderFoundation = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings;
    const fl = P.floors[0];
    const C = AP.columns(P);
    const walls = AP.computeWalls(fl, S);
    const dash = st(ts, LW.thin, { dash: [2 * ts, 1 * ts], layer: 'FOOTING' });
    for (const w of walls) if (w.t) {
      const h = 0.30, a = w.a - w.ea, b = w.b + w.eb;
      if (w.o === 'h') { d.line(a, w.c - h, b, w.c - h, dash); d.line(a, w.c + h, b, w.c + h, dash); }
      else { d.line(w.c - h, a, w.c - h, b, dash); d.line(w.c + h, a, w.c + h, b, dash); }
      wallRect(d, w, { fill: 'none', stroke: '#444444', w: LW.thin * ts, layer: 'WALLS' });
      const m = (w.a + w.b) / 2, p = AP.wallPt(w.o, w.c, m);
      if (w.b - w.a > 1.2) d.text(p[0] + (w.o === 'v' ? 0.45 : 0), p[1] - (w.o === 'h' ? 0.38 : 0), 'WF', 1.8 * ts, { anchor: 'middle', v: 'middle', layer: 'FOOTING' });
    }
    for (const b of AP.beams(P, 0)) AP.drawBeam(d, b, ts, st(ts, LW.thin, { layer: 'FOOTING', fill: '#ffffff' }), true); // tie beams
    for (const c of C.cols) {
      const f = c.foot;
      d.rect(c.x - f / 2, c.y - f / 2, f, f, st(ts, LW.thin, { fill: '#efefef', layer: 'FOOTING' }));
      AP.drawColumn(d, c, { fill: '#111111', stroke: 'none', layer: 'COLUMNS' });
      d.text(c.x + f / 2 + 0.05, c.y + f / 2 + 2.6 * ts, c.fmark + c.mark, 2.0 * ts, { layer: 'TEXT' });
    }
    const big = fl.rooms.filter(r => !AP.isOpen(r)).sort((p, q) => q.w * q.l - p.w * p.l)[0];
    if (big) {
      const cx = big.x + big.w / 2, cy = big.y + big.l / 2;
      d.text(cx, cy, '100mm THK. CONCRETE SLAB ON GRADE', 2 * ts, { anchor: 'middle' });
      d.text(cx, cy + 3 * ts, 'W/ 10mm DIA. BARS @ 400mm O.C. B/W', 2 * ts, { anchor: 'middle' });
    }
    const fref = refOf('footing'), c0 = C.cols.slice().sort((p, q) => p.y - q.y || p.x - q.x)[0];
    if (fref && c0) {
      const bx = c0.x - c0.foot / 2 - 7 * ts, by = c0.y - c0.foot / 2 - 7 * ts;
      d.line(c0.x - c0.foot / 2, c0.y - c0.foot / 2, bx + 2.6 * ts, by + 2.6 * ts, st(ts, LW.thin, { layer: 'TEXT' }));
      AP.refBubble(d, bx, by, fref.num, fref.sheet, ts, 3.6 * ts);
      d.text(bx, by + 6 * ts, 'TYP.', 1.8 * ts, { anchor: 'middle' });
    }
    AP.drawGrids(d, P, ts, {});
    return d;
  };

  /* ---------- ROOF FRAMING PLAN: steel trusses, purlins, ridge / hips ---------- */
  AP.trussSpacing = R => { const L = R.A1 - R.A0 - 2 * R.oh; return L / Math.max(1, Math.ceil(L / AP.trussMax(R) - 1e-9)); }; // max 1.0 m o.c. (or the roof's own)
  AP.renderRoofFraming = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings, RL = AP.roofs(P);
    if (!RL.length) return d;
    const E = AP.roofsExtent(P), main = AP.mainPitched(P);
    let nTot = 0, hasG = false;
    const kinds = {}; // T-1 / HT-1: how many, spacing, max. spacing
    for (const R of RL.slice().sort((a, b) => a.level - b.level)) {
      const r = framingOne(d, P, R, ts, main && R.id === main.id);
      nTot += r.n; hasG = hasG || r.hasG;
      if (r.n) for (const [k, c] of Object.entries(r.marks || {})) { const q = kinds[k] || (kinds[k] = { n: 0, sp: 0, mx: 0, mat: AP.trussMembers(R.tt).mat }); q.n += c; q.sp = Math.max(q.sp, r.sp); q.mx = Math.max(q.mx, AP.trussMax(R)); }
    }
    // trusses placed by hand (Roof › Trusses)
    for (const tl of AP.placedTrusses(P)) {
      const T = AP.trussType(P, tl.type), k = AP.trussMarkOf(P, tl);
      AP.drawPlacedTruss(d, tl, T, ts, st(ts, LW.thick, { layer: 'ROOF' }), null, k);
      const q = kinds[k] || (kinds[k] = { n: 0, sp: 0, mx: 0, mat: AP.trussMembers(T).mat, placed: true }); q.n++; nTot++;
    }
    d.trussKinds = kinds; // for the TRUSS SCHEDULE (AP.trussSchedule)
    // under the plan: the framing notes; the trusses themselves are in the TRUSS SCHEDULE beside the column schedule
    if (nTot) {
      const nt = ['TRUSSES: SEE TRUSS SCHEDULE & DETAILS. HALF TRUSSES ON THE HIPS', 'PURLINS: C 2"x4" GA.16 @ 600 O.C., PARALLEL TO THE EAVES', 'RIDGE PURLIN: 2 - C 2"x4" GA.16 W/ RIDGE ROLL', 'HIPS / VALLEYS: SHOWN DASHED' + (hasG ? '. GUTTERS ON FASCIA' : '')];
      nt.forEach((t, i) => d.text((E.x0 + E.x1) / 2, E.y1 + (5 + 3 * i) * ts, (i + 1) + '. ' + t, 1.9 * ts, { anchor: 'middle' }));
    }

    AP.drawGrids(d, P, ts, { overhang: true });
    return d;
  };
  // TRUSS SCHEDULE: one row per truss detail (FT-1, FT-2 … then HT-1 …) with span, height, spacing, quantity, detail
  AP.trussSchedule = function (P) {
    const kinds = (AP.renderRoofFraming(P, { ts: 0.1 }).trussKinds) || {};
    if (!Object.keys(kinds).length) return null;
    {
      const TD = AP.trussDetails(P), Q = Object.entries(kinds).map(([k, q]) => ({ k, q, e: TD.find(t => t.mark === k), i: TD.findIndex(t => t.mark === k) }));
      Q.sort((a, b) => (a.k[0] === 'H') - (b.k[0] === 'H') || parseInt(a.k.slice(3), 10) - parseInt(b.k.slice(3), 10));
      const mats = [...new Set(Q.map(r => r.q.mat))], mixed = mats.length > 1, u = AP.unitSuf();
      const cols = [{ h: 'MARK', w: 13 }, { h: 'TRUSS', w: 13 }, { h: 'SPAN (' + u + ')', w: 17 }, { h: 'HEIGHT (' + u + ')', w: 17 }, ...(mixed ? [{ h: 'MATERIAL', w: 34 }] : []), { h: 'SPACING', w: 22 }, { h: 'QTY', w: 10 }, { h: 'DETAIL', w: 15 }];
      const rows = Q.map(({ k, q, e, i }) => {
        const ref = i < 0 ? null : refOf(i ? 'truss' + k : 'truss');
        return [k, k[0] === 'H' ? 'HALF' : 'FULL', e ? AP.mm(e.span) : '-', e ? AP.mm(e.H) : '-', ...(mixed ? [q.mat] : []), q.sp ? AP.len(q.sp) + ' O.C.' : 'AS SHOWN', q.n, ref ? ref.num + ' / ' + ref.sheet : '-'];
      });
      const mx = Math.max(...Q.map(r => r.q.mx));
      return { cols, rows, notes: [...(mixed ? [] : ['TRUSSES: ' + mats[0]]), 'MAX. TRUSS SPACING: ' + AP.len(mx) + ' O.C.'] };
    }
  };
  /* ---------- automatic roof framing of a pitched roof ----------
   * full trusses across each wing from one end of the ridge to the other; in a hip end a half truss on every hip
   * line, from the end of the ridge down to the corner; the ridge purlin along the ridge; purlins @ 600 o.c.
   * parallel to the eave of every roof face (contour lines of the roof: they turn at the hips and valleys).
   * Returns { full: [{p, q, span}], half: [{p, q, span, pitch, kind: 'hip'}] (p = high end), ridge: [[p, q]], purl, sp, HT } */
  AP.roofFraming = function (P, R, opt) {
    opt = opt || {};
    const S = P.settings, t = S.extWall / 2, e = t + R.oh, out = { full: [], half: [], purl: [], ridge: [], sp: 0 };
    out.HT = AP.trussTypes(P).find(q => q.kind === 'half') || Object.assign({}, R.tt, { id: R.tt.id + '-H', mark: 'HT', kind: 'half' });
    if (R.type === 'flat') return out;
    const mx = AP.trussMax(R), hipped = !R.box;
    const wings = R.poly && R.wings ? R.wings.map(w => ({ w, rx: R.parts ? w.ridgeX : R.ridgeX })) : [{ w: R.b, rx: R.ridgeX }];
    if (R.sp.autoTruss !== false) for (const { w, rx } of wings) {
      const A = (a, c) => (rx ? [a, c] : [c, a]);
      let a0 = rx ? w.x0 : w.y0, a1 = rx ? w.x1 : w.y1;
      if (!R.poly) { a0 = R.A0 + R.oh + t; a1 = R.A1 - R.oh - t; }
      const cw0 = rx ? w.y0 : w.x0, cw1 = rx ? w.y1 : w.x1, c0 = cw0 - e, c1 = cw1 + e, cm = (cw0 + cw1) / 2, hw = (cw1 - cw0) / 2;
      const span = cw1 - cw0 + 2 * t, Z = (a, c) => { const p = A(a, c); return R.z(p[0], p[1]); };
      // a hip end face here: the roof slopes down along the ridge axis (both sides of the ridge)
      const endFace = a => [cm - 0.08 * hw, cm + 0.08 * hw].every(c => {
        const h = 0.02, ga = (Z(a + h, c) - Z(a - h, c)) / (2 * h), gc = (Z(a, c + h) - Z(a, c - h)) / (2 * h);
        return Math.abs(ga) > Math.abs(gc) + 1e-4;
      });
      const eaveEnd = (a, dir) => { const p = A(a + dir * (e + 0.3), cm); return !R.inside(p[0], p[1]); };
      let g0 = a0, g1 = a1;
      if (hipped && eaveEnd(a0, -1)) { while (g0 < a1 && endFace(g0 + 0.05)) g0 += 0.05; }
      if (hipped && eaveEnd(a1, 1)) { while (g1 > g0 && endFace(g1 - 0.05)) g1 -= 0.05; }
      if (g1 < g0) g1 = g0;
      // full trusses: girder to girder (the whole wing when it has no hip ends)
      const L = g1 - g0, n = L < 0.05 ? 0 : Math.max(1, Math.ceil(L / mx - 1e-9)), sp = n ? L / n : 0;
      for (let i = 0; i <= n; i++) { const a = g0 + i * sp; out.full.push({ p: A(a, c0), q: A(a, c1), span, a }); }
      if (!out.sp) out.sp = sp || mx;
      // hip ends: a half truss on each hip line, from the end of the ridge down to the corner
      const pitch = R.pitch || 0.3;
      // the ridge purlin: along the ridge, from end to end (to the gable eaves on a gable roof)
      if (!R.box && R.type !== 'shed') {
        const ra = Math.abs(g0 - a0) < 0.1 && eaveEnd(a0, -1) ? a0 - e : g0, rb = Math.abs(g1 - a1) < 0.1 && eaveEnd(a1, 1) ? a1 + e : g1;
        if (rb - ra > 0.05) out.ridge.push([A(ra, cm), A(rb, cm)]);
      }
      for (const [g, aw, dir] of [[g0, a0, -1], [g1, a1, 1]]) {
        const D = Math.abs(g - aw); if (D < 0.1) continue;
        for (const [cw, sg] of [[cw0, -1], [cw1, 1]]) {
          const run = Math.hypot(D + t, hw + t), rise = pitch * (hw + t);
          out.half.push({ p: A(g, cm), q: A(aw + dir * e, cw + sg * e), span: run, pitch: rise / run, kind: 'hip' });
        }
      }
    }
    if (opt.purlins === false || R.box) return out;
    // purlins: contour lines of the roof surface (marching squares), merged into straight runs
    const gs = 0.05, nx = Math.ceil((R.X1 - R.X0) / gs), ny = Math.ceil((R.Y1 - R.Y0) / gs), Zs = new Float64Array((nx + 1) * (ny + 1)), In = new Uint8Array((nx + 1) * (ny + 1));
    let zmin = Infinity, zmax = -Infinity;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = Math.min(R.X1, R.X0 + i * gs), y = Math.min(R.Y1, R.Y0 + j * gs), k = j * (nx + 1) + i;
      In[k] = R.inside(x, y) ? 1 : 0;
      if (In[k]) { Zs[k] = R.z(x, y); zmin = Math.min(zmin, Zs[k]); zmax = Math.max(zmax, Zs[k]); }
    }
    const pitch = R.pitch || 0.3, levels = [];
    for (let z = zmin + pitch * 0.15; z < zmax - 1e-4; z += pitch * 0.6) levels.push(z);
    const H = new Map(), V = new Map(), diag = [];
    const put = (m, key, u0, u1) => { if (!m.has(key)) m.set(key, []); m.get(key).push([Math.min(u0, u1), Math.max(u0, u1)]); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k00 = j * (nx + 1) + i, k10 = k00 + 1, k01 = k00 + nx + 1, k11 = k01 + 1;
      if (!(In[k00] && In[k10] && In[k01] && In[k11])) continue;
      const x0 = R.X0 + i * gs, y0 = R.Y0 + j * gs, z = [Zs[k00], Zs[k10], Zs[k11], Zs[k01]];
      const lo = Math.min(...z), hi = Math.max(...z);
      const P4 = [[x0, y0], [x0 + gs, y0], [x0 + gs, y0 + gs], [x0, y0 + gs]];
      for (const lv of levels) {
        if (lv < lo || lv > hi) continue;
        const pts = [];
        for (let s = 0; s < 4; s++) {
          const za = z[s], zb = z[(s + 1) % 4];
          if ((za < lv) !== (zb < lv)) { const f = (lv - za) / (zb - za), pa = P4[s], pb = P4[(s + 1) % 4]; pts.push([pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f]); }
        }
        for (let s = 0; s + 1 < pts.length; s += 2) {
          const [p, q] = [pts[s], pts[s + 1]];
          if (Math.abs(p[1] - q[1]) < 1e-6) put(H, Math.round(p[1] * 1000), p[0], q[0]);
          else if (Math.abs(p[0] - q[0]) < 1e-6) put(V, Math.round(p[0] * 1000), p[1], q[1]);
          else diag.push([p, q]);
        }
      }
    }
    const merge = (m, mk) => { for (const [key, iv] of m) { iv.sort((a, b) => a[0] - b[0]); let cur = iv[0].slice(); for (const r of iv.slice(1)) { if (r[0] <= cur[1] + 1e-4) cur[1] = Math.max(cur[1], r[1]); else { out.purl.push(mk(key / 1000, cur)); cur = r.slice(); } } out.purl.push(mk(key / 1000, cur)); } };
    merge(H, (y, u) => [[u[0], y], [u[1], y]]); merge(V, (x, u) => [[x, u[0]], [x, u[1]]]);
    out.purl.push(...diag);
    return out;
  };
  // one truss of the automatic framing on the plan (a half truss: a tick at its high end, the post)
  function drawFramingTruss(d, m, sty, half) {
    d.lineP(m.p, m.q, sty);
    if (half) { const dx = m.q[0] - m.p[0], dy = m.q[1] - m.p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.2, ny = dx / L * 0.2; d.line(m.p[0] - nx, m.p[1] - ny, m.p[0] + nx, m.p[1] + ny, sty); }
  }
  // draws a roof's automatic trusses + purlins, labels one truss of each mark; returns { n, sp, marks }
  function framingMembers(d, P, R, ts, ss, clip) {
    const F = AP.roofFraming(P, R), g = new AP.Drawing(), marks = {}, lab = {};
    for (const s of F.purl) g.lineP(s[0], s[1], ss.pu);
    for (const s of F.ridge) g.lineP(s[0], s[1], st(ts, LW.med, { layer: 'ROOF' })); // ridge purlin
    for (const m of F.full) { drawFramingTruss(g, m, ss.tr, false); const k = AP.trussMarkFor(P, R.tt, m.span, R, m); marks[k] = (marks[k] || 0) + 1; (lab[k] = lab[k] || []).push(m); }
    for (const m of F.half) { drawFramingTruss(g, m, ss.tr, m.kind !== 'hip'); const k = AP.trussMarkFor(P, F.HT, m.span, R, m); marks[k] = (marks[k] || 0) + 1; (lab[k] = lab[k] || []).push(m); }
    d.append(clip ? g.clipTo(clip) : g);
    const rl = F.ridge.slice().sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]))[0];
    if (rl) { const vert = Math.abs(rl[1][0] - rl[0][0]) < Math.abs(rl[1][1] - rl[0][1]), x = (rl[0][0] + rl[1][0]) / 2, y = (rl[0][1] + rl[1][1]) / 2; d.text(x + (vert ? -0.15 : 0), y + (vert ? 0 : -0.15), 'RIDGE PURLIN', 1.8 * ts, { anchor: 'middle', layer: 'TEXT', rot: vert ? -90 : 0 }); }
    for (const [k, L] of Object.entries(lab)) {
      const m = L[Math.floor(L.length / 2)], dg = m.kind === 'hip', vert = !dg && Math.abs(m.q[0] - m.p[0]) < Math.abs(m.q[1] - m.p[1]), f = dg ? 0.45 : 0.3;
      const x = m.p[0] + (m.q[0] - m.p[0]) * f, y = m.p[1] + (m.q[1] - m.p[1]) * f;
      d.text(x + (vert ? 0.12 : 0), y - (vert ? 0 : 0.12), k, 2.2 * ts, { bold: true, layer: 'TEXT', rot: vert ? -90 : 0 });
    }
    return { n: F.full.length + F.half.length, sp: F.sp, marks };
  }
  function framingOne(d, P, R, ts, isMain) {
    const S = P.settings;
    const L = (a, c) => (R.ridgeX ? [a, c] : [c, a]);
    const ln = (a1, c1, a2, c2, sty) => d.lineP(L(a1, c1), L(a2, c2), sty);
    const out = st(ts, LW.med, { layer: 'ROOF' }), tr = st(ts, LW.thick, { layer: 'ROOF' });
    const pu = st(ts, LW.fine, { layer: 'ROOF', dash: [2 * ts, 1 * ts] }), hp = st(ts, LW.thin, { layer: 'ROOF', dash: [4 * ts, 1 * ts, 1 * ts, 1 * ts] });
    if (R.poly) return framingPoly(d, P, R, ts, { out, tr, pu, hp });
    d.rect2(R.X0, R.Y0, R.X1, R.Y1, Object.assign({ fill: '#ffffff' }, out));
    const top = R.b, t = S.extWall / 2;
    d.rect2(top.x0 - t, top.y0 - t, top.x1 + t, top.y1 + t, st(ts, LW.fine, { layer: 'WALLS', stroke: '#888888' }));
    if (R.type === 'flat') {
      d.text((R.X0 + R.X1) / 2, (R.Y0 + R.Y1) / 2, 'R.C. ROOF DECK - SEE ROOF BEAM PLAN', 2.4 * ts, { anchor: 'middle', v: 'middle', bold: true });
      return { n: 0, sp: 0, hasG: false };
    }
    // trusses (full + half in the hip ends) and purlins parallel to every eave
    const FM = framingMembers(d, P, R, ts, { tr, pu }, null), n = FM.n, sp = FM.sp;
    if (R.box) for (let c = R.C0 + 0.15; c < R.C1 - 0.05; c += 0.6) ln(R.A0, c, R.A1, c, pu); // behind a parapet: purlins along the slope's width
    // ridge, hips, valleys
    const { C0, C1, cm, A0, A1 } = R, half = (C1 - C0) / 2;
    if (R.type === 'hip' || R.type === 'kubo') {
      const h = Math.min(half, (A1 - A0) / 2);
      for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) ln(a, c, a === A0 ? A0 + h : A1 - h, cm, hp);
      ln(A0 + h, cm, A1 - h, cm, hp);
    } else if (R.type === 'dutch') {
      const k = R.d0;
      for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) ln(a, c, a === A0 ? A0 + k : A1 - k, c === C0 ? C0 + k : C1 - k, hp);
      ln(A0 + k, cm, A1 - k, cm, hp);
    } else if (R.type !== 'shed' && !R.box) ln(A0, cm, A1, cm, hp);
    if (R.box) d.text((R.X0 + R.X1) / 2, (R.Y0 + R.Y1) / 2 + 3 * ts, 'LONG SPAN ROOFING @ 5% BEHIND PARAPET', 1.8 * ts, { anchor: 'middle' });
    void isMain;
    return { n, sp, hasG: AP.drawGutters(d, R, ts), marks: FM.marks };
  }

  // framing of an outline roof: trusses across every wing, purlins, hips / ridges / valleys dashed
  function framingPoly(d, P, R, ts, ss) {
    const S = P.settings, e = S.extWall / 2 + R.oh, inside = (x, y) => R.inside(x, y);
    d.poly(R.poly, true, Object.assign({ fill: '#ffffff' }, ss.out));
    d.poly(R.fpoly, true, st(ts, LW.fine, { layer: 'WALLS', stroke: '#888888' }));
    if (R.type === 'flat') {
      d.text((R.X0 + R.X1) / 2, (R.Y0 + R.Y1) / 2, 'R.C. ROOF DECK - SEE ROOF BEAM PLAN', 2.4 * ts, { anchor: 'middle', v: 'middle', bold: true });
      return { n: 0, sp: 0, hasG: false };
    }
    void e;
    // trusses (full + half in the hip ends) and purlins parallel to every eave, inside the roof outline
    const FM = framingMembers(d, P, R, ts, ss, inside);
    if (R.parts) for (const ln of AP.roofCreases(R).lines) d.lineP(ln[0], ln[1], ss.hp);
    return { n: FM.n, sp: FM.sp, hasG: AP.drawGutters(d, R, ts), marks: FM.marks };
  }

  /* ---------- trusses placed by hand: P.trussLines = [{id, a: [x, y], b: [x, y], type}] (a line across the roof, wall to wall) ---------- */
  AP.placedTrusses = P => (P.trussLines || []).filter(t => t.a && t.b);
  AP.drawPlacedTruss = function (d, tl, T, ts, sty, col, mark) {
    d.lineP(tl.a, tl.b, sty);
    const dx = tl.b[0] - tl.a[0], dy = tl.b[1] - tl.a[1], L = Math.hypot(dx, dy) || 1, vert = Math.abs(dy) > Math.abs(dx);
    // half truss: a short tick at its high end (the post)
    if (T.kind === 'half') { const nx = -dy / L * 0.25, ny = dx / L * 0.25; d.line(tl.a[0] - nx, tl.a[1] - ny, tl.a[0] + nx, tl.a[1] + ny, sty); }
    const m = [tl.a[0] + dx * 0.3, tl.a[1] + dy * 0.3];
    d.text(m[0] + (vert ? 0.12 : 0), m[1] - (vert ? 0 : 0.12), mark || T.mark, 2.0 * ts, { bold: true, layer: 'TEXT', rot: vert ? -90 : 0, fill: col || '#000000' });
  };

  /* ---------- BEAMS per level (Revit-like structural levels) ----------
   * level 0: tie beams (TB) at the ground floor, 1 .. n-1: floor beams (B) under floor i, n: roof beams (RB).
   * Automatic beams run along the wall lines from column to column; the user's edits are in
   * P.beamEd[level] = { del: [key], size: {key: {w, h}}, add: [{id, a, b, w, h}] }. */
  AP.nLevels = P => Math.max(1, AP.topFloorIndex(P) + 1);
  AP.beamKind = (P, lv) => (lv === 0 ? 'TB' : lv >= AP.nLevels(P) ? 'RB' : 'B');
  AP.beamDefault = (P, kind) => {
    const S = P.settings;
    return kind === 'TB' ? { w: 0.20, h: 0.30 } : kind === 'RB' ? { w: 0.20, h: Math.max(0.30, S.beamDepth - 0.1) } : { w: 0.25, h: S.beamDepth };
  };
  const bkey = (a, b) => [a, b].map(p => p.map(v => v.toFixed(3)).join(',')).sort().join('|');
  AP.autoBeams = function (P, lv) {
    const C = AP.columns(P), nF = AP.nLevels(P), fl = P.floors[Math.min(lv, nF - 1)];
    if (!fl || !fl.rooms.length) return [];
    const walls = AP.computeWalls(fl, P.settings), cols = C.cols.filter(c => c.top >= lv - 1), out = [], seen = new Set();
    for (const w of walls) {
      const onLine = cols.filter(c => (w.o === 'h' ? AP.eq(c.y, w.c) && c.x >= w.a - 1e-3 && c.x <= w.b + 1e-3 : AP.eq(c.x, w.c) && c.y >= w.a - 1e-3 && c.y <= w.b + 1e-3))
        .map(c => (w.o === 'h' ? c.x : c.y)).sort((a, b) => a - b);
      for (let i = 0; i < onLine.length - 1; i++) {
        const a = AP.wallPt(w.o, w.c, onLine[i]), b = AP.wallPt(w.o, w.c, onLine[i + 1]), key = bkey(a, b);
        if (seen.has(key) || onLine[i + 1] - onLine[i] < 0.2) continue; seen.add(key);
        out.push({ key, a, b, auto: true });
      }
    }
    return out;
  };
  // every level's beams with sizes and marks (B-1, B-2 … per size), and the beam types for the schedule
  AP.allBeams = function (P) {
    const nF = AP.nLevels(P), lvs = [], types = [];
    for (let lv = 0; lv <= nF; lv++) {
      const kind = AP.beamKind(P, lv), D = AP.beamDefault(P, kind), E = (P.beamEd || {})[lv] || {};
      const del = new Set(E.del || []), size = E.size || {};
      const L = AP.autoBeams(P, lv).filter(b => !del.has(b.key)).map(b => Object.assign(b, size[b.key] || D, { lv, kind }));
      for (const u of E.add || []) L.push({ key: 'u:' + u.id, id: u.id, a: u.a, b: u.b, w: u.w || D.w, h: u.h || D.h, lv, kind, user: true });
      lvs.push(L);
    }
    // marks: per kind, the default size first
    for (const kind of ['TB', 'B', 'RB']) {
      const D = AP.beamDefault(P, kind), all = lvs.flat().filter(b => b.kind === kind);
      const sizes = [];
      for (const b of all) if (!sizes.some(s => Math.abs(s.w - b.w) < 1e-4 && Math.abs(s.h - b.h) < 1e-4)) sizes.push({ w: b.w, h: b.h });
      sizes.sort((p, q) => (Math.abs(q.w - D.w) + Math.abs(q.h - D.h) < 1e-4) - (Math.abs(p.w - D.w) + Math.abs(p.h - D.h) < 1e-4));
      sizes.forEach((s, i) => {
        const mark = kind + '-' + (i + 1), n = all.filter(b => Math.abs(s.w - b.w) < 1e-4 && Math.abs(s.h - b.h) < 1e-4);
        n.forEach(b => { b.mark = mark; });
        const big = s.h >= 0.45 || s.w >= 0.3;
        types.push({ mark, kind, w: s.w, h: s.h, n: n.length, top: kind === 'B' ? 3 : 2, bot: (kind === 'TB' ? 2 : 3) + (big ? 1 : 0), len: n.reduce((a, b) => a + Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), 0) });
      });
    }
    return { lvs, types };
  };
  AP.beams = (P, lv) => (AP.allBeams(P).lvs[lv] || []);
  // a beam as a plan band, its mark beside it
  AP.drawBeam = function (d, b, ts, sty, label) {
    const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * b.w / 2, ny = dx / L * b.w / 2;
    d.poly([[b.a[0] + nx, b.a[1] + ny], [b.b[0] + nx, b.b[1] + ny], [b.b[0] - nx, b.b[1] - ny], [b.a[0] - nx, b.a[1] - ny]], true, sty);
    if (label && L > 0.6) {
      const m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], vert = Math.abs(dy) > Math.abs(dx);
      d.text(m[0] + (vert ? 0.32 : 0), m[1] - (vert ? 0 : 0.26), b.mark, 1.8 * ts, { anchor: 'middle', v: 'middle', rot: vert ? -90 : 0, layer: 'TEXT' });
    }
  };

  /* ---------- BEAM PLAN (per level above ground) ---------- */
  AP.renderBeamPlan = function (P, fi, o) {
    const ts = o.ts, d = new AP.Drawing();
    const C = AP.columns(P);
    const cols = C.cols.filter(c => c.top >= fi - 1);
    const bs = st(ts, LW.thin, { layer: 'WALLS' });
    for (const b of AP.beams(P, fi)) AP.drawBeam(d, b, ts, bs, true);
    for (const c of cols) AP.drawColumn(d, c, { fill: '#111111', stroke: 'none', layer: 'COLUMNS' });
    AP.drawGrids(d, P, ts, {});
    return d;
  };

  /* ---------- structural level page: faded plan, columns, footings, beams, roofs ---------- */
  AP.drawLevelEdit = function (d, P, L, ts, selKey) {
    const C = AP.columns(P), S = P.settings;
    if (L.foot) for (const c of C.cols) { const f = c.foot; d.rect(c.x - f / 2, c.y - f / 2, f, f, { stroke: '#7a5c2e', w: 0.5 * ts, fill: 'rgba(160,120,60,0.15)', dash: [1.5 * ts, 0.8 * ts], layer: 'LVL' }); d.text(c.x + f / 2 + 0.05, c.y + f / 2 + 2.6 * ts, c.fmark + c.mark, 1.8 * ts, { fill: '#7a5c2e', layer: 'LVL' }); }
    if (L.roof) AP.drawRoofEdit(d, P, P.floors.length > L.floor ? L.floor : 0, ts, null);
    if (L.id === 'RB') AP.drawRoofWalls(d, P, ts, L.selWall);
    for (const b of AP.beams(P, L.lv)) {
      const me = b.key === selKey, faded = !L.edit;
      AP.drawBeam(d, b, ts, { stroke: me ? '#1677ff' : faded ? '#b89a76' : '#8a4b12', w: (me ? 0.9 : 0.5) * ts, fill: me ? 'rgba(22,119,255,0.35)' : faded ? 'rgba(184,154,118,0.18)' : 'rgba(181,101,29,0.45)', layer: 'LVL', dash: faded ? [1.5 * ts, 0.8 * ts] : null }, true);
    }
    for (const c of C.cols.filter(c => c.top >= L.lv - 1)) AP.drawColumn(d, c, { fill: '#111111', stroke: 'none', layer: 'COLUMNS' });
    const bb = AP.projectBBox(P);
    if (bb) d.text(bb.x0, bb.y1 + 6 * ts, L.name.toUpperCase() + '   EL. ' + (L.el >= 0 ? '+' : '') + (L.el).toFixed(2) + ' m', 2.6 * ts, { bold: true, fill: '#8a4b12', layer: 'LVL' });
    void S;
  };
})(window.AP);
