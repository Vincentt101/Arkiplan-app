/* ArkiPlan – sketch / hand-drawn plan to rooms, on the device (no internet).
 * Works on a photo or scan of a plan drawn with straight (ruler) walls: finds the long dark horizontal and vertical
 * strokes (walls), lines them up into a grid, closes the corners, and takes every enclosed area as a room; short gaps
 * in a wall become doors. Room names and handwritten dimensions are not read – the user names the rooms and gives
 * one real dimension for the scale. */
window.AP = window.AP || {};
(function (AP) {
  'use strict';

  // img: { data: RGBA bytes, width, height } (already scaled down to ~1000 px)
  // returns { rooms: [{x0, y0, x1, y1}], doors: [{o: 'h'|'v', c, a, b, ext}], bbox, tol } in image pixels
  AP.detectPlan = function (img) {
    const W = img.width, H = img.height, N = W * H, D = img.data;
    // 1. grey, then dark = clearly darker than its surroundings (copes with shadows / uneven light in photos)
    const g = new Float32Array(N);
    for (let i = 0; i < N; i++) g[i] = 0.299 * D[4 * i] + 0.587 * D[4 * i + 1] + 0.114 * D[4 * i + 2];
    const I = new Float64Array((W + 1) * (H + 1)); // integral image
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } }
    const R = Math.max(8, Math.round(Math.max(W, H) / 40)), dark = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = g[y * W + x];
      dark[y * W + x] = v < m * 0.78 && v < 170 ? 1 : 0;
    }
    // 2. long runs only (walls), small breaks in a hand-drawn stroke bridged
    const S = Math.max(W, H), K = Math.max(14, Math.round(S * 0.035)), gap = Math.max(2, Math.round(S * 0.004));
    const Hm = new Uint8Array(N), Vm = new Uint8Array(N);
    const runs = (len, at, set) => {
      let s = -1, last = -1;
      for (let i = 0; i <= len; i++) {
        const d = i < len && at(i);
        if (d) { if (s < 0) s = i; last = i; }
        else if (s >= 0 && (i - last > gap || i === len)) { if (last - s + 1 >= K) for (let j = s; j <= last; j++) set(j); s = -1; }
      }
    };
    for (let y = 0; y < H; y++) runs(W, x => dark[y * W + x], x => { Hm[y * W + x] = 1; });
    for (let x = 0; x < W; x++) runs(H, y => dark[y * W + x], y => { Vm[y * W + x] = 1; });
    // 3. strokes = connected parts of each mask -> line segments (centre line, extent, thickness)
    const comps = (M, horiz) => {
      const lab = new Int32Array(N).fill(-1), out = [], st = [];
      for (let p = 0; p < N; p++) {
        if (!M[p] || lab[p] >= 0) continue;
        let n = 0, sc = 0, a0 = Infinity, a1 = -Infinity;
        st.push(p); lab[p] = out.length;
        while (st.length) {
          const q = st.pop(), x = q % W, y = (q - x) / W;
          n++; sc += horiz ? y : x;
          const a = horiz ? x : y; if (a < a0) a0 = a; if (a > a1) a1 = a;
          for (const r of [q - 1, q + 1, q - W, q + W]) {
            if (r < 0 || r >= N || (Math.abs((r % W) - x) > 1) || !M[r] || lab[r] >= 0) continue;
            lab[r] = out.length; st.push(r);
          }
        }
        if (a1 - a0 + 1 >= K) out.push({ c: sc / n, a: a0, b: a1, t: n / (a1 - a0 + 1) });
      }
      return out;
    };
    const hs = comps(Hm, true), vs = comps(Vm, false);
    // 4. strokes on (nearly) one line -> one wall line with the intervals it covers
    const tol = Math.max(6, Math.round(S * 0.012));
    const cluster = segs => {
      segs.sort((p, q) => p.c - q.c);
      const L = [];
      for (const s of segs) {
        const l = L[L.length - 1];
        if (l && Math.abs(s.c - l.c) < tol) { l.c = (l.c * l.n + s.c * (s.b - s.a)) / (l.n + s.b - s.a); l.n += s.b - s.a; l.iv.push([s.a, s.b]); }
        else L.push({ c: s.c, n: s.b - s.a, iv: [[s.a, s.b]] });
      }
      for (const l of L) { // merge overlapping / nearly touching pieces
        l.iv.sort((p, q) => p[0] - q[0]);
        const m = [];
        for (const iv of l.iv) { const t = m[m.length - 1]; if (t && iv[0] <= t[1] + gap * 2) t[1] = Math.max(t[1], iv[1]); else m.push(iv.slice()); }
        l.iv = m;
      }
      return L;
    };
    const HL = cluster(hs), VL = cluster(vs);
    if (!HL.length || !VL.length) return { rooms: [], doors: [], bbox: null, tol };
    // 5. close the corners: a wall that stops just short of a crossing wall is carried to it
    const reach = tol * 2;
    for (const [A, B] of [[HL, VL], [VL, HL]]) for (const l of A) for (const iv of l.iv) {
      for (const k of [0, 1]) {
        let best = null;
        for (const m of B) { const d = Math.abs(m.c - iv[k]); if (d < reach && m.iv.some(j => l.c >= j[0] - reach && l.c <= j[1] + reach) && (!best || d < Math.abs(best.c - iv[k]))) best = m; }
        if (best) iv[k] = best.c;
      }
    }
    // 6. a grid of cells between the wall lines; a cell side is a wall when a wall line covers enough of it
    const xs = VL.map(l => l.c), ys = HL.map(l => l.c), nx = xs.length - 1, ny = ys.length - 1;
    if (nx < 1 || ny < 1) return { rooms: [], doors: [], bbox: null, tol };
    const cover = (l, a, b) => { let s = 0; for (const iv of l.iv) s += Math.max(0, Math.min(b, iv[1]) - Math.max(a, iv[0])); return s / Math.max(1, b - a); };
    const wallV = (i, j) => cover(VL[i], ys[j], ys[j + 1]) >= 0.4; // the line x = xs[i] between rows j, j+1
    const wallH = (i, j) => cover(HL[j], xs[i], xs[i + 1]) >= 0.4; // the line y = ys[j] between columns i, i+1
    const id = (i, j) => j * nx + i, par = Array.from({ length: nx * ny }, (_, k) => k);
    const find = k => (par[k] === k ? k : (par[k] = find(par[k])));
    const join = (p, q) => { p = find(p); q = find(q); if (p !== q) par[p] = q; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 1 < nx && !wallV(i + 1, j)) join(id(i, j), id(i + 1, j));
      if (j + 1 < ny && !wallH(i, j + 1)) join(id(i, j), id(i, j + 1));
    }
    // outside: cells reached from the edge of the grid without crossing a wall
    const out = new Set();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if ((i === 0 && !wallV(0, j)) || (i === nx - 1 && !wallV(nx, j)) || (j === 0 && !wallH(i, 0)) || (j === ny - 1 && !wallH(i, ny))) out.add(find(id(i, j)));
    }
    // 7. each enclosed group of cells -> rectangles (a whole rectangle when the group is one)
    const groups = new Map();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const r = find(id(i, j)); if (out.has(r)) continue; if (!groups.has(r)) groups.set(r, []); groups.get(r).push([i, j]); }
    const rooms = [], minA = (S * 0.06) ** 2;
    for (const cells of groups.values()) {
      const left = new Set(cells.map(c => c[0] + ',' + c[1]));
      while (left.size) {
        // the largest rectangle of cells still left, grown from the top-left one
        const cs = [...left].map(s => s.split(',').map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        const [i0, j0] = cs[0];
        let i1 = i0; while (left.has((i1 + 1) + ',' + j0)) i1++;
        let j1 = j0; for (;;) { let ok = true; for (let i = i0; i <= i1; i++) if (!left.has(i + ',' + (j1 + 1))) { ok = false; break; } if (!ok) break; j1++; }
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) left.delete(i + ',' + j);
        const r = { x0: xs[i0], y0: ys[j0], x1: xs[i1 + 1], y1: ys[j1 + 1] };
        if ((r.x1 - r.x0) * (r.y1 - r.y0) >= minA) rooms.push(r);
      }
    }
    // 8. doors: a gap in a wall line along a room side
    const doors = [];
    const gaps = (l, a, b) => { const g2 = []; let p = a; for (const iv of l.iv) { if (iv[1] <= a || iv[0] >= b) continue; if (iv[0] > p) g2.push([p, iv[0]]); p = Math.max(p, iv[1]); } if (p < b) g2.push([p, b]); return g2; };
    const seen = new Set();
    for (const r of rooms) {
      const sides = [['h', r.y0, r.x0, r.x1, HL], ['h', r.y1, r.x0, r.x1, HL], ['v', r.x0, r.y0, r.y1, VL], ['v', r.x1, r.y0, r.y1, VL]];
      for (const [o, c, a, b, Ls] of sides) {
        const l = Ls.find(q => Math.abs(q.c - c) < 0.5); if (!l) continue;
        for (const [p, q] of gaps(l, a + tol * 0.5, b - tol * 0.5)) {
          const k = o + Math.round(c) + ',' + Math.round(p);
          if (q - p < tol || seen.has(k)) continue; seen.add(k);
          doors.push({ o, c, a: p, b: q });
        }
      }
    }
    const bbox = rooms.length ? { x0: Math.min(...rooms.map(r => r.x0)), y0: Math.min(...rooms.map(r => r.y0)), x1: Math.max(...rooms.map(r => r.x1)), y1: Math.max(...rooms.map(r => r.y1)) } : null;
    return { rooms, doors, bbox, tol };
  };

  // detection (pixels) -> rooms + doors in metres; mpp = metres per pixel. Rooms named ROOM 1, 2 … for the user to rename
  AP.planFromDetection = function (det, mpp) {
    const b = det.bbox, sn = v => Math.round(v / 0.05) * 0.05, X = px => sn((px - b.x0) * mpp), Y = py => sn((py - b.y0) * mpp);
    const rooms = det.rooms.map((r, k) => ({ id: AP.uid(), type: 'other', name: 'Room ' + (k + 1), x: X(r.x0), y: Y(r.y0), w: Math.max(0.5, X(r.x1) - X(r.x0)), l: Math.max(0.5, Y(r.y1) - Y(r.y0)) }));
    // order: top to bottom, left to right
    rooms.sort((p, q) => p.y - q.y || p.x - q.x).forEach((r, k) => { r.name = 'Room ' + (k + 1); });
    const openings = [];
    for (const g of det.doors) {
      const len = (g.b - g.a) * mpp; if (len < 0.5 || len > 2.0) continue; // a door-sized gap only
      const c = g.o === 'h' ? Y(g.c) : X(g.c), a = g.o === 'h' ? X(g.a) : Y(g.a), mid = a + len / 2;
      // the room on one side of the gap: its side + the offset of the door's centre along it
      let host = null, side = null;
      for (const r of rooms) {
        if (g.o === 'h' && mid > r.x && mid < r.x + r.w) { if (Math.abs(r.y - c) < 0.15) { host = r; side = 'N'; } else if (Math.abs(r.y + r.l - c) < 0.15) { host = r; side = 'S'; } }
        if (g.o === 'v' && mid > r.y && mid < r.y + r.l) { if (Math.abs(r.x - c) < 0.15) { host = r; side = 'W'; } else if (Math.abs(r.x + r.w - c) < 0.15) { host = r; side = 'E'; } }
        if (host) break;
      }
      if (!host) continue;
      const tpl = len >= 1.3 ? 'D4' : len >= 0.85 ? 'D1' : 'D2', T = AP.DOOR_TPL[tpl];
      const along = side === 'N' || side === 'S' ? mid - host.x : mid - host.y;
      openings.push({ id: AP.uid(), kind: 'door', tpl, roomId: host.id, side, off: Math.round(along * 100) / 100, w: T.w, h: T.h, sill: 0, flip: false, hand: false });
    }
    return { rooms, openings, width: X(b.x1), depth: Y(b.y1) };
  };

  // an image file -> { canvas (≤ max px), imageData } in the browser
  AP.loadSketchImage = function (file, max) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, (max || 1000) / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res({ canvas: cv, imageData: cx.getImageData(0, 0, cv.width, cv.height) });
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Not a picture this device can open')); };
      im.src = url;
    });
  };
})(window.AP);
