/* ArkiPlan – lot plan (from the technical description), site development plan,
 * vicinity map and perspective view.
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  const LW = AP.LW;
  const st = (ts, w, extra) => Object.assign({ w: w * ts }, extra || {});

  /* ---------------- technical description ----------------
   * One course per line, e.g.  "1-2  N 45°30' E  20.00"  or  "2-3 S 44-30 E 15.5"
   * A line with TIE / BLLM / BBM / MBM / PLS is the tie line from the reference monument to corner 1.
   */
  AP.parseCourse = function (line) {
    const s = String(line).replace(/[º˚]/g, '°').replace(/[’′]/g, "'").replace(/[”″]/g, '"');
    let ns, ew, ang, end;
    const due = /due\s*(north|south|east|west)/i.exec(s);
    if (due) {
      const k = due[1][0].toUpperCase();
      ns = k === 'S' ? 'S' : 'N'; ew = k === 'W' ? 'W' : 'E'; ang = k === 'N' || k === 'S' ? 0 : 90; end = due.index + due[0].length;
    } else {
      const m = /(^|[^A-Z])([NS])\s*([\d][\d.°'"\-\s:]*?)\s*([EW])(?![A-Z])/i.exec(s);
      if (!m) return null;
      const nums = (m[3].match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (!nums.length) return null;
      ns = m[2].toUpperCase(); ew = m[4].toUpperCase();
      ang = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600; end = m.index + m[0].length;
      if (!(ang >= 0 && ang <= 90)) return null;
    }
    const dm = /(\d+(?:\.\d+)?)/.exec(s.slice(end));
    if (!dm) return null;
    const d = +dm[1];
    const a = ang * Math.PI / 180;
    const east = Math.sin(a) * d * (ew === 'E' ? 1 : -1), north = Math.cos(a) * d * (ns === 'N' ? 1 : -1);
    const deg = Math.floor(ang + 1e-9), mn = Math.floor((ang - deg) * 60 + 1e-6), sc = Math.round(((ang - deg) * 60 - mn) * 60);
    const txt = due ? 'DUE ' + due[1].toUpperCase() : ns + ' ' + deg + '°' + String(mn).padStart(2, '0') + "'" + (sc ? String(sc).padStart(2, '0') + '"' : '') + ' ' + ew;
    return { ns, ew, ang, d, dx: east, dy: -north, txt, tie: /tie|bllm|bbm|mbm|pls|monument/i.test(s) };
  };

  // lot geometry from P.lot.text: corners (plan metres, corner 1 at 0,0), area, closure
  AP.lotGeom = function (P) {
    const L = P.lot; if (!L || !L.text) return null;
    const lines = String(L.text).split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    const courses = [], bad = [];
    let tie = null;
    lines.forEach((t, i) => {
      const c = AP.parseCourse(t);
      if (!c) { bad.push(i + 1); return; }
      if (c.tie && !courses.length && !tie) { tie = c; tie.from = (/(BLLM|BBM|MBM|PLS)[^,;]*/i.exec(t) || ['REF. POINT'])[0].trim().toUpperCase(); return; }
      courses.push(c);
    });
    if (courses.length < 3) return { courses, bad, ok: false, msg: 'Enter at least 3 lines (bearing and distance)' };
    const pts = [[0, 0]];
    for (const c of courses) { const p = pts[pts.length - 1]; pts.push([p[0] + c.dx, p[1] + c.dy]); }
    const last = pts.pop(), closure = Math.hypot(last[0], last[1]);
    let a2 = 0, per = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    for (const c of courses) per += c.d;
    const area = Math.abs(a2) / 2;
    return { pts, courses, bad, tie, tieFrom: tie ? [-tie.dx, -tie.dy] : null, area, closure, per, ok: true, ccw: a2 < 0 };
  };

  const centroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
  // outward unit normal of lot line i (from corner i to i+1)
  function outward(pts, i) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = centroid(pts);
    const t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]) || 1;
    let n = [t[1] / L, -t[0] / L];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((m[0] - c[0]) * n[0] + (m[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]];
    return { n, t: [t[0] / L, t[1] / L], m, L };
  }
  // readable text angle along a line (degrees, Y-down)
  const textAng = (t) => { let a = Math.atan2(t[1], t[0]) * 180 / Math.PI; if (a > 90) a -= 180; if (a < -90) a += 180; return a; };
  function north(d, x, y, ts) {
    const r = 5 * ts;
    d.circle(x, y, r, st(ts, LW.thin));
    d.poly([[x, y - r * 1.2], [x + r * 0.45, y + r * 0.6], [x, y + r * 0.25], [x - r * 0.45, y + r * 0.6]], true, { fill: '#000000', stroke: 'none' });
    d.text(x, y - r * 1.45, 'N', 3.2 * ts, { anchor: 'middle', bold: true });
  }
  function road(d, G, P, ts, labelOnly) {
    const i = Math.min(Math.max(1, (P.lot.road || 1)), G.pts.length) - 1, o = outward(G.pts, i);
    const W = P.lot.roadW || 6, a = G.pts[i], b = G.pts[(i + 1) % G.pts.length];
    const ext = 3, q = (p, k, e) => [p[0] + o.n[0] * k + o.t[0] * e, p[1] + o.n[1] * k + o.t[1] * e];
    if (!labelOnly) {
      const rs = st(ts, LW.thin, { layer: 'SITE', stroke: '#777777' });
      d.lineP(q(a, 0, -ext), q(b, 0, ext), rs);
      d.lineP(q(a, W, -ext), q(b, W, ext), rs);
      d.lineP(q(a, W / 2, -ext), q(b, W / 2, ext), st(ts, LW.fine, { layer: 'SITE', stroke: '#999999', dash: [4 * ts, 2 * ts] }));
    }
    const c = q(o.m, W / 2 + 1.2 * ts, 0);
    d.text(c[0], c[1], (P.lot.roadName || 'ROAD').toUpperCase() + ' (' + AP.mm(W) + ' WIDE)', 2.2 * ts, { anchor: 'middle', bold: true, rot: textAng(o.t), layer: 'SITE' });
    return { i, o };
  }

  function placeholder(d, ts, lines) {
    d.rect(0, 0, 120 * ts, 70 * ts, st(ts, LW.thin, { dash: [2 * ts, 1 * ts] }));
    lines.forEach((t, i) => d.text(60 * ts, 26 * ts + i * 5 * ts, t, (i ? 2.2 : 3) * ts, { anchor: 'middle', bold: !i }));
    return d;
  }

  /* ---------------- LOT PLAN ---------------- */
  AP.renderLotPlan = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), G = AP.lotGeom(P);
    if (!G || !G.ok) return placeholder(d, ts, ['LOT PLAN', 'Enter the technical description:', 'Plan tab > Lot / Site']);
    const pts = G.pts, n = pts.length;
    d.poly(pts, true, st(ts, LW.thick, { layer: 'SITE' }));
    // bearings and distances along each line, outside the lot
    G.courses.forEach((c, i) => {
      const w = outward(pts, i), ang = textAng(w.t);
      const p1 = [w.m[0] + w.n[0] * 2.4 * ts, w.m[1] + w.n[1] * 2.4 * ts], p2 = [w.m[0] - w.n[0] * 3.6 * ts, w.m[1] - w.n[1] * 3.6 * ts];
      d.text(p1[0], p1[1], c.txt, 1.9 * ts, { anchor: 'middle', v: 'middle', rot: ang, layer: 'SITE' });
      d.text(p2[0], p2[1], c.d.toFixed(2) + ' m', 1.9 * ts, { anchor: 'middle', v: 'middle', rot: ang, layer: 'SITE' });
    });
    // corners
    pts.forEach((p, i) => {
      const c = centroid(pts), v = [p[0] - c[0], p[1] - c[1]], L = Math.hypot(v[0], v[1]) || 1;
      const q = [p[0] + v[0] / L * 3.2 * ts, p[1] + v[1] / L * 3.2 * ts];
      d.circle(p[0], p[1], 0.6 * ts, { fill: '#000000', stroke: 'none' });
      d.circle(q[0], q[1], 1.8 * ts, st(ts, LW.thin, { fill: '#ffffff' }));
      d.text(q[0], q[1], String(i + 1), 1.9 * ts, { anchor: 'middle', v: 'middle', bold: true });
    });
    // tie line
    if (G.tie) {
      // a long tie line is drawn shortened with a break mark (its real length is written on it)
      let T = G.tieFrom;
      const lb = AP.Drawing ? (() => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return Math.hypot(x1 - x0, y1 - y0); })() : 20;
      const tl = Math.hypot(T[0] - pts[0][0], T[1] - pts[0][1]), maxL = lb * 0.9;
      if (tl > maxL) {
        const u = [(T[0] - pts[0][0]) / tl, (T[1] - pts[0][1]) / tl];
        T = [pts[0][0] + u[0] * maxL, pts[0][1] + u[1] * maxL];
        const bm = [pts[0][0] + u[0] * maxL * 0.55, pts[0][1] + u[1] * maxL * 0.55], nv = [-u[1], u[0]], k = 1.4 * ts;
        d.poly([[bm[0] - u[0] * k + nv[0] * k, bm[1] - u[1] * k + nv[1] * k], [bm[0] + nv[0] * k * 0.2, bm[1] + nv[1] * k * 0.2], [bm[0] - nv[0] * k * 0.2, bm[1] - nv[1] * k * 0.2], [bm[0] + u[0] * k - nv[0] * k, bm[1] + u[1] * k - nv[1] * k]], false, st(ts, LW.thin));
      }
      d.lineP(T, pts[0], st(ts, LW.thin, { dash: [3 * ts, 1.5 * ts], layer: 'SITE' }));
      d.poly([[T[0], T[1] - 1.8 * ts], [T[0] + 1.6 * ts, T[1] + 1.1 * ts], [T[0] - 1.6 * ts, T[1] + 1.1 * ts]], true, st(ts, LW.thin, { fill: '#ffffff' }));
      const t = [pts[0][0] - T[0], pts[0][1] - T[1]], m = [(T[0] + pts[0][0]) / 2, (T[1] + pts[0][1]) / 2];
      d.text(T[0], T[1] + 4 * ts, G.tie.from, 1.9 * ts, { anchor: 'middle', bold: true });
      d.text(m[0], m[1] - 1.2 * ts, 'TIE: ' + G.tie.txt + ', ' + G.tie.d.toFixed(2) + ' m', 1.7 * ts, { anchor: 'middle', rot: textAng(t) });
    }
    if (P.lot.road) road(d, G, P, ts);
    const c = centroid(pts);
    d.text(c[0], c[1] - 1.5 * ts, (P.lot.lotNo ? 'LOT ' + String(P.lot.lotNo).toUpperCase() : 'LOT'), 2.8 * ts, { anchor: 'middle', bold: true });
    d.text(c[0], c[1] + 2.5 * ts, 'AREA = ' + AP.area(G.area), 2.4 * ts, { anchor: 'middle' });
    // technical description table + north arrow on the right
    // compact (60 %) so the lot plan itself gets the room: north arrow, then the table, beside the lot
    // (on the A-1 sheet the table is a view of its own – AP.renderTechDesc – and only the north arrow stays)
    const b = d.bbox(), tx = b.x1 + 5 * ts, tt = ts * 0.6;
    if (o.noTable) { north(d, b.x1 + 6 * ts, b.y0 + 4 * ts, ts * 0.8); return d; }
    const rows = G.courses.map((cc, i) => [(i + 1) + '-' + (i + 2 > n ? 1 : i + 2), cc.txt, cc.d.toFixed(2)]);
    if (G.tie) rows.unshift([G.tie.from.slice(0, 10) + '-1', G.tie.txt, G.tie.d.toFixed(2)]);
    north(d, tx + 33 * tt, b.y0 + 1 * ts, ts * 0.7);
    const t0 = b.y0 + 14 * ts;
    AP.table(d, tx, t0, [{ h: 'LINE', w: 18 }, { h: 'BEARING', w: 30 }, { h: 'DIST. (m)', w: 18 }], rows, tt, 'TECHNICAL DESCRIPTION');
    const ty = t0 + (rows.length + 1) * 6 * tt + 6 * tt;
    d.text(tx, ty, 'LOT AREA: ' + AP.area(G.area), 2.2 * tt, { bold: true });
    d.text(tx, ty + 3.6 * tt, 'ERROR OF CLOSURE: ' + G.closure.toFixed(3) + ' m' + (G.closure > 1e-3 ? ' (1:' + Math.round(G.per / G.closure) + ')' : ''), 1.8 * tt, {});
    return d;
  };

  /* ---------------- building on the lot ---------------- */
  // transform from building plan coordinates to lot coordinates
  AP.sitePlacement = function (P) {
    const G = AP.lotGeom(P); if (!G || !G.ok) return null;
    const fl = P.floors[0]; if (!fl || !fl.rooms.length) return null;
    const S = P.settings, e = S.extWall / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of fl.rooms) { x0 = Math.min(x0, r.x - e); y0 = Math.min(y0, r.y - e); x1 = Math.max(x1, r.x + r.w + e); y1 = Math.max(y1, r.y + r.l + e); }
    const bc = [(x0 + x1) / 2, (y0 + y1) / 2], hd = (y1 - y0) / 2;
    const i = Math.min(Math.max(1, (P.lot.road || 1)), G.pts.length) - 1, ow = outward(G.pts, i);
    // building front (+y in plan) faces the road
    const th = Math.atan2(-ow.n[0], ow.n[1]) + (P.lot.rot || 0) * Math.PI / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const sb = P.lot.setback != null ? P.lot.setback : 3.0, shift = P.lot.shift || 0;
    const c = [ow.m[0] - ow.n[0] * (sb + hd) + ow.t[0] * shift, ow.m[1] - ow.n[1] * (sb + hd) + ow.t[1] * shift];
    const T = (x, y) => { const u = x - bc[0], v = y - bc[1]; return [c[0] + u * ca - v * sa, c[1] + u * sa + v * ca]; };
    const inv = (X, Y) => { const u = X - c[0], v = Y - c[1]; return [bc[0] + u * ca + v * sa, bc[1] - u * sa + v * ca]; };
    return { G, T, inv, box: [x0, y0, x1, y1], ang: th, ow };
  };

  // is the building (ground floor, outside face of the walls) inside the lot? how far out does it go?
  AP.siteCheck = function (P) {
    const SP = AP.sitePlacement(P); if (!SP) return null;
    const pts = SP.G.pts, e = P.settings.extWall / 2, fl = P.floors[0];
    const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const segD = (x, y, p, q) => { const vx = q[0] - p[0], vy = q[1] - p[1], L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (y - p[1]) * vy) / L2)); return Math.hypot(x - p[0] - t * vx, y - p[1] - t * vy); };
    let out = 0;
    for (const r of fl.rooms) {
      const x0 = r.x - e, y0 = r.y - e, x1 = r.x + r.w + e, y1 = r.y + r.l + e;
      // the room's outline, every 0.25 m
      const n = Math.max(2, Math.ceil(Math.max(x1 - x0, y1 - y0) / 0.25));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        for (const [x, y] of [[x0 + (x1 - x0) * f, y0], [x0 + (x1 - x0) * f, y1], [x0, y0 + (y1 - y0) * f], [x1, y0 + (y1 - y0) * f]]) {
          const p = SP.T(x, y);
          if (!inside(p[0], p[1])) { let m = Infinity; for (let i = 0; i < pts.length; i++) m = Math.min(m, segD(p[0], p[1], pts[i], pts[(i + 1) % pts.length])); out = Math.max(out, m); }
        }
      }
    }
    const foot = fl.rooms.reduce((a, r) => a + r.w * r.l, 0);
    return { outside: out > 0.02, by: out, foot, lot: SP.G.area, bigger: foot > SP.G.area };
  };
  // move the building to the nearest place inside the lot (front setback & shift along the road); null if it cannot fit
  AP.siteFit = function (P) {
    const L = P.lot || {}, sb0 = L.setback != null ? L.setback : 3, sh0 = L.shift || 0, G = AP.lotGeom(P); if (!G || !G.ok) return null;
    const Q = Object.assign({}, P, { lot: Object.assign({}, L) }), r = Math.sqrt(G.area) * 1.5;
    const ok = (sb, sh) => { Q.lot.setback = sb; Q.lot.shift = sh; const C = AP.siteCheck(Q); return C && !C.outside; };
    if (ok(sb0, sh0)) return { setback: sb0, shift: sh0 };
    const C0 = AP.siteCheck(Q); if (C0 && C0.bigger) return null;
    let best = null;
    for (const st of [0.1]) {
      for (let rad = st; rad <= r && !best; rad += st) { // rings around the present place, nearest first
        const cand = [];
        for (let a = -rad; a <= rad + 1e-9; a += st) for (const [dsb, dsh] of [[a, -rad], [a, rad], [-rad, a], [rad, a]]) cand.push([sb0 + dsb, sh0 + dsh]);
        cand.sort((p, q) => Math.hypot(p[0] - sb0, p[1] - sh0) - Math.hypot(q[0] - sb0, q[1] - sh0));
        for (const [sb, sh] of cand) if (sb >= 0 && ok(sb, sh)) { best = { setback: Math.round(sb * 1000) / 1000, shift: Math.round(sh * 1000) / 1000 }; break; }
      }
    }
    return best;
  };
  // the warning in words (null when the building is inside the lot)
  AP.siteWarning = function (P) {
    const C = AP.siteCheck(P); if (!C || !C.outside) return null;
    return 'The building goes ' + C.by.toFixed(2) + ' m outside the lot' + (C.bigger ? ' – its footprint (' + AP.area(C.foot) + ') is bigger than the lot (' + AP.area(C.lot) + ')' : '') +
      '. Check the technical description, the front setback / shift / turn (Plan › Lot / Site), or the size of the house.';
  };

  /* ---------------- SITE DEVELOPMENT PLAN ---------------- */
  // the lot's technical description (bearing & distance of each line) as a table of its own
  AP.renderTechDesc = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), G = AP.lotGeom(P);
    if (!G || !G.ok) return placeholder(d, ts, ['TECHNICAL DESCRIPTION', 'Plan tab > Lot / Site']);
    const n = G.pts.length, rows = G.courses.map((cc, i) => [(i + 1) + '-' + (i + 2 > n ? 1 : i + 2), cc.txt, cc.d.toFixed(2)]);
    if (G.tie) rows.unshift([G.tie.from.slice(0, 10) + '-1', G.tie.txt, G.tie.d.toFixed(2)]);
    AP.table(d, 0, 0, [{ h: 'LINE', w: 18 }, { h: 'BEARING', w: 30 }, { h: 'DIST. (m)', w: 18 }], rows, ts);
    const ty = (rows.length + 1) * 6 * ts + 5 * ts;
    d.text(0, ty, 'LOT AREA: ' + AP.area(G.area), 2.2 * ts, { bold: true });
    d.text(0, ty + 3.6 * ts, 'ERROR OF CLOSURE: ' + G.closure.toFixed(3) + ' m' + (G.closure > 1e-3 ? ' (1:' + Math.round(G.per / G.closure) + ')' : ''), 1.8 * ts, {});
    return d;
  };
  // lot area, footprint, floor area, lot occupancy and open space as a table of its own
  AP.renderAreaData = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), G = AP.lotGeom(P), fl = P.floors[0];
    if (!G || !G.ok) return placeholder(d, ts, ['AREA DATA', 'Plan tab > Lot / Site']);
    const foot = fl.rooms.reduce((a, r) => a + r.w * r.l, 0), tfa = P.floors.reduce((a, f) => a + f.rooms.reduce((b, r) => b + r.w * r.l, 0), 0);
    AP.table(d, 0, 0, [{ h: 'DESCRIPTION', w: 38 }, { h: 'AREA', w: 26 }], [
      ['LOT AREA', AP.area(G.area)], ['BUILDING FOOTPRINT', AP.area(foot)], ['TOTAL FLOOR AREA', AP.area(tfa)],
      ['% LOT OCCUPANCY', (foot / G.area * 100).toFixed(2) + ' %'], ['OPEN SPACE', AP.area(Math.max(0, G.area - foot))]
    ], ts);
    return d;
  };
  AP.renderSitePlan = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), SP = AP.sitePlacement(P), S = P.settings;
    if (!SP) return placeholder(d, ts, ['SITE DEVELOPMENT PLAN', 'Enter the technical description:', 'Plan tab > Lot / Site']);
    const { G, T } = SP, pts = G.pts, fl = P.floors[0];
    road(d, G, P, ts);
    d.poly(pts, true, st(ts, LW.thick, { layer: 'SITE' }));
    // perimeter fence just inside the lot line
    d.poly(pts, true, st(ts, LW.thin, { layer: 'SITE', dash: [1.2 * ts, 0.8 * ts], stroke: '#555555' }));
    // roof outline (dashed), building footprint, walls
    for (const R of AP.roofs(P)) if (R.oh > 0) d.poly((R.poly || [[R.X0, R.Y0], [R.X1, R.Y0], [R.X1, R.Y1], [R.X0, R.Y1]]).map(p => T(p[0], p[1])), true, st(ts, LW.thin, { dash: [3 * ts, 1.5 * ts], layer: 'ROOF' }));
    for (const r of fl.rooms) d.poly([T(r.x, r.y), T(r.x + r.w, r.y), T(r.x + r.w, r.y + r.l), T(r.x, r.y + r.l)], true, { fill: AP.isOpen(r) ? '#f4f4f4' : '#e6e6e6', stroke: '#9a9a9a', w: LW.fine * ts, layer: 'SITE' });
    for (const w of AP.computeWalls(fl, S)) if (w.t) {
      const a = w.a - w.ea, b = w.b + w.eb, h = w.t / 2;
      const q = w.o === 'h' ? [[a, w.c - h], [b, w.c - h], [b, w.c + h], [a, w.c + h]] : [[w.c - h, a], [w.c + h, a], [w.c + h, b], [w.c - h, b]];
      d.poly(q.map(p => T(p[0], p[1])), true, { fill: '#555555', stroke: 'none', layer: 'WALLS' });
    }
    const [x0, y0, x1, y1] = SP.box, bc = T((x0 + x1) / 2, (y0 + y1) / 2);
    if (o.edit) { const C = AP.siteCheck(P); if (C && C.outside) for (const r of fl.rooms) d.poly([T(r.x, r.y), T(r.x + r.w, r.y), T(r.x + r.w, r.y + r.l), T(r.x, r.y + r.l)], true, { fill: 'none', stroke: '#e53935', w: LW.med * ts, layer: 'EDIT' }); }
    const nF = P.floors.filter(f => f.rooms.length).length;
    const lab = ['PROPOSED ' + (nF > 1 ? nF + '-STOREY' : ''), P.info.type === 'Commercial' ? 'BUILDING' : 'RESIDENCE'].map(t => t.trim());
    const lh = Math.min(2.2 * ts, (x1 - x0) * 0.8 / Math.max(...lab.map(t => AP.textWidth(t, 1, true)))), ra = textAng([Math.cos(SP.ang), Math.sin(SP.ang)]) * Math.PI / 180;
    lab.forEach((t, i) => { const off = (i - 0.5) * lh * 1.3; d.text(bc[0] - Math.sin(ra) * off, bc[1] + Math.cos(ra) * off, t, lh, { anchor: 'middle', v: 'middle', bold: true, rot: ra * 180 / Math.PI }); });
    // setbacks: from the nearest building corner, square to each lot line
    const corners = [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)];
    const ds = st(ts, LW.fine, { layer: 'DIMS' });
    pts.forEach((a, i) => {
      const w = outward(pts, i);
      let best = null;
      for (const p of corners) {
        const dist = (w.m[0] - p[0]) * w.n[0] + (w.m[1] - p[1]) * w.n[1];
        const foot = [p[0] + w.n[0] * dist, p[1] + w.n[1] * dist];
        const s = (foot[0] - a[0]) * w.t[0] + (foot[1] - a[1]) * w.t[1];
        if (s < 0 || s > w.L) continue;               // foot must land on that lot line
        if (!best || dist < best.dist) best = { p, foot, dist };
      }
      if (!best || best.dist < 0.05) return;
      d.lineP(best.p, best.foot, ds);
      for (const q of [best.p, best.foot]) d.lineP([q[0] - w.t[0] * 1 * ts - w.n[0] * ts, q[1] - w.t[1] * ts - w.n[1] * ts], [q[0] + w.t[0] * ts + w.n[0] * ts, q[1] + w.t[1] * ts + w.n[1] * ts], st(ts, LW.thin, { layer: 'DIMS' }));
      const mm = [(best.p[0] + best.foot[0]) / 2, (best.p[1] + best.foot[1]) / 2];
      d.text(mm[0] + w.t[0] * 1.5 * ts, mm[1] + w.t[1] * 1.5 * ts, AP.mm(best.dist), 1.9 * ts, { anchor: 'middle', v: 'middle', rot: textAng(w.n), layer: 'DIMS' });
    });
    // the lot line over the building (seen where the building reaches it), corners numbered as on the lot plan
    d.poly(pts, true, st(ts, LW.thick, { layer: 'SITE' }));
    pts.forEach((p, i) => {
      const c = centroid(pts), v = [p[0] - c[0], p[1] - c[1]], L = Math.hypot(v[0], v[1]) || 1;
      const q = [p[0] + v[0] / L * 3.2 * ts, p[1] + v[1] / L * 3.2 * ts];
      d.circle(p[0], p[1], 0.6 * ts, { fill: '#000000', stroke: 'none', layer: 'SITE' });
      d.circle(q[0], q[1], 1.8 * ts, st(ts, LW.thin, { fill: '#ffffff', layer: 'SITE' }));
      d.text(q[0], q[1], String(i + 1), 1.9 * ts, { anchor: 'middle', v: 'middle', bold: true });
    });
    // area data
    const foot = fl.rooms.reduce((a, r) => a + r.w * r.l, 0), tfa = P.floors.reduce((a, f) => a + f.rooms.reduce((b, r) => b + r.w * r.l, 0), 0);
    // compact (60 %) so the site plan itself gets the room: north arrow, then the table, beside the site
    // (on the A-1 sheet the table is a view of its own – AP.renderAreaData – and only the north arrow stays)
    const b = d.bbox(), tx = b.x1 + 5 * ts, tt = ts * 0.6;
    if (o.noTable) { north(d, b.x1 + 6 * ts, b.y0 + 4 * ts, ts * 0.8); return d; }
    north(d, tx + 32 * tt, b.y0 + 1 * ts, ts * 0.7);
    AP.table(d, tx, b.y0 + 14 * ts, [{ h: 'DESCRIPTION', w: 38 }, { h: 'AREA', w: 26 }], [
      ['LOT AREA', AP.area(G.area)], ['BUILDING FOOTPRINT', AP.area(foot)], ['TOTAL FLOOR AREA', AP.area(tfa)],
      ['% LOT OCCUPANCY', (foot / G.area * 100).toFixed(2) + ' %'], ['OPEN SPACE', AP.area(Math.max(0, G.area - foot))]
    ], tt, 'AREA DATA');
    return d;
  };

  /* ---------------- VICINITY MAP (screenshot from Google Maps) ---------------- */
  // location map (town / province), uploaded by the user
  AP.renderLocationMap = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), V = P.locmap;
    if (!V || !V.img) return placeholder(d, ts, ['LOCATION MAP', 'Plan tab > Lot / Site > Upload location map']);
    const W = 150 * ts, H = W * V.ph / V.pw;
    d.image(0, 0, W, H, V.img, V.pw, V.ph);
    d.rect(0, 0, W, H, st(ts, LW.med));
    north(d, W - 8 * ts, 10 * ts, ts);
    if (P.info.municipality || P.info.province) d.text(W / 2, H + 4 * ts, [P.info.municipality, P.info.province].filter(Boolean).join(', ').toUpperCase(), 2 * ts, { anchor: 'middle' });
    return d;
  };
  AP.renderVicinity = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), V = P.vicinity;
    if (!V || !V.img) return placeholder(d, ts, ['VICINITY MAP', 'Plan tab > Lot / Site > Open Google Maps,', 'take a screenshot, then Upload vicinity map']);
    const W = 150 * ts, H = W * V.ph / V.pw;
    d.image(0, 0, W, H, V.img, V.pw, V.ph);
    d.rect(0, 0, W, H, st(ts, LW.med));
    north(d, W - 8 * ts, 10 * ts, ts);
    if (P.info.location) d.text(W / 2, H + 4 * ts, String(P.info.location).toUpperCase(), 2 * ts, { anchor: 'middle' });
    return d;
  };

  // roof edges and ridge / hip / valley lines (plan coordinates, sampled so z can follow the roof)
  AP.roofLines = R => roofLines(R);
  function roofLines(R) {
    if (R.poly) {
      // outline roof: the outline, then ridges / hips / valleys (or the box roof's lines cut to the outline)
      const segN = (p, q) => { const o = []; for (let i = 0; i <= 20; i++) o.push([p[0] + (q[0] - p[0]) * i / 20, p[1] + (q[1] - p[1]) * i / 20]); return o; };
      const out = AP.polyEdges(R.poly).map(e => segN(e.p0, e.p1));
      R.nOut = out.length;
      if (R.parts) for (const ln of AP.roofCreases(R).lines) out.push(segN(ln[0], ln[1]));
      else for (const ln of boxLines(R).slice(4)) {
        let run = [];
        for (const p of ln) { if (R.inside(p[0], p[1])) run.push(p); else { if (run.length > 1) out.push(run); run = []; } }
        if (run.length > 1) out.push(run);
      }
      return out;
    }
    return boxLines(R);
  }
  function boxLines(R) {
    const L = (a, c) => (R.ridgeX ? [a, c] : [c, a]);
    const seg = (a1, c1, a2, c2) => { const o = []; for (let i = 0; i <= 20; i++) o.push(L(a1 + (a2 - a1) * i / 20, c1 + (c2 - c1) * i / 20)); return o; };
    const { A0, A1, C0, C1, cm } = R, half = (C1 - C0) / 2, out = [];
    out.push(seg(A0, C0, A1, C0), seg(A1, C0, A1, C1), seg(A1, C1, A0, C1), seg(A0, C1, A0, C0));
    if (R.type === 'hip' || R.type === 'kubo') {
      const h = Math.min(half, (A1 - A0) / 2);
      for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) out.push(seg(a, c, a === A0 ? A0 + h : A1 - h, cm));
      out.push(seg(A0 + h, cm, A1 - h, cm));
    } else if (R.type === 'dutch') {
      const k = R.d0;
      for (const [a, c] of [[A0, C0], [A0, C1], [A1, C0], [A1, C1]]) out.push(seg(a, c, a === A0 ? A0 + k : A1 - k, c === C0 ? C0 + k : C1 - k));
      out.push(seg(A0 + k, C0 + k, A0 + k, C1 - k), seg(A1 - k, C0 + k, A1 - k, C1 - k), seg(A0 + k, cm, A1 - k, cm));
    } else if (R.type === 'gable' || R.type === 'butterfly') out.push(seg(A0, cm, A1, cm));
    else if (R.type === 'clerestory' || R.type === 'doubleshed') out.push(seg(A0, cm - 0.01, A1, cm - 0.01), seg(A0, cm + 0.01, A1, cm + 0.01));
    return out;
  }

  /* ---------------- ISOMETRIC FLOOR PLAN (cut-away 3-D plan) ---------------- */
  AP.renderIsoPlan = function (P, fi, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings, fl = P.floors[fi];
    if (!fl || !fl.rooms.length) return d;
    const cutH = Math.min(S.ceilingHt, S.doorHt + 0.3);
    const walls = AP.computeWalls(fl, S), C = AP.columns(P);
    // isometric camera from the front-right (south-east), world = (x east, -y north, z up)
    const dir = (() => { const v = [1, -1, 1.15], L = Math.hypot(...v); return v.map(x => x / L); })();
    const fw = dir.map(x => -x), up0 = [0, 0, 1];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nz = a => { const L = Math.hypot(...a) || 1; return a.map(x => x / L); };
    const rt = nz(cr(fw, up0)), up = cr(rt, fw), dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const proj = (x, y, z) => { const v = [x, -y, z]; return [dt(v, rt), -dt(v, up), dt(v, fw)]; };
    const P2 = (x, y, z) => { const q = proj(x, y, z); return [q[0], q[1]]; };
    const light = nz([-0.4, -0.8, 1]);
    const shade = (hex, n) => {
      const c = parseInt(hex.slice(1), 16), k = 0.8 + 0.2 * Math.max(0, dt(n, light));
      const ch = v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
      return '#' + ch((c >> 16) & 255) + ch((c >> 8) & 255) + ch(c & 255);
    };
    const line = { stroke: '#2f2f2f', w: 0.3 * ts, layer: 'ISO' };
    // 1. floors
    for (const r of fl.rooms) {
      const col = (AP.ROOM_TYPES[r.type] || {}).color || '#f2f2f2';
      d.poly([P2(r.x, r.y, 0), P2(r.x + r.w, r.y, 0), P2(r.x + r.w, r.y + r.l, 0), P2(r.x, r.y + r.l, 0)], true, Object.assign({ fill: col }, { stroke: '#9a9a9a', w: 0.15 * ts, layer: 'ISO' }));
    }
    // 2. plan symbols on the floor: fixtures, furniture, door swings (projected flat)
    const fx = new AP.Drawing(), fts = ts;
    for (const r of fl.rooms) AP.drawFixtures(fx, fl, r, S, fts);
    for (const f of fl.furniture || []) AP.drawFurniture(fx, f, fts, false);
    for (const op of fl.openings) if (op.kind === 'door') AP.drawOpeningPlan(fx, fl, walls, op, fts, null, false);
    const fz = 0.005, fs = { stroke: '#555555', w: 0.18 * ts, layer: 'ISO' };
    for (const it of fx.items) {
      if (it.t === 'line') d.line(...P2(it.x1, it.y1, fz), ...P2(it.x2, it.y2, fz), fs);
      else if (it.t === 'poly') d.poly(it.pts.map(p => P2(p[0], p[1], fz)), it.closed, Object.assign({}, fs, it.s && it.s.fill && it.s.fill !== 'none' ? { fill: it.s.fill } : {}));
      else if (it.t === 'circle' || it.t === 'arc') {
        const a0 = it.t === 'arc' ? it.a0 : 0, a1 = it.t === 'arc' ? it.a1 : 2 * Math.PI, n = 24, pts = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(P2(it.cx + it.r * Math.cos(a), it.cy + it.r * Math.sin(a), fz)); }
        d.poly(pts, it.t === 'circle', fs);
      }
    }
    // 3. walls cut at cutH (pieces between openings), sill walls, glass, lintels, columns
    const boxes = [];
    const box = (x0, y0, x1, y1, z0, z1, col, top) => boxes.push({ x0, y0, x1, y1, z0, z1, col, top });
    for (const w of walls) {
      if (!w.t) continue;
      const a = w.a - w.ea, b = w.b + w.eb, h = w.t / 2;
      const B = (s0, s1, z0, z1, col, top, th) => {
        const k = (th || w.t) / 2;
        if (w.o === 'h') box(s0, w.c - k, s1, w.c + k, z0, z1, col, top); else box(w.c - k, s0, w.c + k, s1, z0, z1, col, top);
      };
      const ops = [];
      for (const op of fl.openings) {
        const Ro = AP.resolveOp(fl, op);
        if (!Ro || Ro.o !== w.o || !AP.eq(Ro.c, w.c) || Ro.s < w.a || Ro.s > w.b) continue;
        const rr = fl.rooms.find(q => q.id === op.roomId); if (rr && AP.sideOpen(rr, op.side)) continue;
        ops.push({ op, s0: Ro.s - Ro.w / 2, s1: Ro.s + Ro.w / 2 });
      }
      ops.sort((p, q) => p.s0 - q.s0);
      let s = a;
      for (const e of ops) {
        if (e.s0 > s + 0.005) B(s, e.s0, 0, cutH, '#f7f3ea', '#4a4a4a');
        const sill = AP.opSill(e.op, S), head = sill + e.op.h;
        if (e.op.kind === 'window') {
          if (sill > 0.01) B(e.s0, e.s1, 0, sill, '#efe9dc', '#efe9dc');
          B(e.s0, e.s1, sill, Math.min(head, cutH), '#b9d4e6', '#7aa3bf', 0.03);
        }
        if (head < cutH - 0.01) B(e.s0, e.s1, head, cutH, '#f7f3ea', '#4a4a4a');
        s = Math.max(s, e.s1);
      }
      if (b > s + 0.005) B(s, b, 0, cutH, '#f7f3ea', '#4a4a4a');
      void h;
    }
    for (const c of C.cols) if (c.top >= fi) {
      const hx = c.size / 2, hy = (c.d || c.size) / 2;
      box(c.x - hx, c.y - hy, c.x + hx, c.y + hy, 0, cutH + 0.01, '#d9d4c8', '#1e1e1e');
    }
    // far to near
    boxes.forEach(q => { q.depth = proj((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, (q.z0 + q.z1) / 2)[2]; });
    boxes.sort((p, q) => q.depth - p.depth);
    const vdir = dir; // towards the viewer
    for (const q of boxes) {
      const { x0, y0, x1, y1, z0, z1 } = q;
      const F = [
        { n: [0, 0, 1], pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top: true },
        { n: [0, -1, 0], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },   // south (plan +y)
        { n: [0, 1, 0], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },    // north
        { n: [1, 0, 0], pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },    // east
        { n: [-1, 0, 0], pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] }    // west
      ];
      for (const f of F) {
        if (dt(f.n, vdir) <= 0) continue;
        d.poly(f.pts.map(p => P2(p[0], p[1], p[2])), true, { fill: f.top ? q.top : shade(q.col, f.n), stroke: line.stroke, w: line.w, layer: 'ISO' });
      }
    }
    // 4. room names, upright
    for (const r of fl.rooms) {
      const c = P2(r.x + r.w / 2, r.y + r.l / 2, 0), nm = (r.name || '').toUpperCase();
      d.text(c[0], c[1], nm, 2.2 * ts, { anchor: 'middle', bold: true, layer: 'ISO' });
      d.text(c[0], c[1] + 3 * ts, AP.area(r.w * r.l), 1.7 * ts, { anchor: 'middle', layer: 'ISO' });
    }
    return d;
  };

  /* The building as flat-shaded polygons, world = (x east, -y north, z up). Used by the perspective (painter's
   * algorithm) and the interactive 3-D view. opt.inside adds floor slabs, interior walls and wall tops.
   * Face tags: lv = floor of a wall / post / slab; rf + rl = roof face and the floor it sits on. */
  AP.model3D = function (P, opt) {
    opt = opt || {};
    const S = P.settings, RL = AP.roofs(P), C = AP.columns(P);
    const floors = P.floors.map((f, i) => ({ f, i })).filter(e => e.f.rooms.length);
    const faces = [], lines = [];
    if (!floors.length) return { faces, lines, RL };
    const zOf = i => AP.levelZ(P, i);
    const W = p => [p[0], -p[1], p[2]];
    const face = (pts, color, extra) => faces.push(Object.assign({ pts: pts.map(W), color }, extra || {}));
    const OUT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
    // walls, openings, posts
    for (const { f: fl, i: fi } of floors) {
      const nf0 = faces.length;
      const walls = AP.computeWalls(fl, S), z0 = zOf(fi), zb = fi === 0 ? -S.plinth : z0, zt = z0 + AP.floorH(P, fi);
      for (const w of walls) {
        if (w.kind !== 'ext' && w.kind !== 'edge') continue;
        const dir = OUT[w.out]; if (!dir) continue;
        const off = w.o === 'h' ? [0, dir[1] * (w.t || 0.15) / 2] : [dir[0] * (w.t || 0.15) / 2, 0];
        const a = w.a - w.ea, b = w.b + w.eb;
        const P2 = (s, z) => (w.o === 'h' ? [s + off[0], w.c + off[1], z] : [w.c + off[0], s + off[1], z]);
        const nrm = [dir[0], -dir[1], 0];
        if (w.kind === 'ext') {
          // gable ends: wall rises to the roof sitting on it (parapet on a box roof)
          const prof = [];
          const N = 16;
          for (let k = 0; k <= N; k++) {
            const s = a + (b - a) * k / N, p = P2(s, 0), q = P2(s - (s - (a + b) / 2) * 1e-3, 0);
            const R = AP.roofAt(P, fi, q[0], q[1], RL);
            // only a wall on the roof's edge rises to it (gable end); one set back under the roof stops at the beam
            const atEdge = R && AP.roofEdgeWall(R, w.o, w.c, s, S);
            const zu = zt + (R && R.zoff > 0 ? R.zoff : 0);
            const zr = !R ? zt : R.box ? zu + S.parapet : atEdge ? Math.max(zu, R.z(p[0], p[1]) - 0.12) : zu;
            prof.push(P2(s, zr));
          }
          const holes = [];
          for (const op of fl.openings) {
            const Ro = AP.resolveOp(fl, op);
            if (!Ro || Ro.o !== w.o || !AP.eq(Ro.c, w.c) || Ro.s < w.a || Ro.s > w.b || op.side !== w.out) continue;
            const sill = AP.opSill(op, S), s0 = Ro.s - Ro.w / 2, s1 = Ro.s + Ro.w / 2;
            const k = 0.012, Q = (s, z) => { const p = P2(s, z); return [p[0] + dir[0] * k, p[1] + dir[1] * k, p[2]]; };
            holes.push({ pts: [Q(s0, z0 + sill), Q(s1, z0 + sill), Q(s1, z0 + sill + op.h), Q(s0, z0 + sill + op.h)].map(W), color: op.kind === 'door' ? '#7a4e2d' : '#557895', mull: op.kind === 'window' ? [Q(Ro.s, z0 + sill), Q(Ro.s, z0 + sill + op.h)].map(W) : null });
          }
          face([P2(a, zb), P2(b, zb), ...prof.slice().reverse()], '#efe9dc', { n: nrm, sub: holes, edge: '#2f2f2f' });
          // floor line band
          if (fi > 0) face([P2(a, z0 - 0.02), P2(b, z0 - 0.02), P2(b, z0 + 0.12), P2(a, z0 + 0.12)].map(p => [p[0] + dir[0] * 0.02, p[1] + dir[1] * 0.02, p[2]]), '#d9d2c3', { n: nrm });
        } else {
          face([P2(a, zt - S.beamDepth), P2(b, zt - S.beamDepth), P2(b, zt), P2(a, zt)], '#efe9dc', { n: nrm, edge: '#2f2f2f' });
        }
      }
      // posts on open sides
      for (const c of C.cols) {
        if (c.top < fi) continue;
        const onEdge = walls.some(w => w.kind === 'edge' && (w.o === 'h' ? AP.eq(c.y, w.c) && c.x >= w.a - 1e-3 && c.x <= w.b + 1e-3 : AP.eq(c.x, w.c) && c.y >= w.a - 1e-3 && c.y <= w.b + 1e-3));
        if (!onEdge) continue;
        const hx = c.size / 2, hy = (c.d || c.size) / 2, zA = fi === 0 ? -S.plinth : z0, zB = zt - S.beamDepth;
        const q = [[c.x - hx, c.y - hy], [c.x + hx, c.y - hy], [c.x + hx, c.y + hy], [c.x - hx, c.y + hy]];
        const ns = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]];
        for (let k = 0; k < 4; k++) { const p = q[k], r = q[(k + 1) % 4]; face([[p[0], p[1], zA], [r[0], r[1], zA], [r[0], r[1], zB], [p[0], p[1], zB]], '#f5f2ea', { n: ns[k], edge: '#2f2f2f' }); }
      }
      if (opt.inside) inside3D(P, fl, fi, walls, face);
      for (let k = nf0; k < faces.length; k++) { faces[k].grp = fi; faces[k].lv = fi; }
    }
    // roofs: flat-shaded mesh + fascia. Draw order (grp): the walls of a floor, then the roofs sitting on it;
    // a lower roof shares its group with the walls of the floor above, sorted by distance between them
    for (const fc of faces) fc.grp = fc.grp != null ? fc.grp : 0;
    for (const R of RL) {
      const g0 = faces.length;
      if (R.box) {
        const t = S.extWall / 2, b = R.b;
        face([[b.x0 - t, b.y0 - t, R.zTop + 0.05], [b.x1 + t, b.y0 - t, R.zTop + 0.05], [b.x1 + t, b.y1 + t, R.zTop + 0.05], [b.x0 - t, b.y1 + t, R.zTop + 0.05]], '#b9b9b9', { n: [0, 0, 1], pri: 2 });
      } else {
        const even = n => n + (n % 2); // a grid line on the middle, where split roofs step
        const nx = even(Math.min(60, Math.max(8, Math.ceil((R.X1 - R.X0) / 0.25)))), ny = even(Math.min(60, Math.max(8, Math.ceil((R.Y1 - R.Y0) / 0.25))));
        const X = i => R.X0 + (R.X1 - R.X0) * i / nx, Y = j => R.Y0 + (R.Y1 - R.Y0) * j / ny;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const qc = [(X(i) + X(i + 1)) / 2, (Y(j) + Y(j + 1)) / 2];
          if (R.poly && !R.inside(qc[0], qc[1])) continue;
          // corner heights taken a hair inside the square, so a stepped roof (clerestory / double shed) keeps its step
          const q = [[X(i), Y(j)], [X(i + 1), Y(j)], [X(i + 1), Y(j + 1)], [X(i), Y(j + 1)]].map(p => [p[0], p[1], R.z(p[0] + (qc[0] - p[0]) * 1e-3, p[1] + (qc[1] - p[1]) * 1e-3)]);
          face(q, '#a3402e', { roof: true, pri: 2 });
        }
        // clerestory glazing between the high and the low roof
        if (R.type === 'clerestory' || R.type === 'doubleshed') {
          const zl = R.zE + R.pitch * (R.C1 - R.cm), zh = zl + R.step, a0 = R.A0 + R.oh, a1 = R.A1 - R.oh;
          const Lp = (a, z) => (R.ridgeX ? [a, R.cm, z] : [R.cm, a, z]);
          face([Lp(a0, zl), Lp(a1, zl), Lp(a1, zh), Lp(a0, zh)], '#8fb4cc', { n: R.ridgeX ? [0, -R.fs, 0] : [R.fs, 0, 0], edge: '#2f2f2f', pri: 0.5 });
        }
        // fascia boards along the roof edges
        const ed = R.poly ? AP.polyEdges(R.poly).map(e => [e.p0, e.p1, [e.n[0], -e.n[1], 0]]) : [[[R.X0, R.Y1], [R.X1, R.Y1], [0, -1, 0]], [[R.X1, R.Y1], [R.X1, R.Y0], [1, 0, 0]], [[R.X1, R.Y0], [R.X0, R.Y0], [0, 1, 0]], [[R.X0, R.Y0], [R.X0, R.Y1], [-1, 0, 0]]];
        for (const [A, B, n] of ed) {
          const M = 12, An = [n[0], -n[1]];
          for (let k = 0; k < M; k++) {
            const p = [A[0] + (B[0] - A[0]) * k / M, A[1] + (B[1] - A[1]) * k / M], r = [A[0] + (B[0] - A[0]) * (k + 1) / M, A[1] + (B[1] - A[1]) * (k + 1) / M];
            const hin = q2 => (R.poly ? R.z(q2[0] - An[0] * 1e-3, q2[1] - An[1] * 1e-3) : R.z(q2[0], q2[1]));
            const zp = hin(p), zr = hin(r);
            face([[p[0], p[1], zp - 0.2], [r[0], r[1], zr - 0.2], [r[0], r[1], zr], [p[0], p[1], zp]], '#f4f4f4', { n, edge: '#2f2f2f', pri: 1 });
          }
        }
      }
      for (let k = g0; k < faces.length; k++) Object.assign(faces[k], { grp: R.level + 1, rf: true, rl: R.level });
      if (!R.box) for (const ln of roofLines(R)) lines.push({ rl: R.level, pts: ln.map(p => W([p[0], p[1], R.z(p[0], p[1]) + 0.01])) });
    }
    return { faces, lines, RL };
  };
  // floor slabs coloured by room, interior walls cut at the doors / windows, tops of the outside walls
  function inside3D(P, fl, fi, walls, face) {
    const S = P.settings, z0 = AP.levelZ(P, fi), zt = z0 + AP.floorH(P, fi);
    for (const r of fl.rooms) {
      const col = (AP.ROOM_TYPES[r.type] || {}).color || '#eeeeee';
      face([[r.x, r.y, z0 + 0.005], [r.x + r.w, r.y, z0 + 0.005], [r.x + r.w, r.y + r.l, z0 + 0.005], [r.x, r.y + r.l, z0 + 0.005]], col, { n: [0, 0, 1], slab: true });
    }
    const box = (x0, y0, x1, y1, za, zb, col) => {
      face([[x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb]], col === '#efe9dc' ? '#d8d1c2' : col, { n: [0, 0, 1], edge: '#2f2f2f' });
      face([[x0, y1, za], [x1, y1, za], [x1, y1, zb], [x0, y1, zb]], col, { n: [0, -1, 0], edge: '#2f2f2f' });
      face([[x0, y0, za], [x1, y0, za], [x1, y0, zb], [x0, y0, zb]], col, { n: [0, 1, 0], edge: '#2f2f2f' });
      face([[x1, y0, za], [x1, y1, za], [x1, y1, zb], [x1, y0, zb]], col, { n: [1, 0, 0], edge: '#2f2f2f' });
      face([[x0, y0, za], [x0, y1, za], [x0, y1, zb], [x0, y0, zb]], col, { n: [-1, 0, 0], edge: '#2f2f2f' });
    };
    for (const w of walls) {
      if (!w.t || w.kind === 'edge') continue;
      const k = w.t / 2, a = w.a - w.ea, b = w.b + w.eb;
      const B = (s0, s1, za, zb, col, th) => { const h = (th || w.t) / 2; if (w.o === 'h') box(s0, w.c - h, s1, w.c + h, za, zb, col); else box(w.c - h, s0, w.c + h, s1, za, zb, col); };
      if (w.kind === 'ext') { // the outside face is drawn already: add the top of the wall
        if (w.o === 'h') face([[a, w.c - k, zt], [b, w.c - k, zt], [b, w.c + k, zt], [a, w.c + k, zt]], '#d8d1c2', { n: [0, 0, 1] });
        else face([[w.c - k, a, zt], [w.c + k, a, zt], [w.c + k, b, zt], [w.c - k, b, zt]], '#d8d1c2', { n: [0, 0, 1] });
        continue;
      }
      const ops = [];
      for (const op of fl.openings) {
        const Ro = AP.resolveOp(fl, op);
        if (!Ro || Ro.o !== w.o || !AP.eq(Ro.c, w.c) || Ro.s < w.a || Ro.s > w.b) continue;
        ops.push({ op, s0: Ro.s - Ro.w / 2, s1: Ro.s + Ro.w / 2 });
      }
      ops.sort((p, q) => p.s0 - q.s0);
      let s = a;
      for (const e of ops) {
        if (e.s0 > s + 0.005) B(s, e.s0, z0, zt, '#efe9dc');
        const sill = z0 + AP.opSill(e.op, S), head = sill + e.op.h;
        if (sill > z0 + 0.01) B(e.s0, e.s1, z0, sill, '#efe9dc');
        if (e.op.kind === 'window') B(e.s0, e.s1, sill, head, '#9fc2da', 0.02);
        if (head < zt - 0.01) B(e.s0, e.s1, head, zt, '#efe9dc');
        s = Math.max(s, e.s1);
      }
      if (b > s + 0.005) B(s, b, z0, zt, '#efe9dc');
    }
  }

  /* ---------------- PERSPECTIVE VIEW ---------------- */
  AP.renderPerspective = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), S = P.settings;
    // the user's own picture replaces the drawn perspective
    if (P.perspImg && P.perspImg.img && !o.drawn) {
      const V = P.perspImg, W = 150 * ts, H = W * V.ph / V.pw;
      d.image(0, 0, W, H, V.img, V.pw, V.ph);
      d.rect(0, 0, W, H, st(ts, LW.thin));
      return d;
    }
    const { faces, RL } = AP.model3D(P);
    if (!faces.length) return d;
    const W = p => [p[0], -p[1], p[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
    // camera: from the front-right corner, above
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, zMax = 0;
    for (const fc of faces) for (const p of fc.pts) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); zMax = Math.max(zMax, p[2]); }
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, D = Math.max(bx1 - bx0, by1 - by0, 4);
    const cam = [cx + 0.95 * D, by0 - 1.65 * D, zMax + 0.55 * D], tgt = [cx, cy, zMax * 0.38];
    const fw = norm(sub(tgt, cam)), rt = norm(cross(fw, [0, 0, 1])), up = cross(rt, fw), F = D * 1.6;
    const proj = p => { const v = sub(p, cam), z = dot(v, fw); return [dot(v, rt) / z * F, -dot(v, up) / z * F, z]; };
    const light = norm([-0.45, -0.75, 0.9]);
    const shade = (hex, n) => {
      const c = parseInt(hex.slice(1), 16), k = 0.62 + 0.38 * Math.max(0, dot(n, light));
      const ch = v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
      return '#' + ch((c >> 16) & 255) + ch((c >> 8) & 255) + ch(c & 255);
    };
    // ground
    const gm = 2.5, gz = -S.plinth - 0.001;
    const ground = [[bx0 - gm, by0 - gm, gz], [bx1 + gm, by0 - gm, gz], [bx1 + gm, by1 + gm, gz], [bx0 - gm, by1 + gm, gz]].map(proj);
    d.poly(ground.map(p => [p[0], p[1]]), true, { fill: '#d6e6c8', stroke: 'none', layer: 'PERSP' });
    const vis = [];
    for (const fc of faces) {
      let n = fc.n;
      if (!n) { n = norm(cross(sub(fc.pts[1], fc.pts[0]), sub(fc.pts[3] || fc.pts[2], fc.pts[0]))); if (n[2] < 0) n = n.map(v => -v); }
      const c = fc.pts.reduce((a, p) => [a[0] + p[0] / fc.pts.length, a[1] + p[1] / fc.pts.length, a[2] + p[2] / fc.pts.length], [0, 0, 0]);
      if (dot(n, sub(cam, c)) <= 0) continue;              // facing away
      vis.push({ fc, n, depth: Math.hypot(...sub(c, cam)) });
    }
    // the camera is above the roofs: group by group (see grp); in a group of walls & roofs far to near,
    // in a group of one roof: fascia, then the roof surface, far to near
    const mixed = new Set(faces.filter(f => !f.pri).map(f => f.grp));
    vis.sort((a, b) => a.fc.grp - b.fc.grp || (mixed.has(a.fc.grp) ? 0 : (a.fc.pri || 0) - (b.fc.pri || 0)) || b.depth - a.depth);
    for (const { fc, n } of vis) {
      const col = shade(fc.color, n);
      const pts = fc.pts.map(proj).map(p => [p[0], p[1]]);
      d.poly(pts, true, { fill: col, stroke: fc.roof ? col : (fc.edge || col), w: (fc.roof ? 0.15 : 0.25) * ts, layer: 'PERSP' });
      for (const h of fc.sub || []) {
        d.poly(h.pts.map(proj).map(p => [p[0], p[1]]), true, { fill: shade(h.color, n), stroke: '#3e3e3e', w: 0.25 * ts, layer: 'PERSP' });
        if (h.mull) { const a = proj(h.mull[0]), b = proj(h.mull[1]); d.line(a[0], a[1], b[0], b[1], { stroke: '#3e3e3e', w: 0.25 * ts, layer: 'PERSP' }); }
      }
    }
    for (const R of RL) if (!R.box) for (const ln of roofLines(R)) {
      const q = ln.map(p => proj(W([p[0], p[1], R.z(p[0], p[1]) + 0.01])));
      d.poly(q.map(p => [p[0], p[1]]), false, { stroke: '#2f2f2f', w: 0.35 * ts, layer: 'PERSP' });
    }
    return d;
  };
})(window.AP);
