/* ArkiPlan – building geometry derived from the rooms the user enters.
 * Plan coordinates: x to the right (east), y downward (south), metres.
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  const E = 1e-4;
  const rnd = v => Math.round(v * 1000) / 1000;
  const eq = (a, b) => Math.abs(a - b) < E;
  AP.eq = eq;
  AP.isOpen = r => !!(AP.ROOM_TYPES[r.type] || {}).open;
  // user-removed walls: room.noWall = ['N','E',...]
  AP.sideOpen = (r, side) => !!(r.noWall && r.noWall.indexOf(side) >= 0);
  // a stair goes up from its room's low end (left / top) unless that end is closed and the other end is open
  // (no wall, a wall cut or a door there): then it is reversed. A stair on an upper floor follows the one below.
  AP.stairRev = function (P, r) {
    if (r.stairRev != null) return !!r.stairRev;
    const fi = P.floors.findIndex(f => f.rooms.indexOf(r) >= 0); if (fi < 0) return false;
    const over = q => q.type === 'stairs' && q.x < r.x + r.w - 0.05 && q.x + q.w > r.x + 0.05 && q.y < r.y + r.l - 0.05 && q.y + q.l > r.y + 0.05;
    if (fi > 0) { const q = P.floors[fi - 1].rooms.find(over); if (q) return AP.stairRev(P, q); }
    const fl = P.floors[fi], alongX = r.w >= r.l, ends = alongX ? ['W', 'E'] : ['N', 'S'];
    const cutOn = sd => {
      const o = sd === 'N' || sd === 'S' ? 'h' : 'v', c = sd === 'N' ? r.y : sd === 'S' ? r.y + r.l : sd === 'W' ? r.x : r.x + r.w;
      const a = o === 'h' ? r.x : r.y, b = o === 'h' ? r.x + r.w : r.y + r.l;
      return (fl.wallCuts || []).some(k => k.o === o && Math.abs(k.c - c) < 0.01 && Math.min(b, k.b) - Math.max(a, k.a) > 0.5);
    };
    const open = sd => AP.sideOpen(r, sd) || cutOn(sd) || (fl.openings || []).some(o => o.roomId === r.id && o.side === sd && o.kind === 'door');
    return !open(ends[0]) && open(ends[1]);
  };

  /* ---------- walls ----------
   * Every room edge becomes a wall. Shared edges become one interior wall.
   * kind: 'ext' | 'int' | 'edge' (edge = boundary of an open area, no wall)
   * out: side the outside of an exterior wall faces (N,S,E,W)
   */
  AP.computeWalls = function (floor, S) {
    const rooms = floor.rooms, res = [];
    for (const o of ['h', 'v']) {
      const coords = new Set();
      for (const r of rooms) {
        if (o === 'h') { coords.add(rnd(r.y)); coords.add(rnd(r.y + r.l)); }
        else { coords.add(rnd(r.x)); coords.add(rnd(r.x + r.w)); }
      }
      for (const c of [...coords].sort((a, b) => a - b)) {
        const minus = [], plus = [], pts = new Set();
        for (const r of rooms) {
          const lo = o === 'h' ? r.y : r.x, hi = o === 'h' ? r.y + r.l : r.x + r.w;
          const a = o === 'h' ? r.x : r.y, b = o === 'h' ? r.x + r.w : r.y + r.l;
          if (eq(hi, c)) { minus.push([a, b, r]); pts.add(rnd(a)); pts.add(rnd(b)); }
          if (eq(lo, c)) { plus.push([a, b, r]); pts.add(rnd(a)); pts.add(rnd(b)); }
        }
        const cuts = (floor.wallCuts || []).filter(k => k.o === o && eq(k.c, c));
        for (const k of cuts) { pts.add(rnd(k.a)); pts.add(rnd(k.b)); }
        const P = [...pts].sort((p, q) => p - q);
        let cur = null;
        for (let i = 0; i < P.length - 1; i++) {
          const a = P[i], b = P[i + 1];
          if (b - a < E) continue;
          const m = (a + b) / 2;
          const rm = minus.find(e => e[0] < m && m < e[1]), rp = plus.find(e => e[0] < m && m < e[1]);
          const om = rm && AP.isOpen(rm[2]), op = rp && AP.isOpen(rp[2]);
          const outMinus = o === 'h' ? 'N' : 'W', outPlus = o === 'h' ? 'S' : 'E';
          let kind = null, out = null;
          // a side the user opened (no wall on that side) -> just a dashed boundary line
          const mNo = rm && AP.sideOpen(rm[2], o === 'h' ? 'S' : 'E'), pNo = rp && AP.sideOpen(rp[2], o === 'h' ? 'N' : 'W');
          const cutHit = cuts.some(k => m > k.a && m < k.b);
          if ((mNo || pNo || cutHit) && (rm || rp)) { kind = 'edge'; out = rm && rp ? null : rm ? outPlus : outMinus; }
          else if (rm && rp) {
            if (om && op) kind = null;
            else if (!om && !op) kind = 'int';
            else { kind = 'ext'; out = om ? outMinus : outPlus; }
          } else if (rm) { kind = om ? 'edge' : 'ext'; out = outPlus; }
          else if (rp) { kind = op ? 'edge' : 'ext'; out = outMinus; }
          if (!kind) { cur = null; continue; }
          if (cur && eq(cur.b, a) && cur.kind === kind && cur.out === out) cur.b = b;
          else {
            cur = { o, c, a, b, kind, out, t: kind === 'ext' ? S.extWall : kind === 'int' ? S.intWall : 0 };
            res.push(cur);
          }
        }
      }
    }
    // thickness set by the user for one room side (floor.wallThk = [{o, c, a, b, t}])
    for (const w of res) {
      if (!w.t) continue;
      const k = (floor.wallThk || []).find(q => q.o === w.o && eq(q.c, w.c) && Math.min(q.b, w.b) - Math.max(q.a, w.a) > 0.05);
      if (k) w.t = k.t;
    }
    // walls the user drew (partitions), floor.extraWalls = [{id, o, c, a, b, t}]
    for (const xw of floor.extraWalls || []) res.push({ o: xw.o, c: xw.c, a: Math.min(xw.a, xw.b), b: Math.max(xw.a, xw.b), kind: 'int', out: null, t: xw.t || S.intWall, id: xw.id, h: xw.h || 0, mat: xw.mat || null });
    // extend wall ends into perpendicular walls so corners close
    for (const w of res) { w.ea = jx(w, w.a, res); w.eb = jx(w, w.b, res); }
    return res;
  };
  function jx(w, p, walls) {
    let m = 0;
    for (const q of walls) {
      if (q.o === w.o || !q.t) continue;
      if (eq(q.c, p) && w.c >= q.a - E && w.c <= q.b + E) m = Math.max(m, q.t / 2);
    }
    return m;
  }
  AP.wallAt = function (walls, o, c, s) {
    return walls.find(w => w.o === o && eq(w.c, c) && s >= w.a - E && s <= w.b + E);
  };
  AP.wallPt = (o, c, s) => (o === 'h' ? [s, c] : [c, s]);

  AP.floorBBox = function (floor) {
    if (!floor.rooms.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of floor.rooms) {
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.l);
    }
    return { x0, y0, x1, y1 };
  };
  AP.projectBBox = function (P) {
    let b = null;
    for (const f of P.floors) {
      const q = AP.floorBBox(f); if (!q) continue;
      if (!b) b = Object.assign({}, q);
      else { b.x0 = Math.min(b.x0, q.x0); b.y0 = Math.min(b.y0, q.y0); b.x1 = Math.max(b.x1, q.x1); b.y1 = Math.max(b.y1, q.y1); }
    }
    return b;
  };
  AP.topFloorIndex = function (P) {
    for (let i = P.floors.length - 1; i >= 0; i--) if (P.floors[i].rooms.length) return i;
    return -1;
  };

  /* ---------- grids: A,B,C... on vertical lines; 1,2,3... on horizontal lines ---------- */
  const LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  AP.gridLetter = i => i < LET.length ? LET[i] : LET[Math.floor(i / LET.length) - 1] + LET[i % LET.length];
  // structural grid lines = lines that carry at least one column (re-lettered after edits)
  AP.grids = P => AP.columns(P).grids;
  // candidate lines from every room edge (where columns may go)
  AP.candidateGrids = function (P) {
    const xs = [], ys = [];
    for (const f of P.floors) for (const r of f.rooms) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.l); }
    const uniq = arr => {
      const s = arr.map(rnd).sort((a, b) => a - b), o = [];
      for (const v of s) if (!o.length || v - o[o.length - 1] > 0.05) o.push(v);
      return o;
    };
    return {
      x: uniq(xs).map((v, i) => ({ v, label: AP.gridLetter(i) })),
      y: uniq(ys).map((v, i) => ({ v, label: String(i + 1) }))
    };
  };

  /* ---------- columns & footings (preliminary sizing) ---------- */
  AP.colKey = (x, y) => x.toFixed(2) + ',' + y.toFixed(2);
  AP.columns = function (P) {
    const G = AP.candidateGrids(P), S = P.settings, com = P.info.type === 'Commercial';
    const cols = [];
    const near = (a, b) => Math.abs(a - b) < 0.051;
    for (const gx of G.x) for (const gy of G.y) {
      let top = -1;
      P.floors.forEach((f, fi) => {
        let onH = false, onV = false;
        for (const r of f.rooms) {
          if ((near(gy.v, r.y) || near(gy.v, r.y + r.l)) && gx.v >= r.x - 0.05 && gx.v <= r.x + r.w + 0.05) onH = true;
          if ((near(gx.v, r.x) || near(gx.v, r.x + r.w)) && gy.v >= r.y - 0.05 && gy.v <= r.y + r.l + 0.05) onV = true;
        }
        if (onH && onV) top = fi;
      });
      if (top >= 0) cols.push({ x: gx.v, y: gy.v, gx: gx.label, gy: gy.label, top });
    }
    // user edits: deleted columns, added columns, size overrides
    const CE = P.colEdits || {};
    const removed = new Set(CE.removed || []);
    for (let i = cols.length - 1; i >= 0; i--) if (removed.has(AP.colKey(cols[i].x, cols[i].y))) cols.splice(i, 1);
    const ti = AP.topFloorIndex(P);
    for (const a of CE.added || []) {
      if (cols.some(c => near(c.x, a.x) && near(c.y, a.y))) continue;
      const gxl = G.x.find(g => near(g.v, a.x)), gyl = G.y.find(g => near(g.v, a.y));
      let top = -1;
      P.floors.forEach((f, fi) => { if (f.rooms.some(r => a.x >= r.x - 0.05 && a.x <= r.x + r.w + 0.05 && a.y >= r.y - 0.05 && a.y <= r.y + r.l + 0.05)) top = fi; });
      cols.push({ x: a.x, y: a.y, gx: gxl ? gxl.label : '', gy: gyl ? gyl.label : '', top: top >= 0 ? top : Math.max(0, ti), manual: true });
    }
    // spans to neighbouring columns
    for (const c of cols) {
      const row = cols.filter(q => eq(q.y, c.y)).map(q => q.x).sort((a, b) => a - b);
      const col = cols.filter(q => eq(q.x, c.x)).map(q => q.y).sort((a, b) => a - b);
      const i = row.indexOf(c.x), j = col.indexOf(c.y);
      const L = i > 0 ? c.x - row[i - 1] : 0, R = i < row.length - 1 ? row[i + 1] - c.x : 0;
      const U = j > 0 ? c.y - col[j - 1] : 0, D = j < col.length - 1 ? col[j + 1] - c.y : 0;
      const span = Math.max(L, R, U, D);
      const trib = Math.max(1, ((L + R) / 2) * ((U + D) / 2));
      const nfl = c.top + 1;
      const load = trib * nfl * (com ? 12 : 9) + trib * 1.5; // kN service (floors + roof)
      let sz = span <= 3 ? 0.20 : span <= 4.5 ? 0.25 : span <= 6 ? 0.30 : span <= 7.5 ? 0.35 : 0.40;
      if (nfl >= 2) sz = Math.max(sz, 0.25);
      if (nfl >= 3) sz += 0.05 * (nfl - 2);
      if (com) sz = Math.max(sz, 0.30);
      sz = Math.max(sz, Math.ceil(Math.sqrt(1.5 * load / (0.4 * 20700)) * 20) / 20);
      const area = load * 1.1 / (S.soil || 96);
      let ft = Math.max(1.0, Math.ceil(Math.sqrt(area) * 10) / 10);
      if (ft > 1.0 && ft < 1.2) ft = 1.2;
      c.autoSize = Math.round(sz * 100) / 100;
      const key = AP.colKey(c.x, c.y), ov = (CE.sizes || {})[key];
      c.shape = (CE.shapes || {})[key] || CE.shapeAll || 'square';
      // a round column of the same strength is about 13% wider than the square one
      c.size = ov || (c.shape === 'circle' ? Math.ceil(c.autoSize * 1.13 / 0.05 - 1e-6) * 0.05 : c.autoSize);
      c.size = Math.round(c.size * 1000) / 1000;
      c.d = c.shape === 'rect' ? ((CE.depths || {})[key] || Math.round((c.size + 0.10) * 100) / 100) : c.size; // depth along Y
      c.foot = Math.round(ft * 100) / 100;
      c.load = load; c.span = span;
    }
    // group into marks
    // marks: same shape + size share a mark
    const ckey = c => c.shape + ':' + c.size + 'x' + c.d;
    const SH = { square: 0, rect: 1, circle: 2 };
    const cks = [...new Set(cols.map(ckey))].map(k => cols.find(c => ckey(c) === k))
      .sort((a, b) => SH[a.shape] - SH[b.shape] || a.size - b.size || a.d - b.d).map(ckey);
    const fsz = [...new Set(cols.map(c => c.foot))].sort((a, b) => a - b);
    for (const c of cols) { c.mark = 'C' + (cks.indexOf(ckey(c)) + 1); c.fmark = 'F' + (fsz.indexOf(c.foot) + 1); }
    const ctypes = cks.map((k, i) => {
      const c0 = cols.find(c => ckey(c) === k), s = Math.max(c0.size, c0.d), round = c0.shape === 'circle';
      return {
        mark: 'C' + (i + 1), size: c0.size, d: c0.d, shape: c0.shape, n: cols.filter(c => ckey(c) === k).length,
        bars: round ? (s <= 0.35 ? '6-16mm DIA.' : '8-20mm DIA.') : s <= 0.25 ? '4-16mm DIA.' : s <= 0.30 ? '8-16mm DIA.' : s <= 0.40 ? '8-20mm DIA.' : '12-20mm DIA.',
        ties: round ? '10mm DIA. SPIRAL @ 75mm PITCH' : '10mm DIA. TIES: 1@50, 5@100, REST@150 O.C.'
      };
    });
    const ftypes = fsz.map((s, i) => ({
      mark: 'F' + (i + 1), size: s, n: cols.filter(c => c.foot === s).length,
      t: s <= 1.2 ? 0.25 : s <= 2.0 ? 0.30 : 0.40,
      bars: (s <= 2.0 ? '12mm DIA.' : '16mm DIA.') + ' @ 150mm O.C. BOTH WAYS'
    }));
    // final grids: only lines that have a column on them
    const uniq = vals => { const o = []; for (const v of vals.slice().sort((a, b) => a - b)) if (!o.length || v - o[o.length - 1] > 0.05) o.push(v); return o; };
    const FG = {
      x: uniq(cols.map(c => c.x)).map((v, i) => ({ v, label: AP.gridLetter(i) })),
      y: uniq(cols.map(c => c.y)).map((v, i) => ({ v, label: String(i + 1) }))
    };
    for (const c of cols) {
      const gx = FG.x.find(g => Math.abs(g.v - c.x) <= 0.051), gy = FG.y.find(g => Math.abs(g.v - c.y) <= 0.051);
      c.gx = gx ? gx.label : ''; c.gy = gy ? gy.label : '';
    }
    return { grids: FG, cols, ctypes, ftypes, candidates: G };
  };

  /* ---------- openings attach to a room side ---------- */
  AP.sideInfo = function (r, side) {
    switch (side) {
      case 'N': return { o: 'h', c: r.y, s0: r.x, len: r.w, k: 1 };
      case 'S': return { o: 'h', c: r.y + r.l, s0: r.x, len: r.w, k: -1 };
      case 'W': return { o: 'v', c: r.x, s0: r.y, len: r.l, k: 1 };
      default:  return { o: 'v', c: r.x + r.w, s0: r.y, len: r.l, k: -1 };
    }
  };
  AP.resolveOp = function (floor, op) {
    if (op.wallId) {
      const si = AP.opSideInfo(floor, op); if (!si) return null;
      const off = Math.min(Math.max(op.off, op.w / 2), Math.max(op.w / 2, si.len - op.w / 2));
      return { o: si.o, c: si.c, s: si.s0 + off, w: op.w, k: si.k, room: null, wall: si.wall, len: si.len };
    }
    const r = floor.rooms.find(q => q.id === op.roomId);
    if (!r) return null;
    const si = AP.sideInfo(r, op.side);
    const off = Math.min(Math.max(op.off, op.w / 2), Math.max(op.w / 2, si.len - op.w / 2));
    return { o: si.o, c: si.c, s: si.s0 + off, w: op.w, k: si.k, room: r, len: si.len };
  };

  /* Clear span on a wall line around a point: nearest column face, perpendicular wall face,
   * other opening or wall end on each side (used for Revit-style temporary dimensions). */
  AP.clearSpan = function (P, fi, o, c, along, excludeId) {
    const fl = P.floors[fi], walls = AP.computeWalls(fl, P.settings);
    const line = walls.filter(w => w.o === o && eq(w.c, c) && w.t).sort((p, q) => p.a - q.a);
    let i = line.findIndex(w => along >= w.a - E && along <= w.b + E);
    if (i < 0) return null;
    let ra = line[i].a, rb = line[i].b;
    for (let j = i - 1; j >= 0 && eq(line[j].b, ra); j--) ra = line[j].a;
    for (let j = i + 1; j < line.length && eq(line[j].a, rb); j++) rb = line[j].b;
    const iv = [];
    for (const q of walls) {
      if (q.o === o || !q.t) continue;
      if (c >= q.a - E && c <= q.b + E && q.c >= ra - E && q.c <= rb + E) iv.push([q.c - q.t / 2, q.c + q.t / 2, 'wall']);
    }
    for (const col of AP.columns(P).cols) {
      if (col.top < fi) continue;
      const on = o === 'h' ? eq(col.y, c) : eq(col.x, c);
      const p = o === 'h' ? col.x : col.y;
      const half = (o === 'h' ? col.size : col.d) / 2;
      if (on && p >= ra - E && p <= rb + E) iv.push([p - half, p + half, 'column']);
    }
    for (const op of fl.openings) {
      if (op.id === excludeId) continue;
      const R = AP.resolveOp(fl, op);
      if (R && R.o === o && eq(R.c, c)) iv.push([R.s - R.w / 2, R.s + R.w / 2, op.kind]);
    }
    let L = ra, R = rb, Lk = 'wall end', Rk = 'wall end', inside = false;
    for (const [a, b, k] of iv) {
      if (b <= along + E && b > L) { L = b; Lk = k; }
      if (a >= along - E && a < R) { R = a; Rk = k; }
      if (a < along - E && b > along + E) inside = true;
    }
    return { L, R, Lk, Rk, inside, ra, rb };
  };

  /* The piece of wall around point s on line (o,c) between the nearest column, wall junction,
   * room corner or cut end – used to delete only part of a long wall. */
  AP.wallPieceAt = function (P, fi, o, c, s) {
    const fl = P.floors[fi], walls = AP.computeWalls(fl, P.settings);
    const line = walls.filter(w => w.o === o && eq(w.c, c)).sort((p, q) => p.a - q.a);
    const i = line.findIndex(w => s >= w.a - E && s <= w.b + E);
    if (i < 0) return null;
    let ra = line[i].a, rb = line[i].b;
    for (let j = i - 1; j >= 0 && eq(line[j].b, ra); j--) ra = line[j].a;
    for (let j = i + 1; j < line.length && eq(line[j].a, rb); j++) rb = line[j].b;
    const bp = [ra, rb];
    for (const col of AP.columns(P).cols) if (col.top >= fi && (o === 'h' ? eq(col.y, c) : eq(col.x, c))) bp.push(o === 'h' ? col.x : col.y);
    for (const q of walls) if (q.o !== o && c >= q.a - E && c <= q.b + E) bp.push(q.c);
    for (const r of fl.rooms) {
      if (o === 'h' && (eq(r.y, c) || eq(r.y + r.l, c))) bp.push(r.x, r.x + r.w);
      if (o === 'v' && (eq(r.x, c) || eq(r.x + r.w, c))) bp.push(r.y, r.y + r.l);
    }
    for (const k of fl.wallCuts || []) if (k.o === o && eq(k.c, c)) bp.push(k.a, k.b);
    let a = ra, b = rb;
    for (const v of bp) { if (v < s - E && v > a) a = v; if (v > s + E && v < b) b = v; }
    return { a: rnd(a), b: rnd(b) };
  };
  // add / remove an interval from a floor's list of removed wall pieces
  AP.setWallCut = function (fl, o, c, a, b, removed) {
    const keep = [];
    for (const k of fl.wallCuts || []) {
      if (k.o !== o || !eq(k.c, c) || k.b <= a + E || k.a >= b - E) { keep.push(k); continue; }
      if (k.a < a - E) keep.push({ o, c, a: k.a, b: a });
      if (k.b > b + E) keep.push({ o, c, a: b, b: k.b });
    }
    if (removed) keep.push({ o, c, a, b });
    fl.wallCuts = keep;
  };

  // line, start, length and swing side of the wall an opening sits on (room side or drawn wall)
  AP.opSideInfo = function (floor, op) {
    if (op.wallId) {
      const w = (floor.extraWalls || []).find(q => q.id === op.wallId); if (!w) return null;
      const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b);
      return { o: w.o, c: w.c, s0: a, len: b - a, k: op.kside || 1, wall: w };
    }
    const r = floor.rooms.find(q => q.id === op.roomId);
    return r ? AP.sideInfo(r, op.side) : null;
  };

  // Marks for the schedule: same template + same size share a mark
  AP.opMarks = function (P) {
    const marks = {}, types = [];
    for (const f of P.floors) for (const op of f.openings) {
      if (!f.rooms.length || !AP.resolveOp(f, op)) continue; // only doors & windows drawn on the plans
      const sill = AP.opSill(op, P.settings), key = [op.kind, op.tpl, op.w, op.h, sill].join('|');
      let t = types.find(q => q.key === key);
      if (!t) {
        const same = types.filter(q => q.tpl === op.tpl && q.kind === op.kind).length;
        const base = op.tpl.replace(/^([DW])/, '$1-');
        t = { key, kind: op.kind, tpl: op.tpl, w: op.w, h: op.h, sill, mark: same ? base + String.fromCharCode(96 + same) : base, n: 0, rooms: [] };
        types.push(t);
      }
      t.n++;
      const r = f.rooms.find(q => q.id === op.roomId);
      if (r && t.rooms.indexOf(r.name) < 0) t.rooms.push(r.name);
      marks[op.id] = t.mark;
    }
    // only the types drawn are listed, numbered in sequence: D-1, D-2 … and W-1, W-2 … (catalogue order, then size)
    const tn = t => +((t.tpl || '').match(/\d+/) || [0])[0];
    types.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'door' ? -1 : 1) : tn(a) - tn(b) || a.w - b.w || a.h - b.h || a.sill - b.sill));
    const cnt = { door: 0, window: 0 }, re = {};
    for (const t of types) { const old = t.mark; t.mark = (t.kind === 'door' ? 'D-' : 'W-') + (++cnt[t.kind]); re[old] = t.mark; }
    for (const id in marks) marks[id] = re[marks[id]] || marks[id];
    return { marks, types };
  };

  /* ---------- roof ---------- */
  /* A project has a list of roofs (P.roofs). Without one, a single roof covers the top floor and follows it.
   * Roof: { id, level (the floor it sits on), fit (follow that floor's walls) or x0,y0,x1,y1 (wall-line box),
   *         type, pitch, oh (null = project setting), ridge 'auto'|'x'|'y', flip (turn the slope round) } */
  AP.roofSpecs = function (P) {
    if (Array.isArray(P.roofs)) return P.roofs;
    const ti = AP.topFloorIndex(P);
    return ti < 0 ? [] : [{ id: 'main', level: ti, fit: true }];
  };
  AP.roofBox = function (P, sp) {
    const fl = P.floors[Math.min(sp.level || 0, P.floors.length - 1)];
    if (Array.isArray(sp.poly) && sp.poly.length >= 3) { const xs = sp.poly.map(p => p[0]), ys = sp.poly.map(p => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
    if (sp.fit || sp.x0 == null) return fl ? AP.floorBBox(fl) : null;
    return { x0: Math.min(sp.x0, sp.x1), y0: Math.min(sp.y0, sp.y1), x1: Math.max(sp.x0, sp.x1), y1: Math.max(sp.y0, sp.y1) };
  };
  AP.roofType = (P, sp) => sp.type || P.settings.roofType;
  AP.roofs = function (P) {
    const out = [];
    for (const sp of AP.roofSpecs(P)) { const R = AP.roofFrom(P, sp); if (R) out.push(R); }
    return out;
  };
  // the main roof (highest, then largest): trusses, gutter detail, level marks
  AP.roofGeom = function (P) {
    const L = AP.roofs(P);
    if (!L.length) return null;
    return L.slice().sort((a, b) => b.level - a.level || (b.X1 - b.X0) * (b.Y1 - b.Y0) - (a.X1 - a.X0) * (a.Y1 - a.Y0))[0];
  };
  // the main roof with trusses (for the truss and gutter details)
  AP.mainPitched = function (P) {
    const L = AP.roofs(P).filter(R => !R.box);
    return L.length ? L.sort((a, b) => b.level - a.level || (b.X1 - b.X0) * (b.Y1 - b.Y0) - (a.X1 - a.X0) * (a.Y1 - a.Y0))[0] : AP.roofGeom(P);
  };
  // extent of all roof eaves (for grids / bubbles placed around the plan)
  AP.roofsExtent = function (P, level) {
    let e = null;
    for (const R of AP.roofs(P)) {
      if (level != null && R.level !== level) continue;
      e = e ? { x0: Math.min(e.x0, R.X0), y0: Math.min(e.y0, R.Y0), x1: Math.max(e.x1, R.X1), y1: Math.max(e.y1, R.Y1), oh: Math.max(e.oh, R.oh) } : { x0: R.X0, y0: R.Y0, x1: R.X1, y1: R.Y1, oh: R.oh };
    }
    return e;
  };
  // extra wall height under a raised roof (roof height offset > 0) at plan point (x, y) of floor fi
  AP.wallRaise = (P, fi, x, y, RL) => { const R = AP.roofAt(P, fi, x, y, RL); return R && R.zoff > 0 ? R.zoff : 0; };
  // the roof sitting on floor fi over plan point (x, y), if any
  AP.roofAt = function (P, fi, x, y, list) {
    const t = P.settings.extWall / 2 + 1e-3;
    return (list || AP.roofs(P)).find(R => R.level === fi && (R.inWalls ? R.inWalls(x, y, t) : x >= R.b.x0 - t && x <= R.b.x1 + t && y >= R.b.y0 - t && y <= R.b.y1 + t)) || null;
  };
  AP.roofFrom = function (P, sp) {
    const ti = Math.min(sp.level != null ? sp.level : AP.topFloorIndex(P), P.floors.length - 1);
    if (ti < 0) return null;
    const S = P.settings, b = AP.roofBox(P, sp);
    if (!b || !(b.x1 - b.x0 > 0.2) || !(b.y1 - b.y0 > 0.2)) return null;
    const type = AP.roofType(P, sp);
    const box = AP.isBoxRoof(type); // flat deck or modern box: parapet walls, no eaves
    const t = S.extWall / 2;
    const oh = box ? 0 : (sp.oh != null ? sp.oh : S.overhang);
    const X0 = b.x0 - t - oh, X1 = b.x1 + t + oh, Y0 = b.y0 - t - oh, Y1 = b.y1 + t + oh;
    // base of the roof: top of the beam of the floor it sits on, raised / lowered by the roof's height offset (sp.zoff)
    const zoff = sp.zoff || 0, zTop = AP.levelZ(P, ti) + AP.floorH(P, ti) + zoff;
    const p0 = sp.pitch != null ? sp.pitch : S.roofPitch;
    const pitch = type === 'kubo' ? Math.max(p0, 0.9) : p0;
    const ridgeX = sp.ridge === 'x' ? true : sp.ridge === 'y' ? false : (X1 - X0) >= (Y1 - Y0);
    const fs = sp.flip ? -1 : 1; // +1: mono-slopes run down towards C1
    // local axes: a runs along the ridge (long side), c across it
    const A0 = ridgeX ? X0 : Y0, A1 = ridgeX ? X1 : Y1, C0 = ridgeX ? Y0 : X0, C1 = ridgeX ? Y1 : X1;
    const half = (C1 - C0) / 2, cm = (C0 + C1) / 2;
    const d0 = half * 0.45;           // dutch gable: depth of the hipped lower ends
    const step = 0.6;                 // clerestory window band height
    const zE = box ? zTop : type === 'butterfly' ? zTop + 0.10 : zTop + 0.10 - pitch * (oh + t);
    const z = (x, y) => {
      x = Math.min(Math.max(x, X0), X1); y = Math.min(Math.max(y, Y0), Y1);
      const a = ridgeX ? x : y, c = fs > 0 ? (ridgeX ? y : x) : C0 + C1 - (ridgeX ? y : x);
      const da = Math.min(a - A0, A1 - a), dc = Math.min(c - C0, C1 - c);
      switch (type) {
        case 'gable': return zE + pitch * dc;
        case 'hip': case 'kubo': return zE + pitch * Math.min(da, dc);
        case 'dutch': return zE + pitch * (da < d0 ? Math.min(da, dc) : dc);
        case 'shed': return zE + pitch * (C1 - c);
        case 'clerestory': return c < cm ? zE + step + pitch * (c - C0) : zE + pitch * (C1 - c);
        // double shed: both halves slope down to the C1 side; the rear (high) roof starts a clerestory band above the front (low) roof
        case 'doubleshed': return c < cm ? zE + pitch * (C1 - cm) + step + pitch * (cm - c) : zE + pitch * (C1 - c);
        case 'butterfly': return zE + pitch * Math.abs(c - cm);
        default: return zTop;
      }
    };
    let zMax = zTop;
    if (box) zMax = zTop + S.parapet;
    else for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) zMax = Math.max(zMax, z(X0 + (X1 - X0) * i / 24, Y0 + (Y1 - Y0) * j / 24));
    const R = { id: sp.id, sp, level: ti, X0, X1, Y0, Y1, A0, A1, C0, C1, cm, d0, step, zTop, zE, zMax, type, box, pitch, ridgeX, fs, z, b, ti, oh, zoff };
    R.gutter = sp.gutter != null ? !!sp.gutter : S.gutters !== false; // gutters on the eaves (roof plan option)
    R.inside = (x, y) => x >= X0 - 1e-9 && x <= X1 + 1e-9 && y >= Y0 - 1e-9 && y <= Y1 + 1e-9;
    // an L, T, U … outline (rooms of the floor, or a sketched outline): the roof follows it
    const rg = AP.roofRegion(P, sp);
    if (rg && !rg.rect) AP.roofOutline(R, rg.G, S);
    R.tt = AP.roofTrussType(P, R); // truss type of its automatic trusses
    return R;
  };
  /* ---------- outline roofs: a roof that follows an L, T, U … plan (or a sketched outline) ----------
   * The region under the roof is a set of grid cells (wall lines). Hip roofs: the highest of the hip
   * roofs over every largest rectangle of the eave outline (= the true hip roof of the outline).
   * Gable roofs: one gable per wing, a wing runs on into the next one until it is under its roof. */
  AP.ptInPoly = function (pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const uniq = v => [...new Set(v.map(q => Math.round(q * 1e4) / 1e4))].sort((a, b) => a - b);
  // grid of cells; on(i, j) for the cells inside
  function cellGrid(xs, ys, inside) {
    const nx = xs.length - 1, ny = ys.length - 1, on = [];
    for (let i = 0; i < nx; i++) { on.push([]); for (let j = 0; j < ny; j++) on[i].push(!!inside((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)); }
    return { xs, ys, nx, ny, on, at: (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && on[i][j] };
  }
  AP.gridOfRects = function (rects) {
    return cellGrid(uniq(rects.flatMap(r => [r.x0, r.x1])), uniq(rects.flatMap(r => [r.y0, r.y1])),
      (x, y) => rects.some(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1));
  };
  // outer outline of the cells, corners only
  AP.gridOutline = function (G) {
    const E = [];
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.ny; j++) if (G.on[i][j]) {
      const x0 = G.xs[i], x1 = G.xs[i + 1], y0 = G.ys[j], y1 = G.ys[j + 1];
      if (!G.at(i, j - 1)) E.push([[x0, y0], [x1, y0]]);
      if (!G.at(i + 1, j)) E.push([[x1, y0], [x1, y1]]);
      if (!G.at(i, j + 1)) E.push([[x1, y1], [x0, y1]]);
      if (!G.at(i - 1, j)) E.push([[x0, y1], [x0, y0]]);
    }
    const key = p => p[0].toFixed(4) + ',' + p[1].toFixed(4), from = new Map();
    for (const e of E) { const k = key(e[0]); if (!from.has(k)) from.set(k, []); from.get(k).push(e); }
    const used = new Set(), loops = [];
    for (const e0 of E) {
      if (used.has(e0)) continue;
      const loop = []; let e = e0;
      while (e && !used.has(e)) { used.add(e); loop.push(e[0]); e = (from.get(key(e[1])) || []).find(q => !used.has(q)); }
      // drop the points in the middle of straight runs
      const out = loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9; });
      if (out.length >= 4) loops.push(out);
    }
    const area = L => { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
    loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    return loops[0] || null;
  };
  // rectangles of cells: all the largest ones (they may overlap), or wings that do not overlap (largest first)
  function rectsOf(G, wings) {
    const S = [], ok = (i0, j0, i1, j1, free) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!G.on[i][j] || (free && free[i][j])) return false; return true; };
    const ar = (i0, j0, i1, j1) => (G.xs[i1 + 1] - G.xs[i0]) * (G.ys[j1 + 1] - G.ys[j0]);
    if (!wings) {
      for (let i0 = 0; i0 < G.nx; i0++) for (let i1 = i0; i1 < G.nx; i1++) for (let j0 = 0; j0 < G.ny; j0++) for (let j1 = j0; j1 < G.ny; j1++) {
        if (!ok(i0, j0, i1, j1)) break;
        const grow = (i0 > 0 && ok(i0 - 1, j0, i0 - 1, j1)) || (i1 < G.nx - 1 && ok(i1 + 1, j0, i1 + 1, j1)) || (j0 > 0 && ok(i0, j0 - 1, i1, j0 - 1)) || (j1 < G.ny - 1 && ok(i0, j1 + 1, i1, j1 + 1));
        if (!grow) S.push({ x0: G.xs[i0], y0: G.ys[j0], x1: G.xs[i1 + 1], y1: G.ys[j1 + 1] });
      }
      return S;
    }
    const used = G.on.map(c => c.map(() => false));
    for (let guard = 0; guard < 40; guard++) {
      let best = null;
      for (let i0 = 0; i0 < G.nx; i0++) for (let i1 = i0; i1 < G.nx; i1++) for (let j0 = 0; j0 < G.ny; j0++) for (let j1 = j0; j1 < G.ny; j1++) {
        if (!ok(i0, j0, i1, j1, used)) break;
        const a = ar(i0, j0, i1, j1);
        if (!best || a > best.a + 1e-9) best = { a, i0, j0, i1, j1 };
      }
      if (!best) break;
      for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) used[i][j] = true;
      S.push({ x0: G.xs[best.i0], y0: G.ys[best.j0], x1: G.xs[best.i1 + 1], y1: G.ys[best.j1 + 1] });
    }
    return S;
  }
  // the wall-line region a roof covers: rooms of its floor, a sketched outline or a rectangle
  AP.roofRegion = function (P, sp) {
    const fl = P.floors[Math.min(sp.level || 0, P.floors.length - 1)];
    let G;
    if (Array.isArray(sp.poly) && sp.poly.length >= 3) G = cellGrid(uniq(sp.poly.map(p => p[0])), uniq(sp.poly.map(p => p[1])), (x, y) => AP.ptInPoly([x, y], sp.poly));
    else if (sp.fit || sp.x0 == null) { if (!fl || !fl.rooms.length) return null; G = AP.gridOfRects(fl.rooms.map(r => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.l }))); }
    else return null; // a plain rectangle
    let n = 0, all = true;
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.ny; j++) { if (G.on[i][j]) n++; else all = false; }
    if (!n) return null;
    return { G, rect: all };
  };
  // grow the cells of a grid by e on every side (mitred), as a new grid
  function dilate(G, e) {
    const rects = [];
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.ny; j++) if (G.on[i][j]) rects.push({ x0: G.xs[i] - e, y0: G.ys[j] - e, x1: G.xs[i + 1] + e, y1: G.ys[j + 1] + e });
    return AP.gridOfRects(rects);
  }
  // turn a box roof R into one over the outline of grid G
  AP.roofOutline = function (R, G, S) {
    const t = S.extWall / 2, e = t + R.oh;
    const GE = dilate(G, e), GF = dilate(G, t);
    R.poly = AP.gridOutline(GE); R.fpoly = AP.gridOutline(GF); R.wpoly = AP.gridOutline(G);
    if (!R.poly) return R;
    R.cells = G;
    const xs = R.poly.map(p => p[0]), ys = R.poly.map(p => p[1]);
    Object.assign(R, { X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys) });
    R.inside = (x, y) => GE.at(GE.xs.findIndex((v, i) => x >= v - 1e-9 && x <= GE.xs[i + 1] + 1e-9), GE.ys.findIndex((v, i) => y >= v - 1e-9 && y <= GE.ys[i + 1] + 1e-9));
    R.inWalls = (x, y, tol) => { const q = tol || 0; return [[0, 0], [q, 0], [-q, 0], [0, q], [0, -q]].some(d => { const x2 = x + d[0], y2 = y + d[1], i = G.xs.findIndex((v, k) => x2 >= v - 1e-9 && x2 <= G.xs[k + 1] + 1e-9), j = G.ys.findIndex((v, k) => y2 >= v - 1e-9 && y2 <= G.ys[k + 1] + 1e-9); return G.at(i, j); }); };
    // wings (no overlap): trusses run across each, the first is the main roof
    const wings = rectsOf(G, true).map((w, k, all) => {
      const W = w.x1 - w.x0, L = w.y1 - w.y0, prev = all.slice(0, k);
      const inPrev = (x, y) => prev.some(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
      // a wing joined to the main roof runs its ridge into it; the main roof runs along its long side
      const jx = [0.1, 0.5, 0.9].some(f => inPrev(w.x0 - 0.01, w.y0 + (w.y1 - w.y0) * f) || inPrev(w.x1 + 0.01, w.y0 + (w.y1 - w.y0) * f));
      const jy = [0.1, 0.5, 0.9].some(f => inPrev(w.x0 + (w.x1 - w.x0) * f, w.y0 - 0.01) || inPrev(w.x0 + (w.x1 - w.x0) * f, w.y1 + 0.01));
      const ridgeX = R.sp.ridge === 'x' ? true : R.sp.ridge === 'y' ? false : k > 0 && jx !== jy ? jx : W >= L;
      return Object.assign({}, w, { ridgeX });
    });
    R.wings = wings;
    const m = wings[0];
    R.mainB = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
    const hipLike = R.type === 'hip' || R.type === 'kubo' || R.type === 'dutch', gable = R.type === 'gable';
    if (R.box || !(hipLike || gable)) return R; // planes over the whole box, cut to the outline
    R.ridgeX = m.ridgeX;
    if (R.ridgeX) Object.assign(R, { A0: m.x0 - e, A1: m.x1 + e, C0: m.y0 - e, C1: m.y1 + e }); else Object.assign(R, { A0: m.y0 - e, A1: m.y1 + e, C0: m.x0 - e, C1: m.x1 + e });
    R.cm = (R.C0 + R.C1) / 2;
    R.b = { x0: G.xs[0], y0: G.ys[0], x1: G.xs[G.nx], y1: G.ys[G.ny] };
    {
      // parts: rectangles with their planes (z = zE + pitch * distance in from an edge)
      const parts = [];
      if (hipLike) for (const q of rectsOf(GE, false)) parts.push({ r: q, pl: [[R.pitch, 0, -R.pitch * q.x0], [-R.pitch, 0, R.pitch * q.x1], [0, R.pitch, -R.pitch * q.y0], [0, -R.pitch, R.pitch * q.y1]] });
      else for (const w of wings) {
        const r = { x0: w.x0 - e, y0: w.y0 - e, x1: w.x1 + e, y1: w.y1 + e }, hw = (w.ridgeX ? r.y1 - r.y0 : r.x1 - r.x0) / 2, run = Math.max(0, hw - e) + 0.05;
        // ends joined to another wing run on under its roof
        if (w.ridgeX) { if (R.inWalls(w.x0 - 0.01, (w.y0 + w.y1) / 2)) r.x0 = w.x0 - e - run; if (R.inWalls(w.x1 + 0.01, (w.y0 + w.y1) / 2)) r.x1 = w.x1 + e + run; }
        else { if (R.inWalls((w.x0 + w.x1) / 2, w.y0 - 0.01)) r.y0 = w.y0 - e - run; if (R.inWalls((w.x0 + w.x1) / 2, w.y1 + 0.01)) r.y1 = w.y1 + e + run; }
        parts.push({ r, pl: w.ridgeX ? [[0, R.pitch, -R.pitch * r.y0], [0, -R.pitch, R.pitch * r.y1]] : [[R.pitch, 0, -R.pitch * r.x0], [-R.pitch, 0, R.pitch * r.x1]] });
      }
      R.parts = parts;
      // the highest part over (x, y), which plane of it
      R.facet = (x, y) => {
        let best = null;
        for (const q of parts) {
          if (x < q.r.x0 - 1e-9 || x > q.r.x1 + 1e-9 || y < q.r.y0 - 1e-9 || y > q.r.y1 + 1e-9) continue;
          let mz = Infinity, mp = null;
          for (const p of q.pl) { const z = p[0] * x + p[1] * y + p[2]; if (z < mz) { mz = z; mp = p; } }
          if (!best || mz > best.z + 1e-9) best = { z: mz, p: mp };
        }
        return best;
      };
      R.z = (x, y) => { const f = R.facet(x, y); return R.zE + (f ? Math.max(0, f.z) : 0); };
      let zMax = R.zTop;
      for (const q of parts) { const c = [(q.r.x0 + q.r.x1) / 2, (q.r.y0 + q.r.y1) / 2]; zMax = Math.max(zMax, R.z(c[0], c[1])); }
      R.zMax = zMax;
    }
    return R;
  };
  // eave outline edges with outward normals
  AP.polyEdges = function (poly) {
    let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      out.push({ p0: a, p1: b, n: s > 0 ? [ty, -tx] : [-ty, tx] });
    }
    return out;
  };
  // ridges, hips and valleys of an outline roof: where the surface changes plane (sampled, then made straight)
  const creaseCache = new Map();
  AP.roofCreases = function (R) {
    if (!R.parts) return { lines: [], facets: [] };
    const key = JSON.stringify([R.parts.map(q => [q.r, q.pl]), R.poly]);
    if (creaseCache.has(key)) return creaseCache.get(key);
    const h = Math.max(0.03, Math.max(R.X1 - R.X0, R.Y1 - R.Y0) / 260), nx = Math.ceil((R.X1 - R.X0) / h), ny = Math.ceil((R.Y1 - R.Y0) / h);
    const planes = [], pid = p => { let k = planes.findIndex(q => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6 && Math.abs(q[2] - p[2]) < 1e-5); if (k < 0) { planes.push(p); k = planes.length - 1; } return k; };
    const lab = [], fac = [];
    for (let i = 0; i < nx; i++) { lab.push(new Int16Array(ny)); for (let j = 0; j < ny; j++) {
      const x = R.X0 + (i + 0.5) * h, y = R.Y0 + (j + 0.5) * h;
      let k = -1;
      if (R.inside(x, y)) { const f = R.facet(x, y); if (f) k = pid(f.p); }
      lab[i][j] = k;
      if (k >= 0) { fac[k] = fac[k] || { sx: 0, sy: 0, n: 0 }; fac[k].sx += x; fac[k].sy += y; fac[k].n++; }
    } }
    const pairs = new Map();
    const add = (a, b, x, y) => { const k = Math.min(a, b) + '|' + Math.max(a, b); if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push([x, y]); };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = lab[i][j]; if (a < 0) continue;
      if (i + 1 < nx && lab[i + 1][j] >= 0 && lab[i + 1][j] !== a) add(a, lab[i + 1][j], R.X0 + (i + 1) * h, R.Y0 + (j + 0.5) * h);
      if (j + 1 < ny && lab[i][j + 1] >= 0 && lab[i][j + 1] !== a) add(a, lab[i][j + 1], R.X0 + (i + 0.5) * h, R.Y0 + (j + 1) * h);
    }
    const segs = [];
    for (const [k, pts] of pairs) {
      if (pts.length < 3) continue;
      const [ia, ib] = k.split('|').map(Number), A = planes[ia], B = planes[ib];
      const nA = [A[0] - B[0], A[1] - B[1]], nn = Math.hypot(nA[0], nA[1]); if (nn < 1e-9) continue;
      const u = [-nA[1] / nn, nA[0] / nn], c = A[2] - B[2];
      // a point on the line: closest to the mean of the samples
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const dist = (nA[0] * mx + nA[1] * my + c) / nn, o = [mx - nA[0] / nn * dist, my - nA[1] / nn * dist];
      const tv = pts.map(p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]).sort((a, b) => a - b);
      let s0 = tv[0];
      for (let q = 1; q <= tv.length; q++) {
        if (q === tv.length || tv[q] - tv[q - 1] > 3 * h) {
          const s1 = tv[q - 1];
          if (s1 - s0 > 2 * h) segs.push([[o[0] + u[0] * s0, o[1] + u[1] * s0], [o[0] + u[0] * s1, o[1] + u[1] * s1]]);
          if (q < tv.length) s0 = tv[q];
        }
      }
    }
    // tidy the ends: onto an outline corner, else meet the other ends there
    const ends = segs.flatMap(sg => [sg[0], sg[1]]), tol = 3 * h;
    for (const p of ends) {
      const c = R.poly.find(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
      if (c) { p[0] = c[0]; p[1] = c[1]; p.fixed = true; }
    }
    for (const p of ends) {
      if (p.fixed) continue;
      const near = ends.filter(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
      const fx = near.find(q => q.fixed);
      const cx = fx ? fx[0] : near.reduce((s, q) => s + q[0], 0) / near.length, cy = fx ? fx[1] : near.reduce((s, q) => s + q[1], 0) / near.length;
      for (const q of near) { q[0] = cx; q[1] = cy; q.fixed = true; }
    }
    const facets = [];
    fac.forEach((f, k) => { if (!f || f.n < 30) return; const p = planes[k], L = Math.hypot(p[0], p[1]) || 1; facets.push({ c: [f.sx / f.n, f.sy / f.n], dn: [-p[0] / L, -p[1] / L], n: f.n * h * h }); });
    // long span ribs: for every plane, lines down its slope every 0.25 m, kept where the roof is that plane;
    // the ends are found on the exact planes (bisection), not on the grid
    const ribs = [], same = (x, y, k) => { if (!R.inside(x, y)) return false; const f = R.facet(x, y); return !!f && pid(f.p) === k; };
    const labAt = (x, y) => { const i = Math.floor((x - R.X0) / h), j = Math.floor((y - R.Y0) / h); return i >= 0 && j >= 0 && i < nx && j < ny ? lab[i][j] : -1; };
    const edge = (x0, y0, x1, y1, k) => { // (x0, y0) on plane k, (x1, y1) not: the point between them where it stops
      for (let it = 0; it < 14; it++) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if (same(mx, my, k)) { x0 = mx; y0 = my; } else { x1 = mx; y1 = my; } }
      return [x0, y0];
    };
    fac.forEach((f, k) => {
      if (!f || f.n < 30) return;
      const p = planes[k], L = Math.hypot(p[0], p[1]); if (L < 1e-9) return;
      const dn = [-p[0] / L, -p[1] / L], u = [-dn[1], dn[0]];
      const cs = [[R.X0, R.Y0], [R.X1, R.Y0], [R.X1, R.Y1], [R.X0, R.Y1]];
      const us = cs.map(q => q[0] * u[0] + q[1] * u[1]), vs = cs.map(q => q[0] * dn[0] + q[1] * dn[1]);
      const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), st = h * 0.5;
      for (let t = Math.ceil(u0 / 0.25) * 0.25 + 0.125; t < u1; t += 0.25) {
        let on = null, prev = null;
        for (let v = v0; v <= v1 + st; v += st) {
          const x = u[0] * t + dn[0] * v, y = u[1] * t + dn[1] * v, inn = v <= v1 && labAt(x, y) === k;
          if (inn && !on) on = prev ? edge(x, y, prev[0], prev[1], k) : [x, y];
          if (!inn && on) { const e = edge(prev[0], prev[1], x, y, k); if (Math.hypot(e[0] - on[0], e[1] - on[1]) > 0.1) ribs.push([on, e]); on = null; }
          prev = [x, y];
        }
      }
    });
    const res = { lines: segs.filter(sg => Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) > 0.05), facets, ribs };
    if (creaseCache.size > 30) creaseCache.clear();
    creaseCache.set(key, res);
    return res;
  };
  // top of a wall on the roof beams at s along it: its own height, stopped under the roof above it
  // (the underside of the roofing, 120 below the surface); a fire wall (w.thru) goes on up through the roof to w.above over it
  AP.roofWallTop = function (P, w, s, RL) {
    const zRB = AP.levelZ(P, AP.nLevels(P)), base = zRB + w.h;
    const p = AP.wallPt(w.o, w.c, s);
    let zr = -Infinity;
    for (const R of RL || AP.roofs(P)) if (!R.box && R.inside(p[0], p[1])) zr = Math.max(zr, R.z(p[0], p[1]));
    if (zr === -Infinity) return base;
    if (w.thru === true) return Math.max(base, zr + (w.above != null ? w.above : 0.3));
    return Math.max(zRB + 0.05, Math.min(base, zr - 0.12));
  };
  // the wall's top line [[s, z] …] along it
  AP.roofWallProfile = function (P, w, RL) {
    const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b), n = Math.max(2, Math.ceil((b - a) / 0.1));
    return AP.profile(s => AP.roofWallTop(P, w, s, RL), a, b, n);
  };
  // does wall line (o, c) at s sit on the roof's edge (a gable end, a parapet)?
  AP.roofEdgeWall = function (R, o, c, s, S) {
    const t = S.extWall / 2 + 0.02;
    if (!R.wpoly) return (o === 'h' ? Math.min(Math.abs(c - R.Y0), Math.abs(c - R.Y1)) : Math.min(Math.abs(c - R.X0), Math.abs(c - R.X1))) <= R.oh + t;
    const p = o === 'h' ? [s, c] : [c, s];
    return AP.polyEdges(R.wpoly).some(e => {
      const eo = Math.abs(e.p0[1] - e.p1[1]) < 1e-6 ? 'h' : 'v'; if (eo !== o) return false;
      const ec = o === 'h' ? e.p0[1] : e.p0[0], a = Math.min(o === 'h' ? e.p0[0] : e.p0[1], o === 'h' ? e.p1[0] : e.p1[1]), b = Math.max(o === 'h' ? e.p0[0] : e.p0[1], o === 'h' ? e.p1[0] : e.p1[1]);
      return Math.abs(ec - c) <= t && (o === 'h' ? p[0] : p[1]) >= a - t && (o === 'h' ? p[0] : p[1]) <= b + t;
    });
  };

  // Eave edges of a pitched roof (the low edges that get a gutter): [{p0, p1, n}] in plan, n = outward normal.
  // A butterfly roof drains to a valley gutter in the middle instead ({valley: true}).
  AP.GUTTER_W = 0.15;
  AP.roofEaves = function (R) {
    if (!R || R.box || R.gutter === false) return [];
    if (R.poly) { // outline roof: every low stretch of the outline (an edge can be part eave, part gable end)
      const out = [];
      for (const e of AP.polyEdges(R.poly)) {
        const at = (f, k) => { const x = e.p0[0] + (e.p1[0] - e.p0[0]) * f - e.n[0] * k, y = e.p0[1] + (e.p1[1] - e.p0[1]) * f - e.n[1] * k; return R.z(x, y); };
        const low = f => at(f, 0.001) < at(f, 0.3) - 1e-4, len = Math.hypot(e.p1[0] - e.p0[0], e.p1[1] - e.p0[1]);
        const pt = f => [e.p0[0] + (e.p1[0] - e.p0[0]) * f, e.p0[1] + (e.p1[1] - e.p0[1]) * f];
        const cut = (fi, fo) => { for (let i = 0; i < 16; i++) { const m = (fi + fo) / 2; if (low(m)) fi = m; else fo = m; } return fi; };
        const n = Math.max(8, Math.ceil(len / 0.05)), runs = [];
        let s = null;
        for (let i = 0; i <= n; i++) {
          const f = Math.min(1, Math.max(0, i / n)), lw = low(Math.min(0.999, Math.max(0.001, f)));
          if (lw && s === null) s = i ? cut(f, (i - 1) / n) : 0;
          if ((!lw || i === n) && s !== null) { runs.push([s, lw ? 1 : cut((i - 1) / n, f)]); s = null; }
        }
        for (const [f0, f1] of runs) if ((f1 - f0) * len > 0.3) out.push({ p0: f0 < 1e-3 ? e.p0 : pt(f0), p1: f1 > 1 - 1e-3 ? e.p1 : pt(f1), n: e.n, z: at((f0 + f1) / 2, 0.001) });
      }
      return out;
    }
    const P2 = (a, c) => (R.ridgeX ? [a, c] : [c, a]);
    const zl = (a, c) => { const p = P2(a, c); return R.z(p[0], p[1]); };
    const E = [
      { a0: R.A0, c0: R.C0, a1: R.A1, c1: R.C0, da: 0, dc: -1 }, { a0: R.A0, c0: R.C1, a1: R.A1, c1: R.C1, da: 0, dc: 1 },
      { a0: R.A0, c0: R.C0, a1: R.A0, c1: R.C1, da: -1, dc: 0 }, { a0: R.A1, c0: R.C0, a1: R.A1, c1: R.C1, da: 1, dc: 0 }
    ];
    const out = [];
    for (const e of E) {
      let low = true;
      for (const f of [0.25, 0.5, 0.75]) {
        const a = e.a0 + (e.a1 - e.a0) * f, c = e.c0 + (e.c1 - e.c0) * f;
        if (!(zl(a, c) < zl(a - e.da * 0.3, c - e.dc * 0.3) - 1e-4)) low = false;
      }
      if (low) out.push({ p0: P2(e.a0, e.c0), p1: P2(e.a1, e.c1), n: P2(e.da, e.dc), z: zl((e.a0 + e.a1) / 2, (e.c0 + e.c1) / 2) });
    }
    if (R.type === 'butterfly') out.push({ valley: true, p0: P2(R.A0, R.cm), p1: P2(R.A1, R.cm), n: P2(0, 1), z: R.zE });
    return out;
  };

  // column size text: 250 x 400, or Ø300 for a round column
  AP.colDesc = c => (c.shape === 'circle' ? '\u00d8' + AP.mm(c.size) : AP.mm(c.size) + ' x ' + AP.mm(c.d != null ? c.d : c.size));

  // sample a function along [a0,a1] and simplify collinear points
  AP.profile = function (fn, a0, a1, n) {
    n = n || 240;
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([a, fn(a)]); }
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = out[out.length - 1], q = pts[i], r = pts[i + 1];
      const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      if (Math.abs(cross) > 1e-7) out.push(q);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  /* ---------- fixtures & furniture (auto placed) ----------
   * Each fixture is laid out in a wall-local frame: s along the wall, n into the room.
   */
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  AP.frame = function (r, side) {
    return (s, n) => {
      switch (side) {
        case 'N': return [r.x + s, r.y + n];
        case 'S': return [r.x + r.w - s, r.y + r.l - n];
        case 'W': return [r.x + n, r.y + r.l - s];
        default:  return [r.x + r.w - n, r.y + s];
      }
    };
  };
  AP.sideLen = (r, side) => (side === 'N' || side === 'S') ? r.w : r.l;
  AP.fixtures = function (floor, r, S) {
    const doorOp = floor.openings.find(o => o.roomId === r.id && o.kind === 'door');
    // furniture goes against the wall opposite the door, unless the user rotated it (room.fxSide)
    const back = r.fxSide || (doorOp ? OPP[doorOp.side] : 'N');
    const len = AP.sideLen(r, back), dep = AP.sideLen(r, back === 'N' || back === 'S' ? 'E' : 'N');
    const t = S.intWall / 2, m = S.extWall / 2;
    const F = [];
    const add = (kind, s0, s1, n0, n1, extra) => F.push(Object.assign({ kind, side: back, s0, s1, n0, n1 }, extra || {}));
    const L = len - 2 * m;
    switch (r.type) {
      case 'toilet': {
        if (L >= 2.0 && dep >= 1.6) {
          add('lav', m + 0.05, m + 0.55, t, t + 0.45);
          add('wc', m + 0.65, m + 1.05, t, t + 0.70);
          add('shower', len - m - 0.90, len - m, t, t + Math.min(0.90, dep - 0.7));
        } else if (L >= 1.3) {
          add('lav', m + 0.05, m + 0.55, t, t + 0.45);
          add('wc', Math.min(m + 0.70, len - m - 0.45), Math.min(m + 1.10, len - m - 0.05), t, t + 0.70);
          F.push({ kind: 'drain', side: back, s0: len / 2, s1: len / 2, n0: dep * 0.7, n1: dep * 0.7 });
        } else {
          add('wc', len / 2 - 0.2, len / 2 + 0.2, t, t + 0.70);
        }
        break;
      }
      case 'kitchen': {
        // L-shaped counter when the kitchen is big enough and a side wall has no door: back wall + a leg
        const LEFT = { N: 'W', E: 'N', S: 'E', W: 'S' }, RIGHT = { N: 'E', E: 'S', S: 'W', W: 'N' };
        const doorOn = sd => floor.openings.some(o => {
          if (o.kind !== 'door') return false;
          const Ro = AP.resolveOp(floor, o), si = AP.sideInfo(r, sd);
          return Ro && Ro.o === si.o && eq(Ro.c, si.c) && Ro.s + Ro.w / 2 > si.s0 && Ro.s - Ro.w / 2 < si.s0 + si.len;
        });
        const leg = L >= 2.2 && dep >= 2.2 ? (!doorOn(LEFT[back]) ? 'left' : !doorOn(RIGHT[back]) ? 'right' : null) : null;
        if (leg) {
          add('counterL', m, len - m, t, t + Math.min(1.8, Math.max(1.2, dep * 0.6)), { leg, d: 0.6 });
          const a0 = leg === 'left' ? m + 0.65 : m, run = L - 0.65;
          add('sink', a0 + run * 0.15, a0 + run * 0.15 + 0.80, t + 0.05, t + 0.55); add('stove', a0 + run * 0.62, a0 + run * 0.62 + 0.60, t + 0.05, t + 0.55);
          break;
        }
        add('counter', m, len - m, t, t + 0.60);
        if (L >= 1.8) { add('sink', m + L * 0.25, m + L * 0.25 + 0.80, t + 0.05, t + 0.55); add('stove', m + L * 0.65, m + L * 0.65 + 0.60, t + 0.05, t + 0.55); }
        break;
      }
      case 'master': case 'bedroom': {
        // template beds (with night tables): queen / full / single / maid - the biggest that fits
        const BB = AP.BLOCKS || {};
        const order = r.type === 'master' ? ['BEDQUEEN', 'BEDFULL', 'BEDSINGLE', 'BEDMAID'] : ['BEDFULL', 'BEDSINGLE', 'BEDMAID'];
        const pick = order.find(n => BB[n] && BB[n].w <= L - 0.2 && BB[n].h <= dep - 0.5);
        if (pick) { const c = len / 2; add('bed', c - BB[pick].w / 2, c + BB[pick].w / 2, t, t + BB[pick].h, { block: pick }); break; }
        let bw = r.type === 'master' ? 1.8 : 1.2;
        if (L < bw + 0.6) bw = Math.max(0.9, L - 0.6);
        const bl = 1.95;
        if (dep >= bl + 0.5 && L >= 1.4) {
          const c = len / 2;
          add('bed', c - bw / 2, c + bw / 2, t, t + bl);
          if (L >= bw + 1.1) { add('table', c - bw / 2 - 0.5, c - bw / 2 - 0.05, t, t + 0.45); add('table', c + bw / 2 + 0.05, c + bw / 2 + 0.5, t, t + 0.45); }
        }
        break;
      }
      case 'living': {
        if (L >= 2.4 && dep >= 2.4) {
          const BB = AP.BLOCKS || {}, so = BB['SOFA-3'] && L >= 2.7 ? 'SOFA-3' : BB['SOFA-2'] ? 'SOFA-2' : null, c = len / 2;
          if (so) { const sl = BB[so].h, sd = BB[so].w; add('sofa', c - sl / 2, c + sl / 2, t + 0.05, t + 0.05 + sd, { block: so, blockWall: 'left' }); add('table', c - 0.5, c + 0.5, t + sd + 0.45, t + sd + 0.95); }
          else { add('sofa', c - 1.0, c + 1.0, t + 0.05, t + 0.85); add('table', c - 0.5, c + 0.5, t + 1.3, t + 1.8); }
        }
        break;
      }
      case 'dining': {
        if (L >= 2.0 && dep >= 2.0) {
          // template dining sets: 8 / 6 / 4 seaters, long side along the longer room side
          const BB = AP.BLOCKS || {}, c = len / 2, cn = dep / 2;
          const fit = ['TABLE-4', 'TABLE-3', 'TABLE-2'].map(n => {
            if (!BB[n]) return null;
            const along = L >= dep;
            const sw = along ? BB[n].h : BB[n].w, sd = along ? BB[n].w : BB[n].h;
            return sw <= L - 0.3 && sd <= dep - 0.3 ? { n, sw, sd, wall: along ? 'left' : 'top' } : null;
          }).find(Boolean);
          if (fit) add('dtable', c - fit.sw / 2, c + fit.sw / 2, cn - fit.sd / 2, cn + fit.sd / 2, { block: fit.n, blockWall: fit.wall });
          else { const tw = L >= 2.8 ? 1.6 : 1.2; add('dtable', c - tw / 2, c + tw / 2, cn - 0.45, cn + 0.45); }
        }
        break;
      }
      case 'laundry': {
        if (L >= 1.3) { add('washer', m + 0.05, m + 0.65, t, t + 0.60); add('tub', m + 0.75, m + 1.30, t, t + 0.50); }
        break;
      }
      case 'garage': case 'carport': {
        const along = Math.max(r.w, r.l) === r.w ? 'h' : 'v';
        F.push({ kind: 'car', world: along === 'h' ? [r.x + r.w / 2 - 2.25, r.y + r.l / 2 - 0.9, 4.5, 1.8] : [r.x + r.w / 2 - 0.9, r.y + r.l / 2 - 2.25, 1.8, 4.5] });
        break;
      }
      case 'stairs': F.push({ kind: 'stairs' }); break;
    }
    // fixtures made editable (they became the room's own pieces in floor.furniture): only the stairs stay
    if (r.fixOff) return F.filter(f => f.kind === 'stairs');
    // "Auto furniture: off" keeps the plumbing fixtures, kitchen counter and stairs, drops the furniture
    if (r.fxOff) return F.filter(f => AP.PLUMB_KINDS.indexOf(f.kind) >= 0 || f.kind === 'stairs' || f.kind === 'stove' || f.kind === 'counter' || f.kind === 'counterL');
    return F;
  };
  // the user's pieces in room r seen as fixtures {kind, side, s0, s1, n0, n1} (back against side), so the
  // plumbing, power and toilet details follow pieces that were moved or added
  const FURN_FIX = { wc: 'wc', lav: 'lav', shower: 'shower', sink1: 'sink', sink2: 'sink', wm: 'washer', ltub: 'tub', tub: 'tub', fd: 'drain', stove: 'stove', counter: 'counter', counterL: 'counterL' };
  AP.furnFixtures = function (floor, r) {
    const out = [], BACK = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (const f of floor.furniture || []) {
      const kind = FURN_FIX[f.kind]; if (!kind) continue;
      if (!(f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.l)) continue;
      const side = BACK[((f.rot || 0) % 360 + 360) % 360]; if (!side) continue;
      const [w, l] = AP.furnSize(f), T = AP.furnXf(f).T, b = T(0, -l / 2);
      // wall-frame coordinates of the back centre
      const sn = side === 'N' ? [b[0] - r.x, b[1] - r.y] : side === 'S' ? [r.x + r.w - b[0], r.y + r.l - b[1]] : side === 'W' ? [r.y + r.l - b[1], b[0] - r.x] : [b[1] - r.y, r.x + r.w - b[0]];
      const fx = { kind, side, s0: sn[0] - w / 2, s1: sn[0] + w / 2, n0: sn[1], n1: sn[1] + l, user: f.id };
      if (kind === 'drain') { const c = side === 'N' ? [f.x - r.x, f.y - r.y] : side === 'S' ? [r.x + r.w - f.x, r.y + r.l - f.y] : side === 'W' ? [r.y + r.l - f.y, f.x - r.x] : [f.y - r.y, r.x + r.w - f.x]; Object.assign(fx, { s0: c[0], s1: c[0], n0: c[1], n1: c[1] }); }
      if (kind === 'counterL') Object.assign(fx, { leg: f.mir ? 'right' : 'left', d: f.d || 0.6 });
      out.push(fx);
    }
    return out;
  };
  AP.allFixtures = (floor, r, S) => AP.fixtures(floor, r, S).concat(AP.furnFixtures(floor, r));
})(window.AP);
