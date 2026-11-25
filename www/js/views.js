/* ArkiPlan – elevations, sections, toilet details, schedules & notes.
 * Elevation/section drawings use X = horizontal (u) and Y = -z (height up).
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  const LW = AP.LW;
  const st = (ts, w, extra) => Object.assign({ w: w * ts }, extra || {});
  const eq = AP.eq;

  const MAP = {
    S: { u: (x, y) => x,  dp: (x, y) => y,  fo: 'h', ga: 'x', title: 'FRONT ELEVATION' },
    N: { u: (x, y) => -x, dp: (x, y) => -y, fo: 'h', ga: 'x', title: 'REAR ELEVATION' },
    W: { u: (x, y) => y,  dp: (x, y) => -x, fo: 'v', ga: 'y', title: 'LEFT SIDE ELEVATION' },
    E: { u: (x, y) => -y, dp: (x, y) => x,  fo: 'v', ga: 'y', title: 'RIGHT SIDE ELEVATION' }
  };
  AP.ELEV = MAP;
  const zOf = (P, fi) => AP.levelZ(P, fi);

  /* ---------- opening in elevation (shared by elevations, schedule, interior elevations) ---------- */
  AP.drawOpeningElev = function (d, op, u0, u1, zA, zB, ts, knobRight) {
    const style = AP.tplOf(op).style, door = op.kind === 'door';
    const layer = door ? 'DOORS' : 'WINDOWS';
    const s = st(ts, LW.med, { layer }), sf = st(ts, LW.fine, { layer });
    const Y = z => -z;
    d.rect2(u0, Y(zA), u1, Y(zB), Object.assign({ fill: door ? '#ffffff' : '#eaf2f7' }, s));
    const f = 0.05, um = (u0 + u1) / 2;
    if (!door) {
      d.rect2(u0 + f, Y(zA + f), u1 - f, Y(zB - f), sf);
      const dsh = st(ts, LW.fine, { layer, dash: [1.2 * ts, 0.8 * ts] });
      if (style === 'sliding') {
        d.line(um, Y(zA + f), um, Y(zB - f), s);
        const zc = (zA + zB) / 2, a = Math.min(0.15, (u1 - u0) / 8);
        d.line(um - 0.08 - a, Y(zc), um - 0.08, Y(zc), sf); d.line(um + 0.08, Y(zc), um + 0.08 + a, Y(zc), sf);
      } else if (style === 'casement') {
        const zc = (zA + zB) / 2;
        if (u1 - u0 < 0.8) d.poly([[u1 - f, Y(zB - f)], [u0 + f, Y(zc)], [u1 - f, Y(zA + f)]], false, dsh); // single sash
        else {
          d.line(um, Y(zA + f), um, Y(zB - f), s);
          d.poly([[um, Y(zB - f)], [u0 + f, Y(zc)], [um, Y(zA + f)]], false, dsh);
          d.poly([[um, Y(zB - f)], [u1 - f, Y(zc)], [um, Y(zA + f)]], false, dsh);
        }
      } else if (style === 'jalousie') {
        // glass louver blades, slightly tilted
        for (let z = zA + f + 0.07; z < zB - f - 0.02; z += 0.09) d.line(u0 + f, Y(z), u1 - f, Y(z + 0.025), sf);
        d.line(um, Y(zA + f), um, Y(zB - f), sf);
      } else if (style === 'awning') {
        d.poly([[u0 + f, Y(zA + f)], [um, Y(zB - f)], [u1 - f, Y(zA + f)]], false, dsh);
      }
      // window sill: a board under the frame, projecting a little each side (not a loose line at the corners)
      d.rect2(u0 - 0.05, Y(zA), u1 + 0.05, Y(zA - 0.04), Object.assign({ fill: '#ffffff' }, st(ts, LW.thin, { layer })));
    } else {
      if (style === 'double' || style === 'sliding') {
        d.line(um, Y(zA), um, Y(zB - f), s);
        d.rect2(u0 + f, Y(zA + 0.1), um - 0.03, Y(zB - f), sf); d.rect2(um + 0.03, Y(zA + 0.1), u1 - f, Y(zB - f), sf);
      } else if (style === 'rollup') {
        for (let z = zA + 0.1; z < zB; z += 0.1) d.line(u0 + f, Y(z), u1 - f, Y(z), sf);
      } else if (AP.tplOf(op).look === 'pvc') {
        // PVC door: frame / casing, flush leaf with an inner line, louver at the bottom, lever handle
        const c = 0.045, lf = 0.02, kx = knobRight === false ? u0 + 0.09 : u1 - 0.09, dir = knobRight === false ? 1 : -1;
        d.rect2(u0 - c, Y(zA), u1 + c, Y(zB + c), Object.assign({ fill: '#ffffff' }, s));          // casing
        d.rect2(u0, Y(zA), u1, Y(zB), s);                                                          // frame
        d.rect2(u0 + lf, Y(zA + 0.01), u1 - lf, Y(zB - lf), s);                                    // leaf
        d.rect2(u0 + lf + 0.015, Y(zA + 0.025), u1 - lf - 0.015, Y(zB - lf - 0.015), sf);          // leaf edge
        const lw = Math.min(0.42, (u1 - u0) * 0.55), lx0 = (u0 + u1) / 2 - lw / 2, lz0 = zA + 0.1, lz1 = lz0 + 0.24;
        d.rect2(lx0, Y(lz0), lx0 + lw, Y(lz1), s); d.rect2(lx0 + 0.02, Y(lz0 + 0.02), lx0 + lw - 0.02, Y(lz1 - 0.02), sf);
        for (let z = lz0 + 0.045; z < lz1 - 0.03; z += 0.035) d.line(lx0 + 0.03, Y(z), lx0 + lw - 0.03, Y(z), s);
        d.rect2(kx - 0.018, Y(zA + 0.92), kx + 0.018, Y(zA + 1.1), Object.assign({ fill: '#ffffff' }, s)); // escutcheon
        d.line(kx, Y(zA + 1.06), kx + dir * 0.12, Y(zA + 1.06), st(ts, LW.thick, { layer }));         // lever
        d.circle(kx, Y(zA + 0.96), 0.008, sf);                                                       // key / lock
      } else {
        const a = u0 + 0.1, b = u1 - 0.1;
        const n = 4, top = zB - 0.12, bot = zA + 0.12, step = (top - bot) / n;
        for (let i = 0; i < n; i++) d.rect2(a, Y(bot + i * step + 0.03), b - 0.12, Y(bot + (i + 1) * step - 0.03), sf);
        const kx = knobRight === false ? u0 + 0.1 : u1 - 0.1;
        d.circle(kx, Y(1.0 + zA), 0.025, s);
      }
    }
  };

  /* ---------- roof seen in elevation ---------- */
  function roofElev(d, P, M, ts, light, R) {
    R = R || AP.roofGeom(P);
    if (!R) return null;
    const S = P.settings;
    const s = st(ts, light ? LW.fine : LW.med, { layer: 'ROOF', fill: '#ffffff', stroke: light ? '#666666' : '#000000' });
    const along = M.ga; // 'x' -> u along x
    const A0 = along === 'x' ? R.X0 : R.Y0, A1 = along === 'x' ? R.X1 : R.Y1;
    const D0 = along === 'x' ? R.Y0 : R.X0, D1 = along === 'x' ? R.Y1 : R.X1;
    const zAt = (a, dpt) => (along === 'x' ? R.z(a, dpt) : R.z(dpt, a));
    const U = a => (along === 'x' ? M.u(a, 0) : M.u(0, a));
    if (R.box) {
      const b = R.b, t = S.extWall / 2;
      const a0 = along === 'x' ? b.x0 - t : b.y0 - t, a1 = along === 'x' ? b.x1 + t : b.y1 + t;
      d.rect2(U(a0), -R.zTop, U(a1), -(R.zTop + S.parapet), s);
      d.line(U(a0) + (U(a1) > U(a0) ? -0.05 : 0.05), -(R.zTop + S.parapet - 0.1), U(a1) + (U(a1) > U(a0) ? 0.05 : -0.05), -(R.zTop + S.parapet - 0.1), st(ts, LW.thin, { layer: 'ROOF' }));
      return { u0: Math.min(U(a0), U(a1)), u1: Math.max(U(a0), U(a1)), zMax: R.zTop + S.parapet };
    }
    const nD = 24;
    const mx = a => { let m = -Infinity; for (let i = 0; i <= nD; i++) m = Math.max(m, zAt(a, D0 + (D1 - D0) * i / nD)); return m; };
    const mn = a => { let m = Infinity; for (let i = 0; i <= nD; i++) m = Math.min(m, zAt(a, D0 + (D1 - D0) * i / nD)); return m; };
    const top = AP.profile(mx, A0, A1), bot = AP.profile(mn, A0, A1);
    const th = 0.12;
    // end wall infill under the roof edge (gable, shed, V and clerestory ends), taken at the wall facing the viewer
    const b = R.b, t = S.extWall / 2;
    const w0 = along === 'x' ? b.x0 - t : b.y0 - t, w1 = along === 'x' ? b.x1 + t : b.y1 + t;
    const nearD = along === 'x' ? (M.dp(0, 1) > 0 ? b.y1 + t : b.y0 - t) : (M.dp(1, 0) > 0 ? b.x1 + t : b.x0 - t);
    const endZ = a => zAt(a, nearD) - th;
    let endMax = -Infinity; for (let i = 0; i <= 40; i++) endMax = Math.max(endMax, endZ(w0 + (w1 - w0) * i / 40));
    if (endMax > R.zTop + 0.05) {
      const inf = AP.profile(a => Math.max(R.zTop, endZ(a)), w0, w1, 120);
      d.poly([[U(w0), -R.zTop], ...inf.map(p => [U(p[0]), -p[1]]), [U(w1), -R.zTop]], true, st(ts, LW.thin, { fill: '#ffffff', layer: 'WALLS', stroke: light ? '#666666' : '#000000' }));
    }
    const poly = [...top.map(p => [U(p[0]), -p[1]]), ...bot.slice().reverse().map(p => [U(p[0]), -(p[1] - th)])];
    d.poly(poly, true, s);
    // ridge roll: a cap along every ridge seen side-on (a level run at the top) and over every peak seen end-on
    const ridges = [], rs = st(ts, light ? LW.fine : LW.thin, { layer: 'ROOF', fill: '#d9d9d9', stroke: light ? '#666666' : '#000000' });
    for (let i = 0; i < top.length; i++) {
      const p = top[i], prev = top[i - 1], next = top[i + 1];
      if (next && Math.abs(next[1] - p[1]) < 1e-4 && p[1] > R.zE + 0.2) { // a level run that starts here (not along an eave)
        let j = i + 1; while (top[j + 1] && Math.abs(top[j + 1][1] - p[1]) < 1e-4) j++;
        const hiL = prev && prev[1] > p[1] + 1e-4, hiR = top[j + 1] && top[j + 1][1] > p[1] + 1e-4;
        if (!(hiL && hiR) && Math.abs(top[j][0] - p[0]) > 0.3) { // a ridge (not a dip between two higher roofs)
          d.rect2(U(p[0]), -(p[1] - 0.01), U(top[j][0]), -(p[1] + 0.06), rs);
          ridges.push({ u: (U(p[0]) + U(top[j][0])) / 2, z: p[1] + 0.06 });
        }
        i = j; continue;
      }
      if (prev && next && prev[1] < p[1] - 1e-3 && next[1] < p[1] - 1e-3) { // a peak
        const u = U(p[0]), w = 0.16;
        d.poly([[u - w, -(p[1] - 0.05)], [u - w * 0.45, -(p[1] + 0.05)], [u + w * 0.45, -(p[1] + 0.05)], [u + w, -(p[1] - 0.05)]], true, rs);
        ridges.push({ u, z: p[1] + 0.05 });
      }
    }
    // corrugation ribs where the roof surface faces the viewer
    const rib = st(ts, LW.fine, { layer: 'ROOF', stroke: '#888888' });
    for (let a = A0 + 0.15; a < A1 - 0.05; a += 0.3) {
      const z1 = mx(a), z0 = mn(a);
      if (z1 - z0 > 0.3) d.line(U(a), -z0, U(a), -z1, rib);
    }
    d.line(U(A0), -(mn(A0) - th), U(A1), -(mn(A1) - th), st(ts, LW.thin, { layer: 'ROOF' }));
    // gutters: a strip along eaves facing the viewer, the end profile on eaves seen side-on
    const gs = st(ts, light ? LW.fine : LW.thin, { layer: 'ROOF', fill: '#ffffff', stroke: light ? '#666666' : '#000000' }), G = AP.GUTTER_W;
    for (const e of AP.roofEaves(R)) {
      if (e.valley) continue;
      const toward = M.dp(e.n[0], e.n[1]) - M.dp(0, 0); // > 0: the eave faces the viewer
      const u0 = M.u(e.p0[0], e.p0[1]), u1 = M.u(e.p1[0], e.p1[1]), zg = e.z - th;
      if (toward > 0.5) d.rect2(Math.min(u0, u1), -(zg + 0.02), Math.max(u0, u1), -(zg - G), gs);
      else if (Math.abs(toward) < 0.5) { const un = M.u(e.n[0], e.n[1]) - M.u(0, 0), ue = u0; d.rect2(ue, -(zg + 0.02), ue + un * G, -(zg - G), gs); }
    }
    const viewAlongRidge = (along === 'x') === R.ridgeX; // looking at the long side
    const sl = st(ts, LW.thin, { layer: 'ROOF', stroke: light ? '#666666' : '#000000' });
    // dutch gable: small vertical gable above the hipped ends
    if (R.type === 'dutch' && !viewAlongRidge) {
      const zB = R.zE + R.pitch * R.d0;
      const pts = AP.profile(c => R.zE + R.pitch * Math.min(c - R.C0, R.C1 - c), R.C0 + R.d0, R.C1 - R.d0, 60);
      d.poly(pts.map(p => [U(p[0]), -p[1]]), true, Object.assign({ fill: '#ffffff' }, sl));
      d.line(U(R.C0 + R.d0), -zB, U(R.C1 - R.d0), -zB, sl);
      for (let k = 1; k <= 3; k++) { const zz = zB + (R.zMax - zB) * k / 5, hw = (R.zMax - zz) / R.pitch * 0.6; d.line(U(R.cm - hw), -zz, U(R.cm + hw), -zz, st(ts, LW.fine, { layer: 'ROOF' })); }
    }
    // clerestory: glazing band between the two roof halves, seen from the low side
    if ((R.type === 'clerestory' || R.type === 'doubleshed') && viewAlongRidge && R.fs * M.dp(R.ridgeX ? 0 : 1, R.ridgeX ? 1 : 0) > 0) {
      const z0 = R.zE + R.pitch * (R.C1 - R.cm), z1 = z0 + R.step - 0.05;
      const a0 = R.A0 + R.oh, a1 = R.A1 - R.oh;
      d.rect2(U(a0), -z0, U(a1), -z1, Object.assign({ fill: '#eaf2f7' }, sl));
      for (let a = a0 + 1.0; a < a1 - 0.2; a += 1.0) d.line(U(a), -z0, U(a), -z1, sl);
    }
    // where the roof notes point: the ridge, the roofing sheet, the fascia at the eave
    const aS = A0 + (A1 - A0) * 0.22, uE = Math.max(U(A0), U(A1)), aE = U(A1) >= U(A0) ? A1 : A0;
    const note = { ridge: ridges.sort((p, q) => q.z - p.z)[0] || null, slope: { u: U(aS), z: mx(aS) - 0.02 }, eave: { u: uE - 0.05, z: mn(aE) - th - 0.05 }, gutter: AP.roofEaves(R).length > 0, kubo: R.type === 'kubo' };
    return { u0: Math.min(U(A0), U(A1)), u1: Math.max(U(A0), U(A1)), zMax: R.zMax, note };
  }

  /* ---------- level marks & dims on the left, grids on top ---------- */
  function levelMarks(d, P, uL, zTopAll, ts, withDoor) {
    const S = P.settings, nF = Math.max(1, AP.topFloorIndex(P) + 1);
    const L = [{ z: -S.plinth, t: 'NGL' }];
    for (let i = 0; i < nF; i++) {
      L.push({ z: zOf(P, i), t: i === 0 ? 'FFL' : AP.floorName(i).split(' ')[0].replace('SECOND', '2ND').replace('THIRD', '3RD').replace('FOURTH', '4TH') + ' FFL' });
      if (withDoor) L.push({ z: zOf(P, i) + S.doorHt, t: 'DOORS & WINDOW HT.' });
    }
    L.push({ z: zOf(P, nF), t: 'TOP OF BEAM' });
    if (zTopAll > zOf(P, nF) + 0.05) L.push({ z: zTopAll, t: (AP.roofGeom(P) || {}).box ? 'TOP OF PARAPET' : 'TOP OF ROOF' });
    const x0 = uL - 22 * ts, x1 = uL - 1 * ts;
    const ls = st(ts, LW.fine, { layer: 'DIMS' });
    for (const l of L) {
      d.line(x0, -l.z, x1, -l.z, ls);
      d.text(x0 + 0.5 * ts, -l.z - 0.8 * ts, l.t, 1.9 * ts, { layer: 'DIMS' });
    }
    const zs = L.map(l => l.z);
    AP.dimChain(d, zs.map(z => -z), x0 - 2.5 * ts, 'v', ts);
    AP.dimChain(d, [-Math.min(...zs), -Math.max(...zs)], x0 - 8.5 * ts, 'v', ts);
  }
  function gridTop(d, P, M, ts, zTop, ru0, ru1, lift) {
    const G = AP.grids(P);
    const gl = (M.ga === 'x' ? G.x.map(g => ({ u: M.u(g.v, 0), label: g.label })) : G.y.map(g => ({ u: M.u(0, g.v), label: g.label })));
    if (!gl.length) return;
    const yb = -zTop - 24 * ts - (lift || 0); // lift: room for the finish numbers under the bubbles
    const gs = st(ts, LW.fine, { stroke: '#8a8a8a', dash: [8 * ts, 1.5 * ts, 1 * ts, 1.5 * ts], layer: 'GRID' });
    gl.sort((a, b) => a.u - b.u);
    // bubbles in one row; close grids: the bubble moves aside and its line jogs over above the dimension strings
    const SB = AP.spreadBubbles(gl.map(g => g.u), ts), yB = yb - (SB.jog ? 6 * ts : 0);
    const bub = P.settings.gridBubbles !== false;
    gl.forEach((g, i) => {
      if (!bub) { d.line(g.u, -zTop - 15 * ts, g.u, P.settings.plinth, gs); return; }
      AP.gridJog(d, 'x', g.u, SB.pos[i], yB + 4 * ts, yB + 5 * ts, -zTop - 17 * ts, P.settings.plinth, gs);
      AP.bubble(d, SB.pos[i], yB, g.label, ts);
    });
    const us = gl.map(g => g.u).sort((a, b) => a - b);
    // as on the plans: column to column inside, overhang | overall | overhang outside
    AP.dimChain(d, us, -zTop - 7 * ts, 'h', ts);
    AP.dimChain(d, [ru0 != null ? ru0 : us[0], us[0], us[us.length - 1], ru1 != null ? ru1 : us[us.length - 1]], -zTop - 13 * ts, 'h', ts);
  }
  function groundLine(d, u0, u1, P, ts) {
    d.line(u0 - 1.5, P.settings.plinth, u1 + 1.5, P.settings.plinth, st(ts, 0.7, { layer: 'WALLS' }));
  }

  function colsOnLine(C, o, c, a, b) {
    return C.cols.filter(q => (o === 'h' ? eq(q.y, c) && q.x >= a - 1e-3 && q.x <= b + 1e-3 : eq(q.x, c) && q.y >= a - 1e-3 && q.y <= b + 1e-3));
  }

  /* ---------- ELEVATION ---------- */
  AP.renderElevation = function (P, dir, o) {
    const ts = o.ts, S = P.settings, d = new AP.Drawing(), M = MAP[dir];
    const C = AP.columns(P);
    const items = [];
    let uMin = Infinity, uMax = -Infinity;
    const ti = AP.topFloorIndex(P);
    P.floors.forEach((fl, fi) => {
      if (!fl.rooms.length) return;
      const walls = AP.computeWalls(fl, S);
      const z0 = zOf(P, fi), zb = fi === 0 ? -S.plinth : z0, zt = z0 + AP.floorH(P, fi);
      for (const w of walls) {
        if (w.o !== M.fo || w.out !== dir || (w.kind !== 'ext' && w.kind !== 'edge')) continue;
        const pa = AP.wallPt(w.o, w.c, w.a - w.ea), pb = AP.wallPt(w.o, w.c, w.b + w.eb);
        const ua = M.u(pa[0], pa[1]), ub = M.u(pb[0], pb[1]);
        const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub);
        uMin = Math.min(uMin, u0); uMax = Math.max(uMax, u1);
        const mid = AP.wallPt(w.o, w.c, (w.a + w.b) / 2);
        const cols = colsOnLine(C, w.o, w.c, w.a, w.b);
        const ms = st(ts, LW.med, { layer: 'WALLS' }), th = st(ts, LW.thin, { layer: 'WALLS' });
        items.push({
          dp: M.dp(mid[0], mid[1]) + (w.kind === 'edge' ? 0.001 : 0), f: () => {
            if (w.kind === 'ext') {
              const zr = zt + AP.wallRaise(P, fi, mid[0], mid[1]); // walls go on up under a raised roof
              d.rect2(u0, -zb, u1, -zr, Object.assign({ fill: '#ffffff' }, ms));
              if (o.hits) o.hits.push({ wall: true, fi, o: w.o, c: w.c, a: w.a, b: w.b, kind: w.kind, u0, u1, zA: zb, zB: zt });
              for (const op of fl.openings) {
                if (op.side !== dir) continue;
                const R = AP.resolveOp(fl, op);
                if (!R || R.o !== w.o || !eq(R.c, w.c) || R.s < w.a || R.s > w.b) continue;
                const qa = AP.wallPt(R.o, R.c, R.s - R.w / 2), qb = AP.wallPt(R.o, R.c, R.s + R.w / 2);
                const v0 = M.u(qa[0], qa[1]), v1 = M.u(qb[0], qb[1]);
                const sill = AP.opSill(op, S);
                AP.drawOpeningElev(d, op, Math.min(v0, v1), Math.max(v0, v1), z0 + sill, z0 + sill + op.h, ts, (v1 > v0) !== !!op.hand);
                if (o.hits) o.hits.push({ fi, id: op.id, u0: Math.min(v0, v1), u1: Math.max(v0, v1), zA: z0 + sill, zB: z0 + sill + op.h });
              }
            } else {
              // open side: beam + posts
              d.rect2(u0, -(zt - S.beamDepth), u1, -zt, Object.assign({ fill: '#ffffff' }, ms));
            }
            for (const c of cols) {
              const p = M.u(c.x, c.y);
              const cw = M.ga === 'x' ? c.size : c.d, a = p - cw / 2, b = p + cw / 2;
              if (w.kind === 'edge') d.rect2(a, -zb, b, -(zt - S.beamDepth), Object.assign({ fill: '#ffffff' }, ms));
              else { d.line(a, -zb, a, -zt, th); d.line(b, -zb, b, -zt, th); }
            }
            if (w.kind === 'ext') d.line(u0, -(zt - S.beamDepth), u1, -(zt - S.beamDepth), st(ts, LW.fine, { layer: 'WALLS', stroke: '#777777' }));
          }
        });
      }
    });
    const rfs = [];
    for (const R of AP.roofs(P)) {
      let dp = -Infinity;
      for (const p of [[R.X0, R.Y0], [R.X1, R.Y0], [R.X1, R.Y1], [R.X0, R.Y1]]) dp = Math.max(dp, M.dp(p[0], p[1]));
      items.push({ dp, f: () => { const rf = roofElev(d, P, M, ts, false, R); if (rf) rfs.push(rf); } });
    }
    // walls on the roof beams (parapet / fire wall): faces seen square-on, ends seen edge-on
    const zRB = zOf(P, AP.nLevels(P));
    for (const rw of AP.roofWalls(P)) {
      const pa = AP.wallPt(rw.o, rw.c, Math.min(rw.a, rw.b)), pb = AP.wallPt(rw.o, rw.c, Math.max(rw.a, rw.b));
      let u0 = M.u(pa[0], pa[1]), u1 = M.u(pb[0], pb[1]);
      if (rw.o !== M.fo) { const uc = u0; u0 = uc - rw.t / 2; u1 = uc + rw.t / 2; }
      const a = Math.min(u0, u1), b = Math.max(u0, u1), dp = Math.max(M.dp(pa[0], pa[1]), M.dp(pb[0], pb[1])) + 0.002;
      const prof = AP.roofWallProfile(P, rw), zMx = Math.max(...prof.map(q => q[1]));
      items.push({ dp, f: () => {
        const ws = st(ts, LW.med, { layer: 'WALLS', fill: '#ffffff' });
        if (rw.o === M.fo) { const U = s => { const q = AP.wallPt(rw.o, rw.c, s); return M.u(q[0], q[1]); }; d.poly([[U(prof[0][0]), -zRB], ...prof.map(q => [U(q[0]), -q[1]]), [U(prof[prof.length - 1][0]), -zRB]], true, ws); }
        else d.rect2(a, -zRB, b, -zMx, ws);
        if (o.hits) o.hits.push({ wall: true, rw: rw.id, fi: AP.nLevels(P) - 1, u0: a, u1: b, zA: zRB, zB: zMx });
      } });
    }
    items.sort((a, b) => a.dp - b.dp);
    for (const it of items) it.f();
    const rf = rfs.length ? { u0: Math.min(...rfs.map(q => q.u0)), u1: Math.max(...rfs.map(q => q.u1)), zMax: Math.max(...rfs.map(q => q.zMax)) } : null;
    const zTop = rf ? Math.max(rf.zMax, zOf(P, ti + 1)) : zOf(P, ti + 1);
    if (rf) { uMin = Math.min(uMin, rf.u0); uMax = Math.max(uMax, rf.u1); }
    if (uMin === Infinity) return d;
    groundLine(d, uMin, uMax, P, ts);
    levelMarks(d, P, uMin - 1.5, zTop, ts, true);
    gridTop(d, P, M, ts, zTop, rf ? rf.u0 : null, rf ? rf.u1 : null);
    // finish notes (Settings › Finish notes in the elevations): beside it with leaders, numbered pointers + FINISHES legend, or off
    const FE = S.finNotesEl || 'keyed', topR = rfs.filter(q => q.note).sort((p, q) => q.zMax - p.zMax)[0], L = [];
    const extTxt = 'EXT. WALL: ' + (S.extFinish || 'PLAIN CEMENT PLASTER, PAINT FINISH');
    if (topR) {
      const N = topR.note;
      if (N.ridge) L.push({ txt: 'RIDGE ROLL GA. 26', u: N.ridge.u, z: N.ridge.z, up: true });
      L.push({ txt: N.kubo ? 'CLAY-LOOK ROOFING' : 'LONG SPAN ROOFING GA. 26', u: N.slope.u, z: N.slope.z, up: true });
      L.push({ txt: 'FIBER CEMENT FASCIA', u: N.eave.u, z: N.eave.z, up: true });
      if (N.gutter) L.push({ txt: '150mm G.I. GUTTER', u: N.eave.u + 0.08, z: N.eave.z - 0.1, up: true });
    }
    if (FE === 'leader') {
      d.text((uMin + uMax) / 2, P.settings.plinth + 5 * ts, 'EXTERIOR WALL FINISH: ' + (S.extFinish || 'PLAIN CEMENT PLASTER, PAINT FINISH'), 2 * ts, { anchor: 'middle' });
      const x0 = uMax + 0.7, th = 1.6 * ts, ls = st(ts, LW.fine, { layer: 'TEXT' });
      L.forEach((n, i) => {
        const y = -(topR.zMax + 0.3) + i * 3.4 * ts, knee = [x0 - 0.4, y - 0.35 * th], tip = [n.u, -n.z];
        d.text(x0, y, n.txt, th, { layer: 'TEXT' });
        d.line(x0 - 0.08, knee[1], knee[0], knee[1], ls); d.lineP(knee, tip, ls);
        const dx = tip[0] - knee[0], dy = tip[1] - knee[1], Ln = Math.hypot(dx, dy) || 1, ux = dx / Ln, uy = dy / Ln, h = 1.2 * ts, w = 0.45 * ts;
        d.poly([tip, [tip[0] - ux * h - uy * w, tip[1] - uy * h + ux * w], [tip[0] - ux * h + uy * w, tip[1] - uy * h - ux * w]], true, { fill: '#000000', stroke: 'none', layer: 'TEXT' });
      });
    } else if (FE === 'keyed') {
      // the wall finish too, on a stretch of wall near the left; numbered pointers like the sections
      L.push({ txt: extTxt, u: uMin + (uMax - uMin) * 0.1, z: 0.6, up: false });
      if (o.collect) { o.collect.push(...L); return d; }
      AP.drawPointers(d, L, o.keys, { yAbove: -zTop - 2.6 * ts, yBelow: S.plinth + 1.3, legendX: uMax + 1.2, legendY: -zTop + 2 * ts }, ts);
    }
    return d;
  };

  /* ---------- SECTION ---------- */
  AP.renderSection = function (P, which, o) {
    const ts = o.ts, S = P.settings, d = new AP.Drawing();
    // finish notes: inside the rooms, or outside with leader lines, or numbered with a legend (Settings)
    const FN = S.finNotes || 'keyed', notesOut = [];
    const cut = AP.sectionCuts(P)[which];
    const M = which === 'A' ? MAP.S : MAP.W;
    const cutO = which === 'A' ? 'v' : 'h';
    const beyond = c => (which === 'A' ? c < cut - 1e-3 : c > cut + 1e-3);
    const crosses = r => (which === 'A' ? r.y < cut && cut < r.y + r.l : r.x < cut && cut < r.x + r.w);
    const ru = r => (which === 'A' ? [r.x, r.x + r.w] : [r.y, r.y + r.l]);
    const C = AP.columns(P), RL = AP.roofs(P);
    const behind = R => (which === 'A' ? R.Y0 < cut : R.X1 > cut); // some of the roof is beyond the cut
    const items = [];
    let uMin = Infinity, uMax = -Infinity;
    const ti = AP.topFloorIndex(P);
    const fine = st(ts, LW.fine, { layer: 'WALLS', stroke: '#555555' });
    const spans = [], seen = []; // wall faces beyond the cut, doors & windows on them
    P.floors.forEach((fl, fi) => {
      if (!fl.rooms.length) return;
      const walls = AP.computeWalls(fl, S);
      const z0 = zOf(P, fi), zt = z0 + AP.floorH(P, fi);
      for (const w of walls) {
        if (w.o !== M.fo || !w.t || !beyond(w.c)) continue;
        const pa = AP.wallPt(w.o, w.c, w.a - w.ea), pb = AP.wallPt(w.o, w.c, w.b + w.eb);
        const ua = M.u(pa[0], pa[1]), ub = M.u(pb[0], pb[1]);
        const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub), dp = M.dp(pa[0], pa[1]);
        spans.push({ fi, u0, u1, dp });
        const wTop = w.h ? z0 + w.h : zt - S.beamDepth;
        items.push({ dp, f: () => {
          d.rect2(u0, -z0, u1, -wTop, Object.assign({ fill: '#ffffff' }, fine));
          if (o.hits) o.hits.push({ wall: true, fi, o: w.o, c: w.c, a: w.a, b: w.b, kind: w.kind, xid: w.id, u0, u1, zA: z0, zB: wTop });
        } });
        for (const op of fl.openings) {
          const Ro = AP.resolveOp(fl, op);
          if (!Ro || Ro.o !== w.o || !eq(Ro.c, w.c) || Ro.s < w.a || Ro.s > w.b) continue;
          const qa = AP.wallPt(Ro.o, Ro.c, Ro.s - Ro.w / 2), qb = AP.wallPt(Ro.o, Ro.c, Ro.s + Ro.w / 2);
          const v0 = M.u(qa[0], qa[1]), v1 = M.u(qb[0], qb[1]);
          const sill = AP.opSill(op, S);
          seen.push({ fi, op, dp, u0: Math.min(v0, v1), u1: Math.max(v0, v1), zA: z0 + sill, zB: z0 + sill + op.h, knob: (v1 > v0) === !!op.hand });
        }
      }
      for (const r of fl.rooms) if (crosses(r)) { const [a, b] = ru(r); uMin = Math.min(uMin, a); uMax = Math.max(uMax, b); }
    });
    if (uMin === Infinity) {
      d.text(0, 0, 'SECTION LINE ' + which + ' DOES NOT CUT THE BUILDING', 3 * ts, {});
      return d;
    }
    items.sort((a, b) => a.dp - b.dp);
    for (const it of items) it.f();
    for (const R of RL) if (!R.box && behind(R)) roofElev(d, P, M, ts, true, R);
    // cut slabs, walls, openings
    const cutFill = { fill: '#4d4d4d', stroke: '#000000', w: LW.thin * ts, layer: 'WALLS' };
    const slabFill = { fill: '#a8a8a8', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' };
    P.floors.forEach((fl, fi) => {
      if (!fl.rooms.length) return;
      const walls = AP.computeWalls(fl, S);
      const z0 = zOf(P, fi), zt = z0 + AP.floorH(P, fi);
      const isTop = fi === ti, labels = []; // room names & finish notes go on top of the doors/windows
      for (const r of fl.rooms) {
        if (!crosses(r)) continue;
        const [a, b] = ru(r);
        const e = S.extWall / 2;
        if (fi === 0) d.rect2(a - e, 0, b + e, AP.slabThk(r, S, true), slabFill);
        else if (!(r.type === 'stairs' && P.floors[fi - 1].rooms.some(q => q.type === 'stairs' && q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.l && q.y + q.l > r.y)))
          d.rect2(a - e, -z0, b + e, -(z0 - AP.slabThk(r, S)), slabFill);
        const rOver = AP.roofAt(P, fi, r.x + r.w / 2, r.y + r.l / 2, RL);
        if (rOver && rOver.type === 'flat') d.rect2(a - e, -(zt - S.slab), b + e, -zt, slabFill);
        else if (AP.hasCeiling(r)) d.line(a, -(z0 + AP.ceilHt(r, S)), b, -(z0 + AP.ceilHt(r, S)), st(ts, LW.thin, { layer: 'WALLS', dash: [2 * ts, 1 * ts] }));
        // room name
        const fin = Object.assign({}, AP.roomFinish(r), AP.wallFinish(r, which === 'A' ? 'N' : 'E')), cH = AP.ceilHt(r, S), hasC = AP.hasCeiling(r), drop = AP.floorDrop(r);
        // wall tiles on the wall seen behind the cut, floor finish layer
        if (fin.tileHt > 0 && !AP.isOpen(r)) {
          const TH = Math.min(fin.tileHt, cH), ws = st(ts, LW.fine, { stroke: '#8fb8bf', layer: 'HATCH' });
          for (let z = 0.3; z < TH - 0.01; z += 0.3) d.line(a + 0.02, -(z0 + z), b - 0.02, -(z0 + z), ws);
          for (let u = a + 0.6; u < b - 0.02; u += 0.6) d.line(u, -z0, u, -(z0 + TH), ws);
          d.line(a, -(z0 + TH), b, -(z0 + TH), st(ts, LW.thin, { stroke: '#4c7f87', layer: 'HATCH' }));
        }
        d.rect2(a, -(z0 - drop), b, -(z0 - drop + 0.03), { fill: '#d9e4ea', stroke: '#000000', w: LW.fine * ts, layer: 'SLAB' });
        // a raised floor: concrete topping / platform from the slab up to the new floor level
        if (drop < -0.001) d.rect2(a, -z0, b, -(z0 - drop), { fill: '#c9c9c9', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' });
        // the floor level: in the floor finish note (FLR: …, FL. -100); on its own only when the notes are off
        if (Math.abs(drop) > 0.001 && FN === 'off') d.text((a + b) / 2, -(z0 - drop + 0.03) - 0.8 * ts, AP.flText(r), 1.5 * ts, { anchor: 'middle', layer: 'TEXT' });
        // stair cut along its run: steps, waist slab, landing and railing
        if (r.type === 'stairs' && !isTop && ((which === 'A') === (r.w >= r.l))) {
          const H = AP.floorH(P, fi), g = AP.stairGeom(r, H), rise = g.rise, tread = g.t, n = g.n;
          const start = which === 'A' ? r.x : r.y, s0 = start + g.a0, rv = AP.stairRev(P, r);
          // positions are worked out from the start of the run; a reversed stair is mirrored along the room
          const U = s => { const w = rv ? 2 * start + g.run - s : s; return M.u(which === 'A' ? w : 0, which === 'A' ? 0 : w); };
          const cutSt = { fill: '#a8a8a8', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' };
          const rl = st(ts, LW.med, { layer: 'RAILING' }), rp = st(ts, LW.thin, { layer: 'RAILING' });
          if (g.type === 'U') {
            const sL = s0 + n * tread, zL = z0 + (n + 1) * rise, sE = start + g.run;
            // first flight up to the landing, the landing slab (cut)
            const pts = [[U(s0), -z0]];
            for (let i = 0; i <= n; i++) { const sx = s0 + i * tread, z = z0 + (i + 1) * rise; pts.push([U(sx), -z]); if (i < n) pts.push([U(sx + tread), -z]); }
            pts.push([U(sE), -zL], [U(sE), -(zL - 0.15)], [U(sL), -(zL - 0.15)], [U(s0 + 0.3), -z0]);
            d.poly(pts, true, cutSt);
            // second flight, from the landing back up to the floor above (beyond the cut)
            const q = [[U(sL), -zL]];
            for (let i = 0; i <= n; i++) { const sx = sL - i * tread, z = zL + (i + 1) * rise; q.push([U(sx), -z]); if (i < n) q.push([U(sx - tread), -z]); }
            q.push([U(s0 - 0.15), -(z0 + H)], [U(s0 - 0.15), -(z0 + H - 0.15)], [U(sL - 0.3), -zL]);
            d.poly(q, true, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' });
            // railing 900 over the nosings of the first flight and along the landing
            d.line(U(s0), -(z0 + rise + 0.9), U(sL), -(zL + 0.9), rl); d.line(U(sL), -(zL + 0.9), U(sE - 0.05), -(zL + 0.9), rl);
            for (let i = 0; i <= n; i++) { const sx = s0 + i * tread + tread / 2, z = z0 + (i + 1) * rise; d.line(U(sx), -z, U(sx), -(z + 0.9), st(ts, LW.fine, { layer: 'RAILING' })); }
            d.line(U(sE - 0.05), -zL, U(sE - 0.05), -(zL + 0.9), rp);
            const ux = U(s0 + n * tread * 0.55), right = U(sL) > U(s0);
            [g.risers + ' R @ ' + AP.mm(rise), g.treads + ' T @ ' + AP.mm(tread), 'LANDING @ +' + (zL - z0).toFixed(2)]
              .forEach((t, j) => d.text(ux + (right ? 0.1 : -0.1), -(z0 + 0.35) + (j - 1) * 2.4 * ts, t, 1.4 * ts, { anchor: right ? 'start' : 'end', layer: 'TEXT' }));
          } else {
            const pts = [[U(s0), -z0]];
            for (let i = 0; i <= n; i++) { const sx = s0 + i * tread, z = z0 + (i + 1) * rise; pts.push([U(sx), -z]); pts.push([U(sx + (i < n ? tread : 0.15)), -z]); }
            const sEnd = s0 + n * tread + 0.15, slope = rise / tread, wst = 0.15 * Math.sqrt(1 + slope * slope);
            pts.push([U(sEnd), -(z0 + H - S.slab)]);
            pts.push([U(s0 + Math.max(0.3, wst * 2)), -z0]); // soffit of the waist slab back down to the floor
            d.poly(pts, true, cutSt);
            // railing 900 above the nosings, posts every 4th step
            const nose = i => [s0 + i * tread, z0 + (i + 1) * rise];
            const [sa, za] = nose(0), [sb, zb] = nose(n);
            d.line(U(sa), -(za + 0.9), U(sb), -(zb + 0.9), rl);
            d.line(U(sb), -(zb + 0.9), U(sb + 0.3), -(zb + 0.9), rl);
            for (let i = 0; i <= n; i += 4) { const [sx, zx] = nose(i); d.line(U(sx + tread / 2), -zx, U(sx + tread / 2), -(zx + 0.9), rp); }
            d.line(U(sb + tread / 2), -zb, U(sb + tread / 2), -(zb + 0.9), rp);
            for (let i = 0; i <= n; i++) { const [sx, zx] = nose(i); d.line(U(sx + tread / 2), -zx, U(sx + tread / 2), -(zx + 0.9), st(ts, LW.fine, { layer: 'RAILING' })); }
            const ux = U(s0 + n * tread * 0.62), right = U(sb) > U(sa);
            [g.risers + ' R @ ' + AP.mm(rise), g.treads + ' T @ ' + AP.mm(tread)]
              .forEach((t, j) => d.text(ux + (right ? 0.1 : -0.1), -(z0 + 0.35) + (j - 1) * 2.4 * ts, t, 1.4 * ts, { anchor: right ? 'start' : 'end', layer: 'TEXT' }));
          }
        }
        labels.push(() => {
        const h = 2.4 * ts, nm = (r.name || '').toUpperCase();
        const hh = Math.min(h, (b - a) * 0.9 / Math.max(1, nm.length * 0.62));
        const zl = r.type === 'stairs' ? z0 + cH - 0.25 : z0 + 1.3; // stairs: name up near the ceiling, clear of the flight
        d.text((a + b) / 2, -zl, nm, hh, { anchor: 'middle', bold: true });
        // the ceiling height is in the CEILING HEIGHTS table beside the sections (AP.clgRows)
        // finish notes, shrunk to fit the room width
        const note = (txt, z, tgt) => {
          if (FN === 'off') return;
          if (FN !== 'inside') { notesOut.push({ txt, u: tgt[0], z: tgt[1], fi, top: isTop }); return; }
          let th = 1.6 * ts; const wmax = (b - a) - 0.15, tw = AP.textWidth(txt, th);
          if (tw > wmax) th = Math.max(1.2 * ts, th * wmax / tw);
          if (AP.textWidth(txt, th) > wmax) return; // too narrow – see the Schedule of Finishes
          d.text(a + 0.08, -z, txt, th, { layer: 'TEXT' });
        };
        // targets of the leaders / numbers: the floor, the wall seen beyond, the ceiling
        note('FLR: ' + fin.floor + (AP.flText(r) ? ', ' + AP.flText(r) : ''), z0 + 0.12, [a + (b - a) * 0.3, z0 - drop + 0.02]);
        if (!AP.isOpen(r)) {
          note('WALL: ' + fin.wall + (fin.tileHt > 0 ? ' UP TO ' + AP.len(fin.tileHt) + ', ' + AP.wallAbove(AP.roomFinish(r)) + ' ABOVE' : ''), z0 + 0.62, [a + (b - a) * 0.75, z0 + 0.5]);
          if (hasC) note('CLG: ' + fin.ceiling, z0 + cH - 0.12 - 1.6 * ts, [a + (b - a) * 0.5, z0 + cH]);
        }
        });
      }
      // doors & windows seen beyond the cut (as seen from inside), unless a nearer wall hides them
      for (const s of seen) {
        if (s.fi !== fi) continue;
        if (spans.some(q => q.fi === fi && q.dp > s.dp + 1e-3 && q.u0 < s.u1 - 0.02 && q.u1 > s.u0 + 0.02)) continue;
        AP.drawOpeningElev(d, s.op, s.u0, s.u1, s.zA, s.zB, ts, s.knob);
        if (o.hits) o.hits.push({ fi, id: s.op.id, u0: s.u0, u1: s.u1, zA: s.zA, zB: s.zB });
      }
      labels.forEach(f => f());
      for (const w of walls) {
        if (w.o !== cutO || !w.t || !(w.a < cut && cut < w.b)) continue;
        const p = AP.wallPt(w.o, w.c, cut);
        const u = M.u(p[0], p[1]);
        const rw = AP.roofAt(P, fi, p[0], p[1], RL), top = w.h ? z0 + w.h : rw && rw.box && w.kind === 'ext' ? zt + S.parapet + Math.max(0, rw.zoff) : zt + (w.kind === 'ext' && rw && rw.zoff > 0 ? rw.zoff : 0);
        const zb = fi === 0 ? -S.plinth : z0;
        d.rect2(u - w.t / 2, -zb, u + w.t / 2, -top, cutFill);
        if (!w.h) d.rect2(u - w.t / 2 - 0.02, -(zt - S.beamDepth), u + w.t / 2 + 0.02, -zt, { fill: '#2a2a2a', stroke: '#000000', w: LW.thin * ts, layer: 'WALLS' });
        if (o.hits) o.hits.push({ wall: true, fi, o: w.o, c: w.c, a: w.a, b: w.b, kind: w.kind, xid: w.id, u0: u - w.t / 2 - 0.05, u1: u + w.t / 2 + 0.05, zA: zb, zB: top, cut: true });
        for (const op of fl.openings) {
          const Ro = AP.resolveOp(fl, op);
          if (!Ro || Ro.o !== w.o || !eq(Ro.c, w.c) || Math.abs(Ro.s - cut) > Ro.w / 2) continue;
          const sill = AP.opSill(op, S);
          d.rect2(u - w.t / 2, -(z0 + sill), u + w.t / 2, -(z0 + sill + op.h), { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'WINDOWS' });
          if (o.hits) o.hits.push({ fi, id: op.id, u0: u - w.t / 2 - 0.1, u1: u + w.t / 2 + 0.1, zA: z0 + sill, zB: z0 + sill + op.h, cut: true });
          if (op.kind !== 'door') d.line(u, -(z0 + sill), u, -(z0 + sill + op.h), st(ts, LW.thin, { layer: 'WINDOWS' }));
        }
        if (fi === 0) {
          // wall footing
          const fb = -S.plinth - 0.70;
          d.rect2(u - w.t / 2, S.plinth, u + w.t / 2, -fb - 0.25, { fill: '#7a7a7a', stroke: '#000000', w: LW.thin * ts, layer: 'FOOTING' });
          d.rect2(u - 0.30, -fb - 0.25, u + 0.30, -fb, { fill: '#c9c9c9', stroke: '#000000', w: LW.thin * ts, layer: 'FOOTING' });
        }
      }
    });
    // walls on the roof beams: cut (filled) or seen beyond the cut
    { const zRB = zOf(P, AP.nLevels(P));
      for (const rw of AP.roofWalls(P)) {
        const a = Math.min(rw.a, rw.b), b = Math.max(rw.a, rw.b);
        if (rw.o === cutO && a < cut && cut < b) {
          const p = AP.wallPt(rw.o, rw.c, cut), u = M.u(p[0], p[1]);
          const zt2 = AP.roofWallTop(P, rw, cut, RL);
          d.rect2(u - rw.t / 2, -zRB, u + rw.t / 2, -zt2, cutFill);
          if (o.hits) o.hits.push({ wall: true, rw: rw.id, fi: ti, u0: u - rw.t / 2 - 0.05, u1: u + rw.t / 2 + 0.05, zA: zRB, zB: zt2, cut: true });
        } else if (rw.o === M.fo && beyond(rw.c)) {
          const pa = AP.wallPt(rw.o, rw.c, a), pb = AP.wallPt(rw.o, rw.c, b), u0 = Math.min(M.u(pa[0], pa[1]), M.u(pb[0], pb[1])), u1 = Math.max(M.u(pa[0], pa[1]), M.u(pb[0], pb[1]));
          const prof = AP.roofWallProfile(P, rw, RL), U = s => { const q = AP.wallPt(rw.o, rw.c, s); return M.u(q[0], q[1]); };
          d.poly([[U(prof[0][0]), -zRB], ...prof.map(q => [U(q[0]), -q[1]]), [U(prof[prof.length - 1][0]), -zRB]], true, Object.assign({ fill: '#ffffff' }, fine));
          if (o.hits) o.hits.push({ wall: true, rw: rw.id, fi: ti, u0, u1, zA: zRB, zB: Math.max(...prof.map(q => q[1])) });
        }
      } }
    // roof cut profile + truss
    let zTop = zOf(P, ti + 1), trussLab = false; // one truss note per section
    for (const R of RL.slice().sort((a, b) => (b.X1 - b.X0) * (b.Y1 - b.Y0) - (a.X1 - a.X0) * (a.Y1 - a.Y0))) {
    if (R.type === 'parapet' && (which === 'A' ? cut > R.Y0 && cut < R.Y1 : cut > R.X0 && cut < R.X1)) {
      // modern box: long span roofing at ~5% slope concealed behind the parapet
      const A0 = which === 'A' ? R.X0 : R.Y0, A1 = which === 'A' ? R.X1 : R.Y1;
      const U = a => M.u(which === 'A' ? a : 0, which === 'A' ? 0 : a);
      const zr = a => R.zTop + 0.15 + 0.05 * (A1 - a);
      d.line(U(A0 + 0.1), -zr(A0 + 0.1), U(A1 - 0.1), -zr(A1 - 0.1), st(ts, LW.thick, { layer: 'ROOF' }));
      d.text(U((A0 + A1) / 2), -zr((A0 + A1) / 2) - 1.2 * ts, 'LONG SPAN ROOFING @ 5% SLOPE BEHIND PARAPET', 1.8 * ts, { anchor: 'middle' });
    }
    if (!R.box) {
      const inside = which === 'A' ? (cut > R.Y0 && cut < R.Y1) : (cut > R.X0 && cut < R.X1);
      const A0 = which === 'A' ? R.X0 : R.Y0, A1 = which === 'A' ? R.X1 : R.Y1;
      const zc = a => (which === 'A' ? R.z(a, cut) : R.z(cut, a));
      if (inside) {
        // an outline roof (L, T …) is cut only where the cut line is under it
        const ins = a => (which === 'A' ? R.inside(a, cut) : R.inside(cut, a)), spans = [];
        { const N = 400; let s0 = null; for (let i = 0; i <= N; i++) { const a = A0 + (A1 - A0) * i / N, k = ins(a); if (k && s0 == null) s0 = a; if ((!k || i === N) && s0 != null) { spans.push([s0, k ? a : A0 + (A1 - A0) * (i - 1) / N]); s0 = null; } } }
        for (const [p0, p1] of spans) {
          if (p1 - p0 < 0.05) continue;
          const prof = AP.profile(zc, p0, p1);
          d.poly(prof.map(p => [M.u(which === 'A' ? p[0] : 0, which === 'A' ? 0 : p[0]), -p[1]]), false, st(ts, LW.thick, { layer: 'ROOF' }));
          d.poly(prof.map(p => [M.u(which === 'A' ? p[0] : 0, which === 'A' ? 0 : p[0]), -(p[1] - 0.10)]), false, st(ts, LW.thin, { layer: 'ROOF' }));
        }
        // gutter profiles where the cut meets an eave
        for (const e of AP.roofEaves(R)) {
          if (e.valley) continue;
          const nA = which === 'A' ? e.n[0] : e.n[1]; if (!nA) continue;          // eave across the cut direction
          const a = nA < 0 ? (spans.length ? spans[0][0] : A0) : (spans.length ? spans[spans.length - 1][1] : A1), uu = M.u(which === 'A' ? a : 0, which === 'A' ? 0 : a), out = M.u(which === 'A' ? nA : 0, which === 'A' ? 0 : nA) - M.u(0, 0);
          const zg = zc(a) - 0.10, G = AP.GUTTER_W;
          d.poly([[uu, -(zg + 0.03)], [uu, -(zg - G)], [uu + out * G, -(zg - G)], [uu + out * G, -(zg + 0.03)]], false, st(ts, LW.med, { layer: 'ROOF' }));
        }
        // steel trusses seen beyond the cut. They span across the ridge, so:
        //  - a section along the ridge sees them edge-on: one vertical per truss, as high as the roof beyond it
        //  - a section across the ridge sees the common truss (the tallest one beyond the cut)
        const b = R.b, t = S.extWall / 2;
        const w0 = (which === 'A' ? b.x0 : b.y0) - t, w1 = (which === 'A' ? b.x1 : b.y1) + t;
        const U = a => M.u(which === 'A' ? a : 0, which === 'A' ? 0 : a);
        const ts1 = st(ts, LW.thin, { layer: 'ROOF' }), tsF = st(ts, LW.fine, { layer: 'ROOF' });
        const bR = which === 'A' ? [R.Y0, cut] : [cut, R.X1];        // the part of the roof beyond the cut
        // only where this roof really is beyond the cut (an L-shaped roof is not a box)
        const zv = a => { let m = -Infinity; for (let i = 0; i <= 24; i++) { const c = bR[0] + (bR[1] - bR[0]) * i / 24, x = which === 'A' ? a : c, y = which === 'A' ? c : a; if (R.inside(x, y)) m = Math.max(m, R.z(x, y)); } return m - 0.10; };
        let wa = Infinity, wb = -Infinity;
        for (let i = 0; i <= 200; i++) { const a = w0 + (w1 - w0) * i / 200; if (zv(a) > R.zTop - 0.2) { wa = Math.min(wa, a); wb = Math.max(wb, a); } }
        if (!(wb > wa)) { uMin = Math.min(uMin, Math.min(U(A0), U(A1))); uMax = Math.max(uMax, Math.max(U(A0), U(A1))); zTop = Math.max(zTop, R.zMax); continue; }
        d.line(U(wa), -R.zTop, U(wb), -R.zTop, ts1);                  // bottom chords on the beams
        const tc = AP.profile(a => Math.max(R.zTop, zv(a)), wa, wb, 120); // top chords seen beyond
        d.poly(tc.map(p => [U(p[0]), -p[1]]), false, tsF);
        const alongRidge = (which === 'A') === R.ridgeX;
        if (alongRidge) {
          const sp = AP.trussSpacing(R), a0 = R.A0 + R.oh, a1 = R.A1 - R.oh;
          for (let a = a0; a <= a1 + 1e-6; a += sp) {
            const zr = zv(a);
            if (zr > R.zTop + 0.04) { d.line(U(a) - 0.025, -R.zTop, U(a) - 0.025, -zr, ts1); d.line(U(a) + 0.025, -R.zTop, U(a) + 0.025, -zr, ts1); }
          }
          if (!trussLab) { trussLab = true; d.text((U(wa) + U(wb)) / 2, -R.zTop - 1.2 * ts, AP.roofTrussMarks(P, R).join(' / ') + ' ' + AP.trussMembers(R.tt).mat + ' TRUSSES @ ' + AP.len(sp) + ' O.C.', 1.6 * ts, { anchor: 'middle', layer: 'TEXT' }); }
        } else {
          const n = Math.max(4, Math.round((wb - wa) / 0.6));
          let prev = null;
          for (let i = 0; i <= n; i++) {
            const a = wa + (wb - wa) * i / n, zr = zv(a);
            if (zr > R.zTop + 0.04) d.line(U(a), -R.zTop, U(a), -zr, ts1);
            if (prev != null) {
              const pz = zv(prev);
              if (i % 2) { if (zr > R.zTop + 0.04) d.line(U(prev), -R.zTop, U(a), -zr, ts1); }
              else if (pz > R.zTop + 0.04) d.line(U(prev), -pz, U(a), -R.zTop, ts1);
            }
            prev = a;
          }
        }
        uMin = Math.min(uMin, Math.min(U(A0), U(A1))); uMax = Math.max(uMax, Math.max(U(A0), U(A1)));
      }
      if (inside || behind(R)) zTop = Math.max(zTop, R.zMax);
    } else zTop = Math.max(zTop, R.zTop + S.parapet);
    }
    if (o.collect) o.collect.push(...notesOut); // AP.finishKeys: the notes of every section
    if (notesOut.length && !o.collect) finishNotesOut(d, notesOut, FN, uMax, zTop, ts, o.keys, S.plinth);
    if (!o.onSheet && !o.collect) { // alone (Details tab): the ceiling heights table beside it, under any legend
      const rows = AP.clgRows(P), x = (uMax + 1.4) / ts, y = (-zTop + 2 * ts) / ts + (FN === 'keyed' && !o.keys ? (new Set(notesOut.map(n => n.txt)).size + 2) * 3.4 : FN === 'leader' ? notesOut.length * 3.4 + 2 : 0);
      const t = new AP.Drawing(); AP.drawClgTable(t, rows, 0, 0, 1); d.append(t.transform(ts, x * ts, y * ts));
    }
    groundLine(d, uMin, uMax, P, ts);
    levelMarks(d, P, uMin - 1.5, zTop, ts, false);
    gridTop(d, P, M, ts, zTop, null, null);
    return d;
  };
  // finish notes outside the section, to the right: with leader lines & arrows, or as numbers with a legend
  // CEILING HEIGHTS: every room, floor to ceiling (or exposed)
  AP.clgRows = function (P) {
    const S = P.settings, rows = [], many = P.floors.filter(f => f.rooms.length).length > 1;
    P.floors.forEach((f, fi) => { for (const r of f.rooms) {
      if (AP.isOpen(r)) continue;
      rows.push([(r.name || '').toUpperCase() + (many ? ' (' + (fi === 0 ? 'GF' : AP.floorName(fi).split(' ')[0].replace('SECOND', '2F').replace('THIRD', '3F').replace('FOURTH', '4F')) + ')' : ''), AP.hasCeiling(r) ? AP.mm(AP.ceilHt(r, S)) : 'EXPOSED']);
    } });
    return rows;
  };
  // the table in paper mm (u = mm per unit) at (x, y); returns its height
  AP.drawClgTable = function (d, rows, x, y, u, part) {
    u = u || 1;
    const w1 = 46 * u, w2 = 22 * u, rh = 4.4 * u, th = 2.1 * u, s = { stroke: '#000000', w: 0.18 * u, layer: 'TEXT' };
    if (!part) d.text(x, y + 3 * u, 'CEILING HEIGHTS', 3.2 * u, { bold: true, layer: 'TEXT' });
    // a long list in columns side by side (7 rooms each) so the table stays low
    if (rows.length > 7) {
      let hh = 0; const per = Math.ceil(rows.length / Math.ceil(rows.length / 7));
      for (let c = 0; c * per < rows.length; c++) hh = Math.max(hh, AP.drawClgTable(d, rows.slice(c * per, (c + 1) * per), x + c * (w1 + w2 + 5 * u), y, u, true));
      return hh;
    }
    const y0 = y + 6 * u, n = rows.length + 1;
    d.rect(x, y0, w1 + w2, n * rh, Object.assign({ fill: 'none' }, s));
    d.line(x + w1, y0, x + w1, y0 + n * rh, s);
    for (let i = 1; i < n; i++) d.line(x, y0 + i * rh, x + w1 + w2, y0 + i * rh, s);
    d.text(x + 1.5 * u, y0 + rh - 1.3 * u, 'ROOM', th, { bold: true, layer: 'TEXT' });
    d.text(x + w1 + w2 / 2, y0 + rh - 1.3 * u, 'FLR. TO CLG.', th * 0.9, { anchor: 'middle', bold: true, layer: 'TEXT' });
    rows.forEach((r, i) => {
      const yy = y0 + (i + 2) * rh - 1.3 * u;
      d.text(x + 1.5 * u, yy, r[0], th, { layer: 'TEXT' });
      d.text(x + w1 + w2 / 2, yy, r[1], th, { anchor: 'middle', layer: 'TEXT' });
    });
    return 6 * u + n * rh;
  };
  // one numbering for every section of the project (the sheet then has one legend for all of them)
  AP.finishKeys = function (P) {
    const keys = [];
    for (const w of ['A', 'B']) { const o = { ts: 0.1, collect: [] }; AP.renderSection(P, w, o); for (const n of o.collect) if (keys.indexOf(n.txt) < 0) keys.push(n.txt); }
    return keys;
  };
  // the FINISHES legend in paper mm at (x, y) – top left corner of the sheet
  AP.drawFinishLegend = function (d, keys, x, y) {
    const th = 2.3, gap = 4.6, r = 1.9;
    d.text(x, y + 3, 'FINISHES', 3.2, { bold: true, layer: 'TEXT' });
    keys.forEach((t, i) => {
      const yy = y + 9 + i * gap;
      d.circle(x + r, yy - 0.8, r, { fill: '#ffffff', stroke: '#000000', w: 0.2, layer: 'TEXT' });
      d.text(x + r, yy - 0.8, keyNo(i + 1), 1.8, { anchor: 'middle', v: 'middle', bold: true, layer: 'TEXT' });
      d.text(x + 2 * r + 1.5, yy, t, th, { layer: 'TEXT' });
    });
    return 9 + keys.length * gap;
  };
  const keyNo = k => String(k).padStart(2, '0'); // 01, 02 …
  // circles of one row (same n.cy) spread at least a circle apart, each group of crowded ones centred over its
  // targets (n.u) -> n.cu. Close targets (near columns / grids) keep their circles apart; the leaders jog to reach them
  function spreadRow(row, gap) {
    row.sort((a, b) => a.u - b.u);
    const G = [];
    for (const n of row) {
      G.push({ items: [n], c: n.u });
      for (;;) { // merge with the group before while they overlap
        const b = G[G.length - 1], a = G[G.length - 2];
        if (!a || a.c + (a.items.length - 1) * gap / 2 + gap <= b.c - (b.items.length - 1) * gap / 2) break;
        const items = a.items.concat(b.items);
        G.splice(-2, 2, { items, c: items.reduce((s, q) => s + q.u, 0) / items.length });
      }
    }
    // a pair: the first stays straight over its target, the next one jogs (unless that runs into the group before)
    G.forEach((g, gi) => {
      const m = g.items.length, prev = G[gi - 1];
      let c = g.c;
      if (m === 2) { const c2 = g.items[0].u + gap / 2; if (!prev || prev.right + gap <= c2 - gap / 2) c = c2; }
      g.items.forEach((n, i) => { n.cu = c + (i - (m - 1) / 2) * gap; });
      g.right = g.items[m - 1].cu;
    });
    // arrows on (nearly) the same spot: side by side
    const tg = gap * 0.36;
    for (let i = 1; i < row.length; i++) { const pu = row[i - 1].tu ?? row[i - 1].u; if (row[i].u - pu < tg && Math.abs(row[i].z - row[i - 1].z) < 0.3) row[i].tu = pu + tg; }
  }
  // one pointer: numbered circle at c, dashed leader straight down/up from it, a 45° jog over to the target's
  // line when the circle had to move aside, then parallel down/up to an open arrow on the target
  function drawPointer(d, c, tip, k, r, ts) {
    const sg = c[1] < tip[1] ? 1 : -1, ah = 1.3 * ts, end = tip[1] - sg * 0.3 * ts, dx = tip[0] - c[0];
    const ls = { stroke: '#000000', w: LW.thin * ts, dash: [1.2 * ts, 0.8 * ts], layer: 'TEXT' };
    const y0 = c[1] + sg * r, run = Math.abs(end - y0);
    if (Math.abs(dx) < 0.3 * r || run < 2 * ah) d.line(c[0], y0, tip[0], end, ls);
    else {
      const stub = Math.min(2.2 * r, run * 0.3), jy = Math.min(Math.abs(dx), Math.max(0, run - stub - 2 * ah));
      const y1 = y0 + sg * stub, y2 = y1 + sg * jy;
      d.poly([[c[0], y0], [c[0], y1], [tip[0], y2], [tip[0], end]], false, ls);
    }
    d.poly([[tip[0] - ah * 0.6, tip[1] - sg * ah], tip, [tip[0] + ah * 0.6, tip[1] - sg * ah]], false, { stroke: '#000000', w: LW.thin * ts, layer: 'TEXT' });
    d.circle(c[0], c[1], r, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'TEXT' });
    d.text(c[0], c[1], keyNo(k), 1.6 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'TEXT' });
  }
  // numbered pointers in two rows (n.up: above the drawing, else below): circle, dashed line, open arrow; a legend beside
  // when the sheet does not carry one (keys = the sheet's numbering)
  AP.drawPointers = function (d, notes, gkeys, R, ts) {
    const keys = gkeys ? gkeys.slice() : [], r = 1.9 * ts;
    for (const n of notes) { let k = keys.indexOf(n.txt); if (k < 0) { keys.push(n.txt); k = keys.length - 1; } n.k = k + 1; }
    for (const up of [true, false]) spreadRow(notes.filter(n => !!n.up === up), 2.6 * r);
    for (const n of notes) drawPointer(d, [n.cu, n.up ? R.yAbove : R.yBelow], [n.tu ?? n.u, -n.z], n.k, r, ts);
    if (gkeys) return;
    const gap = 3.4 * ts, th = 1.6 * ts, x0 = R.legendX, y0 = R.legendY;
    d.text(x0 - r, y0 - gap * 0.6, 'FINISHES', 2 * ts, { bold: true, layer: 'TEXT' });
    keys.forEach((t, i) => {
      const y = y0 + (i + 0.6) * gap;
      d.circle(x0, y - 0.35 * th, r, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'TEXT' });
      d.text(x0, y - 0.35 * th, keyNo(i + 1), 1.4 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'TEXT' });
      d.text(x0 + r + 0.8 * ts, y, t, th, { layer: 'TEXT' });
    });
  };
  // the elevations' numbering (one legend on the elevations sheet)
  AP.elevKeys = function (P) {
    const keys = [];
    for (const k of ['S', 'N', 'W', 'E']) { const o = { ts: 0.1, collect: [] }; AP.renderElevation(P, k, o); for (const n of o.collect) if (keys.indexOf(n.txt) < 0) keys.push(n.txt); }
    return keys;
  };
  function finishNotesOut(d, notes, FN, uMax, zTop, ts, gkeys, plinth) {
    const th = 1.6 * ts, gap = 3.4 * ts, x0 = uMax + 1.4, ls = st(ts, LW.fine, { layer: 'TEXT' });
    const arrowAt = (p, from) => {
      const dx = p[0] - from[0], dy = p[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, h = 1.4 * ts, w = 0.5 * ts;
      d.poly([p, [p[0] - ux * h - uy * w, p[1] - uy * h + ux * w], [p[0] - ux * h + uy * w, p[1] - uy * h - ux * w]], true, { fill: '#000000', stroke: 'none', layer: 'TEXT' });
    };
    if (FN === 'leader') {
      // one row per note, highest first, so the leaders cross as little as possible
      const L = notes.slice().sort((p, q) => q.z - p.z || q.u - p.u), y0 = -zTop + 2 * ts;
      L.forEach((n, i) => {
        const y = y0 + i * gap, tgt = [n.u, -n.z], knee = [x0 - 0.5, y - 0.35 * th];
        d.text(x0, y, n.txt, th, { layer: 'TEXT' });
        d.line(x0 - 0.1, knee[1], knee[0], knee[1], ls);
        d.lineP(knee, tgt, ls);
        arrowAt(tgt, knee);
        d.circle(knee[0], knee[1], 0.25 * ts, { fill: '#000000', stroke: 'none', layer: 'TEXT' });
      });
      return;
    }
    // keyed: the same finish keeps one number
    // numbers: the project's (one legend on the sheet), else this section's own with its legend beside it
    const keys = gkeys ? gkeys.slice() : [];
    for (const n of notes) { let k = keys.indexOf(n.txt); if (k < 0) { keys.push(n.txt); k = keys.length - 1; } n.k = k + 1; }
    const r = 1.9 * ts;
    // pointer: the numbered circle, a dashed line, an open arrow on the floor / wall / ceiling it names
    for (const n of notes) {
      // numbers in two rows, clear of the dimensions: above the roof (under the dimension lines) and below the section.
      // Top-floor ceilings go above, ground floors below, walls to the nearer row; the rest stay inside the room
      const up = /^CLG/.test(n.txt), wall = /^WALL/.test(n.txt), yBelow = (plinth || 0.3) + 1.3, yAbove = -zTop - 2.6 * ts;
      const wallUp = wall && (zTop - n.z) < (n.z + yBelow);
      const out = wall ? true : up ? n.top : /^FLR/.test(n.txt) && n.fi === 0;
      n.cy = out ? (up || wallUp ? yAbove : yBelow) : -(up ? n.z - 0.65 : n.z + 0.65);
    }
    // circles sharing a row kept apart (close columns / grids), the leaders jog to their targets
    const rows = new Map();
    for (const n of notes) { const key = n.cy.toFixed(3); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(n); }
    for (const row of rows.values()) spreadRow(row, 2.6 * r);
    for (const n of notes) drawPointer(d, [n.cu, n.cy], [n.tu ?? n.u, -n.z], n.k, r, ts);
    if (gkeys) return;
    const y0 = -zTop + 2 * ts;
    d.text(x0 - r, y0 - gap * 0.6, 'FINISHES', 2 * ts, { bold: true, layer: 'TEXT' });
    keys.forEach((t, i) => {
      const y = y0 + (i + 0.6) * gap;
      d.circle(x0, y - 0.35 * th, r, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'TEXT' });
      d.text(x0, y - 0.35 * th, keyNo(i + 1), 1.4 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'TEXT' });
      d.text(x0 + r + 0.8 * ts, y, t, th, { layer: 'TEXT' });
    });
  }

  /* ---------- TOILET DETAILS ---------- */
  const SIDE_NAME = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };
  const NEIGH = { N: ['W', 'E'], E: ['N', 'S'], S: ['E', 'W'], W: ['S', 'N'] };
  function sideT(walls, r, side) {
    const si = AP.sideInfo(r, side);
    const w = AP.wallAt(walls, si.o, si.c, si.s0 + si.len / 2);
    return w ? w.t : 0;
  }
  AP.toiletKey = r => [Math.min(r.w, r.l).toFixed(2), Math.max(r.w, r.l).toFixed(2)].join('x');
  AP.toiletRooms = function (P) {
    const out = [], seen = new Set();
    P.floors.forEach((f, fi) => f.rooms.forEach(r => {
      if (r.type !== 'toilet') return;
      const key = [Math.min(r.w, r.l).toFixed(2), Math.max(r.w, r.l).toFixed(2)].join('x');
      if (seen.has(key)) return; seen.add(key);
      out.push({ fi, room: r });
    }));
    return out;
  };
  AP.renderToiletPlan = function (P, fi, r, o) {
    const ts = o.ts, S = P.settings, d = new AP.Drawing(), fl = P.floors[fi];
    const walls = AP.computeWalls(fl, S), C = AP.columns(P), marks = AP.opMarks(P).marks;
    const m = 0.45, wx0 = r.x - m, wx1 = r.x + r.w + m, wy0 = r.y - m, wy1 = r.y + r.l + m;
    d.rect(r.x, r.y, r.w, r.l, { fill: 'none', stroke: 'none' });
    const step = 0.3, hs = st(ts, LW.fine, { stroke: '#8fb8bf', layer: 'HATCH' });
    for (let x = r.x + step; x < r.x + r.w - 0.01; x += step) d.line(x, r.y, x, r.y + r.l, hs);
    for (let y = r.y + step; y < r.y + r.l - 0.01; y += step) d.line(r.x, y, r.x + r.w, y, hs);
    AP.drawFixtures(d, fl, r, S, ts);
    for (const f of fl.furniture || []) if (f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.l) AP.drawFurniture(d, f, ts, false);
    for (const w of walls) {
      if (!w.t) continue;
      const inLine = w.o === 'h' ? w.c > wy0 && w.c < wy1 : w.c > wx0 && w.c < wx1;
      if (!inLine) continue;
      const lo = w.o === 'h' ? wx0 : wy0, hi = w.o === 'h' ? wx1 : wy1;
      const a = Math.max(w.a - w.ea, lo), b = Math.min(w.b + w.eb, hi);
      if (b <= a) continue;
      const h = w.t / 2;
      if (w.o === 'h') d.rect2(a, w.c - h, b, w.c + h, { fill: '#6b6b6b', stroke: 'none', layer: 'WALLS' });
      else d.rect2(w.c - h, a, w.c + h, b, { fill: '#6b6b6b', stroke: 'none', layer: 'WALLS' });
    }
    for (const c of C.cols) if (c.top >= fi && c.x > wx0 && c.x < wx1 && c.y > wy0 && c.y < wy1)
      AP.drawColumn(d, c, { fill: '#111111', stroke: 'none', layer: 'COLUMNS' });
    for (const op of fl.openings) {
      const R = AP.resolveOp(fl, op);
      if (!R) continue;
      const p = AP.wallPt(R.o, R.c, R.s);
      if (p[0] > wx0 && p[0] < wx1 && p[1] > wy0 && p[1] < wy1) AP.drawOpeningPlan(d, fl, walls, op, ts, marks[op.id], false);
    }
    const tN = sideT(walls, r, 'N'), tS = sideT(walls, r, 'S'), tW = sideT(walls, r, 'W'), tE = sideT(walls, r, 'E');
    AP.dimChain(d, [r.x + tW / 2, r.x + r.w - tE / 2], r.y - tN / 2 - 7 * ts, 'h', ts);
    AP.dimChain(d, [r.y + tN / 2, r.y + r.l - tS / 2], r.x - tW / 2 - 7 * ts, 'v', ts);
    d.text(r.x + r.w / 2, r.y + r.l / 2, (r.name || 'T&B').toUpperCase(), 2.6 * ts, { anchor: 'middle', v: 'middle', bold: true });
    return d;
  };
  // finishes & fixtures of a T&B as a table (under the enlarged plan; the interior elevations carry no notes)
  AP.renderToiletFinishes = function (P, fi, r, o) {
    const ts = o.ts, d = new AP.Drawing();
    const F = AP.roomFinish(r), wrap = (t, n) => { const w = String(t).split(' '), L = ['']; for (const x of w) { if ((L[L.length - 1] + ' ' + x).trim().length > n && L[L.length - 1]) L.push(x); else L[L.length - 1] = (L[L.length - 1] + ' ' + x).trim(); } return L.join('\n'); };
    const tiled = F.tileHt > 0;
    const rows = [['FLOOR', F.floor], [tiled ? 'WALL (TILES)' : 'WALL', F.wall + (tiled ? ' UP TO ' + AP.len(F.tileHt) + ' HT.' : '')],
      ...(tiled ? [['WALL ABOVE TILES', AP.wallAbove(F)]] : []),
      ['CEILING', AP.hasCeiling(r) ? F.ceiling + ', CLG. HT. ' + AP.len(AP.ceilHt(r, P.settings)) : 'NONE (EXPOSED)'],
      ['FIXTURES', 'WATER CLOSET: FLUSH TANK TYPE, LAVATORY: WALL HUNG, FLOOR DRAIN: 100mm DIA. STAINLESS, SLOPE 1% TO F.D.']].map(([a, b]) => [a, wrap(b, 46)]);
    AP.table(d, 0, 0, [{ h: 'ITEM', w: 28 }, { h: 'FINISH / SPECIFICATION', w: 74 }], rows, ts);
    return d;
  };
  AP.renderToiletElev = function (P, fi, r, side, o) {
    const ts = o.ts, S = P.settings, d = new AP.Drawing(), fl = P.floors[fi];
    const walls = AP.computeWalls(fl, S);
    const len = AP.sideLen(r, side);
    const [nA, nB] = NEIGH[side];
    const tA = sideT(walls, r, nA), tB = sideT(walls, r, nB);
    // tiles: the wall's own tile height (a T&B without one gets the project's toilet tile height)
    const fin = AP.wallFinish(r, side), L = len - tA / 2 - tB / 2, H = AP.ceilHt(r, S), TH = Math.min(fin.tileHt > 0 ? fin.tileHt : r.type === 'toilet' ? S.tileHt : 0, H);
    const U = s => s - tA / 2; // frame s -> interior elevation u
    const sTile = st(ts, LW.fine, { stroke: '#8a9ea2', layer: 'HATCH' });
    for (let z = 0.3; z < TH - 0.01; z += 0.3) d.line(0, -z, L, -z, sTile);
    for (let u = 0.6; u < L - 0.01; u += 0.6) d.line(u, 0, u, -TH, sTile);
    d.line(0, -TH, L, -TH, st(ts, LW.thin, { layer: 'WALLS' }));
    // openings on this wall
    const si = AP.sideInfo(r, side);
    const toS = sw => {
      switch (side) { case 'N': return sw - r.x; case 'S': return r.x + r.w - sw; case 'W': return r.y + r.l - sw; default: return sw - r.y; }
    };
    for (const op of fl.openings) {
      const R = AP.resolveOp(fl, op);
      if (!R || R.o !== si.o || !eq(R.c, si.c) || R.s < si.s0 || R.s > si.s0 + si.len) continue;
      const a = U(toS(R.s - R.w / 2)), b = U(toS(R.s + R.w / 2));
      const sill = AP.opSill(op, S);
      AP.drawOpeningElev(d, op, Math.min(a, b), Math.max(a, b), sill, sill + op.h, ts, true);
    }
    // fixtures on this wall
    const fs = st(ts, LW.thin, { layer: 'FIXTURES' }), ff = st(ts, LW.fine, { layer: 'FIXTURES' });
    for (const f of AP.allFixtures(fl, r, S)) {
      if (f.side !== side) continue;
      const a = U(f.s0), b = U(f.s1), c = (a + b) / 2;
      const EB = { wc: 'WC-S-EL1', lav: 'LAV1-E2', shower: 'SH-1EL2' }[f.kind];
      const Bk = EB && AP.BLOCKS && AP.BLOCKS[EB];
      if (Bk) { // template elevation block standing on the floor, centred on the fixture
        const ub = c - Bk.w / 2;
        AP.drawBlock(d, EB, (x, y) => [ub + x, -y], fs);
        continue;
      }
      if (f.kind === 'wc') {
        d.rect2(a + 0.02, -0.42, b - 0.02, -0.80, Object.assign({ fill: '#ffffff' }, fs));
        d.poly([[a + 0.03, -0.42], [b - 0.03, -0.42], [b - 0.09, 0], [a + 0.09, 0]], true, Object.assign({ fill: '#ffffff' }, fs));
        d.line(a + 0.02, -0.45, b - 0.02, -0.45, ff);
      } else if (f.kind === 'lav') {
        d.rect2(a, -0.70, b, -0.84, Object.assign({ fill: '#ffffff' }, fs));
        d.rect2(c - 0.08, 0, c + 0.08, -0.70, Object.assign({ fill: '#ffffff' }, fs));
        d.rect2(c - 0.02, -0.84, c + 0.02, -0.96, fs);
        d.rect2(c - 0.25, -1.20, c + 0.25, -1.90, Object.assign({ fill: '#eef6fa' }, ff));
        d.text(c, -1.55, 'MIRROR', 1.6 * ts, { anchor: 'middle', v: 'middle' });
      } else if (f.kind === 'shower') {
        d.line(c, -2.15, c, -2.05, fs); d.poly([[c - 0.08, -2.05], [c + 0.08, -2.05], [c + 0.05, -1.98], [c - 0.05, -1.98]], true, fs);
        d.circle(c, -1.10, 0.05, fs);
        d.line(a, -2.0, b, -2.0, st(ts, LW.thin, { layer: 'FIXTURES', dash: [1.5 * ts, 1 * ts] }));
        d.text(c, -1.75, 'SHOWER', 1.6 * ts, { anchor: 'middle' });
      } else {
        // other pieces against this wall: their front seen as a block of their height
        const HT = { counter: 0.9, counterL: 0.9, sink: 0.9, stove: 0.9, washer: 0.9, tub: 0.85 }[f.kind];
        if (!HT) continue;
        const u0 = Math.min(a, b), u1 = Math.max(a, b);
        d.rect2(u0, 0, u1, -HT, Object.assign({ fill: '#ffffff' }, fs));
        if (/counter/.test(f.kind)) { d.rect2(u0, -HT + 0.04, u1, -HT, ff); for (let u = u0 + 0.6; u < u1 - 0.05; u += 0.6) d.line(u, -0.1, u, -HT + 0.04, ff); }
        if (f.kind === 'counter' || f.kind === 'counterL') d.rect2(u0, -1.5, u1, -2.1, Object.assign({ fill: '#ffffff' }, ff)); // wall cabinet
        d.text((u0 + u1) / 2, -HT / 2, { counter: 'COUNTER', counterL: 'COUNTER', sink: 'SINK', stove: 'STOVE', washer: 'WASHER', tub: 'LAUNDRY TUB' }[f.kind], 1.5 * ts, { anchor: 'middle', v: 'middle' });
      }
    }
    d.rect2(0, 0, L, -H, st(ts, LW.thick, { layer: 'WALLS' }));
    d.line(-0.3, 0, L + 0.3, 0, st(ts, LW.thick, { layer: 'WALLS' }));
    AP.dimChain(d, [0, L], 6 * ts, 'h', ts);
    AP.dimChain(d, TH > 0 ? [0, -TH, -H] : [0, -H], L + 6 * ts, 'v', ts);
    // the finishes are in the table under the enlarged plan
    void fin;
    return d;
  };
  // the four walls of a room seen from inside, two by two, each with its title
  AP.renderRoomInside = function (P, fi, r, o) {
    const ts = o.ts, d = new AP.Drawing(), W = { N: 'NORTH WALL', E: 'EAST WALL', S: 'SOUTH WALL', W: 'WEST WALL' };
    const parts = ['N', 'E', 'S', 'W'].map(sd => ({ sd, e: AP.renderToiletElev(P, fi, r, sd, { ts }) })).map(q => Object.assign(q, { b: q.e.bbox() }));
    const cw = Math.max(...parts.map(q => q.b.w)) + 10 * ts, ch = Math.max(...parts.map(q => q.b.h)) + 16 * ts;
    parts.forEach((q, i) => {
      const ox = (i % 2) * cw - q.b.x0, oy = Math.floor(i / 2) * ch - q.b.y0 + 6 * ts;
      d.append(q.e.transform(1, ox, oy));
      d.text(ox + q.b.x0, oy + q.b.y0 - 3 * ts, (r.name || '').toUpperCase() + ' – ' + W[q.sd], 2.4 * ts, { bold: true });
    });
    return d;
  };
  AP.SIDE_NAME = SIDE_NAME;

  /* ---------- DOORS & WINDOWS SCHEDULE ---------- */
  AP.renderDWSchedule = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    const T = AP.opMarks(P).types;
    if (!T.length) { d.text(0, 0, 'NO DOORS / WINDOWS PLACED YET', 3 * ts, {}); return d; }
    // paper units (x ts): each door / window elevation at 1:75 with its text under it; the sheet shrinks the whole
    // block evenly when its space is small (elevations and text together, nothing runs into anything)
    const k = ts * 1000 / 75, tsO = ts / k;
    const rows = Math.min(T.length, o.rows || (T.length <= 6 ? 1 : T.length <= 12 ? 2 : 3));
    const perRow = Math.ceil(T.length / rows);
    const th = 1.9 * ts;
    const wrap = (s, n) => { const o = []; let c = ''; for (const w of String(s).split(' ')) { if ((c + ' ' + w).trim().length > n) { if (c) o.push(c); c = w; } else c = (c + ' ' + w).trim(); } if (c) o.push(c); return o; };
    // the blocks of one row share its height; rows stack under each other
    const items = T.map(t => {
      const tpl = AP.tplOf(t);
      const lines = [...wrap('DESCRIPTION : ' + (tpl.desc || tpl.name || ''), 26), 'QUANTITY : ' + t.n, ...wrap('LOCATION : ' + t.rooms.join(', ').toUpperCase(), 26).slice(0, 4)];
      const textW = Math.max(...lines.map(l => AP.textWidth(l, th)));
      const top = t.sill + t.h, z0 = t.sill;
      const g = new AP.Drawing();
      AP.drawOpeningElev(g, t, 0, t.w, z0, top, tsO, true);
      g.line(-0.3, 0, t.w + 0.3, 0, st(tsO, LW.thick));
      AP.dimChain(g, [0, t.w], -top - 5 * tsO, 'h', tsO);
      AP.dimChain(g, t.sill ? [0, -z0, -top] : [0, -top], t.w + 5 * tsO, 'v', tsO);
      if (t.sill) AP.dimChain(g, [0, -top], t.w + 11 * tsO, 'v', tsO);
      const elev = g.transform(k, 0, 0); // now in paper units, ground line at y = 0
      const blockW = Math.max(t.w * k + 17 * ts, textW) + 6 * ts;
      return { t, lines, elev, topP: top * k, blockW };
    });
    let yb = 0;
    for (let r = 0; r < rows; r++) {
      const row = items.slice(r * perRow, (r + 1) * perRow); if (!row.length) break;
      const up = Math.max(...row.map(it => it.topP)) + 9 * ts; // room above the ground line for the tallest one
      const down = Math.max(...row.map(it => (it.lines.length * 3 + 16) * ts));
      let x = 0;
      for (const it of row) {
        const g = new AP.Drawing(); g.append(it.elev);
        let ty = 7 * ts;
        for (const l of it.lines) { g.text(0, ty, l, th, {}); ty += 3 * ts; }
        g.text(0, ty + 6 * ts, it.t.mark, 5 * ts, {});
        d.append(g.transform(1, x, yb + up));
        x += it.blockW;
      }
      yb += up + down + 4 * ts;
    }
    return d;
  };
  /* ---------- tables ---------- */
  AP.table = function (d, x, y, cols, rows, ts, title) {
    const rh = 6 * ts, lh = 3 * ts, s = st(ts, LW.thin, { layer: 'TEXT' }), sk = st(ts, LW.med, { layer: 'TEXT' });
    const W = cols.reduce((a, c) => a + c.w, 0) * ts;
    if (title) { d.text(x + W / 2, y - 2.5 * ts, title, 3.2 * ts, { anchor: 'middle', bold: true }); }
    const all = [cols.map(c => c.h), ...rows];
    const nl = r => Math.max(1, ...r.map(v => String(v).split('\n').length));
    const ys = [y];
    all.forEach((r, i) => ys.push(ys[i] + rh + (nl(r) - 1) * lh));
    all.forEach((r, i) => { if (r.sh) d.rect(x, ys[i], W, ys[i + 1] - ys[i], { fill: '#e6e6e6', stroke: 'none', layer: 'TEXT' }); });
    all.forEach((r, i) => {
      let cx = x;
      const yy = ys[i], hh = ys[i + 1] - ys[i];
      r.forEach((v, j) => {
        const w = cols[j].w * ts, L = String(v).split('\n'), al = i ? cols[j].a : null;
        const tx = al === 'l' ? cx + 1.2 * ts : al === 'r' ? cx + w - 1.2 * ts : cx + w / 2, an = al === 'l' ? 'start' : al === 'r' ? 'end' : 'middle';
        L.forEach((t, k) => d.text(tx, yy + hh / 2 + (k - (L.length - 1) / 2) * lh, t, (i ? 2.1 : 2.2) * ts, { anchor: an, v: 'middle', bold: i === 0 || !!r.b }));
        cx += w;
      });
    });
    const H = ys[all.length] - y;
    d.rect(x, y, W, H, sk);
    for (let i = 1; i < all.length; i++) d.line(x, ys[i], x + W, ys[i], i === 1 ? sk : s);
    let cx = x;
    for (let j = 0; j < cols.length - 1; j++) { cx += cols[j].w * ts; d.line(cx, y, cx, y + H, s); }
    return { w: W, h: H };
  };

  AP.renderColumnSchedule = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), C = AP.columns(P);
    AP.table(d, 0, 0, [{ h: 'MARK', w: 14 }, { h: 'SIZE (' + AP.unitSuf() + ')', w: 22 }, { h: 'MAIN BARS', w: 26 }, { h: 'LATERAL TIES', w: 58 }, { h: 'QTY', w: 12 }],
      C.ctypes.map(c => [c.mark, AP.colDesc(c), c.bars, c.ties, c.n]), ts, 'SCHEDULE OF COLUMNS');
    const y = (C.ctypes.length + 1) * 6 * ts + 14 * ts;
    AP.table(d, 0, y, [{ h: 'MARK', w: 14 }, { h: 'SIZE (' + AP.unitSuf() + ')', w: 26 }, { h: 'THK.', w: 14 }, { h: 'REINFORCEMENT', w: 52 }, { h: 'DEPTH', w: 14 }, { h: 'QTY', w: 12 }],
      C.ftypes.map(f => [f.mark, AP.mm(f.size) + ' x ' + AP.mm(f.size), AP.mm(f.t), f.bars, AP.mm(P.settings.footDepth), f.n]), ts, 'SCHEDULE OF FOOTINGS');
    let y2 = y + (C.ftypes.length + 1) * 6 * ts + 14 * ts;
    // schedule of beams (tie beams, floor beams, roof beams as drawn on the beam plans)
    const BT = AP.allBeams(P).types;
    if (BT.length) {
      const NM = { TB: 'TIE BEAM', B: 'FLOOR BEAM', RB: 'ROOF BEAM' };
      AP.table(d, 0, y2, [{ h: 'MARK', w: 14 }, { h: 'TYPE', w: 22 }, { h: 'SIZE (' + AP.unitSuf() + ')', w: 24 }, { h: 'TOP BARS', w: 22 }, { h: 'BOTTOM BARS', w: 22 }, { h: 'STIRRUPS', w: 40 }, { h: 'QTY', w: 10 }],
        BT.map(t => [t.mark, NM[t.kind], AP.mm(t.w) + ' x ' + AP.mm(t.h), t.top + '-16mm DIA.', t.bot + '-16mm DIA.', '10mm DIA. 1@50, 5@100, R@200', t.n]), ts, 'SCHEDULE OF BEAMS');
      y2 += (BT.length + 1) * 6 * ts + 8 * ts;
    } else y2 -= 6 * ts;
    // TRUSS SCHEDULE (the roof framing plan's trusses)
    const TS = AP.trussSchedule && AP.trussSchedule(P);
    if (TS) {
      y2 += 6 * ts;
      AP.table(d, 0, y2, TS.cols, TS.rows, ts, 'TRUSS SCHEDULE');
      y2 += (TS.rows.length + 1) * 6 * ts + 4 * ts;
      TS.notes.forEach(t => { d.text(0, y2, t, 2 * ts, {}); y2 += 3.2 * ts; });
      y2 += 4 * ts;
    }
    d.text(0, y2, 'NOTE: SIZES ARE PRELIMINARY, COMPUTED FROM SPANS AND ASSUMED LOADS', 2 * ts, {});
    d.text(0, y2 + 3.2 * ts, '(SOIL BEARING ' + P.settings.soil + ' kPa). TO BE VERIFIED AND SIGNED BY A LICENSED CIVIL ENGINEER.', 2 * ts, {});
    return d;
  };

  AP.renderFootingDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), C = AP.columns(P), S = P.settings;
    const F = C.ftypes[C.ftypes.length - 1] || { size: 1.2, t: 0.3, mark: 'F1' };
    const col = C.ctypes[C.ctypes.length - 1] || { size: 0.25 };
    const B = F.size, t = F.t, D = S.footDepth, c = col.size;
    const s = st(ts, LW.med, { layer: 'FOOTING' });
    d.rect2(-B / 2, D, B / 2, D - t, Object.assign({ fill: '#d6d6d6' }, s));
    d.rect2(-B / 2 - 0.05, D + 0.05, B / 2 + 0.05, D, st(ts, LW.thin, { layer: 'FOOTING', dash: [1 * ts, 0.6 * ts] }));
    d.rect2(-c / 2, D - t, c / 2, -S.plinth - 0.3, Object.assign({ fill: '#bdbdbd' }, s));
    d.line(-B / 2 - 0.6, 0, B / 2 + 0.6, 0, st(ts, LW.thick, { layer: 'WALLS' }));
    d.rect2(-B / 2 - 0.6, -S.plinth, B / 2 + 0.6, -S.plinth + 0.1, st(ts, LW.thin, { fill: '#a8a8a8', layer: 'SLAB' }));
    const bar = st(ts, LW.thin, { layer: 'FOOTING', stroke: '#b00000' });
    d.line(-B / 2 + 0.075, D - 0.075, B / 2 - 0.075, D - 0.075, bar);
    for (let x = -B / 2 + 0.1; x < B / 2 - 0.05; x += 0.15) d.circle(x, D - 0.095, 0.012, bar);
    for (const sx of [-1, 1]) d.poly([[sx * (c / 2 - 0.05), -S.plinth - 0.3], [sx * (c / 2 - 0.05), D - 0.075], [sx * (c / 2 - 0.05) + sx * 0.25, D - 0.075]], false, bar);
    AP.dimChain(d, [-B / 2, B / 2], D + 6 * ts, 'h', ts);
    AP.dimChain(d, [0, D - t, D], B / 2 + 6 * ts, 'v', ts);
    d.text(B / 2 + 0.65, -0.6 * ts, 'NGL', 2 * ts, {}); d.text(B / 2 + 0.65, -S.plinth - 0.6 * ts, 'FFL', 2 * ts, {});
    d.text(-B / 2 - 0.55, D + 13 * ts, F.mark + ' - SEE SCHEDULE', 2 * ts, {});
    d.text(-B / 2 - 0.55, D + 16 * ts, '50mm THK. GRAVEL BED', 2 * ts, {});
    return d;
  };

  /* ---------- structural details (preliminary sizes) ---------- */
  const RED = '#b00000';
  const lbl = (d, x, y, tx, ts, x2, y2) => { // leader + note
    if (x2 != null) d.line(x2, y2, x, y + 0.6 * ts, st(ts, LW.fine, { layer: 'TEXT' }));
    d.text(x, y, tx, 1.8 * ts, { layer: 'TEXT' });
  };
  // a reinforced section: w x h box, ties, bars (n top / n bottom / per side)
  function rcSection(d, x, y, w, h, ts, nTop, nBot, nSide, cover) {
    const s = st(ts, LW.med, { layer: 'STRUCT', fill: '#e6e6e6' }), bar = st(ts, LW.thin, { layer: 'STRUCT', stroke: RED });
    d.rect(x, y, w, h, s);
    const c = cover || 0.04;
    d.rect(x + c, y + c, w - 2 * c, h - 2 * c, bar);
    const row = (n, yy) => { for (let i = 0; i < n; i++) d.circle(x + c + 0.015 + (w - 2 * c - 0.03) * (n > 1 ? i / (n - 1) : 0.5), yy, 0.011, Object.assign({ fill: RED }, bar)); };
    row(nTop, y + c + 0.015); row(nBot, y + h - c - 0.015);
    for (let i = 1; i <= nSide; i++) { const yy = y + c + 0.015 + (h - 2 * c - 0.03) * i / (nSide + 1); d.circle(x + c + 0.015, yy, 0.011, Object.assign({ fill: RED }, bar)); d.circle(x + w - c - 0.015, yy, 0.011, Object.assign({ fill: RED }, bar)); }
  }

  // a truss as joints (x along the span, z up from the bottom chord, m) and members [i, j, kind: top / bot / web / post].
  // A type's own drawing (T.custom: joints as fractions of the span & height, edited in Roof › Trusses › a truss › Edit detail)
  // replaces its style and applies to every truss of that type.
  AP.trussGeom = function (T, span, pitch, half, cap) {
    // cap: a truncated truss (hip end) – the top chord runs flat at this height
    const heel = 0.10, zt0 = x => (half ? heel + pitch * (span - x) : heel + pitch * Math.min(x, span - x)), zt = x => (cap ? Math.min(cap, zt0(x)) : zt0(x));
    const H = half ? zt(0) : zt(span / 2);
    if (T.custom && T.custom.nodes && T.custom.nodes.length >= 3) return { nodes: T.custom.nodes.map(p => [p[0] * span, p[1] * H]), members: T.custom.members.map(m => m.slice()), H, zt, heel, custom: true };
    const nodes = [], members = [];
    const node = (x, z) => { let i = nodes.findIndex(p => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - z) < 1e-6); if (i < 0) { nodes.push([x, z]); i = nodes.length - 1; } return i; };
    const B = x => node(x, 0), Tp = x => node(x, zt(x)), web = (a, b) => { if (a !== b && !members.some(m => (m[0] === a && m[1] === b) || (m[0] === b && m[1] === a))) members.push([a, b, 'web']); };
    B(0); B(span); Tp(0); Tp(span); if (!half) Tp(span / 2);
    const xc = cap && !half && cap < zt0(span / 2) ? (cap - heel) / pitch : 0; // where a truncated truss turns flat
    if (xc) { web(B(xc), Tp(xc)); web(B(span - xc), Tp(span - xc)); }
    const style = T.style || 'pratt', n0 = Math.max(4, 2 * Math.round(span / 1.2));
    if (style === 'king' && !half) { web(B(span / 2), Tp(span / 2)); web(B(span / 2), Tp(span / 4)); web(B(span / 2), Tp(span * 3 / 4)); }
    else if (style === 'queen' && !half) { for (const f of [1 / 3, 2 / 3]) web(B(span * f), Tp(span * f)); web(B(span / 3), Tp(span / 2)); web(B(span * 2 / 3), Tp(span / 2)); }
    else if (style === 'fink' && !half) { web(B(span / 3), Tp(span / 4)); web(B(span / 3), Tp(span / 2)); web(B(span * 2 / 3), Tp(span / 2)); web(B(span * 2 / 3), Tp(span * 3 / 4)); }
    else {
      const n = half ? n0 / 2 : n0, X = Array.from({ length: n + 1 }, (_, i) => span * i / n), mid = n / 2;
      for (let i = 0; i < n; i++) {
        const a = X[i], c = X[i + 1], toward = half ? true : i < mid; // a half truss is high at x = 0
        if (style !== 'warren' && i > 0 && (half || i !== mid)) web(B(a), Tp(a));
        if (style === 'warren') { if (i % 2) web(Tp(a), B(c)); else web(B(a), Tp(c)); }
        else if (style === 'howe' || (half && style !== 'pratt')) { if (toward) web(B(a), Tp(c)); else web(Tp(a), B(c)); }
        else { if (toward) web(Tp(a), B(c)); else web(B(a), Tp(c)); } // pratt
      }
      if (!half && style !== 'warren') web(B(span / 2), Tp(span / 2));
    }
    // end verticals: the post of a half truss, the heels of a full truss
    if (half) { members.push([B(0), Tp(0), 'post']); web(B(span), Tp(span)); } else { web(B(0), Tp(0)); web(B(span), Tp(span)); }
    // chords: joint to joint along the bottom and along the top
    const idx = nodes.map((p, i) => i), onTop = i => nodes[i][1] > 1e-6 && Math.abs(nodes[i][1] - zt(nodes[i][0])) < 1e-6;
    const chain = (list, kind) => { list.sort((a, b) => nodes[a][0] - nodes[b][0]); for (let i = 0; i + 1 < list.length; i++) members.push([list[i], list[i + 1], kind]); };
    chain(idx.filter(i => Math.abs(nodes[i][1]) < 1e-6), 'bot'); chain(idx.filter(onTop), 'top');
    return { nodes, members, H, zt, heel };
  };
  // the span, slope and overhang a truss type is drawn with: a roof that uses it, else one of its placed trusses
  AP.trussCtx = function (P, id) {
    const S = P.settings, T = AP.trussType(P, id), t = S.extWall / 2, RL = AP.roofs(P).filter(q => q.type !== 'flat');
    let R = RL.find(q => q.sp.autoTruss !== false && q.tt.id === T.id), span = null;
    const tl = AP.placedTrusses(P).find(q => q.type === T.id);
    if (!R && tl) { const m = [(tl.a[0] + tl.b[0]) / 2, (tl.a[1] + tl.b[1]) / 2]; R = RL.find(q => q.inside(m[0], m[1])) || RL[0]; span = Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1]); }
    R = R || RL[0];
    if (!R) return { T, R: null };
    const b = R.parts ? R.mainB : R.b, W = (R.ridgeX ? b.y1 - b.y0 : b.x1 - b.x0) + 2 * t, half = T.kind === 'half';
    if (span == null) span = half && R.type !== 'shed' ? W / 2 : W;
    return { T, R, span, half, pitch: R.box ? 0.05 : R.pitch, oh: R.box ? 0 : R.oh };
  };
  AP.renderTrussTypeDetail = function (P, id, o) {
    const ts = o.ts, d = new AP.Drawing(), C = o.detail || AP.trussCtx(P, id), T = C.T, M = AP.trussMembers(T), kindTx = C.kind === 'trunc' ? 'TRUNCATED TRUSS (HIP END)' : C.kind === 'hip' ? 'HALF TRUSS (ON THE HIP)' : null;
    const mark = o.detail ? o.detail.mark : C.R ? AP.trussMarkFor(P, T, C.span, C.R) : T.mark;
    if (!C.R) { d.text(0, 0, 'NO PITCHED ROOF', 2.4 * ts, {}); return d; }
    const { R, span, half, pitch, oh } = C, G = AP.trussGeom(T, span, pitch, half, C.cap), N = G.nodes;
    const s = st(ts, LW.thick, { layer: 'ROOF' }), wb = st(ts, LW.thin, { layer: 'ROOF' }), dp = Math.min(M.depth, 0.15);
    const Pt = i => [N[i][0], -N[i][1]];
    for (const [i, j, k] of G.members) {
      d.lineP(Pt(i), Pt(j), k === 'web' ? wb : s);
      // chords: a second line the member depth inside
      if (k === 'top') d.line(N[i][0], -(N[i][1] - dp), N[j][0], -(N[j][1] - dp), wb);
      if (k === 'bot') d.line(N[i][0], -(N[i][1] + dp), N[j][0], -(N[j][1] + dp), wb);
    }
    // the top chord runs on over the eaves
    const tops = N.map((p, i) => i).filter(i => G.members.some(m => m[2] === 'top' && (m[0] === i || m[1] === i))).sort((a, b) => N[a][0] - N[b][0]);
    if (tops.length && oh > 0) {
      const ends = half ? [tops[tops.length - 1]] : [tops[0], tops[tops.length - 1]];
      for (const i of ends) { const sg = N[i][0] < span / 2 && !half ? -1 : 1; d.line(N[i][0], -N[i][1], N[i][0] + sg * oh, -(N[i][1] - pitch * oh), s); }
    }
    // bearing plates, purlins
    for (const c of [0, span]) d.rect2(c - 0.1, 0, c + 0.1, 0.03, st(ts, LW.thin, { layer: 'ROOF', fill: '#555555' }));
    const zt = G.zt;
    for (let x = -oh + 0.15; x < span + oh - 0.05; x += 0.6) {
      if (half && x < 0) continue;
      const z = half ? zt(0) - pitch * x : x < 0 ? zt(0) + pitch * x : x > span ? zt(span) - pitch * (x - span) : zt(x);
      d.rect2(x - 0.025, -z, x + 0.025, -z - 0.1, st(ts, LW.fine, { layer: 'ROOF', fill: '#ffffff' }));
    }
    const H = Math.max(...N.map(p => p[1]));
    AP.dimChain(d, [0, span], 7 * ts, 'h', ts, 1);
    AP.dimChain(d, [0, -H], (half ? -8 * ts : span + oh + 6 * ts), 'v', ts);
    d.text(span * (half ? 0.55 : 0.25), -zt(span * (half ? 0.55 : 0.25)) - 3 * ts, 'SLOPE ' + Math.round(Math.atan(pitch) * 180 / Math.PI) + '°', 1.8 * ts, { anchor: 'middle', layer: 'TEXT' });
    const style = T.style || 'pratt', styleName = G.custom ? 'CUSTOM' : ((AP.TRUSS_STYLES.find(q => q[0] === style) || ['', ''])[1].split(' –')[0] || '').toUpperCase();
    const nx = half ? 0 : -oh, ny = -H - 30 * ts;
    [mark + ' – ' + (kindTx || (half ? 'HALF TRUSS' : 'FULL TRUSS')) + ', ' + styleName + ' TYPE, ' + M.mat, 'TOP & BOTTOM CHORDS: ' + M.chord, 'WEBS' + (half ? ' & END POST' : '') + ': ' + M.web, M.joint,
      'PURLINS: C 2"x4" GA.16 @ 600 O.C.', 'TRUSS SPACING: ' + (R.tt.id === T.id ? AP.len(AP.trussSpacing(R)) + ' O.C. (MAX. ' + AP.mm(AP.trussMax(R)) + ')' : 'AS SHOWN ON THE ROOF FRAMING PLAN'), 'ANCHOR: 2 - 16mm DIA. x 300 BOLTS TO BEAM']
      .forEach((tx, i) => d.text(nx, ny + i * 3 * ts, tx, 1.8 * ts, { layer: 'TEXT', bold: i === 0 }));
    d.truss = { G, span }; // for the editor
    return d;
  };
  /* ---------- truss details: one per truss type AND span / height -> FT-1, FT-2 … (full), HT-1, HT-2 … (half) ---------- */
  // bearing spans of a roof's automatic trusses: one per wing of an outline roof (the same order as R.wings)
  AP.roofTrussSpans = function (P, R) {
    const t2 = P.settings.extWall, half = R.tt.kind === 'half' && R.type !== 'shed';
    let W;
    if (R.poly && R.wings) W = R.wings.map(w => ((R.parts ? w.ridgeX : R.ridgeX) ? w.y1 - w.y0 : w.x1 - w.x0) + t2);
    else { const b = R.parts ? R.mainB : R.b; W = [(R.ridgeX ? b.y1 - b.y0 : b.x1 - b.x0) + t2]; }
    return W.map(w => (half ? w / 2 : w));
  };
  // m: a member of the automatic framing – a truncated truss (m.cap) or a hip truss (m.pitch along the hip)
  const tdKey = (T, span, R, m) => {
    const pitch = m && m.pitch ? m.pitch : R ? (R.box ? 0.05 : R.pitch) : 0.3, H0 = 0.10 + pitch * (T.kind === 'half' ? span : span / 2), H = m && m.cap ? Math.min(m.cap, H0) : H0;
    return { key: T.id + '|' + (m && m.kind || '') + '|' + Math.round(span * 100) + '|' + Math.round(H * 100), pitch, H };
  };
  const tlRoof = (P, tl) => { const RL = AP.roofs(P).filter(q => q.type !== 'flat'), m = [(tl.a[0] + tl.b[0]) / 2, (tl.a[1] + tl.b[1]) / 2]; return RL.find(q => q.inside(m[0], m[1])) || RL[0] || null; };
  AP.trussDetails = function (P) {
    const L = [], add = (T, span, R, m) => {
      const k = tdKey(T, span, R, m);
      if (!L.some(q => q.key === k.key)) L.push({ key: k.key, T, span, half: T.kind === 'half', pitch: k.pitch, H: k.H, oh: R && !R.box ? R.oh * (m && m.kind === 'hip' ? Math.SQRT2 : 1) : 0, R, cap: m && m.cap ? m.cap : null, kind: m && m.kind || null });
    };
    for (const R of AP.roofs(P)) if (R.type !== 'flat' && R.sp.autoTruss !== false) {
      const F = AP.roofFraming(P, R, { purlins: false });
      for (const m of F.full) add(R.tt, m.span, R, m);
      for (const m of F.half) add(F.HT, m.span, R, m);
    }
    for (const tl of AP.placedTrusses(P)) add(AP.trussType(P, tl.type), Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1]), tlRoof(P, tl));
    let f = 0, h = 0;
    for (const e of L) e.mark = e.half ? 'HT-' + (++h) : 'FT-' + (++f);
    return L;
  };
  AP.trussMarkFor = (P, T, span, R, m) => { const k = tdKey(T, span, R, m).key, e = AP.trussDetails(P).find(q => q.key === k); return e ? e.mark : T.mark; };
  AP.trussMarkOf = (P, tl) => AP.trussMarkFor(P, AP.trussType(P, tl.type), Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1]), tlRoof(P, tl));
  AP.roofTrussMarks = (P, R) => { const F = AP.roofFraming(P, R, { purlins: false }); return [...new Set([...F.full.filter(m => !m.cap).map(m => AP.trussMarkFor(P, R.tt, m.span, R, m))])]; };
  // the truss types used on the drawings (automatic trusses of each roof + the ones placed by hand)
  AP.usedTrussTypes = function (P) {
    const ids = [];
    for (const R of AP.roofs(P)) if (R.type !== 'flat' && R.sp.autoTruss !== false && ids.indexOf(R.tt.id) < 0) ids.push(R.tt.id);
    for (const tl of AP.placedTrusses(P)) { const T = AP.trussType(P, tl.type); if (ids.indexOf(T.id) < 0) ids.push(T.id); }
    return ids.map(id => AP.trussType(P, id));
  };

  AP.renderTrussDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings;
    const R = AP.roofs(P).filter(q => q.type !== 'flat' && !AP.halfTruss(q)).sort((a, b) => b.level - a.level || (b.X1 - b.X0) * (b.Y1 - b.Y0) - (a.X1 - a.X0) * (a.Y1 - a.Y0))[0] || AP.mainPitched(P);
    if (!R || R.type === 'flat') { d.text(0, 0, 'R.C. ROOF DECK - NO ROOF TRUSS', 2.4 * ts, {}); return d; }
    const t = S.extWall / 2, b = R.mainB || R.b;
    const w0 = (R.ridgeX ? b.y0 : b.x0) - t, w1 = (R.ridgeX ? b.y1 : b.x1) + t; // bearing on the beams
    const am = (R.A0 + R.A1) / 2;
    const zc = c => (R.ridgeX ? R.z(am, c) : R.z(c, am)) - R.zTop - 0.10;
    const top = c => (R.box ? 0.15 + 0.05 * (w1 - c) : Math.max(0.05, zc(c)));
    const s = st(ts, LW.thick, { layer: 'ROOF' }), wb = st(ts, LW.thin, { layer: 'ROOF' });
    const C0 = R.box ? w0 : R.C0, C1 = R.box ? w1 : R.C1;
    // top chord incl. eaves, bottom chord between bearings
    const prof = AP.profile(c => (c < w0 || c > w1 ? (R.box ? top(Math.min(Math.max(c, w0), w1)) : zc(c)) : top(c)), C0, C1, 120);
    d.poly(prof.map(p => [p[0], -p[1]]), false, s);
    d.line(w0, 0, w1, 0, s);
    const n = Math.max(4, Math.round((w1 - w0) / 0.6));
    for (let i = 0; i <= n; i++) {
      const a = w0 + (w1 - w0) * i / n, ztop = top(a);
      if (ztop > 0.05) d.line(a, 0, a, -ztop, wb);
      if (i > 0) {
        const pa = w0 + (w1 - w0) * (i - 1) / n;
        if (i % 2) d.line(pa, 0, a, -top(a), wb); else d.line(pa, -top(pa), a, 0, wb);
      }
    }
    // bearing plates, purlins
    for (const c of [w0, w1]) d.rect2(c - 0.1, 0, c + 0.1, 0.03, st(ts, LW.thin, { layer: 'ROOF', fill: '#555555' }));
    for (let c = C0 + 0.15; c < C1 - 0.05; c += 0.6) { const z = (c < w0 || c > w1) ? (R.box ? top(w0) : zc(c)) : top(c); d.rect2(c - 0.025, -z, c + 0.025, -z - 0.1, st(ts, LW.fine, { layer: 'ROOF', fill: '#ffffff' })); }
    // dims & notes
    const zMax = Math.max(...prof.map(p => p[1]));
    AP.dimChain(d, [w0, w1], 7 * ts, 'h', ts);
    AP.dimChain(d, [0, -zMax], w1 + (C1 - w1) + 6 * ts, 'v', ts);
    const nx = C0, ny = -zMax - 26 * ts;
    ['TOP CHORD: 2 - C 75x50x15x2.0mm', 'BOTTOM CHORD: 2 - C 75x50x15x2.0mm', 'WEBS: C 75x50x15x1.5mm', 'GUSSET PLATES: 6mm THK. W/ E70 FILLET WELD', 'PURLINS: C 2"x4" GA.16 @ 600 O.C.', 'TRUSS SPACING: ' + AP.len(AP.trussSpacing(R)) + ' O.C. (MAX. ' + AP.mm(AP.trussMax(R)) + ')', 'ANCHOR: 2 - 16mm DIA. x 300 BOLTS TO BEAM']
      .forEach((tx, i) => d.text(nx, ny + i * 3 * ts, tx, 1.8 * ts, { layer: 'TEXT' }));
    return d;
  };

  AP.renderGutterDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), R = AP.mainPitched(P);
    if (!R || R.box) { d.text(0, 0, 'BOX GUTTER BEHIND PARAPET - SEE ROOF PLAN', 2.2 * ts, {}); return d; }
    const pitch = R.pitch, s = st(ts, LW.med, { layer: 'ROOF' }), th = st(ts, LW.thin, { layer: 'ROOF' });
    // rafter / top chord end with purlin, roofing sheet, fascia board and the gutter on brackets
    const ang = Math.atan(pitch), L = 0.9;
    const rf = x => -(0.25 + x * pitch);                    // roofing sheet top (x = 0 at the fascia)
    d.poly([[0, rf(0)], [L, rf(L)]], false, st(ts, LW.thick, { layer: 'ROOF' }));
    d.poly([[0.02, rf(0) + 0.05], [L, rf(L) + 0.05], [L, rf(L) + 0.125], [0.02, rf(0) + 0.125]], true, Object.assign({ fill: '#e3e3e3' }, th)); // top chord C75
    for (const x of [0.15, 0.75]) d.rect2(x - 0.025, rf(x) + 0.0, x + 0.025, rf(x) + 0.05, Object.assign({ fill: '#ffffff' }, th)); // purlins
    d.rect2(-0.025, rf(0) + 0.05, 0.0, rf(0) + 0.25, Object.assign({ fill: '#c8b48a' }, th)); // fascia board
    const gx0 = -0.025 - 0.17, gx1 = -0.025, gy = rf(0) + 0.12;
    d.poly([[gx1, gy - 0.06], [gx1, gy + 0.10], [gx0 + 0.02, gy + 0.10], [gx0, gy - 0.04]], false, s);   // gutter
    d.line(gx1, gy - 0.07, gx0 - 0.01, gy - 0.07, th); // bracket strap
    d.line(-0.11, gy + 0.10, -0.11, gy + 0.55, th); d.line(-0.035, gy + 0.10, -0.035, gy + 0.55, th); // downspout
    d.line(0.0, rf(0) - 0.0, -0.06, rf(0) + 0.025, st(ts, LW.thin, { layer: 'ROOF' })); // sheet end bent into the gutter
    const T = (x, y, t, lx, ly) => { const e = x < 0; d.line(lx, ly, x + (e ? 0.01 : -0.01), y - 0.6 * ts, st(ts, LW.fine, { layer: 'TEXT' })); d.text(x, y, t, 1.8 * ts, { layer: 'TEXT', anchor: e ? 'end' : 'start' }); };
    T(0.35, rf(0.35) - 0.12, 'PRE-PAINTED LONG SPAN ROOFING GA. 26', 0.35, rf(0.35));
    T(0.45, rf(0.45) + 0.28, 'STEEL TRUSS TOP CHORD', 0.45, rf(0.45) + 0.09);
    T(0.2, rf(0) + 0.42, 'C-PURLIN 2"x4" GA. 16', 0.15, rf(0.15) + 0.05);
    T(0.12, rf(0) + 0.3, '25mm x 200mm FIBER CEMENT FASCIA BOARD', -0.01, rf(0) + 0.2);
    T(-0.3, gy - 0.16, '150mm PRE-PAINTED G.I. GUTTER GA. 24', gx0 + 0.04, gy);
    T(-0.3, gy - 0.07, 'G.I. BRACKET STRAP @ 600 O.C.', gx0, gy - 0.07);
    T(-0.2, gy + 0.36, '75mm\u00d8 uPVC DOWNSPOUT', -0.11, gy + 0.4);
    AP.dimChain(d, [gx0, gx1], gy + 0.62, 'h', ts);
    void ang;
    return d;
  };

  AP.renderBeamDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings, nF = Math.max(1, AP.topFloorIndex(P) + 1);
    // one section per beam type on the beam plans (TB / B / RB, each size)
    const types = AP.allBeams(P).types.slice(0, 6).map(t => Object.assign({}, t, { slab: t.kind === 'B' ? S.slab : t.kind === 'RB' && S.roofType === 'flat' ? S.slab : 0 }));
    void nF;
    if (!types.length) types.push({ mark: 'RB-1', w: 0.20, h: Math.max(0.30, S.beamDepth - 0.1), top: 2, bot: 3, slab: 0 });
    let x = 0;
    for (const B of types) {
      if (B.slab) d.rect(x - 0.25, -B.slab, B.w + 0.5, B.slab, st(ts, LW.thin, { layer: 'SLAB', fill: '#cfcfcf' }));
      rcSection(d, x, B.slab ? -B.slab : 0, B.w, B.h, ts, B.top, B.bot, B.h > 0.35 ? 1 : 0);
      const y0 = B.slab ? -B.slab : 0;
      AP.dimChain(d, [x, x + B.w], y0 + B.h + 5 * ts, 'h', ts);
      AP.dimChain(d, [y0, y0 + B.h], x - 5 * ts, 'v', ts);
      const lx = x + B.w + 0.12;
      lbl(d, lx, y0 + 0.05, B.top + ' - 16mm DIA. TOP BARS', ts, x + B.w - 0.06, y0 + 0.06);
      lbl(d, lx, y0 + B.h - 0.03, B.bot + ' - 16mm DIA. BOTTOM BARS', ts, x + B.w - 0.06, y0 + B.h - 0.06);
      lbl(d, lx, y0 + B.h / 2, '10mm DIA. STIRRUPS:', ts, x + B.w - 0.04, y0 + B.h / 2);
      d.text(lx, y0 + B.h / 2 + 2.6 * ts, '1@50, 5@100, REST@200 O.C.', 1.8 * ts, { layer: 'TEXT' });
      d.text(x + B.w / 2, y0 + B.h + 11 * ts, B.mark + ' (' + AP.mm(B.w) + ' x ' + AP.mm(B.h) + ')', 2.4 * ts, { anchor: 'middle', bold: true });
      x += B.w + 1.25;
    }
    d.text(0, (types[0].slab ? 0 : 0) + 0.65 + 16 * ts, 'CONCRETE COVER 40mm. LAP TOP BARS AT MIDSPAN, BOTTOM BARS AT SUPPORTS.', 1.8 * ts, { layer: 'TEXT' });
    return d;
  };

  AP.renderColumnDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), C = AP.columns(P);
    const types = C.ctypes.length ? C.ctypes.slice(0, 6) : [{ mark: 'C1', size: 0.25, d: 0.25, shape: 'square', bars: '4-16mm DIA.', ties: '10mm DIA. TIES' }];
    // three sections per row, labels under each (tie text on two lines so they never overlap)
    const rowH = Math.max(...types.map(c => c.d || c.size)) + 26 * ts + 0.25;
    types.forEach((c, i) => {
      const x = (i % 3) * 1.4, y = Math.floor(i / 3) * rowH;
      const n = parseInt(c.bars, 10) || 4, W = c.size, H = c.d || c.size;
      if (c.shape === 'circle') {
        const r = W / 2, cx = x + r, cy = y + r, bar = st(ts, LW.thin, { layer: 'STRUCT', stroke: '#b00000' });
        d.circle(cx, cy, r, st(ts, LW.med, { layer: 'STRUCT', fill: '#e6e6e6' }));
        d.circle(cx, cy, r - 0.04, bar); // spiral
        for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; d.circle(cx + (r - 0.06) * Math.cos(a), cy + (r - 0.06) * Math.sin(a), 0.011, Object.assign({ fill: '#b00000' }, bar)); }
      } else {
        const side = n <= 4 ? 0 : Math.round((n - 4) / 4);
        rcSection(d, x, y, W, H, ts, 2 + side, 2 + side, side + (H > W + 0.05 ? 1 : 0));
      }
      AP.dimChain(d, [x, x + W], y + H + 5 * ts, 'h', ts);
      if (c.shape !== 'circle') AP.dimChain(d, [y, y + H], x - 5 * ts, 'v', ts);
      const tie = String(c.ties).split(/:\s*| @ /);
      const lines = [c.bars + ' MAIN BARS', tie[0] + (c.shape === 'circle' ? '' : ':'), (c.shape === 'circle' ? '@ ' : '') + (tie[1] || '')];
      d.text(x + W / 2, y + H + 11 * ts, c.mark + ' (' + AP.colDesc(c) + ')', 2.4 * ts, { anchor: 'middle', bold: true });
      lines.forEach((t, j) => d.text(x + W / 2, y + H + (14.5 + 3 * j) * ts, t, 1.6 * ts, { anchor: 'middle' }));
    });
    d.text(0, -5 * ts, 'CONCRETE COVER 40mm. 135' + '\u00b0' + ' HOOKS ON TIES. SPLICE BARS AT MID-HEIGHT, 40 BAR DIA. MIN.', 1.8 * ts, { layer: 'TEXT' });
    return d;
  };

  AP.renderWallFootingDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings;
    const t = S.extWall, B = 0.60, T = 0.25, D = S.plinth + 0.70 + T; // NGL to bottom of wall footing
    const s = st(ts, LW.med, { layer: 'FOOTING' }), bar = st(ts, LW.thin, { layer: 'FOOTING', stroke: RED });
    d.rect2(-B / 2, D, B / 2, D - T, Object.assign({ fill: '#d6d6d6' }, s));
    d.rect2(-B / 2 - 0.05, D + 0.05, B / 2 + 0.05, D, st(ts, LW.thin, { layer: 'FOOTING', dash: [1 * ts, 0.6 * ts] }));
    const wt = -S.plinth - 0.6;
    d.rect2(-t / 2, D - T, t / 2, wt, Object.assign({ fill: '#efefef' }, s));
    for (let z = D - T - 0.2; z > wt; z -= 0.2) d.line(-t / 2, z, t / 2, z, st(ts, LW.fine, { layer: 'WALLS' })); // CHB courses
    // break line on top of the wall
    d.poly([[-t / 2 - 0.05, wt], [-0.02, wt], [0, wt - 0.04], [0.02, wt + 0.04], [0.04, wt], [t / 2 + 0.05, wt]], false, st(ts, LW.thin, { layer: 'WALLS' }));
    d.line(-B / 2 - 0.6, 0, -t / 2, 0, st(ts, LW.thick, { layer: 'WALLS' })); d.line(t / 2, 0, B / 2 + 0.6, 0, st(ts, LW.thick, { layer: 'WALLS' }));
    d.rect2(t / 2, -S.plinth, B / 2 + 0.6, -S.plinth + 0.1, st(ts, LW.thin, { fill: '#a8a8a8', layer: 'SLAB' }));
    d.line(-B / 2 + 0.075, D - 0.075, B / 2 - 0.075, D - 0.075, bar);
    for (let x = -B / 2 + 0.1; x < B / 2 - 0.05; x += 0.2) d.circle(x, D - 0.09, 0.011, bar);
    d.poly([[0, wt], [0, D - 0.075], [0.2, D - 0.075]], false, bar);
    AP.dimChain(d, [-B / 2, B / 2], D + 6 * ts, 'h', ts);
    AP.dimChain(d, [0, D - T, D], B / 2 + 6 * ts, 'v', ts);
    d.text(B / 2 + 0.65, -0.6 * ts, 'NGL', 2 * ts, {}); d.text(B / 2 + 0.65, -S.plinth - 0.6 * ts, 'FFL', 2 * ts, {});
    const nx = -B / 2 - 0.6;
    [AP.mm(t) + 'mm CHB, ALL CELLS FILLED', '10mm DIA. VERT. BARS @ 400 O.C.', '10mm DIA. HOR. BARS @ EVERY 3RD COURSE', 'WF: ' + AP.mm(B) + ' x ' + AP.mm(T) + ' THK. CONC. FOOTING', '3 - 12mm DIA. LONG. BARS', '10mm DIA. @ 400 O.C. TRANSV.', '50mm THK. GRAVEL BED']
      .forEach((tx, i) => d.text(nx, D + 12 * ts + i * 3 * ts, tx, 1.8 * ts, { layer: 'TEXT' }));
    return d;
  };

  AP.renderFinishSchedule = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), rows = [];
    P.floors.forEach(f => f.rooms.forEach(r => {
      const fin = AP.roomFinish(r), Lf = AP.finList(fin.floor), Lc = AP.finList(fin.ceiling);
      // walls: one block per different finish, named by its sides when the sides differ
      const wl = fin2 => { const L = AP.finList(fin2.wall); if (fin2.tileHt > 0 && L.length) { const k = L.map(t => /TILE/.test(t)).lastIndexOf(true); L[k >= 0 ? k : L.length - 1] += ' UP TO ' + AP.len(fin2.tileHt) + ' HT.'; if (!L.some(t => /PAINT|PLASTER/.test(t))) L.push('ABOVE: ' + AP.wallAbove(AP.roomFinish(r))); } return L; };
      const bySide = {}; for (const sd of AP.SIDES) { const key = wl(AP.wallFinish(r, sd)).join('\n'); (bySide[key] = bySide[key] || []).push(sd); }
      const SN = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' }, keys = Object.keys(bySide);
      const Lw = keys.length === 1 ? keys[0].split('\n') : keys.flatMap(k => [bySide[k].map(q => SN[q]).join(' & ') + ' WALL' + (bySide[k].length > 1 ? 'S' : '') + ':', ...k.split('\n')]);
      if (Math.abs(AP.floorDrop(r)) > 0.001) Lf.push('(FL. ' + AP.mm(Math.abs(AP.floorDrop(r))) + (AP.floorDrop(r) > 0 ? ' BELOW' : ' ABOVE') + ' FFL)');
      const ceil = AP.hasCeiling(r) ? [...Lc, 'CLG. HT. ' + AP.mm(AP.ceilHt(r, P.settings))] : ['NO CEILING (EXPOSED)'];
      rows.push([f.name, (r.name || '').toUpperCase(), Lf.join('\n'), AP.isOpen(r) && !r.wallFin ? '-' : Lw.join('\n'), AP.isOpen(r) && !AP.hasCeiling(r) ? '-' : ceil.join('\n')]);
    }));
    const W = (k, min) => Math.max(min, ...rows.map(r => Math.max(...String(r[k]).split('\n').map(t => AP.textWidth(t, 2.1))) + 6));
    const tb = AP.table(d, 0, 0, [{ h: 'LEVEL', w: W(0, 26) }, { h: 'SPACE', w: W(1, 30) }, { h: 'FLOOR', w: W(2, 40) }, { h: 'WALL', w: W(3, 40) }, { h: 'CEILING', w: W(4, 40) }], rows, ts, 'SCHEDULE OF FINISHES');
    const y = tb.h + 8 * ts;
    d.text(0, y, 'EXTERIOR WALL FINISH: ' + (P.settings.extFinish || 'PLAIN CEMENT PLASTER, PAINT FINISH'), 2.2 * ts, { bold: true });
    d.text(0, y + 3.6 * ts, 'ALL TILES SET ON CEMENT MORTAR BED W/ TILE GROUT; PAINT: 1 COAT PRIMER + 2 COATS FINISH (LATEX INTERIOR / ACRYLIC EXTERIOR).', 2 * ts, {});
    return d;
  };

  // sheet index / table of contents
  AP.renderSheetIndex = function (defs, o) {
    const ts = o.ts, d = new AP.Drawing();
    const disc = { A: 'ARCHITECTURAL', S: 'STRUCTURAL', E: 'ELECTRICAL', P: 'PLUMBING / SANITARY' };
    const rows = [];
    let last = null;
    for (const s of defs) {
      if (s.disc !== last) { rows.push(['', disc[s.disc] || s.disc, '']); last = s.disc; }
      rows.push([s.no, s.contents.slice(0, 90), s.page + ' of ' + defs.length]);
    }
    AP.table(d, 0, 0, [{ h: 'SHEET NO.', w: 22 }, { h: 'SHEET CONTENTS', w: 150 }, { h: 'PAGE', w: 22 }], rows, ts, 'SHEET INDEX');
    return d;
  };

  AP.renderRoomSchedule = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    const rows = [];
    let total = 0;
    P.floors.forEach(f => {
      let sub = 0;
      f.rooms.forEach(r => { const a = r.w * r.l; sub += a; rows.push([f.name, (r.name || '').toUpperCase(), AP.mm(r.w) + ' x ' + AP.mm(r.l), AP.areaNum(a)]); });
      if (f.rooms.length) rows.push(['', 'SUB-TOTAL ' + f.name, '', AP.areaNum(sub)]);
      total += sub;
    });
    rows.push(['', 'TOTAL FLOOR AREA', '', AP.area(total)]);
    AP.table(d, 0, 0, [{ h: 'LEVEL', w: 30 }, { h: 'SPACE', w: 50 }, { h: 'SIZE (' + AP.unitSuf() + ')', w: 32 }, { h: 'AREA (' + AP.areaLabel() + ')', w: 26 }], rows, ts, 'SCHEDULE OF ROOMS / AREA COMPUTATION');
    return d;
  };

  AP.renderNotes = function (P, which, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings;
    const N = which === 'S' ? [
      'GENERAL CONSTRUCTION NOTES',
      '',
      'A. GENERAL',
      '1. ALL WORKS SHALL CONFORM TO THE NATIONAL STRUCTURAL CODE OF THE PHILIPPINES (NSCP) LATEST EDITION',
      '   AND THE NATIONAL BUILDING CODE OF THE PHILIPPINES (P.D. 1096).',
      '2. ALL DIMENSIONS ARE IN MILLIMETERS UNLESS OTHERWISE NOTED. VERIFY ALL DIMENSIONS AT SITE.',
      '3. IN CASE OF DISCREPANCY BETWEEN DRAWINGS AND NOTES, CONSULT THE ENGINEER BEFORE PROCEEDING.',
      '',
      'B. CONCRETE',
      '1. MINIMUM 28-DAY COMPRESSIVE STRENGTH fc\' = 20.7 MPa (3000 psi) FOR FOOTINGS, COLUMNS, BEAMS AND SLABS.',
      '2. SLAB ON GRADE fc\' = 17.2 MPa (2500 psi). CURE ALL CONCRETE FOR AT LEAST 7 CONSECUTIVE DAYS.',
      '3. MINIMUM CONCRETE COVER: FOOTINGS 75mm, COLUMNS & BEAMS 40mm, SLABS 20mm.',
      '',
      'C. REINFORCING STEEL',
      '1. DEFORMED BARS SHALL CONFORM TO PNS 49, GRADE 40 (fy = 275 MPa) FOR 12mm DIA. AND BELOW,',
      '   GRADE 60 (fy = 414 MPa) FOR 16mm DIA. AND ABOVE.',
      '2. BARS SHALL BE LAPPED A MINIMUM OF 40 BAR DIAMETERS. STAGGER SPLICES WHERE POSSIBLE.',
      '',
      'D. FOUNDATION AND FOOTINGS',
      '1. FOOTINGS WERE DESIGNED FOR AN ALLOWABLE SOIL BEARING CAPACITY OF ' + S.soil + ' kPa.',
      '2. FOOTINGS SHALL REST ON UNDISTURBED NATURAL SOIL ' + AP.len(S.footDepth) + ' BELOW NATURAL GRADE LINE.',
      '3. NOTIFY THE ENGINEER AFTER EXCAVATION TO CONFIRM THE SOIL BEARING CAPACITY BEFORE CONCRETING.',
      '',
      'E. MASONRY',
      '1. EXTERIOR WALLS: ' + AP.len(S.extWall) + ' CHB, INTERIOR WALLS: ' + AP.len(S.intWall) + ' CHB, ALL CELLS FILLED WITH MORTAR.',
      '2. VERTICAL BARS 10mm DIA. @ 600mm O.C., HORIZONTAL BARS 10mm DIA. @ EVERY 3RD LAYER.',
      '3. PROVIDE LINTEL BEAMS OVER ALL OPENINGS BEARING AT LEAST 200mm ON EACH SIDE.',
      '',
      'F. ROOFING',
      '1. ROOF FRAMING: STEEL TRUSS / C-PURLINS 2"x4" GA.16 @ 600mm O.C., LONG SPAN PRE-PAINTED G.I. SHEET GA.26.',
      '',
      'NOTE: THIS PLAN SET WAS GENERATED BY ARKIPLAN AS A PRELIMINARY DESIGN. ALL STRUCTURAL SIZES MUST BE',
      'CHECKED, COMPUTED AND SIGNED/SEALED BY A LICENSED CIVIL/STRUCTURAL ENGINEER BEFORE PERMIT SUBMISSION.'
    ] : [
      'GENERAL ARCHITECTURAL NOTES',
      '',
      '1. ALL WORKS SHALL CONFORM TO THE NATIONAL BUILDING CODE OF THE PHILIPPINES (P.D. 1096) AND ITS IRR.',
      '2. ALL DIMENSIONS ARE IN MILLIMETERS, CENTER-TO-CENTER OF WALLS / GRID LINES UNLESS OTHERWISE NOTED.',
      '3. FINISH FLOOR LINE (FFL) IS ' + AP.len(S.plinth) + ' ABOVE NATURAL GROUND LINE (NGL).',
      '4. FLOOR-TO-CEILING HEIGHT: ' + AP.len(S.ceilingHt) + '. DOORS & WINDOW HEAD HEIGHT: ' + AP.len(S.doorHt) + '.',
      '5. EXTERIOR WALLS: ' + AP.len(S.extWall) + ' CHB, PLASTERED & PAINTED. INTERIOR WALLS: ' + AP.len(S.intWall) + ' CHB.',
      '6. FLOOR FINISH: CERAMIC TILES ON CEMENT MORTAR. TOILET: NON-SKID TILES, WALL TILES UP TO ' + AP.len(S.tileHt) + '.',
      '7. CEILING: 4.5mm FIBER CEMENT BOARD ON METAL FURRING, PAINTED.',
      '8. ALL DOORS & WINDOWS PER SCHEDULE. VERIFY ROUGH OPENINGS AT SITE BEFORE FABRICATION.'
    ];
    let y = 0;
    N.forEach((l, i) => { d.text(0, y, l, (i === 0 ? 3.2 : 2.1) * ts, { bold: i === 0 || /^[A-F]\. /.test(l) }); y += (i === 0 ? 6 : 3.6) * ts; });
    return d;
  };
  // STAIR DETAIL: section along the run of the stair (first stair that goes up to a floor above): flights, landing,
  // waist slab with its bars, floor slabs, railing, dimensions (riser, tread, landing level, floor height) and notes
  AP.stairOf = function (P) {
    for (let i = 0; i < P.floors.length - 1; i++) for (const r of P.floors[i].rooms) if (r.type === 'stairs') return { fi: i, r };
    return null;
  };
  AP.renderStairDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings, F = AP.stairOf(P);
    if (!F) { d.text(0, 0, 'STAIR DETAIL: draw a Stairs room on a lower floor', 2.4 * ts, {}); return d; }
    const H = AP.floorH(P, F.fi), g = AP.stairGeom(F.r, H), n = g.n, t = g.t, rise = g.rise, run = g.run, slab = S.slab || 0.1, ws = 0.15;
    const cut = { fill: '#bdbdbd', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' }, seen = { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts, layer: 'SLAB' };
    const wall = { fill: '#e2e2e2', stroke: '#000000', w: LW.thin * ts, layer: 'WALLS' };
    const rl = st(ts, LW.med, { layer: 'RAILING' }), rp = st(ts, LW.fine, { layer: 'RAILING' }), bar = st(ts, LW.thin, { layer: 'REBAR', stroke: '#c62828' });
    const a0 = g.a0, sL = a0 + n * t;
    // floor slab on grade (with gravel bed), the walls at both ends of the stair room
    d.rect2(-0.9, 0, run + 0.6, 0.1, cut);
    for (let x = -0.85; x < run + 0.55; x += 0.12) d.circle(x, 0.14, 0.025, st(ts, LW.fine, { layer: 'SLAB' }));
    d.rect2(-0.15, 0, 0, -(H + 0.4), wall); d.rect2(run, 0, run + 0.15, -(H + 0.4), wall);
    const stepsUp = (s0, z0, k, dir) => { const p = []; for (let i = 0; i <= k; i++) { const sx = s0 + dir * i * t, z = z0 + (i + 1) * rise; p.push([sx, -z]); if (i < k) p.push([sx + dir * t, -z]); } return p; };
    let zL = H, sTop;
    if (g.type === 'U') {
      zL = (n + 1) * rise;
      // first flight + landing (cut), waist slab soffit parallel to the nosings
      const p1 = [[a0, 0], ...stepsUp(a0, 0, n, 1), [run, -zL], [run, -(zL - ws)], [sL, -(zL - ws)], [a0 + 0.3, 0]];
      d.poly(p1, true, cut);
      // second flight from the landing back up to the floor above (seen beyond)
      const p2 = [[sL, -zL], ...stepsUp(sL, zL, n, -1), [a0 - 0.15, -H], [a0 - 0.15, -(H - ws)], [sL - 0.3, -zL]];
      d.poly(p2, true, seen);
      // upper floor slab, from the end wall to the top of the second flight
      d.rect2(0, -H, a0, -(H - slab), cut); d.rect2(-0.9, -H, -0.15, -(H - slab), cut);
      sTop = a0;
      // bars in the first flight's waist slab (bottom main bars) and in the landing
      d.line(a0 + 0.35, -0.04, sL - 0.05, -(zL - ws + 0.04), bar); d.line(sL - 0.05, -(zL - ws + 0.04), run - 0.04, -(zL - ws + 0.04), bar);
      d.line(sL + 0.05, -(zL - 0.04), run - 0.04, -(zL - 0.04), bar);
    } else {
      const sEnd = sL + 0.15;
      const p1 = [[a0, 0], ...stepsUp(a0, 0, n, 1).slice(0, -1), [sEnd, -H], [sEnd, -(H - slab)], [a0 + 0.35, 0]];
      d.poly(p1, true, cut);
      d.rect2(sEnd, -H, run + 0.15, -(H - slab), cut); d.rect2(run + 0.15, -H, run + 0.6, -(H - slab), cut);
      d.line(a0 + 0.4, -0.04, sEnd - 0.05, -(H - slab + 0.04), bar);
      sTop = sEnd;
    }
    // railing 900 over the nosings of the first flight (and along the landing)
    const zEnd = g.type === 'U' ? zL : H;
    d.line(a0, -(rise + 0.9), sL, -(zEnd + 0.9), rl);
    if (g.type === 'U') d.line(sL, -(zL + 0.9), run - 0.05, -(zL + 0.9), rl);
    for (let i = 0; i <= n; i++) { const sx = a0 + i * t + 0.04, z = (i + 1) * rise; d.line(sx, -z, sx, -(z + 0.9 + 0.04 * rise / t), rp); }
    // levels
    // level marks left of the end wall: symbol + text ending clear of the wall
    const lev = (z, txt) => { const tw = AP.textWidth(txt, 1.7 * ts), x1 = -0.3, x0 = x1 - tw - 2.4 * ts; AP.levelSymbol(d, x0, -z - 1.2 * ts, ts, 1); d.text(x0 + 2.2 * ts, -z - 1.2 * ts, txt, 1.7 * ts, { layer: 'TEXT' }); };
    lev(0, (F.fi ? 'FLOOR ' : 'GROUND FLOOR ') + AP.fflText(AP.levelZ(P, F.fi)));
    if (g.type === 'U') { const p = [run - 0.05, -zL]; d.text(p[0] - 0.1, p[1] - 1.4 * ts, 'LANDING ' + AP.fflText(AP.levelZ(P, F.fi) + zL), 1.7 * ts, { anchor: 'end', layer: 'TEXT' }); }
    lev(H, (P.floors[F.fi + 1].name || 'SECOND FLOOR').toUpperCase() + ' ' + AP.fflText(AP.levelZ(P, F.fi + 1)));
    // dimensions: along the run (start, flight, landing) and up the side (landing, floor height)
    AP.dimChain(d, [0, a0, sL, run], 0.1 + 7 * ts, 'h', ts);
    AP.dimChain(d, g.type === 'U' ? [0, -zL, -H] : [0, -H], run + 0.15 + 7 * ts, 'v', ts);
    // one riser & tread called out on the first steps
    const k = 2, sx = a0 + k * t, zx = (k + 1) * rise;
    d.text(sx + t / 2, -zx - 0.9 * ts, 'T=' + AP.mm(t), 1.5 * ts, { anchor: 'middle', layer: 'TEXT' });
    d.text(sx - 0.6 * ts, -zx + rise / 2, 'R=' + AP.mm(rise), 1.5 * ts, { anchor: 'end', v: 'middle', layer: 'TEXT' });
    // notes under the drawing
    const fin = AP.roomFinish(F.r).floor || 'GRANITE TILES';
    const notes = ['NOTES:',
      '1. R.C. STAIR, CONCRETE CLASS A (f\'c = 21 MPa); ' + AP.mm(ws) + 'mm THK. WAIST SLAB & LANDING.',
      '2. MAIN BARS 12mm Ø @ 150 O.C. (BOTTOM), TEMPERATURE BARS 10mm Ø @ 200 O.C.; BARS ANCHORED INTO THE FLOOR SLAB & BEAMS.',
      '3. ' + g.risers + ' RISERS @ ' + AP.mm(rise) + 'mm, ' + g.treads + ' TREADS @ ' + AP.mm(t) + 'mm' + (g.type === 'U' ? ', ONE LANDING (U-TYPE STAIR), FLIGHT WIDTH ' + AP.mm(g.fw) + 'mm.' : ', FLIGHT WIDTH ' + AP.mm(g.wid) + 'mm.'),
      '4. TREADS & RISERS: ' + String(fin).toUpperCase() + ', NON-SLIP NOSING.', '5. RAILING / HANDRAIL 900mm HIGH; MIN. HEADROOM 2000mm.'];
    // wrapped to the width of the drawing (paper-size text must not make the detail wider than its cell)
    const maxW = Math.max(60 * ts, run + 1.5), wrap = tx => { const w = tx.split(' '), L = ['']; for (const x of w) { const c = (L[L.length - 1] + ' ' + x).trim(); if (L[L.length - 1] && AP.textWidth(c, 1.6 * ts) > maxW) L.push('   ' + x); else L[L.length - 1] = c; } return L; };
    let y = 0.1 + 14 * ts;
    notes.forEach((tx, i) => { for (const ln of i ? wrap(tx) : [tx]) { d.text(-0.9, y, ln, (i ? 1.6 : 1.9) * ts, { bold: !i, layer: 'TEXT' }); y += 2.5 * ts; } });
    return d;
  };
})(window.AP);
