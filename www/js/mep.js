/* ArkiPlan – electrical and plumbing layouts generated from the rooms and fixtures.
 * Sizes are preliminary (PEC / National Plumbing Code rules of thumb) and must be
 * checked and signed by a licensed electrical engineer / master plumber.
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  const LW = AP.LW;
  const st = (ts, w, e) => Object.assign({ w: w * ts }, e || {});
  const eq = AP.eq;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  AP.PLUMB_KINDS = ['wc', 'lav', 'shower', 'drain', 'sink', 'counter', 'counterL', 'washer', 'tub'];

  function sidePt(si, s, n) { return si.o === 'h' ? [s, si.c + si.k * n] : [si.c + si.k * n, s]; }
  function opsOnLine(fl, o, c) {
    const out = [];
    for (const op of fl.openings) { const R = AP.resolveOp(fl, op); if (R && R.o === o && eq(R.c, c)) out.push({ op, R }); }
    return out;
  }
  function findDoor(fl, r) {
    let best = null;
    for (const op of fl.openings) {
      if (op.kind !== 'door') continue;
      const R = AP.resolveOp(fl, op); if (!R) continue;
      for (const side of 'NSEW') {
        const si = AP.sideInfo(r, side);
        if (R.o === si.o && eq(R.c, si.c) && R.s > si.s0 && R.s < si.s0 + si.len) {
          const c = { op, R, si };
          if (op.roomId === r.id) return c;
          if (!best) best = c;
        }
      }
    }
    return best;
  }

  /* ======================= ELECTRICAL ======================= */
  const BRK = [20, 30, 40, 50, 60, 70, 80, 100, 125, 150, 175, 200, 225, 250];
  const WIRE = [[20, '3.5'], [30, '5.5'], [40, '8.0'], [55, '14'], [70, '22'], [95, '30'], [110, '38'], [130, '50'], [150, '60'], [175, '80'], [200, '100'], [250, '125']];
  const wireFor = a => (WIRE.find(w => a <= w[0]) || WIRE[WIRE.length - 1])[1];
  const brkFor = a => BRK.find(b => b >= a) || 250;
  // light types (dev.lt) and outlet types (dev.ct): name, legend text, load (VA)
  AP.LIGHT_TYPES = {
    recessed: { name: 'Recessed downlight', legend: 'LED RECESSED DOWNLIGHT, 18W', va: 60 },
    pin: { name: 'Pin light', legend: 'LED PIN LIGHT, 5W', va: 10 },
    ceiling: { name: 'Ceiling light (surface)', legend: 'LED SURFACE CEILING LIGHT, 24W', va: 60 },
    pendant: { name: 'Pendant light', legend: 'PENDANT LIGHT, 15W LED BULB', va: 40 },
    tube: { name: 'Tube light (T8 LED)', legend: 'T8 LED TUBE LIGHT, 1-18W, 1200mm', va: 40 },
    panel: { name: 'LED panel 600x600', legend: 'LED PANEL LIGHT 600x600, 40W', va: 50 },
    track: { name: 'Track light', legend: 'TRACK LIGHT, 3 x 7W LED', va: 30 },
    wall: { name: 'Wall light (sconce)', legend: 'WALL LIGHT / SCONCE @ 2.10m ABOVE FFL, 10W', va: 20 },
    chand: { name: 'Chandelier', legend: 'CHANDELIER, 6 x 5W LED', va: 100 },
    emer: { name: 'Emergency light', legend: 'EMERGENCY LIGHT, TWIN HEAD W/ BATTERY BACK-UP', va: 20 }
  };
  AP.OUTLET_TYPES = {
    duplex: { name: 'Duplex outlet', legend: 'DUPLEX CONVENIENCE OUTLET @ 0.30m ABOVE FFL' },
    wp: { name: 'Weatherproof outlet', legend: 'WEATHERPROOF CONVENIENCE OUTLET' },
    gfci: { name: 'GFCI outlet', legend: 'GFCI DUPLEX OUTLET (WET AREAS)' },
    usb: { name: 'Outlet with USB', legend: 'DUPLEX OUTLET W/ USB PORTS' },
    floor: { name: 'Floor outlet', legend: 'FLOOR-MOUNTED DUPLEX OUTLET W/ COVER' }
  };
  AP.lightVA = d => (d.kind === 'ef' ? 50 : d.kind === 'exit' ? 20 : (AP.LIGHT_TYPES[d.lt || 'recessed'] || AP.LIGHT_TYPES.recessed).va);
  const MIN_CO = { bedroom: 2, master: 3, living: 3, dining: 2, kitchen: 2, office: 3, store: 3, garage: 1, storage: 1, other: 1, laundry: 1, hall: 0, stairs: 0, toilet: 0 };

  AP.elecLayout = function (P) {
    const S = P.settings, com = P.info.type === 'Commercial';
    const F = P.floors.map(() => []);
    let panel = null;
    P.floors.forEach((fl, fi) => {
      const walls = AP.computeWalls(fl, S);
      const tAt = (si, s) => { const w = AP.wallAt(walls, si.o, si.c, s); return w && w.t ? w.t : 0; };
      const kindAt = (si, s) => { const w = AP.wallAt(walls, si.o, si.c, s); return w ? w.kind : null; };
      for (const r of fl.rooms) {
        const add = (kind, p, extra) => F[fi].push(Object.assign({ kind, x: p[0], y: p[1], room: r.id, rname: r.name, fi }, extra || {}));
        const area = r.w * r.l, open = AP.isOpen(r);
        // lighting outlets in a grid
        let n = (r.type === 'toilet' || r.type === 'stairs') ? 1 : Math.max(1, Math.round(area / (open ? 8 : 9)));
        if (r.type === 'hall') n = Math.max(1, Math.round(Math.max(r.w, r.l) / 3));
        n = Math.min(n, 12);
        const cols = Math.min(n, Math.max(1, Math.round(Math.sqrt(n * r.w / r.l)))), rows = Math.ceil(n / cols);
        let k = 0;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols && k < n; i++, k++)
          add('light', [r.x + r.w * (i + 0.5) / cols, r.y + r.l * (j + 0.5) / rows]);
        if (r.type === 'toilet') add('ef', [r.x + r.w * 0.5, r.y + r.l * 0.22]);
        // switch beside the latch side of the door
        const door = findDoor(fl, r);
        let sp;
        if (door) {
          const { R, op, si } = door, dir = op.hand ? -1 : 1;
          const lo = si.s0 + 0.15, hi = si.s0 + si.len - 0.15;
          let s = R.s + dir * (R.w / 2 + 0.2);
          if (s < lo || s > hi) s = R.s - dir * (R.w / 2 + 0.2);
          s = clamp(s, lo, hi);
          sp = sidePt(si, s, tAt(si, s) / 2 + 0.15);
        } else sp = [r.x + 0.3, r.y + 0.3];
        add('sw', sp, { gang: r.type === 'toilet' ? 2 : 1 });
        // convenience outlets along the walls, clear of openings and corners
        const cand = [];
        for (const side of 'NESW') {
          const si = AP.sideInfo(r, side);
          if (!tAt(si, si.s0 + si.len / 2) && !open) continue;
          const ops = opsOnLine(fl, si.o, si.c);
          const m = Math.max(1, Math.floor(si.len / 3));
          for (let i = 1; i <= m; i++) {
            const s = si.s0 + si.len * i / (m + 1);
            if (ops.some(e => Math.abs(e.R.s - s) < e.R.w / 2 + 0.35)) continue;
            if (s < si.s0 + 0.5 || s > si.s0 + si.len - 0.5) continue;
            cand.push({ si, s, ext: kindAt(si, s) === 'ext' });
          }
        }
        if (open) {
          if (r.type !== 'balcony' && r.type !== 'open') {
            const c = cand.find(c => tAt(c.si, c.s) > 0);
            if (c) add('co', sidePt(c.si, c.s, tAt(c.si, c.s) / 2 + 0.12), { wp: true });
          }
        } else {
          const need = (MIN_CO[r.type] != null ? MIN_CO[r.type] : 1) + (area > 16 ? 1 : 0);
          const pick = [];
          if (cand.length <= need) pick.push(...cand);
          else for (let i = 0; i < need; i++) pick.push(cand[Math.floor(i * cand.length / need)]);
          for (const c of pick) add('co', sidePt(c.si, c.s, tAt(c.si, c.s) / 2 + 0.12));
        }
        // special purpose outlets
        const hp = { master: 1.5, bedroom: 1.0, living: 2.0, office: com ? 1.5 : 0, store: com ? 2.0 : 0 }[r.type] || 0;
        if (hp && !(r.type === 'living' && area < 12)) {
          let best = null;
          for (const side of 'NESW') {
            const si = AP.sideInfo(r, side), mid = si.s0 + si.len / 2;
            if (!tAt(si, mid)) continue;
            const ops = opsOnLine(fl, si.o, si.c);
            for (const s of [mid, mid - 0.9, mid + 0.9]) {
              if (s < si.s0 + 0.5 || s > si.s0 + si.len - 0.5 || ops.some(e => Math.abs(e.R.s - s) < e.R.w / 2 + 0.45)) continue;
              const score = (kindAt(si, s) === 'ext' ? 10 : 0) + si.len;
              if (!best || score > best.score) best = { si, s, score };
              break;
            }
          }
          if (best) add('acu', sidePt(best.si, best.s, tAt(best.si, best.s) / 2 + 0.3), { hp });
        }
        const fx = AP.allFixtures(fl, r, S), mine = new Set(fx.filter(f => f.user).map(f => f.kind));
        for (const f of fx) {
          if (!f.user && mine.has(f.kind)) continue; // the user's own stove / washer / shower replaces the automatic one
          const L = AP.frame(r, f.side), cs = (f.s0 + f.s1) / 2;
          if (f.kind === 'stove') add('range', L(cs, f.n0 + 0.1));
          if (f.kind === 'shower') add('wh', L(cs, f.n0 + 0.12));
          if (f.kind === 'washer') add('wm', L(cs, f.n0 + 0.1));
        }
        if (r.type === 'kitchen') {
          const c = fx.find(f => f.kind === 'counter' || f.kind === 'counterL');
          if (c) { const L = AP.frame(r, c.side), nn = c.kind === 'counterL' ? c.n0 + (c.d || 0.6) : c.n1; add('ref', L(c.leg === 'right' ? Math.min(c.s1 - 0.35, c.s0 + 0.25) : Math.max(0.35, c.s1 - 0.25), nn + 0.15)); }
        }
      }
      // illuminated EXIT sign with battery back-up over every exit door, on the inside
      for (const op of fl.openings) {
        if (op.kind !== 'door' || !AP.tplOf(op).exit) continue;
        const Ro = AP.resolveOp(fl, op); if (!Ro) continue;
        const rr = fl.rooms.find(q => q.id === op.roomId), p = Ro.o === 'h' ? [Ro.s, Ro.c + Ro.k * 0.45] : [Ro.c + Ro.k * 0.45, Ro.s];
        F[fi].push({ kind: 'exit', x: p[0], y: p[1], room: rr ? rr.id : null, rname: rr ? rr.name : 'EXIT', fi, o: Ro.o });
      }
      // outlets for the furniture / appliances placed by the user, at the wall behind the piece
      const NEED = { tv: ['co', 'TV'], desk: ['co', ''], counter: ['co', ''], counterL: ['co', ''], ref: ['ref', ''] };
      for (const f of fl.furniture || []) {
        const nd = NEED[f.kind]; if (!nd) continue;
        const [w, l] = AP.furnSize(f), T = AP.furnXf(f).T;
        const r = fl.rooms.find(q => f.x > q.x && f.x < q.x + q.w && f.y > q.y && f.y < q.y + q.l);
        // the user's own refrigerator / washer / stove replaces the automatic outlet of that room
        if (r && nd[0] !== 'co') for (let i = F[fi].length - 1; i >= 0; i--) if (F[fi][i].room === r.id && F[fi][i].kind === nd[0] && !F[fi][i].user) F[fi].splice(i, 1);
        const p = T(f.kind === 'tv' || f.kind === 'counter' ? Math.min(0.35, w / 3) : 0, -l / 2 + 0.1);
        F[fi].push({ kind: nd[0], x: p[0], y: p[1], room: r ? r.id : null, rname: r ? r.name : (AP.FURN[f.kind] || {}).name, fi, user: true, lab: nd[1] });
      }
      // the user's changes (Details › lighting / power layout): devices moved, changed or deleted, devices added by hand
      // P.elecEd = { del: [key], move: {key: [x, y]}, prop: {key: {...}}, add: [{id, fi, kind, x, y, ...}] }
      const ED = P.elecEd || {}, del = new Set(ED.del || []), mv = ED.move || {}, pr = ED.prop || {};
      for (let i = F[fi].length - 1; i >= 0; i--) {
        const v = F[fi][i]; v.key = fi + ':' + v.kind + ':' + v.x.toFixed(2) + ':' + v.y.toFixed(2);
        if (del.has(v.key)) { F[fi].splice(i, 1); continue; }
        if (mv[v.key]) { v.x = mv[v.key][0]; v.y = mv[v.key][1]; v.moved = true; }
        if (pr[v.key]) Object.assign(v, pr[v.key], { changed: true });
      }
      for (const a of ED.add || []) if (a.fi === fi) {
        const r = fl.rooms.find(q => a.x >= q.x - 0.2 && a.x <= q.x + q.w + 0.2 && a.y >= q.y - 0.2 && a.y <= q.y + q.l + 0.2);
        F[fi].push(Object.assign({ room: r ? r.id : null, rname: r ? r.name : 'OUTSIDE', outside: !r }, a, { key: 'u:' + a.id, added: true }));
      }
      // panel board inside, next to the main door; kWh meter outside
      if (fi === 0 && fl.rooms.length) {
        const doors = fl.openings.filter(o => o.kind === 'door').map(op => ({ op, R: AP.resolveOp(fl, op) })).filter(e => e.R && e.R.room);
        const ext = doors.filter(e => { const w = AP.wallAt(walls, e.R.o, e.R.c, e.R.s); return w && w.kind === 'ext'; });
        const main = ext.find(e => e.op.tpl === 'D1') || ext[0] || doors[0];
        if (main) {
          const room = main.R.room, si = AP.sideInfo(room, main.op.side);
          let s = main.R.s + (main.R.w / 2 + 0.55);
          if (s > si.s0 + si.len - 0.3) s = main.R.s - (main.R.w / 2 + 0.55);
          s = clamp(s, si.s0 + 0.3, si.s0 + si.len - 0.3);
          const t = tAt(si, s);
          const p = sidePt(si, s, t / 2 + 0.06), m = sidePt(si, s, -(t / 2 + 0.35));
          panel = { fi: 0, x: p[0], y: p[1], o: si.o, k: si.k, mx: m[0], my: m[1], rname: room.name };
        } else {
          const r = fl.rooms[0];
          panel = { fi: 0, x: r.x + 0.3, y: r.y + 0.1, o: 'h', k: 1, mx: r.x + 0.3, my: r.y - 0.5, rname: r.name };
        }
      }
    });
    // the panel board where the user put it (lighting / power layout › drag LP)
    const PL = P.elecEd && P.elecEd.panel;
    if (PL && P.floors[PL.fi] && P.floors[PL.fi].rooms.length) panel = Object.assign({}, panel || {}, PL, { moved: true });
    // circuits
    // a device the user put on a circuit (dev.cg) is left out of the automatic grouping and joins that circuit below
    const every = F.flat(), all = every.filter(d => !d.cg), ckts = [];
    const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
    chunk(all.filter(d => d.kind === 'light' || d.kind === 'ef' || d.kind === 'exit'), 12).forEach(g =>
      ckts.push({ type: 'L', desc: 'LIGHTING OUTLETS', devs: g, qty: g.length, va: g.reduce((a, d) => a + AP.lightVA(d), 0) }));
    chunk(all.filter(d => d.kind === 'co' || d.kind === 'ref'), 8).forEach(g =>
      ckts.push({ type: 'C', desc: 'CONVENIENCE OUTLETS', devs: g, qty: g.length, va: g.reduce((a, d) => a + (d.kind === 'ref' ? 300 : 180), 0) }));
    const SPEC = { acu: ['ACU', d => Math.round(d.hp * 1120)], range: ['RANGE / OVEN', () => 3000], wh: ['WATER HEATER', () => 3000], wm: ['LAUNDRY CIRCUIT', () => 1500] };
    for (const d of all) if (SPEC[d.kind]) {
      const [nm, va] = SPEC[d.kind];
      ckts.push({ type: 'D', desc: nm + (d.kind === 'acu' ? ' ' + d.hp + 'HP' : '') + ' - ' + String(d.rname).toUpperCase(), devs: [d], qty: 1, va: va(d) });
    }
    // the user's circuits keep their numbers (dev.cg); the automatic circuits fill the numbers in between, then follow
    const devVA = d => (d.kind === 'light' || d.kind === 'ef' || d.kind === 'exit' ? AP.lightVA(d) : d.kind === 'ref' ? 300 : d.kind === 'co' ? 180 : SPEC[d.kind] ? SPEC[d.kind][1](d) : 100);
    const isLt = d => d.kind === 'light' || d.kind === 'ef' || d.kind === 'exit';
    const user = new Map();
    for (const d of every.filter(q => q.cg)) { if (!user.has(d.cg)) user.set(d.cg, []); user.get(d.cg).push(d); }
    // circuits the user made / named (Circuits): kept even while empty, with their own type and description
    const DEF = new Map(((P.elecEd || {}).circuits || []).map(c => [c.no, c]));
    for (const no of DEF.keys()) if (!user.has(no)) user.set(no, []);
    if (user.size) {
      const auto = ckts.splice(0), maxU = Math.max(...user.keys());
      for (let n = 1, ai = 0; ai < auto.length || n <= maxU; n++) {
        const g = user.get(n);
        if (g) {
          const sp = g.find(d => SPEC[d.kind]), L = g.length ? g.every(isLt) : false, df = DEF.get(n);
          let desc = sp ? SPEC[sp.kind][0] + (sp.kind === 'acu' ? ' ' + sp.hp + 'HP' : '') + (g.length > 1 ? ' + OUTLETS' : ' - ' + String(sp.rname).toUpperCase()) : L ? 'LIGHTING OUTLETS' : g.some(isLt) ? 'LIGHTING & CONVENIENCE OUTLETS' : 'CONVENIENCE OUTLETS';
          let type = sp ? 'D' : L ? 'L' : 'C';
          if (df) { type = df.type || type; desc = df.desc || (type === 'L' ? 'LIGHTING OUTLETS' : type === 'D' ? desc : 'CONVENIENCE OUTLETS'); }
          ckts.push({ type, desc, devs: g, qty: g.length, va: g.reduce((a, d) => a + devVA(d), 0), user: true });
        } else if (ai < auto.length) ckts.push(auto[ai++]);
      }
    }
    ckts.forEach((c, i) => {
      c.no = i + 1;
      for (const d of c.devs) d.ckt = c.no;
      c.amps = c.va / 230;
      // convenience outlets: always 20 AMP on 2-5.5mm² THHN; lighting and the appliances as before
      c.at = c.type === 'C' ? 20 : Math.max(20, brkFor(c.amps * 1.25));
      const w = c.type === 'D' ? wireFor(c.at) : c.type === 'C' ? '5.5' : '3.5';
      c.wire = c.type === 'L' ? '2-3.5mm² THHN' : c.type === 'C' ? '2-5.5mm² THHN' : '2-' + w + 'mm² THHN + 1-' + w + 'mm² G';
      c.conduit = parseFloat(w) >= 14 ? '25mmØ PVC' : '20mmØ PVC';
    });
    const lc = ckts.filter(c => c.type !== 'D').reduce((a, c) => a + c.va, 0);
    const sp = ckts.filter(c => c.type === 'D').reduce((a, c) => a + c.va, 0);
    // DEMAND LOAD – PEC 2017 Art. 2.20, standard method. A dwelling: general lighting 24 VA/m² of floor area (it covers
    // the general-use outlets), 2 small-appliance circuits @ 1500 VA, the laundry circuit @ 1500 VA; that sum: first
    // 3000 VA @ 100 %, 3001–120000 VA @ 35 %, the rest @ 25 %; household ranges by the range demand table; other fixed
    // appliances @ 75 % when 4 or more; air-conditioners @ 100 %.  Other occupancies: the connected load, outlets
    // over 10 kVA @ 50 %.
    const calc = [], R = n => Math.round(n), app = c => c.devs.find(d => SPEC[d.kind]) || {};
    let demand;
    if (P.info.type !== 'Commercial') {
      const area = P.floors.reduce((a, f) => a + f.rooms.filter(r => !AP.isOpen(r) && r.type !== 'garage').reduce((b, r) => b + r.w * r.l, 0), 0);
      const GL = area * 24, laundry = P.floors.some(f => f.rooms.some(r => r.type === 'laundry')) || ckts.some(c => app(c).kind === 'wm');
      const SA = 2 * 1500, LA = laundry ? 1500 : 0, gen = GL + SA + LA;
      const d1 = Math.min(gen, 3000) + Math.max(0, Math.min(gen, 120000) - 3000) * 0.35 + Math.max(0, gen - 120000) * 0.25;
      calc.push('GENERAL LIGHTING ' + area.toFixed(2) + ' m² x 24 VA/m² = ' + R(GL) + ' VA;  SMALL APPLIANCE 2 x 1500 = ' + SA + ' VA' + (LA ? ';  LAUNDRY 1500 VA' : ''));
      calc.push('SUB-TOTAL ' + R(gen) + ' VA: FIRST 3000 VA @ 100% + ' + R(Math.max(0, gen - 3000)) + ' VA @ 35% = ' + R(d1) + ' VA');
      const ap = [];
      const ranges = ckts.filter(c => app(c).kind === 'range'), acs = ckts.filter(c => app(c).kind === 'acu');
      const fixed = ckts.filter(c => c.type === 'D' && ['range', 'acu', 'wm'].indexOf(app(c).kind) < 0);
      let dR = 0;
      if (ranges.length) {
        const kw = ranges.map(c => c.va / 1000), n = ranges.length, big = kw.some(k => k > 8.75);
        const fB = [0.8, 0.65, 0.55, 0.5, 0.45][Math.min(n, 5) - 1], fC = [8, 11, 14, 17, 20][Math.min(n, 5) - 1] * 1000;
        dR = big ? fC * (1 + Math.max(0, Math.max(...kw) - 12) * 0.05) : kw.reduce((a, k) => a + k, 0) * 1000 * fB;
        ap.push('RANGE' + (n > 1 ? 'S' : '') + ' ' + R(ranges.reduce((a, c) => a + c.va, 0)) + ' VA' + (big ? ' (TABLE COL. C) = ' : ' @ ' + R(fB * 100) + '% = ') + R(dR) + ' VA');
      }
      const fx = fixed.reduce((a, c) => a + c.va, 0), fF = fixed.length >= 4 ? 0.75 : 1;
      if (fixed.length) ap.push('FIXED APPL. (' + fixed.length + ') ' + R(fx) + ' VA @ ' + (fF * 100) + '% = ' + R(fx * fF) + ' VA');
      const ac = acs.reduce((a, c) => a + c.va, 0);
      if (acs.length) ap.push('AIRCON (' + acs.length + ') ' + R(ac) + ' VA @ 100%');
      if (ap.length) calc.push(ap.join(';  '));
      demand = d1 + dR + fx * fF + ac;
    } else {
      const lt = ckts.filter(c => c.type === 'L').reduce((a, c) => a + c.va, 0), co = ckts.filter(c => c.type === 'C').reduce((a, c) => a + c.va, 0);
      const dco = Math.min(co, 10000) + Math.max(0, co - 10000) * 0.5;
      calc.push('LIGHTING: ' + R(lt) + ' VA @ 100%');
      calc.push('CONVENIENCE OUTLETS: ' + R(co) + ' VA (FIRST 10 kVA @ 100%, REMAINDER @ 50%) = ' + R(dco) + ' VA');
      calc.push('APPLIANCES / EQUIPMENT: ' + R(sp) + ' VA @ 100%');
      demand = lt + dco + sp;
    }
    const amps = demand / 230;
    const mainAT = Math.max(40, brkFor(amps * 1.25));
    const feeder = wireFor(mainAT);
    const ground = mainAT <= 60 ? '5.5' : mainAT <= 100 ? '8.0' : '14';
    return { F, panel, ckts, total: lc + sp, demand, amps, mainAT, feeder, ground, calc };
  };

  /* ---------- electrical symbols ---------- */
  function halfDisc(d, x, y, r, ts) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI + Math.PI * i / 12; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
    d.poly(pts, true, { fill: '#000000', stroke: 'none', layer: 'ELEC' });
  }
  AP.elecSym = function (d, dev, ts) {
    const x = dev.x, y = dev.y, r = 1.8 * ts, s = st(ts, LW.thin, { layer: 'ELEC' });
    const wf = Object.assign({ fill: '#ffffff' }, s), lt = dev.kind === 'light' ? dev.lt || 'recessed' : null, ct = dev.kind === 'co' ? (dev.ct || (dev.wp ? 'wp' : 'duplex')) : null;
    const tag = (t, dx) => d.text(x + (dx || r + 0.5 * ts), y + 0.8 * ts, t, 1.6 * ts, { bold: true, layer: 'ELEC' });
    if (lt && lt !== 'recessed') {
      switch (lt) {
        case 'pin': d.circle(x, y, r * 0.55, wf); d.circle(x, y, r * 0.22, { fill: '#000000', stroke: 'none', layer: 'ELEC' }); break;
        case 'ceiling': d.circle(x, y, r, wf); d.line(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, s); d.line(x - r * 0.7, y + r * 0.7, x + r * 0.7, y - r * 0.7, s); break;
        case 'pendant': d.circle(x, y, r, wf); d.circle(x, y, r * 0.45, { fill: '#000000', stroke: 'none', layer: 'ELEC' }); break;
        case 'tube': d.rect(x - 3 * ts, y - 0.6 * ts, 6 * ts, 1.2 * ts, wf); d.line(x - 3 * ts, y, x + 3 * ts, y, s); break;
        case 'panel': d.rect(x - 2.2 * ts, y - 2.2 * ts, 4.4 * ts, 4.4 * ts, wf); d.line(x - 2.2 * ts, y - 2.2 * ts, x + 2.2 * ts, y + 2.2 * ts, s); d.line(x - 2.2 * ts, y + 2.2 * ts, x + 2.2 * ts, y - 2.2 * ts, s); break;
        case 'track': d.line(x - 3 * ts, y, x + 3 * ts, y, st(ts, LW.med, { layer: 'ELEC' })); for (const k of [-2, 0, 2]) d.circle(x + k * ts, y, 0.7 * ts, wf); break;
        case 'wall': { const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; pts.push([x + r * Math.cos(a), y - r * Math.sin(a)]); } d.poly(pts, true, wf); d.line(x - r, y, x + r, y, st(ts, LW.med, { layer: 'ELEC' })); tag('W'); break; }
        case 'chand': d.circle(x, y, r * 0.8, wf); for (let i = 0; i < 6; i++) { const a = Math.PI * i / 3; d.circle(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.35, wf); } break;
        case 'emer': d.rect(x - 2.4 * ts, y - 1.1 * ts, 4.8 * ts, 2.2 * ts, wf); d.text(x, y, 'EL', 1.5 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'ELEC' }); break;
      }
      return;
    }
    if (ct && ct !== 'duplex' && ct !== 'wp') {
      const rr = r * 0.9;
      if (ct === 'floor') d.rect(x - rr * 1.25, y - rr * 1.25, rr * 2.5, rr * 2.5, wf);
      d.circle(x, y, rr, wf);
      d.line(x - rr * 0.35, y - rr * 0.6, x - rr * 0.35, y + rr * 0.6, s); d.line(x + rr * 0.35, y - rr * 0.6, x + rr * 0.35, y + rr * 0.6, s);
      if (ct === 'gfci') tag('GFCI', rr + 0.5 * ts); if (ct === 'usb') tag('USB', rr + 0.5 * ts); if (ct === 'floor') tag('F', rr * 1.25 + 0.5 * ts);
      return;
    }
    // template symbols (drawn for 1:100), scaled to the current plot scale
    const EB = { light: 'E-RECESSED DL', co: 'E-CO', acu: 'E-AC', wh: 'E-WH', ref: 'E-REF' }[dev.kind];
    const Bk = EB && AP.BLOCKS && AP.BLOCKS[EB];
    if (Bk) {
      const k = ts / 0.1, lx = x + Bk.w * k * 0.55 + 0.3 * ts;
      d.circle(x, y, Math.max(Bk.w, Bk.h) * k * 0.5, { fill: '#ffffff', stroke: 'none', layer: 'ELEC' });
      AP.drawBlock(d, EB, (bx, by) => [x + (bx - Bk.w / 2) * k, y - (by - Bk.h / 2) * k], s);
      const lab = { acu: 'ACU', wh: 'WH', ref: 'REF' }[dev.kind];
      if (lab) d.text(lx, y - 0.4 * ts, lab, 1.8 * ts, { bold: true, layer: 'ELEC' });
      if (dev.kind === 'acu') d.text(lx, y + 1.8 * ts, dev.hp + 'HP', 1.5 * ts, { layer: 'ELEC' });
      if (dev.kind === 'co' && dev.wp) d.text(lx, y + 0.8 * ts, 'WP', 1.7 * ts, { layer: 'ELEC' });
      if (dev.kind === 'co' && dev.lab) d.text(lx, y + 0.8 * ts, dev.lab, 1.7 * ts, { bold: true, layer: 'ELEC' });
      return;
    }
    switch (dev.kind) {
      case 'light':
        d.circle(x, y, r, Object.assign({ fill: '#ffffff' }, s));
        d.line(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, s); d.line(x - r * 0.7, y + r * 0.7, x + r * 0.7, y - r * 0.7, s);
        break;
      case 'exit': {
        const a = 2.6 * ts, b = 1.2 * ts, v = dev.o === 'v';
        d.rect(x - (v ? b : a), y - (v ? a : b), 2 * (v ? b : a), 2 * (v ? a : b), Object.assign({ fill: '#ffffff' }, s));
        d.text(x, y, 'EXIT', 1.5 * ts, { anchor: 'middle', v: 'middle', bold: true, rot: v ? -90 : 0, layer: 'ELEC' });
        break;
      }
      case 'ef':
        d.circle(x, y, r * 1.3, Object.assign({ fill: '#ffffff' }, s));
        d.text(x, y, 'EF', 1.7 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'ELEC' });
        break;
      case 'sw':
        d.circle(x, y, 0.6 * ts, { fill: '#000000', stroke: 'none', layer: 'ELEC' });
        d.text(x + 0.9 * ts, y - 0.5 * ts, dev.gang > 1 ? 'S' + dev.gang : 'S', 2.4 * ts, { bold: true, layer: 'ELEC' });
        break;
      case 'co': {
        const rr = r * 0.9;
        d.circle(x, y, rr, Object.assign({ fill: '#ffffff' }, s));
        d.line(x - rr * 0.35, y - rr * 0.6, x - rr * 0.35, y + rr * 0.6, s); d.line(x + rr * 0.35, y - rr * 0.6, x + rr * 0.35, y + rr * 0.6, s);
        if (dev.wp) d.text(x + rr + 0.5 * ts, y + 0.8 * ts, 'WP', 1.7 * ts, { layer: 'ELEC' });
        break;
      }
      case 'acu': case 'range': case 'ref': case 'wh': case 'wm': {
        d.circle(x, y, r, Object.assign({ fill: '#ffffff' }, s));
        halfDisc(d, x, y, r, ts);
        const lab = { acu: 'ACU', range: 'R', ref: 'REF', wh: 'WH', wm: 'WM' }[dev.kind];
        d.text(x + r + 0.5 * ts, y - 0.4 * ts, lab, 1.8 * ts, { bold: true, layer: 'ELEC' });
        if (dev.kind === 'acu') d.text(x + r + 0.5 * ts, y + 1.8 * ts, dev.hp + 'HP', 1.5 * ts, { layer: 'ELEC' });
        break;
      }
    }
  };
  function panelSym(d, p, ts) {
    const a = 3.2 * ts, b = 1.1 * ts;
    const pts = p.o === 'h' ? [[p.x - a, p.y - b], [p.x + a, p.y - b], [p.x + a, p.y + b], [p.x - a, p.y + b]] : [[p.x - b, p.y - a], [p.x + b, p.y - a], [p.x + b, p.y + a], [p.x - b, p.y + a]];
    d.poly(pts, true, st(ts, LW.med, { fill: '#ffffff', layer: 'ELEC' }));
    d.poly([pts[0], pts[1], pts[2]], true, { fill: '#000000', stroke: 'none', layer: 'ELEC' });
    const ox = p.o === 'h' ? 0 : -p.k * 3.5 * ts, oy = p.o === 'h' ? p.k * 3.6 * ts : 0;
    d.text(p.x + ox, p.y + oy, 'LP', 2.2 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'ELEC' });
  }
  function meterSym(d, x, y, ts) {
    d.circle(x, y, 2 * ts, st(ts, LW.thin, { fill: '#ffffff', layer: 'ELEC' }));
    d.text(x, y, 'M', 2 * ts, { anchor: 'middle', v: 'middle', bold: true, layer: 'ELEC' });
    d.text(x, y + 4.2 * ts, 'kWh METER', 1.6 * ts, { anchor: 'middle', layer: 'ELEC' });
  }
  // curved wiring run between two points
  function wire(d, p, q, ts, dashed) {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) return;
    const bx = mx - dy / L * L * 0.12, by = my + dx / L * L * 0.12;
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; pts.push([a * p[0] + b * bx + c * q[0], a * p[1] + b * by + c * q[1]]); }
    d.poly(pts, false, st(ts, LW.thin, { layer: 'WIRING', stroke: '#1d4ed8', dash: dashed ? [1.5 * ts, 0.8 * ts] : null }));
  }
  function homerun(d, p, target, label, ts) {
    let dx = target ? target[0] - p[0] : -1, dy = target ? target[1] - p[1] : -1;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const a = [p[0] + dx * 2.6 * ts, p[1] + dy * 2.6 * ts], b = [a[0] + dx * 5 * ts, a[1] + dy * 5 * ts];
    const s = st(ts, LW.thin, { layer: 'WIRING', stroke: '#1d4ed8' });
    d.lineP(a, b, s);
    for (const sgn of [1, -1]) d.line(b[0], b[1], b[0] - dx * 1.2 * ts + sgn * dy * 0.7 * ts, b[1] - dy * 1.2 * ts - sgn * dx * 0.7 * ts, s);
    d.text(b[0] + dx * 1.5 * ts, b[1] + dy * 1.5 * ts, label, 1.7 * ts, { anchor: 'middle', v: 'middle', layer: 'WIRING', fill: '#1d4ed8' });
  }

  // wires the user drew: each device to the one it is fed from (dev.to = key, 'lp' = straight home run to the panel)
  function drawLinks(d, list, devs, pan, ts) {
    for (const v of devs) if (v.to && v.to !== 'lp' && !devs.some(q => q.key === v.to)) v.to = null; // its source is gone: wired automatically
    for (const v of list) {
      if (!v.to) continue;
      if (v.to === 'lp') { homerun(d, [v.x, v.y], pan, pan ? String(v.ckt) : v.ckt + ' TO LP', ts); continue; }
      const t = devs.find(q => q.key === v.to);
      if (t) wire(d, [t.x, t.y], [v.x, v.y], ts, t.kind === 'sw');
    }
  }
  AP.renderLighting = function (P, fi, o) {
    const ts = o.ts, d = AP.renderPlan(P, fi, { ts, base: 'E', sections: false });
    const E = AP.elecLayout(P), devs = E.F[fi] || [];
    const pan = E.panel && E.panel.fi === fi ? [E.panel.x, E.panel.y] : null;
    const fl = P.floors[fi];
    const isL = v => v.kind === 'light' || v.kind === 'ef' || v.kind === 'exit';
    drawLinks(d, devs.filter(isL), devs, pan, ts); // the connections the user made
    for (const r of fl.rooms) {
      const ls = devs.filter(v => v.room === r.id && (v.kind === 'light' || v.kind === 'ef') && !v.to);
      const sw = devs.find(v => v.room === r.id && v.kind === 'sw');
      // lights of the room wired together per circuit (a light moved to another circuit leaves this run); the switch leg to each
      const byC = new Map(); for (const v of ls) { if (!byC.has(v.ckt)) byC.set(v.ckt, []); byC.get(v.ckt).push(v); }
      for (const g of byC.values()) {
        if (sw) wire(d, [sw.x, sw.y], [g[0].x, g[0].y], ts, true);
        for (let i = 1; i < g.length; i++) wire(d, [g[i - 1].x, g[i - 1].y], [g[i].x, g[i].y], ts, false);
      }
    }
    // lights outside the house (no room): wired one to the next on their circuit, nearest first
    const outs = new Map(); for (const v of devs) if (isL(v) && !v.room && !v.to) { if (!outs.has(v.ckt)) outs.set(v.ckt, []); outs.get(v.ckt).push(v); }
    for (const g of outs.values()) {
      const left = g.slice(1), run = [g[0]];
      while (left.length) { const p = run[run.length - 1]; left.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); run.push(left.shift()); }
      for (let i = 1; i < run.length; i++) wire(d, [run[i - 1].x, run[i - 1].y], [run[i].x, run[i].y], ts, false);
    }
    for (const c of E.ckts.filter(c => c.devs.some(isL))) {
      const on = c.devs.filter(v => v.fi === fi && isL(v) && !v.to);
      const firsts = [];
      for (const v of on) if (!firsts.some(f => f.room === v.room)) firsts.push(v);
      for (let i = 1; i < firsts.length; i++) wire(d, [firsts[i - 1].x, firsts[i - 1].y], [firsts[i].x, firsts[i].y], ts, false);
      if (firsts.length) homerun(d, [firsts[0].x, firsts[0].y], pan, pan ? String(c.no) : c.no + ' TO LP', ts);
    }
    for (const v of devs) if (v.kind === 'light' || v.kind === 'ef' || v.kind === 'sw' || v.kind === 'exit') AP.elecSym(d, v, ts);
    if (pan) panelSym(d, E.panel, ts);
    return d;
  };
  AP.renderPower = function (P, fi, o) {
    const ts = o.ts, d = AP.renderPlan(P, fi, { ts, base: 'E', sections: false });
    const E = AP.elecLayout(P), devs = E.F[fi] || [];
    const pan = E.panel && E.panel.fi === fi ? [E.panel.x, E.panel.y] : null;
    const isL = v => v.kind === 'light' || v.kind === 'ef' || v.kind === 'exit' || v.kind === 'sw';
    drawLinks(d, devs.filter(v => !isL(v)), devs, pan, ts); // the connections the user made
    for (const c of E.ckts.filter(c => c.devs.some(v => !isL(v)))) {
      const on = c.devs.filter(v => v.fi === fi && !isL(v) && !v.to);
      for (let i = 1; i < on.length; i++) wire(d, [on[i - 1].x, on[i - 1].y], [on[i].x, on[i].y], ts, false);
      if (on.length) homerun(d, [on[0].x, on[0].y], pan, pan ? String(c.no) : c.no + ' TO LP', ts);
    }
    for (const v of devs) if (v.kind !== 'light' && v.kind !== 'ef' && v.kind !== 'sw' && v.kind !== 'exit') AP.elecSym(d, v, ts);
    if (pan) { panelSym(d, E.panel, ts); meterSym(d, E.panel.mx, E.panel.my, ts); d.lineP([E.panel.mx, E.panel.my], [E.panel.x, E.panel.y], st(ts, LW.med, { layer: 'WIRING', stroke: '#1d4ed8' })); }
    return d;
  };

  AP.renderLoadSchedule = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), E = AP.elecLayout(P);
    const rows = E.ckts.map(c => [c.no, c.desc.slice(0, 34), c.qty, c.va, 230, c.amps.toFixed(2), c.at + 'AT/' + (c.at <= 60 ? 60 : 100) + 'AF', c.wire + ', ' + c.conduit]);
    // same spares as the riser diagram: at least 2, an even number of circuits in all
    let nAll = E.ckts.length + 2; if (nAll % 2) nAll++;
    for (let i = E.ckts.length + 1; i <= nAll; i++) rows.push([i, 'SPARE', '', '', '', '', '20AT/60AF', '']);
    rows.push(['', 'TOTAL CONNECTED LOAD', '', Math.round(E.total), '', (E.total / 230).toFixed(2), '', '']);
    AP.table(d, 0, 0, [{ h: 'CKT', w: 10 }, { h: 'DESCRIPTION', w: 58 }, { h: 'QTY', w: 10 }, { h: 'VA', w: 14 }, { h: 'VOLTS', w: 12 }, { h: 'AMPS', w: 14 }, { h: 'AT / AF', w: 22 }, { h: 'WIRE & CONDUIT', w: 64 }], rows, ts, 'SCHEDULE OF LOADS - PANEL BOARD "LP"');
    let y = (rows.length + 1) * 6 * ts + 6.5 * ts;
    const L = [
      'LOAD COMPUTATION (PEC 2017, ART. 2.20 – STANDARD METHOD' + (P.info.type !== 'Commercial' ? ', DWELLING UNIT' : '') + '):',
      'TOTAL CONNECTED LOAD = ' + Math.round(E.total) + ' VA',
      ...E.calc,
      'TOTAL DEMAND LOAD = ' + Math.round(E.demand) + ' VA;  I = ' + Math.round(E.demand) + ' / 230 = ' + E.amps.toFixed(2) + ' A;  1.25 x I = ' + (E.amps * 1.25).toFixed(2) + ' A',
      'USE MAIN CIRCUIT BREAKER: ' + E.mainAT + 'AT / ' + (E.mainAT <= 100 ? 100 : 225) + 'AF, 2P, 230V',
      'MAIN FEEDER: 2-' + E.feeder + 'mm² THHN + 1-' + E.ground + 'mm² THHN (G) IN 32mmØ PVC CONDUIT'
    ];
    L.forEach((l, i) => { d.text(0, y, l, (i ? 1.9 : 2.2) * ts, { bold: i === 0 }); y += 2.65 * ts; });
    return d;
  };

  // riser diagram: service entrance -> kWh meter -> main breaker -> panel bus, branch breakers in two columns
  // (odd circuits on the left, even on the right) with spares, home-run bubbles and the circuit names
  AP.renderRiser = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), E = AP.elecLayout(P);
    const s = st(ts, LW.med, { layer: 'ELEC' }), sf = st(ts, LW.thin, { layer: 'ELEC' });
    const X = v => v * ts;
    const T = (x, y, t, h, op) => d.text(X(x), X(y), t, (h || 2.1) * ts, op || {});
    const L = (x1, y1, x2, y2, sty) => d.line(X(x1), X(y1), X(x2), X(y2), sty || s);
    const dot = (x, y) => d.circle(X(x), X(y), 0.45 * ts, { fill: '#9a9a9a', stroke: '#000000', w: LW.fine * ts, layer: 'ELEC' });
    const NAME = c => c.type === 'L' ? 'LIGHTING' : c.type === 'C' ? 'CONVENIENCE OUTLET'
      : c.desc.split(' - ')[0].replace('REFRIGERATOR', 'REF.').replace('WASHING MACHINE', 'WASHING MACH.').replace('RANGE / OVEN', 'RANGE');
    // circuits + spares: at least 2 spares, an even number in all
    const list = E.ckts.map(c => ({ no: c.no, at: c.at, name: NAME(c) }));
    let n = list.length + 2; if (n % 2) n++;
    for (let i = list.length; i < n; i++) list.push({ no: i + 1, at: null, name: 'SPARE' });
    const rows = n / 2, top = 8, y0 = top + 12, dy = 9, bot = y0 + (rows - 1) * dy + 6, hw = 11;
    // service entrance, meter
    ['POWER', 'SERVICE', 'ENTRANCE', '230V, 1\u00d8, 3W', '60HZ'].forEach((t, i) => T(-36, -14 + i * 2.6, t, 2.0));
    L(-26, -8.8, -18, -8.8, sf);
    d.poly([[X(-18), X(-10.3)], [X(-15.4), X(-8.8)], [X(-18), X(-7.3)]], true, Object.assign({ fill: '#ffffff' }, sf)); // service head
    L(-15.4, -8.8, -12, -8.8, sf);
    d.circle(X(-9), X(-8.8), 3 * ts, Object.assign({ fill: '#ffffff' }, s)); // kWh meter
    L(-6, -8.8, 0, -8.8); L(0, -8.8, 0, top + 3);
    // panel box, main breaker, bus
    d.rect(X(-hw), X(top), X(2 * hw), X(bot - top), st(ts, LW.thin, { layer: 'ELEC' }));
    dot(0, top + 3); dot(0, top + 7);
    d.arc(X(0.2), X(top + 5), 2 * ts, -Math.PI / 2, Math.PI / 2, sf);
    T(-1.2, top + 4.2, E.mainAT + 'A', 2.0, { anchor: 'end', bold: true });
    T(-1.2, top + 6.8, '2P, 230V', 2.0, { anchor: 'end', bold: true });
    L(0, top + 7, 0, bot + 1);
    // branch circuits
    for (let i = 0; i < n; i++) {
      const c = list[i], left = i % 2 === 0, sg = left ? -1 : 1, y = y0 + Math.floor(i / 2) * dy;
      dot(sg * 1.6, y); dot(sg * 5.6, y);
      L(0, y, sg * 1.6, y, sf);
      d.arc(X(sg * 3.6), X(y), 2 * ts, Math.PI, 2 * Math.PI, sf);
      L(sg * 5.6, y, sg * 15.5, y, sf);
      if (c.at) T(sg * 3.6, y + 3.2, c.at + 'AT', 1.9, { anchor: 'middle', bold: true });
      // home-run bubble with the circuit number, arrow pointing out
      const bx = sg * 18;
      d.poly([[X(bx + sg * 1.2), X(y - 2.9)], [X(bx + sg * 4.3), X(y)], [X(bx + sg * 1.2), X(y + 2.9)]], true, { fill: '#000000', stroke: 'none', layer: 'ELEC' });
      d.circle(X(bx), X(y), 2.5 * ts, Object.assign({ fill: '#ffffff' }, s));
      T(bx, y, String(c.no), 2.4, { anchor: 'middle', v: 'middle', bold: true });
      T(bx + sg * 5.4, y + 0.7, c.name, 1.9, { anchor: left ? 'end' : 'start', bold: true });
    }
    // ground
    const g = bot + 1;
    L(-2.4, g, 2.4, g, sf); L(-1.6, g + 1, 1.6, g + 1, sf); L(-0.8, g + 2, 0.8, g + 2, sf);
    d.poly([[X(-0.5), X(g + 2.7)], [X(0.5), X(g + 2.7)], [X(0), X(g + 3.6)]], false, sf);
    T(0, g + 7, 'MAIN FEEDER: 2-' + E.feeder + 'mm\u00b2 THHN + 1-' + E.ground + 'mm\u00b2 THHN (G) IN 32mm\u00d8 PVC', 1.8, { anchor: 'middle' });
    T(0, g + 9.8, 'GROUND ROD 16mm\u00d8 x 3.0m COPPER-CLAD, PANEL BOARD "LP" IN NEMA 1 ENCLOSURE', 1.8, { anchor: 'middle' });
    return d;
  };

  AP.renderElecLegend = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    const rows = [
      [{ kind: 'light' }, 'LED CEILING LIGHT, 18W'],
      [{ kind: 'ef' }, 'EXHAUST FAN, CEILING MOUNTED'],
      [{ kind: 'exit' }, 'EXIT SIGN, LED W/ BATTERY BACK-UP, OVER EXIT DOOR'],
      [{ kind: 'sw', gang: 1 }, 'SINGLE / 2-GANG SWITCH @ 1.40m ABOVE FFL'],
      [{ kind: 'co' }, 'DUPLEX CONVENIENCE OUTLET @ 0.30m ABOVE FFL'],
      [{ kind: 'co', wp: true }, 'WEATHERPROOF CONVENIENCE OUTLET'],
      [{ kind: 'acu', hp: 1 }, 'AIRCON OUTLET @ 2.10m ABOVE FFL'],
      [{ kind: 'range' }, 'RANGE / OVEN OUTLET'],
      [{ kind: 'ref' }, 'REFRIGERATOR OUTLET'],
      [{ kind: 'wh' }, 'WATER HEATER OUTLET @ 1.60m ABOVE FFL'],
      [{ kind: 'wm' }, 'WASHING MACHINE OUTLET']
    ];
    // light & outlet types used on the layouts besides the usual ones
    const used = AP.elecLayout(P).F.flat();
    for (const [k, t] of Object.entries(AP.LIGHT_TYPES)) if (k !== 'recessed' && used.some(v => v.kind === 'light' && v.lt === k)) rows.splice(1, 0, [{ kind: 'light', lt: k }, t.legend]);
    for (const [k, t] of Object.entries(AP.OUTLET_TYPES)) if (k !== 'duplex' && k !== 'wp' && used.some(v => v.kind === 'co' && v.ct === k)) rows.push([{ kind: 'co', ct: k }, t.legend]);
    rows[0][1] = AP.LIGHT_TYPES.recessed.legend;
    d.text(0, -4 * ts, 'LEGEND', 3.2 * ts, { bold: true });
    rows.forEach(([dev, t], i) => {
      const y = i * 7 * ts + 2 * ts;
      AP.elecSym(d, Object.assign({ x: 3 * ts, y }, dev), ts);
      d.text(16 * ts, y + 0.8 * ts, t, 2.1 * ts, {});
    });
    let y = rows.length * 7 * ts + 2 * ts;
    panelSym(d, { x: 3 * ts, y, o: 'h', k: -1 }, ts); d.text(16 * ts, y + 0.8 * ts, 'PANEL BOARD "LP" @ 1.60m ABOVE FFL', 2.1 * ts, {}); y += 8 * ts;
    meterSym(d, 3 * ts, y, ts); d.text(16 * ts, y + 0.8 * ts, 'kWh METER', 2.1 * ts, {}); y += 8 * ts;
    wire(d, [0, y], [6 * ts, y], ts, false); d.text(16 * ts, y + 0.8 * ts, 'WIRING IN CONDUIT (CEILING / WALL)', 2.1 * ts, {}); y += 6 * ts;
    homerun(d, [-2 * ts, y], [6 * ts, y], '1', ts); d.text(16 * ts, y + 0.8 * ts, 'HOME RUN TO PANEL, CIRCUIT NO.', 2.1 * ts, {});
    return d;
  };

  /* ======================= PLUMBING ======================= */
  // the user's changes to the plumbing (Details › Plumbing): P.plumbEd = { del: [key], move: {key: [x, y]},
  // add: [{id, fi, pipe: 'water'|'soil'|'waste'|'vent'|'storm', a, b, size} | {id, fi, mark: kind, p}], meter: [x, y], tank: [x0, y0] }
  const pKey = (fi, t, a, b) => fi + ':' + t + ':' + [a, b].map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).sort().join(';');
  const mKey = (fi, kind, p) => fi + ':m:' + kind + ':' + p[0].toFixed(2) + ',' + p[1].toFixed(2);
  AP.plumbLayout = function (P) {
    const E = P.plumbEd || {}, del = new Set(E.del || []), mv = E.move || {}, out = plumbAuto(P);
    out.floors.forEach((F, fi) => {
      for (const s of F.sewer) s.key = pKey(fi, 's', s.a, s.b);
      for (const s of F.water) s.key = pKey(fi, 'w', s.a, s.b);
      for (const m of F.marks) m.key = mKey(fi, m.kind, m.p);
      F.sewer = F.sewer.filter(s => !del.has(s.key)); F.water = F.water.filter(s => !del.has(s.key));
      F.marks = F.marks.filter(m => !del.has(m.key)).map(m => (mv[m.key] ? Object.assign({}, m, { p: mv[m.key], moved: true }) : m));
    });
    for (const s of out.storm) s.key = s.kind === 'line' ? pKey(0, 'st', s.a, s.b) : mKey(0, 'st' + s.kind, s.p);
    out.storm = out.storm.filter(s => !del.has(s.key)).map(s => (s.p && mv[s.key] ? Object.assign({}, s, { p: mv[s.key], moved: true }) : s));
    for (const a of E.add || []) {
      const F = out.floors[a.fi]; if (!F) continue;
      const key = 'u:' + a.id;
      if (a.pipe === 'water') F.water.push({ a: a.a, b: a.b, size: a.size || '', key, added: true });
      else if (a.pipe === 'storm') { if (a.fi === 0) out.storm.push({ kind: 'line', a: a.a, b: a.b, size: a.size || '', key, added: true }); }
      else if (a.pipe) F.sewer.push({ a: a.a, b: a.b, type: a.pipe, size: a.size || '', key, added: true });
      else if (a.mark === 'ds' || a.mark === 'scb') { if (a.fi === 0) out.storm.push({ kind: a.mark, p: a.p, key, added: true }); }
      else if (a.mark) F.marks.push({ kind: a.mark, p: a.p, label: a.mark === 'cb' ? 'CB' : a.mark === 'stack' ? 'SS' : undefined, key, added: true });
    }
    out.meterMoved = !!E.meter; out.tankMoved = !!E.tank;
    return out;
  };
  function plumbAuto(P) {
    const PE = P.plumbEd || {};
    const S = P.settings, com = P.info.type === 'Commercial';
    const bb = AP.floorBBox(P.floors[0]);
    const out = { floors: P.floors.map(() => ({ sewer: [], water: [], marks: [] })), fx: [], tank: null, storm: [] };
    if (!bb) return out;
    const t2 = S.extWall / 2;
    const B = { x0: bb.x0 - t2, y0: bb.y0 - t2, x1: bb.x1 + t2, y1: bb.y1 + t2 };
    const fx = [];
    P.floors.forEach((fl, fi) => fl.rooms.forEach(r => {
      for (const f of AP.allFixtures(fl, r, S)) {
        if (['wc', 'lav', 'shower', 'drain', 'sink', 'washer', 'tub'].indexOf(f.kind) < 0) continue;
        const L = AP.frame(r, f.side), cs = (f.s0 + f.s1) / 2;
        const dp = f.kind === 'drain' ? L(f.s0, f.n0) : f.kind === 'wc' ? L(cs, f.n0 + 0.28) : L(cs, (f.n0 + f.n1) / 2);
        const wp = f.kind === 'drain' ? null : L(cs, f.n0 + 0.04);
        const vp = L(cs, f.n0 - 0.02);
        fx.push({ fi, kind: f.kind, dp, wp, vp, room: r });
      }
    }));
    out.fx = fx;
    const wcs = fx.filter(f => f.kind === 'wc');
    const anyDrain = fx.length > 0;
    if (!anyDrain) return out;
    // septic tank outside the building wall closest to the toilets
    const ref = (wcs.length ? wcs : fx);
    const ax = ref.reduce((a, f) => a + f.dp[0], 0) / ref.length, ay = ref.reduce((a, f) => a + f.dp[1], 0) / ref.length;
    const dist = { N: ay - B.y0, S: B.y1 - ay, W: ax - B.x0, E: B.x1 - ax };
    const side = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0];
    const TL = com ? 3.6 : 3.0, TW = com ? 1.8 : 1.5, gap = 1.6;
    let tank;
    if (side === 'N' || side === 'S') {
      const x0 = clamp(ax - TL / 2, B.x0, Math.max(B.x0, B.x1 - TL));
      const y0 = side === 'S' ? B.y1 + gap : B.y0 - gap - TW;
      tank = { x0, y0, x1: x0 + TL, y1: y0 + TW, side };
    } else {
      const y0 = clamp(ay - TL / 2, B.y0, Math.max(B.y0, B.y1 - TL));
      const x0 = side === 'E' ? B.x1 + gap : B.x0 - gap - TW;
      tank = { x0, y0, x1: x0 + TW, y1: y0 + TL, side };
    }
    if (PE.tank) { const dx = PE.tank[0] - tank.x0, dy = PE.tank[1] - tank.y0; tank.x0 += dx; tank.x1 += dx; tank.y0 += dy; tank.y1 += dy; } // placed by the user
    const horiz = side === 'N' || side === 'S';
    // collector main runs parallel to the wall, 0.7 m outside it
    const colC = side === 'S' ? B.y1 + 0.7 : side === 'N' ? B.y0 - 0.7 : side === 'E' ? B.x1 + 0.7 : B.x0 - 0.7;
    const inlet = horiz ? [tank.x0 + 0.35, side === 'S' ? tank.y0 : tank.y1] : [side === 'E' ? tank.x0 : tank.x1, tank.y0 + 0.35];
    const inletOnCol = horiz ? [inlet[0], colC] : [colC, inlet[1]];
    tank.inlet = inlet;
    out.tank = tank;
    const toCol = p => (horiz ? [p[0], colC] : [colC, p[1]]);
    const along = p => (horiz ? p[0] : p[1]);
    const g0 = out.floors[0];
    let colMin = along(inletOnCol), colMax = along(inletOnCol);
    const seg = (arr, a, b, type, size) => arr.push({ a, b, type, size });
    // catch basin for kitchen & laundry waste, on the collector before the tank
    const cbAlong = along(inletOnCol) + (horiz ? (ax < inlet[0] ? -1.2 : 1.2) : (ay < inlet[1] ? -1.2 : 1.2));
    const cb = horiz ? [cbAlong, colC] : [colC, cbAlong];
    let needCB = false;
    // stacks: one per toilet room with a WC on upper floors
    const stacks = [];
    for (const f of fx) {
      const flo = out.floors[f.fi];
      const wcInRoom = fx.find(q => q.kind === 'wc' && q.room === f.room && q.fi === f.fi);
      if (f.kind === 'wc') {
        if (f.fi === 0) {
          const c = toCol(f.dp);
          seg(g0.sewer, f.dp, c, 'soil', '100mmØ');
          g0.marks.push({ kind: 'co', p: c });
          colMin = Math.min(colMin, along(c)); colMax = Math.max(colMax, along(c));
        } else {
          seg(flo.sewer, f.dp, f.dp, 'soil', '');
          stacks.push({ p: f.dp, fi: f.fi, kind: 'SS' });
        }
        flo.marks.push({ kind: 'vs', p: f.vp });
      } else if (wcInRoom) {
        seg(flo.sewer, f.dp, [wcInRoom.dp[0], f.dp[1]], 'waste', '50mmØ');
        seg(flo.sewer, [wcInRoom.dp[0], f.dp[1]], wcInRoom.dp, 'waste', '');
        if (f.kind === 'drain' || f.kind === 'shower') flo.marks.push({ kind: 'fd', p: f.dp });
      } else {
        if (f.fi === 0) {
          const c = toCol(f.dp);
          seg(g0.sewer, f.dp, c, 'waste', '50mmØ');
          colMin = Math.min(colMin, along(c)); colMax = Math.max(colMax, along(c));
          if (f.room.type === 'kitchen' || f.room.type === 'laundry') needCB = true;
        } else stacks.push({ p: f.dp, fi: f.fi, kind: 'WS' });
        if (f.kind === 'drain') flo.marks.push({ kind: 'fd', p: f.dp });
      }
    }
    // upper floor stacks drop to the ground floor and run to the collector
    const seenStack = new Set();
    for (const s of stacks) {
      const key = s.p.map(v => v.toFixed(2)).join(',');
      if (seenStack.has(key)) continue; seenStack.add(key);
      g0.marks.push({ kind: 'stack', p: s.p, label: s.kind });
      const c = toCol(s.p);
      seg(g0.sewer, s.p, c, s.kind === 'SS' ? 'soil' : 'waste', s.kind === 'SS' ? '100mmØ' : '75mmØ');
      g0.marks.push({ kind: 'co', p: c });
      colMin = Math.min(colMin, along(c)); colMax = Math.max(colMax, along(c));
      for (let fi = 1; fi <= s.fi; fi++) out.floors[fi].marks.push({ kind: 'stack', p: s.p, label: s.kind });
    }
    if (needCB) { colMin = Math.min(colMin, cbAlong); colMax = Math.max(colMax, cbAlong); g0.marks.push({ kind: 'cb', p: cb, label: 'CB / GREASE TRAP' }); }
    const cA = horiz ? [colMin, colC] : [colC, colMin], cB = horiz ? [colMax, colC] : [colC, colMax];
    seg(g0.sewer, cA, cB, 'soil', '100mmØ PVC');
    seg(g0.sewer, inletOnCol, inlet, 'soil', '');
    g0.marks.push({ kind: 'co', p: along(inletOnCol) === colMin ? cB : cA });
    // storm drainage: downspouts at the corners -> catch basins -> outfall at the front
    const R = AP.roofGeom(P);
    const ex = R && R.oh ? 0.25 : 0.1;
    const corners = [[B.x0 - ex, B.y0 - ex], [B.x1 + ex, B.y0 - ex], [B.x1 + ex, B.y1 + ex], [B.x0 - ex, B.y1 + ex]];
    const cbs = corners.map(c => [c[0] + (c[0] < B.x0 ? -0.6 : 0.6), c[1] + (c[1] < B.y0 ? -0.6 : 0.6)]);
    cbs.forEach((c, i) => { out.storm.push({ kind: 'ds', p: corners[i] }); out.storm.push({ kind: 'scb', p: c }); out.storm.push({ kind: 'line', a: corners[i], b: c }); });
    out.storm.push({ kind: 'line', a: cbs[0], b: cbs[3] }, { kind: 'line', a: cbs[1], b: cbs[2] }, { kind: 'line', a: cbs[3], b: cbs[2] });
    // outfall from the front corner farthest from the septic tank
    const om = tank && tank.side === 'S' && (tank.x0 + tank.x1) / 2 < (B.x0 + B.x1) / 2 ? cbs[2] : (tank && tank.side === 'S' ? cbs[3] : [(cbs[2][0] + cbs[3][0]) / 2, cbs[2][1]]);
    out.storm.push({ kind: 'line', a: om, b: [om[0], om[1] + 2.0] }, { kind: 'outfall', p: [om[0], om[1] + 2.0] });
    // water line: meter at the front, header along the front wall, branches to the fixtures
    const front = P.floors[0].openings.map(op => ({ op, R: AP.resolveOp(P.floors[0], op) })).find(e => e.R && e.op.tpl === 'D1');
    const exX = clamp(front ? front.R.s + front.R.w / 2 + 0.6 : (B.x0 + B.x1) / 2, B.x0 + 0.3, B.x1 - 0.3);
    const meter = PE.meter ? PE.meter.slice() : [exX, B.y1 + 2.6]; // the user may place the meter
    out.meter = meter; out.valve = [meter[0], meter[1] - 1.0];
    const hy = B.y1 - S.extWall - 0.08;
    const wsz = com ? '25mmØ' : '20mmØ';
    // the main runs OUTSIDE the house, 300 mm off the exterior walls, along the walls to the wet areas; each fixture
    // (and each riser to an upper floor) gets a short branch straight in through the nearest wall
    const ofs = S.extWall / 2 + 0.3, encl = P.floors[0].rooms.filter(r => !AP.isOpen(r));
    const ring = encl.length ? AP.gridOutline(AP.gridOfRects(encl.map(r => ({ x0: r.x - ofs, y0: r.y - ofs, x1: r.x + r.w + ofs, y1: r.y + r.l + ofs })))) : null;
    const targets = [], risers = [];
    for (const f of fx.filter(q => q.wp)) {
      if (f.fi === 0) { targets.push({ p: f.wp, size: '13mmØ' }); continue; }
      let rs = risers.find(r => r.room === f.room.id);
      if (!rs) {
        const wc = fx.find(q => q.room === f.room && q.kind === 'wc');
        const rp = wc ? [wc.vp[0] + 0.15, wc.vp[1] + 0.05] : f.wp;
        rs = { room: f.room.id, p: rp, fi: f.fi };
        risers.push(rs); targets.push({ p: rp, size: '20mmØ' });
        g0.marks.push({ kind: 'wr', p: rp });
        for (let k = 1; k <= f.fi; k++) out.floors[k].marks.push({ kind: 'wr', p: rp });
      }
      const flo = out.floors[f.fi];
      flo.water.push({ a: rs.p, b: [f.wp[0], rs.p[1]], size: '13mmØ' });
      flo.water.push({ a: [f.wp[0], rs.p[1]], b: f.wp, size: '' });
    }
    if (ring) {
      const n = ring.length, cum = [0];
      for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]));
      const Lt = cum[n];
      const proj = p => { // nearest point of the ring and its position along it
        let best = null;
        for (let i = 0; i < n; i++) {
          const A = ring[i], Bp = ring[(i + 1) % n], dx = Bp[0] - A[0], dy = Bp[1] - A[1], L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L2)), q = [A[0] + dx * t, A[1] + dy * t], dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (!best || dd < best.d - 1e-9) best = { d: dd, q, s: cum[i] + t * Math.sqrt(L2) };
        }
        return best;
      };
      const ptAt = s => { s = ((s % Lt) + Lt) % Lt; for (let i = 0; i < n; i++) if (s <= cum[i + 1] + 1e-9) { const A = ring[i], Bp = ring[(i + 1) % n], t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); return [A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t]; } return ring[0]; };
      const path = (s0, len, dir) => { // the ring from s0, len along it (dir +1 / -1), corner to corner
        const pts = [ptAt(s0)];
        const ks = []; for (let i = 0; i < n; i++) { const dd = dir > 0 ? ((cum[i] - s0) % Lt + Lt) % Lt : ((s0 - cum[i]) % Lt + Lt) % Lt; if (dd > 1e-6 && dd < len - 1e-6) ks.push([dd, ring[i]]); }
        ks.sort((p, q) => p[0] - q[0]); for (const k of ks) pts.push(k[1]);
        pts.push(ptAt(s0 + dir * len)); return pts;
      };
      const e0 = proj(meter);
      g0.water.push({ a: meter, b: e0.q, size: wsz + ' PPR' });
      const T = targets.map(t => { const pr = proj(t.p); g0.water.push({ a: pr.q, b: t.p, size: t.size }); const cw = ((pr.s - e0.s) % Lt + Lt) % Lt; return { cw, ccw: (Lt - cw) % Lt }; }).sort((p, q) => p.cw - q.cw);
      // around one way, the other way, or split – whichever needs the least pipe
      let best = null;
      for (let k = 0; k <= T.length; k++) {
        const a1 = k ? T[k - 1].cw : 0, b1 = Math.max(0, ...T.slice(k).map(t => t.ccw));
        if (!best || a1 + b1 < best.a + best.b - 1e-9) best = { a: a1, b: b1 };
      }
      let lbl = wsz + ' MAIN';
      for (const [len, dir] of [[best.a, 1], [best.b, -1]]) {
        if (len < 1e-6) continue;
        const pts = path(e0.s, len, dir);
        for (let i = 0; i + 1 < pts.length; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (L < 1e-6) continue; g0.water.push({ a: pts[i], b: pts[i + 1], size: L > 1.5 ? lbl : '' }); if (L > 1.5) lbl = ''; }
      }
    } else {
      g0.water.push({ a: meter, b: [exX, hy], size: wsz + ' PPR' });
      for (const t of targets) g0.water.push({ a: [exX, hy], b: t.p, size: t.size });
    }
    out.hy = hy; out.risers = risers;
    g0.marks.push({ kind: 'hb', p: [Math.min(exX + 0.9, B.x1 - 0.2), B.y1 + 0.15] });
    return out;
  }

  /* ---------- plumbing symbols ---------- */
  const PIPE = {
    soil: ts => st(ts, 0.6, { layer: 'SANITARY', stroke: '#7a3e00' }),
    waste: ts => st(ts, LW.med, { layer: 'SANITARY', stroke: '#7a3e00', dash: [2.2 * ts, 1 * ts] }),
    vent: ts => st(ts, LW.thin, { layer: 'SANITARY', stroke: '#7a3e00', dash: [0.6 * ts, 0.8 * ts] }),
    storm: ts => st(ts, LW.med, { layer: 'STORM', stroke: '#2b6a2b', dash: [4 * ts, 1 * ts, 1 * ts, 1 * ts] }),
    water: ts => st(ts, LW.med, { layer: 'WATER', stroke: '#0057b8' })
  };
  AP.PIPE = PIPE;
  function lab(d, a, b, txt, ts, color) {
    if (!txt) return;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.6) return;
    const vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    d.text(m[0] + (vert ? -0.8 * ts : 0), m[1] - (vert ? 0 : 0.8 * ts), txt, 1.6 * ts, { anchor: 'middle', rot: vert ? -90 : 0, fill: color, layer: 'TEXT' });
  }
  function pmark(d, m, ts) {
    const [x, y] = m.p, s = st(ts, LW.thin, { layer: 'SANITARY', fill: '#ffffff' });
    const T = (t, dx, dy) => d.text(x + (dx || 1.6 * ts), y + (dy || -1.2 * ts), t, 1.6 * ts, { bold: true, layer: 'TEXT' });
    switch (m.kind) {
      case 'co': d.circle(x, y, 1.1 * ts, s); d.circle(x, y, 0.4 * ts, { fill: '#000000', stroke: 'none' }); T('CO'); break;
      case 'vs': d.circle(x, y, 0.9 * ts, { fill: '#7a3e00', stroke: 'none' }); T('VS', 1.3 * ts, 2.2 * ts); break;
      case 'fd': d.circle(x, y, 1.2 * ts, s); d.line(x - 0.85 * ts, y - 0.85 * ts, x + 0.85 * ts, y + 0.85 * ts, s); d.line(x - 0.85 * ts, y + 0.85 * ts, x + 0.85 * ts, y - 0.85 * ts, s); T('FD'); break;
      case 'stack': d.circle(x, y, 1.4 * ts, st(ts, LW.med, { layer: 'SANITARY', fill: '#ffffff', stroke: '#7a3e00' })); d.circle(x, y, 0.6 * ts, { fill: '#7a3e00', stroke: 'none' }); T(m.label); break;
      case 'cb': d.rect(x - 0.3, y - 0.3, 0.6, 0.6, st(ts, LW.med, { layer: 'SANITARY', fill: '#ffffff' })); d.line(x - 0.3, y - 0.3, x + 0.3, y + 0.3, st(ts, LW.thin)); T(m.label, 0.4, -0.4); break;
      case 'wr': d.circle(x, y, 1.1 * ts, st(ts, LW.med, { layer: 'WATER', fill: '#ffffff', stroke: '#0057b8' })); T('WR', 1.4 * ts, 2.4 * ts); break;
      case 'hb': d.poly([[x - ts, y - ts], [x + ts, y + ts], [x + ts, y - ts], [x - ts, y + ts]], true, st(ts, LW.thin, { layer: 'WATER', stroke: '#0057b8' })); T('HB'); break;
    }
  }

  AP.renderSewer = function (P, fi, o) {
    const ts = o.ts, d = AP.renderPlan(P, fi, { ts, base: 'P', sections: false });
    const PL = AP.plumbLayout(P), F = PL.floors[fi];
    if (fi === 0) {
      for (const s of PL.storm) {
        if (s.kind === 'line') d.lineP(s.a, s.b, PIPE.storm(ts));
        if (s.kind === 'ds') { d.circle(s.p[0], s.p[1], 1.2 * ts, st(ts, LW.thin, { fill: '#ffffff', stroke: '#2b6a2b' })); d.text(s.p[0] + 1.5 * ts, s.p[1] - 1.2 * ts, 'DS', 1.6 * ts, { bold: true }); }
        if (s.kind === 'scb') d.rect(s.p[0] - 0.25, s.p[1] - 0.25, 0.5, 0.5, st(ts, LW.thin, { fill: '#ffffff', stroke: '#2b6a2b' }));
        if (s.kind === 'outfall') d.text(s.p[0], s.p[1] + 3 * ts, 'TO STREET DRAINAGE (STORM)', 1.8 * ts, { anchor: 'middle', bold: true });
      }
      const T = PL.tank;
      if (T) {
        d.rect2(T.x0, T.y0, T.x1, T.y1, st(ts, LW.med, { layer: 'SANITARY', fill: '#ffffff' }));
        const horiz = T.side === 'N' || T.side === 'S';
        const k = 0.66;
        if (horiz) d.line(T.x0 + (T.x1 - T.x0) * k, T.y0, T.x0 + (T.x1 - T.x0) * k, T.y1, st(ts, LW.thin));
        else d.line(T.x0, T.y0 + (T.y1 - T.y0) * k, T.x1, T.y0 + (T.y1 - T.y0) * k, st(ts, LW.thin));
        d.text((T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2, 'SEPTIC TANK', 2 * ts, { anchor: 'middle', v: 'middle', bold: true, rot: horiz ? 0 : -90 });
      }
    }
    for (const s of F.sewer) { d.lineP(s.a, s.b, PIPE[s.type](ts)); lab(d, s.a, s.b, s.size, ts, '#7a3e00'); }
    for (const m of F.marks) if (m.kind !== 'wr' && m.kind !== 'hb') pmark(d, m, ts);
    return d;
  };
  AP.renderWater = function (P, fi, o) {
    const ts = o.ts, d = AP.renderPlan(P, fi, { ts, base: 'P', sections: false });
    const PL = AP.plumbLayout(P), F = PL.floors[fi];
    for (const s of F.water) { d.lineP(s.a, s.b, PIPE.water(ts)); lab(d, s.a, s.b, s.size, ts, '#0057b8'); }
    for (const f of PL.fx) if (f.fi === fi && f.wp) d.circle(f.wp[0], f.wp[1], 0.5 * ts, { fill: '#0057b8', stroke: 'none' });
    if (fi === 0 && PL.meter) {
      const [x, y] = PL.meter;
      d.rect(x - 0.3, y - 0.18, 0.6, 0.36, st(ts, LW.med, { layer: 'WATER', fill: '#ffffff', stroke: '#0057b8' }));
      d.text(x, y, 'WM', 1.8 * ts, { anchor: 'middle', v: 'middle', bold: true });
      d.text(x + 0.45, y + 0.7 * ts, 'WATER METER (FROM WATER DISTRICT MAIN)', 1.7 * ts, {});
      const [vx, vy] = PL.valve;
      d.poly([[vx - 0.12, vy - 0.08], [vx + 0.12, vy + 0.08], [vx + 0.12, vy - 0.08], [vx - 0.12, vy + 0.08]], true, st(ts, LW.thin, { stroke: '#0057b8', fill: '#ffffff' }));
      d.text(vx + 0.25, vy + 0.6 * ts, 'GATE VALVE', 1.6 * ts, {});
    }
    for (const m of F.marks) if (m.kind === 'wr' || m.kind === 'hb') pmark(d, m, ts);
    return d;
  };

  /* ---------- isometric diagrams ---------- */
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const iso = (x, y, z) => [(x - y) * C30, (x + y) * S30 - z];
  AP.renderIsoSewer = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), PL = AP.plumbLayout(P), S = P.settings;
    const zf = fi => fi === 0 ? -0.35 : AP.levelZ(P, fi) - 0.30;
    const line = (a, za, b, zb, sty) => d.lineP(iso(a[0], a[1], za), iso(b[0], b[1], zb), sty);
    PL.floors.forEach((F, fi) => {
      for (const s of F.sewer) if (s.a !== s.b) line(s.a, zf(fi), s.b, zf(fi), PIPE[s.type](ts));
    });
    const R = AP.roofGeom(P), zRoof = R ? R.zTop + 0.6 : 3.6;
    const fx = PL.fx;
    for (const f of fx) {
      const z = zf(f.fi), fz = AP.levelZ(P, f.fi);
      line(f.dp, z, f.dp, fz, PIPE.waste(ts));
      const p = iso(f.dp[0], f.dp[1], fz);
      d.text(p[0] + 0.8 * ts, p[1] - 0.8 * ts, { wc: 'WC', lav: 'LAV', shower: 'SH', drain: 'FD', sink: 'KS', washer: 'WM', tub: 'LT' }[f.kind], 1.7 * ts, { bold: true });
      if (f.kind === 'wc') { line(f.vp, fz + 0.3, f.vp, zRoof, PIPE.vent(ts)); const q = iso(f.vp[0], f.vp[1], zRoof); d.text(q[0], q[1] - 1.2 * ts, 'VTR', 1.6 * ts, { anchor: 'middle' }); }
    }
    for (const m of PL.floors[0].marks) if (m.kind === 'stack') {
      const top = Math.max(...fx.filter(f => Math.abs(f.dp[0] - m.p[0]) < 1e-6 && Math.abs(f.dp[1] - m.p[1]) < 1e-6).map(f => zf(f.fi)), zf(1));
      line(m.p, zf(0), m.p, top, PIPE.soil(ts));
    }
    if (PL.tank) {
      const T = PL.tank, z0 = -0.35, z1 = -1.5;
      const c = [[T.x0, T.y0], [T.x1, T.y0], [T.x1, T.y1], [T.x0, T.y1]];
      const s = st(ts, LW.med);
      for (const z of [z0, z1]) d.poly(c.map(p => iso(p[0], p[1], z)), true, s);
      for (const p of c) line(p, z0, p, z1, s);
      const m = iso((T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2, z1);
      d.text(m[0], m[1] + 3 * ts, 'SEPTIC TANK', 2 * ts, { anchor: 'middle', bold: true });
    }
    return d;
  };
  AP.renderIsoWater = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), PL = AP.plumbLayout(P), S = P.settings;
    const zf = fi => AP.levelZ(P, fi) + 0.3;
    const sty = PIPE.water(ts);
    const line = (a, za, b, zb) => d.lineP(iso(a[0], a[1], za), iso(b[0], b[1], zb), sty);
    PL.floors.forEach((F, fi) => { for (const s of F.water) line(s.a, fi === 0 && s === F.water[0] ? 0 : zf(fi), s.b, zf(fi)); });
    for (const r of PL.risers || []) line(r.p, zf(0), r.p, zf(r.fi));
    const H = { wc: 0.2, lav: 0.55, shower: 1.1, sink: 0.6, washer: 0.9, tub: 0.6 };
    for (const f of PL.fx) if (f.wp) {
      const fz = AP.levelZ(P, f.fi);
      line(f.wp, zf(f.fi), f.wp, fz + (H[f.kind] || 0.5));
      const p = iso(f.wp[0], f.wp[1], fz + (H[f.kind] || 0.5));
      d.text(p[0] + 0.8 * ts, p[1] - 0.8 * ts, { wc: 'WC', lav: 'LAV', shower: 'SH', sink: 'KS', washer: 'WM', tub: 'LT' }[f.kind] || '', 1.7 * ts, { bold: true });
    }
    if (PL.meter) { const p = iso(PL.meter[0], PL.meter[1], 0); d.text(p[0], p[1] + 3 * ts, 'FROM WATER METER', 1.8 * ts, { anchor: 'middle', bold: true }); }
    return d;
  };

  /* ---------- isometric views of the waterline / sewer line layout: the floor plan laid flat in isometric, pipes on top ---------- */
  // projected angle (degrees, y-down) of a plan direction, kept readable (never upside down)
  const isoAng = (ux, uy) => {
    const p = iso(ux, uy, 0); let a = Math.atan2(p[1], p[0]) * 180 / Math.PI, flip = false;
    if (a > 90.5) { a -= 180; flip = true; } else if (a < -89.5) { a += 180; flip = true; }
    return { a, flip };
  };
  // copy a plan drawing onto the ground plane in light grey
  function isoBase(src, d, ts) {
    const G = s => {
      const n = Object.assign({}, s);
      if (n.stroke !== 'none') n.stroke = '#9c9c9c';
      if (n.fill && n.fill !== 'none' && n.fill !== '#ffffff') n.fill = '#e9e9e9';
      if (n.w) n.w = Math.min(n.w * 0.7, 0.35 * ts);
      return n;
    };
    const P2 = (x, y) => iso(x, y, 0);
    for (const it of src.items) {
      switch (it.t) {
        case 'line': d.lineP(P2(it.x1, it.y1), P2(it.x2, it.y2), G(it.s)); break;
        case 'poly': d.poly(it.pts.map(p => P2(p[0], p[1])), it.closed, G(it.s)); break;
        case 'circle': case 'arc': {
          const a0 = it.t === 'arc' ? it.a0 : 0, a1 = it.t === 'arc' ? it.a1 : 2 * Math.PI, n = 24, pts = [];
          for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(P2(it.cx + it.r * Math.cos(a), it.cy + it.r * Math.sin(a))); }
          d.poly(pts, it.t === 'circle', G(it.s)); break;
        }
        case 'text': {
          const r = it.rot * Math.PI / 180, A = isoAng(Math.cos(r), Math.sin(r)), p = P2(it.x, it.y);
          const anchor = A.flip && it.anchor !== 'middle' ? (it.anchor === 'end' ? 'start' : 'end') : it.anchor;
          d.add(Object.assign({}, it, { x: p[0], y: p[1], rot: A.a, anchor, fill: '#7a7a7a' }));
          break;
        }
      }
    }
  }
  // a pipe with its size written along it
  function isoPipe(d, a, za, b, zb, sty, txt, ts) {
    const p = iso(a[0], a[1], za), q = iso(b[0], b[1], zb);
    d.lineP(p, q, sty);
    if (!txt || Math.hypot(b[0] - a[0], b[1] - a[1], zb - za) < 0.9) return;
    const vert = Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6;
    let ang = vert ? -90 : Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
    if (ang > 90.5) ang -= 180; else if (ang < -89.5) ang += 180;
    const r = ang * Math.PI / 180, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    d.text(m[0] + Math.sin(r) * 0.7 * ts, m[1] - Math.cos(r) * 0.7 * ts, txt, 1.6 * ts, { anchor: 'middle', rot: ang, bold: true, layer: 'TEXT' });
  }
  const FXN = { wc: 'WC', lav: 'LAV', shower: 'SH', drain: 'FD', sink: 'KS', washer: 'WM', tub: 'LT' };
  function isoPlanBase(P, fi, ts) {
    const src = AP.renderPlan(P, fi, { ts, base: 'P', sections: false });
    for (const f of P.floors[fi].furniture || []) AP.drawFurniture(src, f, ts, false);
    const d = new AP.Drawing();
    isoBase(src, d, ts);
    return d;
  }
  const heavy = (ts, sty) => Object.assign({}, sty, { stroke: '#000000', w: Math.max(sty.w || 0, 0.45 * ts) });
  const isoMark = (d, m, z, ts) => { const p = iso(m.p[0], m.p[1], z); pmark(d, Object.assign({}, m, { p }), ts); };

  AP.renderIsoWaterPlan = function (P, fi, o) {
    const ts = o.ts, S = P.settings, PL = AP.plumbLayout(P), F = PL.floors[fi], d = isoPlanBase(P, fi, ts);
    const sty = heavy(ts, PIPE.water(ts)), zp = 0.0;
    for (const s of F.water) isoPipe(d, s.a, zp, s.b, zp, sty, s.size ? s.size + ' PIPE' : '', ts);
    // risers up to each fixture, tagged
    const H = { wc: 0.2, lav: 0.55, shower: 1.1, sink: 0.6, washer: 0.9, tub: 0.6 };
    for (const f of PL.fx) if (f.fi === fi && f.wp) {
      const h = H[f.kind] || 0.5;
      isoPipe(d, f.wp, zp, f.wp, h, sty, '', ts);
      const q = iso(f.wp[0], f.wp[1], h);
      d.circle(q[0], q[1], 0.35 * ts, { fill: '#000000', stroke: 'none' });
      d.text(q[0] + 0.8 * ts, q[1] - 0.6 * ts, FXN[f.kind] || '', 1.6 * ts, { bold: true });
    }
    // water risers between floors
    for (const r of PL.risers || []) if (fi <= r.fi) {
      const up = fi < r.fi, z1 = up ? 1.6 : -1.0;
      isoPipe(d, r.p, zp, r.p, z1, sty, '', ts);
      const q = iso(r.p[0], r.p[1], z1);
      d.text(q[0] + 0.8 * ts, q[1] + (up ? 0 : 2 * ts), up ? '20mmØ RISER UP' : '20mmØ RISER FROM BELOW', 1.5 * ts, { bold: true });
    }
    if (fi === 0 && PL.meter) {
      const p = iso(PL.meter[0], PL.meter[1], 0);
      d.rect(p[0] - 0.3, p[1] - 0.18, 0.6, 0.36, st(ts, LW.med, { layer: 'WATER', fill: '#ffffff' }));
      d.text(p[0], p[1], 'WM', 1.7 * ts, { anchor: 'middle', v: 'middle', bold: true });
      d.text(p[0], p[1] + 0.18 + 2.4 * ts, 'FROM WATER DISTRICT MAIN', 1.6 * ts, { anchor: 'middle', bold: true });
      const v = iso(PL.valve[0], PL.valve[1], 0);
      d.poly([[v[0] - 0.12, v[1] - 0.08], [v[0] + 0.12, v[1] + 0.08], [v[0] + 0.12, v[1] - 0.08], [v[0] - 0.12, v[1] + 0.08]], true, st(ts, LW.thin, { fill: '#ffffff' }));
      d.text(v[0] + 0.25, v[1], 'GV', 1.6 * ts, { bold: true });
    }
    for (const m of F.marks) if (m.kind === 'hb') isoMark(d, m, 0, ts);
    return d;
  };

  AP.renderIsoSewerPlan = function (P, fi, o) {
    const ts = o.ts, S = P.settings, PL = AP.plumbLayout(P), F = PL.floors[fi], d = isoPlanBase(P, fi, ts);
    void S;
    if (fi === 0) {
      const ss = heavy(ts, PIPE.storm(ts));
      for (const s of PL.storm) {
        if (s.kind === 'line') isoPipe(d, s.a, 0, s.b, 0, Object.assign({}, ss, { w: 0.3 * ts }), '', ts);
        if (s.kind === 'ds') { const p = iso(s.p[0], s.p[1], 0); d.circle(p[0], p[1], 0.9 * ts, st(ts, LW.thin, { fill: '#ffffff' })); d.text(p[0] + 1.2 * ts, p[1] - 0.8 * ts, 'DS', 1.5 * ts, { bold: true }); }
        if (s.kind === 'scb') { const c = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]]; d.poly(c.map(q => iso(s.p[0] + q[0], s.p[1] + q[1], 0)), true, st(ts, LW.thin, { fill: '#ffffff' })); }
        if (s.kind === 'outfall') { const p = iso(s.p[0], s.p[1], 0); d.text(p[0], p[1] + 2.6 * ts, 'TO STREET DRAINAGE (STORM)', 1.6 * ts, { anchor: 'middle', bold: true }); }
      }
      const T = PL.tank;
      if (T) {
        const c = [[T.x0, T.y0], [T.x1, T.y0], [T.x1, T.y1], [T.x0, T.y1]], s = st(ts, LW.med, { fill: '#ffffff' }), zb = -1.2;
        d.poly(c.map(p => iso(p[0], p[1], zb)), true, st(ts, LW.thin, { dash: [1 * ts, 0.7 * ts] }));
        for (const p of c) d.lineP(iso(p[0], p[1], 0), iso(p[0], p[1], zb), st(ts, LW.thin, { dash: [1 * ts, 0.7 * ts] }));
        d.poly(c.map(p => iso(p[0], p[1], 0)), true, s);
        const k = 0.66, horiz = T.side === 'N' || T.side === 'S';
        const a = horiz ? [T.x0 + (T.x1 - T.x0) * k, T.y0] : [T.x0, T.y0 + (T.y1 - T.y0) * k], b = horiz ? [a[0], T.y1] : [T.x1, a[1]];
        d.lineP(iso(a[0], a[1], 0), iso(b[0], b[1], 0), st(ts, LW.thin));
        const m = iso((T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2, 0);
        d.text(m[0], m[1], 'SEPTIC TANK', 1.8 * ts, { anchor: 'middle', v: 'middle', bold: true, rot: isoAng(horiz ? 1 : 0, horiz ? 0 : 1).a });
      }
    }
    for (const s of F.sewer) if (s.a !== s.b) isoPipe(d, s.a, 0, s.b, 0, heavy(ts, PIPE[s.type](ts)), s.size ? s.size + ' PIPE' : '', ts);
    // fixture drops and vent stacks
    for (const f of PL.fx) if (f.fi === fi) {
      const q = iso(f.dp[0], f.dp[1], 0);
      d.text(q[0] + 0.8 * ts, q[1] + 2.2 * ts, FXN[f.kind] || '', 1.5 * ts, { bold: true });
      if (f.kind === 'wc') {
        isoPipe(d, f.vp, 0, f.vp, 1.8, heavy(ts, PIPE.vent(ts)), '', ts);
        const v = iso(f.vp[0], f.vp[1], 1.8);
        d.text(v[0], v[1] - 0.8 * ts, '50mmØ VENT THRU ROOF', 1.5 * ts, { anchor: 'middle', bold: true });
      }
    }
    for (const m of F.marks) if (m.kind === 'stack') {
      const up = fi === 0, z1 = up ? 1.8 : -1.0;
      isoPipe(d, m.p, 0, m.p, z1, heavy(ts, PIPE.soil(ts)), '', ts);
      const q = iso(m.p[0], m.p[1], z1);
      d.text(q[0] + 0.8 * ts, q[1], up ? m.label + ' UP TO FLOOR ABOVE' : m.label + ' DOWN', 1.5 * ts, { bold: true });
    }
    for (const m of F.marks) if (m.kind !== 'wr' && m.kind !== 'hb' && m.kind !== 'vs' && m.kind !== 'stack') isoMark(d, m, 0, ts);
    return d;
  };

  /* ---------- standard details ---------- */
  AP.renderSepticDetail = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), com = P.info.type === 'Commercial';
    const L = com ? 3.3 : 2.7, W = com ? 1.5 : 1.2, D = 1.5, t = 0.15;
    const s = st(ts, LW.med), sf = st(ts, LW.thin), cut = { fill: '#9a9a9a', stroke: '#000000', w: LW.thin * ts };
    // plan
    d.rect(-t, -t, L + 2 * t, W + 2 * t, cut); d.rect(0, 0, L, W, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts });
    const k = L * 2 / 3;
    d.rect(k, 0, 0.10, W, cut);
    d.text(k / 2, W / 2, 'DIGESTION CHAMBER', 1.8 * ts, { anchor: 'middle', v: 'middle' });
    d.text(k + (L - k) / 2 + 0.05, W / 2, 'LEACHING', 1.8 * ts, { anchor: 'middle', v: 'middle' });
    AP.dimChain(d, [-t, k, L + t], -t - 5 * ts, 'h', ts);
    AP.dimChain(d, [-t, W + t], -t - 5 * ts, 'v', ts);
    d.text(L / 2, W + t + 5 * ts, 'PLAN', 2.4 * ts, { anchor: 'middle', bold: true });
    // section
    const y0 = W + 1.6;
    d.line(-0.6, y0, L + 0.6, y0, st(ts, LW.thick));
    d.rect(-t, y0 - 0.1, L + 2 * t, 0.1, cut);
    d.rect(-t, y0, t, D, cut); d.rect(L, y0, t, D, cut); d.rect(-t, y0 + D, L + 2 * t, 0.1, cut);
    d.rect(k, y0 + 0.25, 0.10, D - 0.25, cut);
    for (let x = k + 0.15; x < L - 0.05; x += 0.15) for (let y = y0 + D - 0.35; y < y0 + D - 0.02; y += 0.12) d.circle(x, y, 0.035, sf);
    d.line(-0.6, y0 + 0.35, 0.15, y0 + 0.35, st(ts, LW.med, { stroke: '#7a3e00' })); d.line(0.15, y0 + 0.2, 0.15, y0 + 0.65, st(ts, LW.med, { stroke: '#7a3e00' }));
    d.line(0, y0 + D * 0.55, k, y0 + D * 0.55, st(ts, LW.fine, { dash: [1 * ts, 0.7 * ts] }));
    AP.dimChain(d, [y0, y0 + D], L + t + 5 * ts, 'v', ts);
    d.text(-0.6, y0 + 0.35 - 1 * ts, '100mmØ INLET', 1.7 * ts, {});
    d.text(k + 0.1, y0 + D - 0.45, 'GRAVEL', 1.6 * ts, {});
    d.text(L / 2, y0 + D + 0.1 + 5 * ts, 'SECTION', 2.4 * ts, { anchor: 'middle', bold: true });
    d.text(0, y0 + D + 0.1 + 9 * ts, '150mm CHB WALLS, ALL CELLS FILLED; 100mm THK. R.C. COVER W/ 600x600 MANHOLES', 1.8 * ts, {});
    return d;
  };
  AP.renderSmallDetails = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    // the designer's own details (plumbdet.js): catch basin over the water meter | floor drain | clean-out, bottoms in line
    if (AP.PLUMB_DET && AP.drawPlumbDet) {
      const k = ts / 100, g = 700, S = key => AP.plumbDetSize(key);
      const cb = S('cb'), wm = S('wm'), fd = S('fd'), co = S('co');
      const c1 = Math.max(cb.w, wm.w), H = Math.max(cb.h + g + wm.h, fd.h, co.h);
      AP.drawPlumbDet(d, 'cb', (c1 - cb.w) / 2 * k, 0, k, ts);
      AP.drawPlumbDet(d, 'wm', (c1 - wm.w) / 2 * k, (H - wm.h) * k, k, ts);
      AP.drawPlumbDet(d, 'fd', (c1 + g) * k, (H - fd.h) * k, k, ts);
      AP.drawPlumbDet(d, 'co', (c1 + g + fd.w + g) * k, (H - co.h) * k, k, ts);
      return d;
    }
    const cut = { fill: '#9a9a9a', stroke: '#000000', w: LW.thin * ts }, s = st(ts, LW.med);
    // catch basin section
    d.line(-0.4, 0, 1.0, 0, st(ts, LW.thick));
    d.rect(0, 0, 0.1, 0.7, cut); d.rect(0.6, 0, 0.1, 0.7, cut); d.rect(0, 0.7, 0.7, 0.1, cut);
    d.rect(0.08, -0.04, 0.54, 0.04, st(ts, LW.thin, { fill: '#ffffff' }));
    for (let x = 0.12; x < 0.6; x += 0.06) d.line(x, -0.04, x, 0, st(ts, LW.fine));
    d.line(0.7, 0.35, 1.1, 0.35, st(ts, LW.med, { stroke: '#7a3e00' }));
    AP.dimChain(d, [0, 0.7], 0.8 + 5 * ts, 'h', ts);
    d.text(0.35, 0.8 + 11 * ts, 'CATCH BASIN DETAIL', 2.4 * ts, { anchor: 'middle', bold: true });
    d.text(0.35, 0.8 + 14.5 * ts, '600x600 CHB, CAST IRON GRATING', 1.7 * ts, { anchor: 'middle' });
    // floor drain section
    const ox = 2.0;
    d.rect(ox, 0, 1.2, 0.10, cut);
    d.rect(ox, -0.03, 1.2, 0.03, st(ts, LW.thin, { fill: '#e6f2f4' }));
    d.rect(ox + 0.5, -0.03, 0.2, 0.03, { fill: '#ffffff', stroke: '#000000', w: LW.thin * ts });
    d.poly([[ox + 0.55, 0.1], [ox + 0.55, 0.30], [ox + 0.65, 0.38], [ox + 0.75, 0.30], [ox + 0.75, 0.22]], false, st(ts, LW.med, { stroke: '#7a3e00' }));
    d.line(ox + 0.65, 0.0, ox + 0.65, 0.12, s);
    d.line(ox + 0.75, 0.22, ox + 1.1, 0.22, st(ts, LW.med, { stroke: '#7a3e00' }));
    d.text(ox + 0.6, 0.6, 'FLOOR DRAIN DETAIL', 2.4 * ts, { anchor: 'middle', bold: true });
    d.text(ox + 0.6, 0.6 + 3.5 * ts, '100mmØ S.S. FLOOR DRAIN W/ 50mmØ P-TRAP', 1.7 * ts, { anchor: 'middle' });
    // cleanout
    const cx = 4.2;
    d.line(cx - 0.3, 0, cx + 0.9, 0, st(ts, LW.thick));
    d.poly([[cx, 0.5], [cx + 0.25, 0.5], [cx + 0.25, -0.02]], false, st(ts, 0.6, { stroke: '#7a3e00' }));
    d.line(cx + 0.25, 0.5, cx + 0.8, 0.5, st(ts, 0.6, { stroke: '#7a3e00' }));
    d.rect(cx + 0.17, -0.06, 0.16, 0.06, st(ts, LW.thin, { fill: '#ffffff' }));
    d.text(cx + 0.3, 0.9, 'CLEANOUT DETAIL', 2.4 * ts, { anchor: 'middle', bold: true });
    d.text(cx + 0.3, 0.9 + 3.5 * ts, 'C.O. PLUG FLUSH W/ FINISH', 1.7 * ts, { anchor: 'middle' });
    return d;
  };

  // SPECIFICATIONS (plumbing) and the CERTIFICATION on the artesian well distance, with the master plumber's signature line
  AP.renderPlumbSpecs = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), W = 92 * ts, th = 2.3 * ts, lh = 3.5 * ts;
    const head = (y, t) => { // a boxed, letter-spaced heading
      const sp = t.split('').join(' '), tw = AP.textWidth(sp, 3.2 * ts, true) + 6 * ts;
      d.rect(W / 2 - tw / 2, y - 4.6 * ts, tw, 6.4 * ts, { w: 0.5 * ts, fill: 'none' });
      d.rect(W / 2 - tw / 2 - 0.8 * ts, y - 5.4 * ts, tw + 1.6 * ts, 8 * ts, { w: 0.2 * ts, fill: 'none' });
      d.text(W / 2, y, sp, 3.2 * ts, { anchor: 'middle', bold: true });
    };
    const wrap = (t, n) => { const w = t.split(' '), L = ['']; for (const x of w) { if ((L[L.length - 1] + ' ' + x).trim().length > n && L[L.length - 1]) L.push(x); else L[L.length - 1] = (L[L.length - 1] + ' ' + x).trim(); } return L; };
    let y = 6 * ts;
    head(y, 'SPECIFICATIONS'); y += 10 * ts;
    const specs = ['ALL PLUMBING INSTALLATION SHALL CONFORM TO THE LOCAL AND NATIONAL PLUMBING CODE OF THE PHILIPPINES.',
      'ALL SOIL AND WASTE PIPE SHALL BE SCH. 40 PVC PIPE. JOINTS AND FITTINGS SHALL BE PROPERLY APPLIED WITH PVC SOLVENT CEMENT AND SET TO ITS APPROVED SLOPE.',
      'ALL G.I. PIPES AND CONNECTIONS SHALL BE PROPERLY APPLIED WITH TEFLON OR TAPE BEFORE TIGHTENING.',
      'ALL PLUMBING INSTALLATION SHALL BE DONE UNDER THE DIRECT SUPERVISION OF A DULY LICENSED MASTER PLUMBER.'];
    specs.forEach((t, i) => {
      wrap(t, 58).forEach((l, j) => d.text(j ? 6 * ts : 0, y + j * lh, j ? l : (i + 1) + '.  ' + l, th, {}));
      y += wrap(t, 58).length * lh + 2.2 * ts;
    });
    y += 6 * ts;
    head(y, 'CERTIFICATION'); y += 10 * ts;
    wrap('IT HAS BEEN VERIFIED THAT THERE IS NO EXISTING ARTESIAN WELL WITHIN THE RADIUS OF TWENTY FIVE (25.00) METERS FROM THE PROPOSED SEPTIC TANK.', 56)
      .forEach((l, j) => { d.text(W / 2, y, l, th, { anchor: 'middle' }); y += lh; });
    y += 9 * ts;
    d.text(0, y, 'APPROVED BY:', th, {});
    d.line(22 * ts, y + 0.4 * ts, W, y + 0.4 * ts, { w: 0.25 * ts });
    if (P.info.plumber) d.text((22 * ts + W) / 2, y - 1 * ts, String(P.info.plumber).toUpperCase(), th, { anchor: 'middle', bold: true });
    d.text((22 * ts + W) / 2, y + 4 * ts, 'LICENSED MASTER PLUMBER', th, { anchor: 'middle' });
    return d;
  };
  AP.renderPlumbLegend = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    d.text(0, -4 * ts, 'LEGEND', 3.2 * ts, { bold: true });
    const rows = [
      ['soil', 'SOIL PIPE, 100mmØ PVC (S-1000)'], ['waste', 'WASTE PIPE, 50mmØ PVC'], ['vent', 'VENT PIPE, 50mmØ PVC'],
      ['storm', 'STORM DRAIN, 100mmØ PVC'], ['water', 'COLD WATER LINE, PPR PN20']
    ];
    rows.forEach(([k, t], i) => { const y = i * 6 * ts; d.line(0, y, 10 * ts, y, PIPE[k](ts)); d.text(14 * ts, y + 0.8 * ts, t, 2.1 * ts, {}); });
    let y = rows.length * 6 * ts + 2 * ts;
    const marks = [['co', 'CLEANOUT'], ['fd', 'FLOOR DRAIN'], ['vs', 'VENT STACK'], ['stack', 'SOIL / WASTE STACK (SS / WS)'], ['wr', 'WATER RISER'], ['hb', 'HOSE BIBB']];
    for (const [k, t] of marks) { pmark(d, { kind: k, p: [3 * ts, y], label: k === 'stack' ? 'SS' : '' }, ts); d.text(14 * ts, y + 0.8 * ts, t, 2.1 * ts, {}); y += 6 * ts; }
    y += 3 * ts;
    const N = [
      'PLUMBING NOTES:',
      '1. ALL WORKS SHALL CONFORM TO THE REVISED NATIONAL PLUMBING CODE OF THE PHILIPPINES.',
      '2. SANITARY & STORM PIPES: PVC S-1000; MINIMUM SLOPE 2% (50-75mm), 1% (100mm).',
      '3. WATER LINES: PPR PN20, PRESSURE TESTED AT 1.5 x WORKING PRESSURE BEFORE CONCEALING.',
      '4. PROVIDE CLEANOUTS AT EVERY CHANGE OF DIRECTION AND AT THE END OF HORIZONTAL RUNS.',
      '5. VENT THROUGH ROOF (VTR) MIN. 150mm ABOVE ROOF; WATER CLOSET: FLUSH TANK TYPE.',
      '6. SEPTIC TANK LOCATION SHALL BE AT LEAST 1.50m FROM THE BUILDING AND 25m FROM ANY WELL.',
      'NOTE: PRELIMINARY LAYOUT - TO BE CHECKED AND SIGNED BY A REGISTERED MASTER PLUMBER.'
    ];
    N.forEach((l, i) => { d.text(0, y, l, (i ? 1.9 : 2.3) * ts, { bold: i === 0 }); y += 3.4 * ts; });
    return d;
  };

  AP.renderElecNotes = function (P, o) {
    const ts = o.ts, d = new AP.Drawing();
    const N = [
      'GENERAL ELECTRICAL NOTES',
      '',
      '1. ALL WORKS SHALL CONFORM TO THE PHILIPPINE ELECTRICAL CODE (PEC) 2017 AND LOCAL UTILITY REQUIREMENTS.',
      '2. SERVICE: 230V, SINGLE PHASE, 3-WIRE (2 LINES + GROUND), 60Hz FROM THE LOCAL DISTRIBUTION UTILITY.',
      '3. ALL WIRES SHALL BE COPPER, THHN/THWN-2, 600V. MINIMUM SIZE 3.5mm² FOR BRANCH CIRCUITS.',
      '4. ALL WIRING SHALL BE INSTALLED IN PVC CONDUIT, MINIMUM 20mmØ, CONCEALED IN WALLS/SLAB/CEILING.',
      '5. MOUNTING HEIGHTS ABOVE FFL: SWITCHES 1.40m, CONVENIENCE OUTLETS 0.30m (KITCHEN 1.10m),',
      '   AIRCON OUTLETS 2.10m, PANEL BOARD 1.60m TO CENTER.',
      '6. ALL CONVENIENCE OUTLETS SHALL BE GROUNDING TYPE. TOILET & OUTDOOR OUTLETS SHALL BE GFCI/WEATHERPROOF.',
      '7. THE SYSTEM SHALL BE GROUNDED BY A 16mmØ x 3.0m COPPER-CLAD GROUND ROD; RESISTANCE NOT MORE THAN 25 OHMS.',
      '8. CIRCUIT NUMBERS AT HOME RUNS REFER TO THE SCHEDULE OF LOADS.',
      '',
      'NOTE: PRELIMINARY DESIGN GENERATED BY ARKIPLAN - TO BE CHECKED, COMPUTED AND SIGNED',
      'BY A PROFESSIONAL ELECTRICAL ENGINEER (PEE) BEFORE PERMIT SUBMISSION.'
    ];
    let y = 0;
    N.forEach((l, i) => { d.text(0, y, l, (i === 0 ? 3.2 : 2.1) * ts, { bold: i === 0 }); y += (i === 0 ? 6 : 3.6) * ts; });
    return d;
  };
})(window.AP);
