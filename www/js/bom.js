/* ArkiPlan – BILL OF MATERIALS & COST ESTIMATE, taken off the model with standard Philippine estimating factors
 * (concrete mixes, CHB per m², mortar & plaster, rebar in 6.0 m lengths …), priced from a 2026 price list the user can
 * change (Settings › Material prices → P.bomPrices), + 40 % labor (P.settings.laborPct).  Quantities are estimates for a
 * permit / budget – to be checked by the engineer or quantity surveyor. */
window.AP = window.AP || {};
(function (AP) {
  'use strict';

  // unit prices, PHP (Philippine market, 2026): national / Metro Manila averages from DTI-PSA based lists, AEDO 2026
  // cost guide, Philcon Prices Q1 2026 and supplier lists; "est." = typical budget price where no 2026 list was found
  AP.BOM_PRICES = {
    cement: ['Portland cement, 40 kg', 'bag', 285], sand: ['Washed sand', 'cu.m.', 1250], gravel: ['Crushed gravel 3/4"', 'cu.m.', 1550],
    fill: ['Gravel bedding / sub-base (est.)', 'cu.m.', 950],
    rb10: ['Deformed bar 10mm x 6.0m, Gr. 40', 'pc', 185], rb12: ['Deformed bar 12mm x 6.0m, Gr. 40', 'pc', 265], rb16: ['Deformed bar 16mm x 6.0m, Gr. 40', 'pc', 460],
    tie: ['G.I. tie wire #16', 'kg', 90],
    ply: ['Marine plywood 1/2" x 4\' x 8\'', 'sheet', 950], lumber: ['Coco lumber (form frames)', 'bd.ft.', 45], nails: ['Common wire nails (assorted)', 'kg', 95],
    chb4: ['CHB 4" (100mm)', 'pc', 18], chb6: ['CHB 6" (150mm)', 'pc', 26],
    ls: ['Pre-painted long span roofing 0.4mm (rib type)', 'sq.m.', 560], ridge: ['Ridge roll / hip roll, pre-painted', 'l.m.', 300],
    gutter: ['Pre-painted G.I. gutter 150mm (est.)', 'l.m.', 450], ds: ['uPVC downspout 75mm x 3.0m (est.)', 'pc', 450],
    fascia: ['Fiber cement fascia board 12mm (est.)', 'l.m.', 160], tek: ['Tekscrew w/ rubber washer', 'pc', 4],
    purlin: ['C-purlin 2" x 4" x 1.2mm x 6.0m', 'pc', 600], truss: ['Steel C-channel for trusses 75x50 x 6.0m', 'pc', 750],
    rod: ['Welding rod E6013', 'kg', 160], abolt: ['Anchor bolt 16mm x 300mm w/ nut', 'pc', 45],
    fcb: ['Fiber cement board 4.5mm x 4\' x 8\'', 'sheet', 500], pvcc: ['PVC ceiling panel (est.)', 'sq.m.', 420],
    furring: ['Metal furring 12 x 38 x 5.0m (est.)', 'pc', 120], carry: ['Carrying channel 5.0m (est.)', 'pc', 160], wangle: ['Wall angle 5.0m (est.)', 'pc', 90],
    t600: ['Floor tiles 600x600 (est.)', 'sq.m.', 550], t300: ['Floor tiles 300x300 non-skid (est.)', 'sq.m.', 400], t400: ['Floor tiles 400x400 (est.)', 'sq.m.', 450],
    twall: ['Wall tiles 300x600 (est.)', 'sq.m.', 500], adh: ['Tile adhesive 25 kg (est.)', 'bag', 280], grout: ['Tile grout 2 kg (est.)', 'pack', 120],
    paint: ['Latex / acrylic paint', 'gal', 650], primer: ['Masonry neutralizer / primer (est.)', 'gal', 600],
    D1: ['Wood panel door w/ jamb & lockset (est.)', 'set', 9000], D2: ['Flush door w/ jamb & lockset (est.)', 'set', 5000], D3: ['PVC door w/ jamb & lockset (est.)', 'set', 3800],
    D4: ['Double panel door w/ jamb & lockset (est.)', 'set', 15000], D5: ['Aluminum sliding glass door (est.)', 'set', 18000], D6: ['Steel roll-up door (est.)', 'set', 35000], D7: ['Steel fire exit door w/ panic bar (est.)', 'set', 12000],
    wslide: ['Aluminum sliding window (est.)', 'sq.m.', 4500], wcase: ['Aluminum casement window (est.)', 'sq.m.', 5000], wawn: ['Aluminum awning window (est.)', 'sq.m.', 5000],
    wfix: ['Aluminum fixed glass window (est.)', 'sq.m.', 4000], wjal: ['Jalousie window (est.)', 'sq.m.', 3500], wstore: ['Storefront glass, tempered (est.)', 'sq.m.', 6500],
    w35: ['THHN wire 3.5mm²', 'l.m.', 40], w55: ['THHN wire 5.5mm²', 'l.m.', 60], w80: ['THHN wire 8.0mm² (est.)', 'l.m.', 95], w14: ['THHN wire 14mm² (est.)', 'l.m.', 160],
    w22: ['THHN wire 22mm² (est.)', 'l.m.', 260], w30: ['THHN wire 30mm² (est.)', 'l.m.', 350],
    c20: ['PVC conduit 20mm x 3.0m (est.)', 'pc', 80], c25: ['PVC conduit 25mm x 3.0m (est.)', 'pc', 110], c32: ['PVC conduit 32mm x 3.0m (est.)', 'pc', 150],
    ubox: ['Utility box w/ cover (est.)', 'pc', 30], jbox: ['Junction box, octagonal (est.)', 'pc', 30],
    co: ['Duplex convenience outlet w/ plate (est.)', 'pc', 150], sw1: ['Switch, 1-gang w/ plate (est.)', 'pc', 110], sw2: ['Switch, 2-gang w/ plate (est.)', 'pc', 150], sw3: ['Switch, 3-gang w/ plate (est.)', 'pc', 190],
    lrec: ['LED recessed downlight 18W (est.)', 'pc', 350], lsurf: ['LED surface ceiling light 24W (est.)', 'pc', 650], lother: ['Light fixture, other types (est.)', 'pc', 450],
    ef: ['Exhaust fan, ceiling mounted (est.)', 'pc', 1500], exit: ['Exit sign / emergency light (est.)', 'pc', 1800], spo: ['Special purpose outlet (aircon / range) (est.)', 'pc', 300],
    panel: ['Panel board w/ enclosure (est.)', 'set', 3500], brk: ['Branch circuit breaker 20–30A, 1P (est.)', 'pc', 450], mcb: ['Main circuit breaker 2P (est.)', 'pc', 2200],
    grod: ['Ground rod 16mm x 3.0m w/ clamp (est.)', 'set', 900],
    p100: ['uPVC sanitary pipe 100mm x 3.0m (S-1000)', 'pc', 1300], p75: ['uPVC sanitary pipe 75mm x 3.0m (est.)', 'pc', 900], p50: ['uPVC sanitary pipe 50mm x 3.0m', 'pc', 500],
    ppr20: ['PPR pipe 20mm (1/2") x 4.0m', 'pc', 265], ppr25: ['PPR pipe 25mm (3/4") x 4.0m (est.)', 'pc', 420],
    wc: ['Water closet, flush tank type, complete (est.)', 'set', 6500], lav: ['Lavatory w/ faucet & fittings (est.)', 'set', 3200], sink: ['Kitchen sink, stainless w/ faucet (est.)', 'set', 3800],
    shower: ['Shower set (est.)', 'set', 1800], fd: ['Floor drain 100mm, stainless (est.)', 'pc', 350], cop: ['Cleanout plug (est.)', 'pc', 250], hb: ['Hose bibb / faucet (est.)', 'pc', 350],
    gv: ['Gate valve 20mm (est.)', 'pc', 500], cbx: ['Catch basin, CHB w/ cover (est.)', 'pc', 1800],
    // earthworks: labor / subcontract rates (no labor % added on top)
    excav: ['Excavation, manual (labor) (est.)', 'cu.m.', 450], backfill: ['Backfill & compaction, manual (labor) (est.)', 'cu.m.', 300],
    poison: ['Soil poisoning / termite treatment (est.)', 'sq.m.', 90]
  };
  const LABOR_ONLY = { excav: 1, backfill: 1, poison: 1 };
  // the price list by division (Material prices dialog)
  AP.BOM_GROUPS = [
    ['EARTHWORKS', 'excav backfill poison fill'], ['CONCRETE & MASONRY', 'cement sand gravel chb4 chb6'],
    ['REINFORCING STEEL', 'rb10 rb12 rb16 tie'], ['FORMWORKS', 'ply lumber nails'],
    ['ROOFING & ROOF FRAMING', 'ls ridge gutter ds fascia tek purlin truss rod abolt'], ['CEILING', 'fcb pvcc furring carry wangle'],
    ['TILES', 't600 t400 t300 twall adh grout'], ['PAINTING', 'primer paint'],
    ['DOORS & WINDOWS', 'D1 D2 D3 D4 D5 D6 D7 wslide wcase wawn wfix wjal wstore'],
    ['ELECTRICAL', 'w35 w55 w80 w14 w22 w30 c20 c25 c32 ubox jbox co sw1 sw2 sw3 lrec lsurf lother ef exit spo panel brk mcb grod'],
    ['PLUMBING & SANITARY', 'p100 p75 p50 ppr25 ppr20 wc lav sink shower fd cop hb gv cbx']
  ].map(([name, keys]) => [name, keys.split(' ')]);
  const PR = (P, k) => { const o = (P.bomPrices || {})[k]; return o != null && o !== '' ? +o : AP.BOM_PRICES[k][2]; };

  // concrete per cu.m. (40 kg bags / cu.m. sand / cu.m. gravel): Class A 1:2:4, Class B 1:2.5:5
  const MIX = { A: [9.0, 0.5, 1.0], B: [7.5, 0.5, 1.0] };
  const KGM = { 10: 0.617, 12: 0.888, 16: 1.578 };
  const pieces6 = m => Math.ceil(m * 1.07 / 6.0); // 6.0 m lengths, 7 % laps & waste

  // o.simple: template 2 (the earlier one – no earthworks, no contingency / overhead / VAT); default from Settings
  AP.bom = function (P, o) {
    const S = P.settings, secs = [], R2 = v => Math.round(v * 100) / 100;
    const simple = o && o.simple != null ? o.simple : S.bomTemplate === 'simple';
    const sec = plain => { const s = { plain, name: plain, items: [] }; secs.push(s); return s; };
    const add = (s, key, qty, note) => { if (!(qty > 0)) return; const d = AP.BOM_PRICES[key], q = d[1] === 'cu.m.' || d[1] === 'sq.m.' || d[1] === 'l.m.' || d[1] === 'kg' ? R2(qty) : Math.ceil(qty - 1e-9); s.items.push({ key, desc: d[0] + (note ? ' – ' + note : ''), qty: q, unit: d[1], price: PR(P, key), amt: q * PR(P, key), lab: !!LABOR_ONLY[key] }); };
    const floors = P.floors.filter(f => f.rooms.length);
    if (!floors.length) return { secs, mat: 0, labor: 0, direct: 0, cont: 0, ocm: 0, vat: 0, total: 0, simple };
    const htOf = f => f.ht || S.floorHt, tot = floors.reduce((a, f) => a + htOf(f), 0);
    const C = AP.columns(P), B = AP.allBeams(P);
    let conc = { A: 0, B: 0 }, form = 0, steel = { 10: 0, 12: 0, 16: 0 };
    // --- footings
    for (const ft of C.ftypes) {
      conc.A += ft.size * ft.size * ft.t * ft.n; form += 4 * ft.size * ft.t * ft.n;
      const nb = Math.floor(ft.size / 0.15) + 1; steel[12] += nb * 2 * (ft.size - 0.15 + 0.2) * ft.n;
    }
    const tf = C.ftypes.length ? C.ftypes.reduce((a, f) => a + f.t * f.n, 0) / C.ftypes.reduce((a, f) => a + f.n, 0) : 0.25;
    const bed = C.ftypes.reduce((a, f) => a + f.size * f.size * 0.05 * f.n, 0);
    // --- columns, from the top of the footing to the roof beam
    const hc = Math.max(1, S.footDepth - tf + S.plinth + tot);
    for (const ct of C.ctypes) {
      const d = ct.d || ct.size, nb = +(String(ct.bars).match(/^(\d+)/) || [0, 4])[1];
      conc.A += ct.size * d * hc * ct.n; form += 2 * (ct.size + d) * hc * ct.n;
      steel[16] += nb * (hc + 0.6) * ct.n;
      steel[10] += Math.ceil(hc / 0.15) * (2 * (ct.size + d) - 0.32 + 0.2) * ct.n;
    }
    // --- beams (tie beams, floor beams, roof beams)
    for (const t of B.types) {
      conc.A += t.len * t.w * t.h; form += t.len * (2 * t.h + t.w);
      steel[16] += t.len * ((t.top || 2) + (t.bot || 2)) * 1.1;
      steel[10] += Math.ceil(t.len / 0.18) * (2 * (t.w + t.h) - 0.32 + 0.2);
    }
    // --- slabs: on grade (ground floor, 100mm, gravel bed 100mm) and suspended (upper floors, flat roof decks)
    const area = f => f.rooms.reduce((a, r) => a + r.w * r.l, 0);
    const a0 = area(P.floors[0]); conc.B += a0 * 0.10; steel[10] += a0 * 5;
    const fillSlab = a0 * 0.10;
    let susp = 0; for (let i = 1; i < P.floors.length; i++) susp += area(P.floors[i]);
    for (const R of AP.roofs(P)) if (R.type === 'flat') susp += R.poly ? Math.abs(polyArea(R.poly)) : (R.X1 - R.X0) * (R.Y1 - R.Y0);
    conc.A += susp * S.slab; form += susp; steel[12] += susp * 10; steel[10] += susp * 10;
    // --- walls: CHB 6" outside, 4" inside, floor to beam; below the floor down to the wall footing; wall footings
    let chb4 = 0, chb6 = 0, plaster = 0, wfLen = 0;
    P.floors.forEach((f, fi) => {
      if (!f.rooms.length) return;
      const W = AP.computeWalls(f, S).filter(w => w.t > 0), hw = htOf(f) - S.beamDepth;
      let ops = 0; for (const o of f.openings || []) ops += (o.w || 0.9) * (o.h || 2.1);
      let a6 = 0, a4 = 0;
      for (const w of W) { const L = Math.abs(w.b - w.a), a = L * hw; if (w.t >= 0.13) a6 += a; else a4 += a; if (fi === 0) wfLen += L; }
      const tot2 = a6 + a4 || 1; a6 -= ops * a6 / tot2; a4 -= ops * a4 / tot2;
      if (fi === 0) { const below = S.plinth + 0.5; for (const w of W) { const L = Math.abs(w.b - w.a); if (w.t >= 0.13) a6 += L * below; else a4 += L * below; } }
      chb6 += Math.max(0, a6); chb4 += Math.max(0, a4); plaster += 2 * (Math.max(0, a6) + Math.max(0, a4));
    });
    conc.A += wfLen * 0.6 * 0.25; steel[12] += wfLen * 3; steel[10] += wfLen / 0.4 * 0.5;
    steel[10] += (chb4 + chb6) * 2.92; // vertical bars @ 0.80 m, horizontal every 3rd course
    // --- septic tank (6" CHB walls 1.5 m deep, bottom & cover slabs)
    const PL = AP.plumbLayout(P), T = PL.tank;
    if (T) {
      const L = T.x1 - T.x0, Wd = T.y1 - T.y0, dp = 1.5;
      chb6 += (2 * (L + Wd) + Math.min(L, Wd)) * dp; plaster += 2 * (2 * (L + Wd)) * dp;
      conc.A += L * Wd * 0.1 * 2; steel[10] += L * Wd * 10 * 2;
    }
    // ===== earthworks (template 1): excavation with 0.30 m working space, backfill, soil poisoning, gravel bedding
    const sEw = simple ? null : sec('EARTHWORKS');
    if (sEw) {
      let exc = 0, solid = 0;
      for (const ft of C.ftypes) { exc += (ft.size + 0.6) ** 2 * S.footDepth * ft.n; solid += ft.size * ft.size * ft.t * ft.n; }
      for (const ct of C.ctypes) solid += ct.size * (ct.d || ct.size) * Math.max(0, S.footDepth - tf) * ct.n;
      exc += wfLen * 0.9 * 0.8; solid += wfLen * 0.6 * 0.25 + wfLen * 0.15 * 0.55;
      let texc = 0, tsol = 0;
      if (T) { const L = T.x1 - T.x0, Wd = T.y1 - T.y0; texc = (L + 0.6) * (Wd + 0.6) * 1.7; tsol = (L + 0.3) * (Wd + 0.3) * 1.7; }
      add(sEw, 'excav', exc + texc, 'footings, wall footings' + (T ? ' & septic tank' : ''));
      add(sEw, 'backfill', Math.max(0, exc - solid) + Math.max(0, texc - tsol));
      add(sEw, 'poison', area(P.floors[0]), 'under the slab on grade');
      add(sEw, 'fill', bed + fillSlab, 'under footings & slab on grade');
    }
    // ===== A. concrete
    const sA = sec('CONCRETE WORKS'), cm = conc.A * MIX.A[0] + conc.B * MIX.B[0];
    add(sA, 'cement', cm * 1.05, R2(conc.A) + ' cu.m. Class A + ' + R2(conc.B) + ' cu.m. Class B');
    add(sA, 'sand', (conc.A * MIX.A[1] + conc.B * MIX.B[1]) * 1.05);
    add(sA, 'gravel', (conc.A * MIX.A[2] + conc.B * MIX.B[2]) * 1.05);
    if (!sEw) add(sA, 'fill', bed + fillSlab, 'under footings & slab on grade');
    // ===== B. masonry
    const sM = sec('MASONRY WORKS');
    add(sM, 'chb6', chb6 * 12.5 * 1.05, R2(chb6) + ' sq.m.'); add(sM, 'chb4', chb4 * 12.5 * 1.05, R2(chb4) + ' sq.m.');
    add(sM, 'cement', chb6 * 1.018 + chb4 * 0.522 + plaster * 0.2, 'mortar, cell filling & 16mm plaster');
    add(sM, 'sand', chb6 * 0.0844 + chb4 * 0.0435 + plaster * 0.016);
    // ===== C. reinforcing steel
    const sR = sec('REINFORCING STEEL');
    add(sR, 'rb16', pieces6(steel[16])); add(sR, 'rb12', pieces6(steel[12])); add(sR, 'rb10', pieces6(steel[10]));
    add(sR, 'tie', (steel[10] * KGM[10] + steel[12] * KGM[12] + steel[16] * KGM[16]) * 0.025);
    // ===== D. formworks (3 uses)
    const sF = sec('FORMWORKS & SCAFFOLDING');
    add(sF, 'ply', form / 2.97 / 3 * 1.1, R2(form) + ' sq.m. of forms, 3 uses'); add(sF, 'lumber', form * 2.0); add(sF, 'nails', form * 0.12);
    // ===== E. roofing & roof framing
    const sRf = sec('ROOFING & ROOF FRAMING');
    let slope = 0, ridge = 0, eave = 0, purl = 0, trussLm = 0, nTr = 0, nDs = 0;
    for (const R of AP.roofs(P)) {
      if (R.type === 'flat') continue;
      const pa = R.poly ? Math.abs(polyArea(R.poly)) : (R.X1 - R.X0) * (R.Y1 - R.Y0);
      slope += pa * Math.sqrt(1 + (R.box ? 0.05 : R.pitch) ** 2);
      const F = AP.roofFraming(P, R);
      for (const s of F.ridge) ridge += Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
      for (const m of F.half) if (m.kind === 'hip') ridge += Math.hypot(m.q[0] - m.p[0], m.q[1] - m.p[1]) * 1.05;
      for (const s of F.purl) purl += Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
      const ev = AP.roofEaves(R); for (const e of ev) eave += Math.hypot(e.p1[0] - e.p0[0], e.p1[1] - e.p0[1]);
      nDs += Math.max(2, Math.round(ev.length / 2));
    }
    const kinds = (AP.renderRoofFraming(P, { ts: 0.1 }).trussKinds) || {};
    for (const e of AP.trussDetails(P)) {
      const q = kinds[e.mark]; if (!q) continue;
      const G = AP.trussGeom(e.T, e.span, e.pitch, e.half, e.cap), N = G.nodes;
      let lm = 0; for (const [i, j, k] of G.members) lm += Math.hypot(N[j][0] - N[i][0], N[j][1] - N[i][1]) * (k === 'top' || k === 'bot' ? 2 : 1);
      lm += 2 * (e.oh || 0) * 2;
      trussLm += lm * q.n; nTr += q.n;
    }
    add(sRf, 'ls', slope * 1.08, R2(slope) + ' sq.m. roof area'); add(sRf, 'ridge', ridge * 1.05); add(sRf, 'tek', slope * 6);
    if (S.gutters !== false) { add(sRf, 'gutter', eave * 1.05); add(sRf, 'ds', nDs * 1.5); }
    add(sRf, 'fascia', eave * 1.05);
    add(sRf, 'purlin', pieces6(purl)); add(sRf, 'truss', pieces6(trussLm), nTr + ' trusses');
    add(sRf, 'rod', trussLm * 0.03); add(sRf, 'abolt', nTr * 4);
    // ===== F. ceiling
    const sC = sec('CEILING WORKS');
    let cFcb = 0, cPvc = 0, cPer = 0;
    for (const f of P.floors) for (const r of f.rooms) if (!AP.isOpen(r) && AP.hasCeiling(r)) { const a = r.w * r.l; if (/PVC/.test(AP.roomFinish(r).ceiling || '')) cPvc += a; else cFcb += a; cPer += 2 * (r.w + r.l); }
    add(sC, 'fcb', cFcb / 2.976 * 1.08, R2(cFcb) + ' sq.m.'); add(sC, 'pvcc', cPvc * 1.08);
    add(sC, 'furring', (cFcb + cPvc) * 2.6 / 5 * 1.05); add(sC, 'carry', (cFcb + cPvc) / 5 * 1.05); add(sC, 'wangle', cPer / 5 * 1.05);
    // ===== G. tile works
    const sT = sec('TILE WORKS');
    const tl = { t600: 0, t300: 0, t400: 0, twall: 0 };
    let tiled = 0;
    P.floors.forEach(f => f.rooms.forEach(r => {
      const F2 = AP.roomFinish(r), fl = F2.floor || '', a = r.w * r.l;
      if (/TILE/.test(fl)) { const k = /600/.test(fl) ? 't600' : /400/.test(fl) ? 't400' : 't300'; tl[k] += a; }
      if (F2.tileHt > 0 && /TILE/.test(F2.wall || '')) { const wa = 2 * (r.w + r.l) * F2.tileHt - 0.8 * F2.tileHt; tl.twall += wa; tiled += wa; }
    }));
    for (const k of ['t600', 't400', 't300', 'twall']) add(sT, k, tl[k] * 1.08);
    const tAll = tl.t600 + tl.t400 + tl.t300 + tl.twall;
    add(sT, 'adh', tAll / 4); add(sT, 'grout', tAll / 8);
    // ===== H. painting
    const sP = sec('PAINTING WORKS'), pa2 = Math.max(0, plaster - tiled) + cFcb;
    add(sP, 'primer', pa2 / 35, R2(pa2) + ' sq.m., 1 coat'); add(sP, 'paint', pa2 * 2 / 30, '2 coats');
    // ===== I. doors & windows
    const sD = sec('DOORS & WINDOWS'), OM = AP.opMarks(P);
    const WK = { sliding: 'wslide', casement: 'wcase', awning: 'wawn', fixed: 'wfix', jalousie: 'wjal' };
    for (const t of OM.types) {
      if (t.kind === 'door') add(sD, AP.BOM_PRICES[t.tpl] ? t.tpl : 'D2', t.n, t.mark + ' ' + AP.mm(t.w) + 'x' + AP.mm(t.h));
      else { const st = (AP.tplOf(t) || {}).style, k = t.tpl === 'W6' ? 'wstore' : WK[st] || 'wslide'; add(sD, k, t.w * t.h * t.n, t.mark + ' ' + AP.mm(t.w) + 'x' + AP.mm(t.h) + ' x ' + t.n); }
    }
    // ===== J. electrical
    const sE = sec('ELECTRICAL WORKS'), E = AP.elecLayout(P), devs = E.F.flat();
    const cnt = k => devs.filter(d => d.kind === k).length, wire = {}, cond = { c20: 0, c25: 0 };
    const pnl = E.panel || { x: 0, y: 0 };
    for (const c of E.ckts) {
      // a chain from the panel through the circuit's devices, nearest next (walls & ceiling, right-angle runs), drops to boxes
      let at = [pnl.x, pnl.y], left = c.devs.slice(), run = 0;
      while (left.length) { left.sort((p, q) => (Math.abs(p.x - at[0]) + Math.abs(p.y - at[1])) - (Math.abs(q.x - at[0]) + Math.abs(q.y - at[1]))); const d = left.shift(); run += Math.abs(d.x - at[0]) + Math.abs(d.y - at[1]) + (/light|ef|exit/.test(d.kind) ? 0.3 : 2.4); at = [d.x, d.y]; }
      run += 3; // up to the ceiling & down into the panel
      const m = String(c.wire).match(/(\d+)-(\d+(?:\.\d+)?)mm/), sz = m ? m[2] : '3.5', nc = (m ? +m[1] : 2) + (/G/.test(c.wire) ? 1 : 0);
      wire[sz] = (wire[sz] || 0) + run * nc * 1.1;
      if (parseFloat(sz) >= 14) cond.c25 += run; else cond.c20 += run;
    }
    const WKEY = { '3.5': 'w35', '5.5': 'w55', '8.0': 'w80', '8': 'w80', '14': 'w14', '22': 'w22', '30': 'w30' };
    for (const [sz, m] of Object.entries(wire)) add(sE, WKEY[sz] || 'w35', m, 'branch circuits');
    const feederM = 12;
    add(sE, WKEY[E.feeder] || 'w22', feederM * 2, 'main feeder'); add(sE, WKEY[E.ground] || 'w55', feederM, 'equipment ground');
    add(sE, 'c20', cond.c20 * 1.1 / 3); add(sE, 'c25', cond.c25 * 1.1 / 3); add(sE, 'c32', feederM / 3);
    const nLt = cnt('light'), nCo = cnt('co') + cnt('ref'), nSw = devs.filter(d => d.kind === 'sw');
    add(sE, 'lrec', devs.filter(d => d.kind === 'light' && (d.lt || 'recessed') === 'recessed').length);
    add(sE, 'lsurf', devs.filter(d => d.kind === 'light' && d.lt === 'ceiling').length);
    add(sE, 'lother', devs.filter(d => d.kind === 'light' && d.lt && d.lt !== 'recessed' && d.lt !== 'ceiling').length);
    add(sE, 'ef', cnt('ef')); add(sE, 'exit', cnt('exit'));
    add(sE, 'co', nCo); add(sE, 'spo', cnt('acu') + cnt('range') + cnt('wh') + cnt('wm'));
    add(sE, 'sw1', nSw.filter(d => (d.gang || 1) === 1).length); add(sE, 'sw2', nSw.filter(d => d.gang === 2).length); add(sE, 'sw3', nSw.filter(d => d.gang === 3).length);
    add(sE, 'jbox', nLt + cnt('ef') + cnt('exit')); add(sE, 'ubox', nCo + nSw.length + cnt('acu') + cnt('range') + cnt('wh') + cnt('wm'));
    let nAll = E.ckts.length + 2; if (nAll % 2) nAll++;
    add(sE, 'panel', 1, nAll + ' circuits'); add(sE, 'brk', E.ckts.length, 'plus ' + (nAll - E.ckts.length) + ' spares'); add(sE, 'mcb', 1, E.mainAT + 'AT'); add(sE, 'grod', 1);
    // ===== K. plumbing & sanitary
    const sPl = sec('PLUMBING & SANITARY WORKS'), pipe = { p100: 0, p75: 0, p50: 0, ppr20: 0, ppr25: 0 };
    const segL = s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    PL.floors.forEach(F => {
      for (const s of F.sewer) { const k = /100/.test(s.size) ? 'p100' : /75/.test(s.size) ? 'p75' : /50/.test(s.size) ? 'p50' : s.type === 'soil' ? 'p100' : 'p50'; pipe[k] += segL(s); }
      for (const s of F.water) pipe[/20mm|25mm/.test(s.size) ? 'ppr25' : 'ppr20'] += segL(s);
    });
    for (const s of PL.storm) if (s.kind === 'line') pipe.p100 += segL(s);
    const nStack = PL.floors[0].marks.filter(m => m.kind === 'stack').length; pipe.p100 += nStack * tot;
    pipe.p50 += PL.fx.filter(f => f.kind === 'wc').length * (tot + 1); // vent through roof
    add(sPl, 'p100', pipe.p100 * 1.1 / 3); add(sPl, 'p75', pipe.p75 * 1.1 / 3); add(sPl, 'p50', pipe.p50 * 1.1 / 3);
    add(sPl, 'ppr25', pipe.ppr25 * 1.1 / 4); add(sPl, 'ppr20', pipe.ppr20 * 1.1 / 4);
    const pipeCost = sPl.items.reduce((a, it) => a + it.amt, 0);
    const fxc = k => PL.fx.filter(f => f.kind === k).length;
    add(sPl, 'wc', fxc('wc')); add(sPl, 'lav', fxc('lav')); add(sPl, 'sink', fxc('sink')); add(sPl, 'shower', fxc('shower'));
    const allMarks = PL.floors.flatMap(F => F.marks);
    add(sPl, 'fd', allMarks.filter(m => m.kind === 'fd').length); add(sPl, 'cop', allMarks.filter(m => m.kind === 'co').length);
    add(sPl, 'hb', allMarks.filter(m => m.kind === 'hb').length + fxc('washer')); add(sPl, 'gv', PL.meter ? 1 : 0);
    add(sPl, 'cbx', PL.storm.filter(s => s.kind === 'scb').length + allMarks.filter(m => m.kind === 'cb').length);
    if (pipeCost > 0) sPl.items.push({ key: 'fit', desc: 'Pipe fittings, solvent cement & teflon (30% of pipes)', qty: 1, unit: 'lot', price: Math.round(pipeCost * 0.3), amt: Math.round(pipeCost * 0.3) });
    // electrical sundries
    const eCost = sE.items.reduce((a, it) => a + it.amt, 0);
    if (eCost > 0) sE.items.push({ key: 'esun', desc: 'Connectors, electrical tape, straps & supports (5%)', qty: 1, unit: 'lot', price: Math.round(eCost * 0.05), amt: Math.round(eCost * 0.05) });
    const lp = S.laborPct != null ? S.laborPct : 40;
    // per division: materials, labor (lp % of the materials + the labor-only items), total
    for (const s of secs) {
      s.total = s.items.reduce((a, it) => a + it.amt, 0);
      s.mat = s.items.reduce((a, it) => a + (it.lab ? 0 : it.amt), 0); s.direct = s.total - s.mat;
      s.labor = s.mat * lp / 100 + s.direct; s.grand = s.mat + s.labor;
    }
    const out = secs.filter(s => s.items.length);
    out.forEach((s, i) => { s.no = i + 1; s.letter = String.fromCharCode(65 + i); s.name = s.letter + '. ' + s.plain; });
    const mat = out.reduce((a, s) => a + s.mat, 0), labor = out.reduce((a, s) => a + s.labor, 0), direct = mat + labor;
    const pc = k => simple ? 0 : Math.max(0, +S[k] || 0);
    const cont = direct * pc('contPct') / 100, ocm = direct * pc('ocmPct') / 100, vat = (direct + cont + ocm) * pc('vatPct') / 100;
    return { secs: out, mat, laborPct: lp, labor, direct, contPct: pc('contPct'), ocmPct: pc('ocmPct'), vatPct: pc('vatPct'), cont, ocm, vat, total: direct + cont + ocm + vat, simple };
  };
  function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  AP.peso = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // the BILL OF MATERIALS as a document of its own: A4 portrait pages (mm), project header on every page,
  // the table split over the pages, notes and signatures at the end, page numbers – for AP.toPDF
  AP.bomPages = function (P) {
    return P.settings.bomTemplate === 'simple' || (P.settings.costMode || 'bom') === 'sqm' ? bomPagesSimple(P) : bomPagesFull(P);
  };
  function bomPagesSimple(P) {
    const W = 210, H = 297, M = 14, I = P.info, mode = P.settings.costMode || 'bom', ts = 0.85;
    const cols = [{ h: 'DESCRIPTION', w: 104 }, { h: 'QTY', w: 20 }, { h: 'UNIT', w: 16 }, { h: 'UNIT COST (PHP)', w: 30 }, { h: 'AMOUNT (PHP)', w: 36 }];
    let rows = [], Bm = null;
    const sqm = () => { const C = AP.costSqm(P); return [...C.rows.map(r => [r[0], AP.peso(r[1]), 'sq.m.', AP.peso(C.rate), AP.peso(r[1] * C.rate)]), ['TOTAL FLOOR AREA', AP.peso(C.area), 'sq.m.', '', ''], ['TOTAL ESTIMATED PROJECT COST (' + AP.peso(C.rate) + ' / SQ.M.)', '', '', '', AP.peso(C.total)]]; };
    if (mode !== 'sqm') {
      Bm = AP.bom(P, { simple: true });
      for (const s of Bm.secs) rows.push([s.name, '', '', '', ''], ...s.items.map(it => [it.desc.length > 74 ? it.desc.slice(0, 71) + '...' : it.desc, String(it.qty), it.unit, AP.peso(it.price), AP.peso(it.amt)]), ['SUB-TOTAL - ' + s.name.replace(/^[A-Z]\. /, ''), '', '', '', AP.peso(s.total)]);
      rows.push(['', '', '', '', ''], ['TOTAL COST OF MATERIALS', '', '', '', AP.peso(Bm.mat)], ['LABOR (' + Bm.laborPct + '% OF MATERIALS)', '', '', '', AP.peso(Bm.labor)], ['TOTAL ESTIMATED PROJECT COST', '', '', '', AP.peso(Bm.total)]);
      if (mode === 'both') rows.push(['', '', '', '', ''], ['COST ESTIMATE BY FLOOR AREA (FOR COMPARISON)', '', '', '', ''], ...sqm());
    } else rows = sqm();
    const head = 40, foot = 14, rh = 6 * ts, per = Math.floor((H - M - head - foot - M - rh) / rh), endH = 62;
    const chunks = []; for (let i = 0; i < rows.length; i += per) chunks.push(rows.slice(i, i + per));
    if (!chunks.length) chunks.push([]);
    // room for the notes & signatures after the last rows, else one more page
    if ((chunks[chunks.length - 1].length + 1) * rh + endH > H - M - head - foot - M) chunks.push(null);
    const n = chunks.length, date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    return chunks.map((ch, pi) => {
      const d = new AP.Drawing(), T = (x, y, t, h, o) => d.text(x, y, t, h, o || {});
      d.rect(M, M, W - 2 * M, H - 2 * M, { w: 0.5, fill: 'none' });
      T(W / 2, M + 9, 'BILL OF MATERIALS & COST ESTIMATE', 5, { anchor: 'middle', bold: true });
      T(W / 2, M + 15, mode === 'sqm' ? 'COST ESTIMATE BY FLOOR AREA' : 'QUANTITIES TAKEN OFF THE PLANS - PRICES: PHILIPPINE MARKET 2026', 2.2, { anchor: 'middle' });
      d.line(M, M + 19, W - M, M + 19, { w: 0.3 });
      const L = [['PROJECT', I.title || ''], ['OWNER', I.owner || ''], ['LOCATION', I.location || ''], ['DATE', date]];
      L.forEach((r, i) => { T(M + 3, M + 24 + i * 4, r[0] + ':', 2.3, { bold: true }); T(M + 24, M + 24 + i * 4, String(r[1]).toUpperCase().slice(0, 90), 2.3); });
      if (ch) AP.table(d, M + 2, M + head + rh, cols, ch, ts);
      if (pi === n - 1) {
        let y = ch ? M + head + rh + (ch.length + 1) * rh + 7 : M + head + 4;
        const notes = mode === 'sqm'
          ? ['NOTES:', '1. FLOOR AREA OF EVERY FLOOR x PRICE PER SQ.M. (MATERIALS & LABOR).', '2. PRELIMINARY ESTIMATE; EXCLUDES PERMITS, FURNITURE & APPLIANCES.']
          : ['NOTES:', '1. QUANTITIES BY STANDARD ESTIMATING FACTORS: CONCRETE CLASS A 1:2:4 (9 BAGS, 0.5 CU.M. SAND, 1.0 CU.M. GRAVEL / CU.M.), CLASS B 1:2.5:5;',
            '   CHB 12.5 PCS/SQ.M.; DEFORMED BARS IN 6.0 M LENGTHS; 5-10% WASTE. "EST." = BUDGET PRICE - VERIFY WITH LOCAL SUPPLIERS.',
            '2. LABOR AT ' + Bm.laborPct + '% OF THE COST OF MATERIALS. EXCLUDES PERMITS, EARTHWORK EQUIPMENT, FURNITURE & APPLIANCES.'];
        notes.forEach((t, i) => { T(M + 3, y, t, i ? 1.9 : 2.2, { bold: !i }); y += 3.4; });
        y += 20;
        const sig = (x, who, role) => { d.line(x, y, x + 70, y, { w: 0.3 }); T(x + 35, y - 1.5, String(who || '').toUpperCase(), 2.4, { anchor: 'middle', bold: true }); T(x + 35, y + 4, role, 2.1, { anchor: 'middle' }); };
        T(M + 6, y - 14, 'PREPARED BY:', 2.2, { bold: true }); T(W / 2 + 10, y - 14, 'CONFORME:', 2.2, { bold: true });
        sig(M + 6, I.architect || I.engineer, I.architect ? 'ARCHITECT' : 'ENGINEER / ARCHITECT'); sig(W / 2 + 10, I.owner, 'OWNER');
      }
      T(W - M - 2, H - M - 3, 'PAGE ' + (pi + 1) + ' OF ' + n, 2, { anchor: 'end' });
      T(M + 2, H - M - 3, 'Generated with ArkiPlan - Developed by Darvin', 1.8, { fill: '#777777' });
      return { drawing: d, W, H };
    });
  }

  // TEMPLATE 1 – page 1: project data, SUMMARY OF COST ESTIMATE by division (materials | labor | total | %), direct cost,
  // contingency / overhead & profit / VAT (Settings, when > 0), cost per sq.m., notes, PREPARED BY (PRC, PTR, TIN) /
  // CHECKED BY / CONFORME; then the DETAILED BILL OF MATERIALS with item numbers and the labor of every division
  function bomPagesFull(P) {
    const W = 210, H = 297, M = 14, I = P.info, S = P.settings, mode = S.costMode || 'bom', Bm = AP.bom(P, { simple: false });
    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const tfa = P.floors.reduce((a, f) => a + f.rooms.reduce((b, r) => b + r.w * r.l, 0), 0), nSt = P.floors.filter(f => f.rooms.length).length;
    const G = AP.lotGeom ? AP.lotGeom(P) : null, lot = G && G.ok ? G.area : 0;
    const B = (r) => Object.assign(r, { b: true }), SH = (r) => Object.assign(r, { b: true, sh: true });
    const cut = (t, n) => t.length > n ? t.slice(0, n - 3) + '...' : t;
    const pages = [];
    const page = (title, sub) => {
      const d = new AP.Drawing(), T = (x, y, t, h, o) => d.text(x, y, t, h, o || {});
      d.rect(M, M, W - 2 * M, H - 2 * M, { w: 0.5, fill: 'none' });
      T(W / 2, M + 8, 'BILL OF MATERIALS & COST ESTIMATE', 4.6, { anchor: 'middle', bold: true });
      T(W / 2, M + 13.5, title, 2.6, { anchor: 'middle', bold: true });
      T(W / 2, M + 17.5, sub, 1.9, { anchor: 'middle' });
      d.line(M, M + 20, W - M, M + 20, { w: 0.3 });
      const L = [['PROJECT', I.title], ['OWNER', I.owner], ['LOCATION', I.location || [I.municipality, I.province].filter(Boolean).join(', ')], ['DATE', date]];
      const R = [['BUILDING TYPE', (I.type || '') + ' – ' + nSt + (nSt > 1 ? ' STOREYS' : ' STOREY')], ['LOT AREA', lot ? AP.peso(lot) + ' SQ.M.' : '-'], ['TOTAL FLOOR AREA', AP.peso(tfa) + ' SQ.M.'], ['PROJECT NO.', I.projectNo || '-']];
      L.forEach((r, i) => { T(M + 3, M + 25 + i * 3.8, r[0] + ':', 2.1, { bold: true }); T(M + 21, M + 25 + i * 3.8, cut(String(r[1] || '').toUpperCase(), 58), 2.1); });
      R.forEach((r, i) => { T(M + 116, M + 25 + i * 3.8, r[0] + ':', 2.1, { bold: true }); T(M + 145, M + 25 + i * 3.8, cut(String(r[1] || '').toUpperCase(), 22), 2.1); });
      d.line(M, M + 39, W - M, M + 39, { w: 0.3 });
      pages.push({ drawing: d, W, H }); return { d, T };
    };
    const top = M + 44;
    // ---- page 1: summary
    {
      const { d, T } = page('SUMMARY OF COST ESTIMATE', 'QUANTITIES TAKEN OFF THE PLANS - UNIT COSTS: PHILIPPINE MARKET 2026');
      const ts = 0.9, cols = [{ h: 'ITEM', w: 12 }, { h: 'DESCRIPTION', w: 66, a: 'l' }, { h: 'MATERIALS (PHP)', w: 31, a: 'r' }, { h: 'LABOR (PHP)', w: 29, a: 'r' }, { h: 'TOTAL (PHP)', w: 33, a: 'r' }, { h: '%', w: 15, a: 'r' }];
      const pct = v => Bm.total > 0 ? (v / Bm.total * 100).toFixed(1) + '%' : '';
      const rows = Bm.secs.map(s => [s.no + '.0', s.plain, AP.peso(s.mat), AP.peso(s.labor), AP.peso(s.grand), pct(s.grand)]);
      rows.push(B(['', 'TOTAL DIRECT COST', AP.peso(Bm.mat), AP.peso(Bm.labor), AP.peso(Bm.direct), pct(Bm.direct)]));
      if (Bm.cont > 0) rows.push(['', 'CONTINGENCY (' + Bm.contPct + '% OF DIRECT COST)', '', '', AP.peso(Bm.cont), pct(Bm.cont)]);
      if (Bm.ocm > 0) rows.push(['', "OVERHEAD, CONTRACTOR'S PROFIT (" + Bm.ocmPct + '% OF DIRECT COST)', '', '', AP.peso(Bm.ocm), pct(Bm.ocm)]);
      if (Bm.vat > 0) rows.push(['', 'VALUE ADDED TAX (' + Bm.vatPct + '%)', '', '', AP.peso(Bm.vat), pct(Bm.vat)]);
      rows.push(SH(['', 'TOTAL ESTIMATED PROJECT COST', '', '', AP.peso(Bm.total), '100.0%']));
      if (tfa > 0) rows.push(['', 'COST PER SQ.M. OF FLOOR AREA (' + AP.peso(tfa) + ' SQ.M.)', '', '', AP.peso(Bm.total / tfa), '']);
      if (mode === 'both') { const C = AP.costSqm(P); rows.push(['', 'BY FLOOR AREA, FOR COMPARISON: ' + AP.peso(C.area) + ' SQ.M. x ' + AP.peso(C.rate), '', '', AP.peso(C.total), '']); }
      AP.table(d, M + 6, top, cols, rows, ts);
      let y = top + (rows.length + 1) * 6 * ts + 7;
      const notes = ['NOTES:',
        '1. QUANTITIES TAKEN OFF THE DRAWINGS WITH STANDARD ESTIMATING FACTORS (CONCRETE CLASS A 1:2:4 = 9 BAGS, 0.5 CU.M. SAND, 1.0 CU.M.',
        '   GRAVEL PER CU.M.; CLASS B 1:2.5:5; CHB 12.5 PCS/SQ.M.; DEFORMED BARS IN 6.0 M LENGTHS; 5-10% WASTE). DETAILED LIST ON THE NEXT PAGES.',
        '2. LABOR AT ' + Bm.laborPct + '% OF THE COST OF MATERIALS OF EVERY DIVISION; EARTHWORKS AT LABOR RATES.',
        '3. UNIT COSTS: PHILIPPINE MARKET AVERAGES 2026; "EST." = BUDGET PRICE - VERIFY WITH LOCAL SUPPLIERS. EXCLUDES PERMITS, FURNITURE',
        '   & APPLIANCES. STRUCTURE: REINFORCED CONCRETE FRAME, CHB WALLS, STEEL ROOF FRAMING.'];
      notes.forEach((t, i) => { T(M + 6, y, t, i ? 1.85 : 2.2, { bold: !i }); y += 3.3; });
      y = Math.max(y + 22, H - M - 50);
      const cw = 52, gap = (W - 2 * M - 12 - 3 * cw) / 2, xs = [0, 1, 2].map(i => M + 6 + i * (cw + gap));
      const sig = (x, label, who, role, extra) => {
        T(x, y - 14, label, 2.1, { bold: true });
        d.line(x, y, x + cw, y, { w: 0.3 });
        T(x + cw / 2, y - 1.5, cut(String(who || '').toUpperCase(), 34), 2.3, { anchor: 'middle', bold: true });
        T(x + cw / 2, y + 3.4, role, 1.9, { anchor: 'middle' });
        (extra || []).forEach((t, i) => T(x + 1, y + 7.4 + i * 3.2, t, 1.8));
      };
      const who = I.bomBy || I.architect || I.engineer, role = I.bomBy ? (I.bomRole || 'ENGINEER / ARCHITECT') : I.architect ? 'ARCHITECT' : I.engineer ? 'CIVIL ENGINEER' : 'ENGINEER / ARCHITECT';
      sig(xs[0], 'PREPARED BY:', who, String(role).toUpperCase(), ['PRC NO.: ' + (I.prcNo || '____________'), 'PTR NO.: ' + (I.ptrNo || '____________'), 'TIN: ' + (I.tin || '____________')]);
      sig(xs[1], 'CHECKED BY:', I.checkedBy, 'ENGINEER / ARCHITECT');
      sig(xs[2], 'CONFORME:', I.owner, 'OWNER', ['DATE: ____________']);
    }
    // ---- detailed bill of materials
    const ts = 0.85, rh = 6 * ts, cols = [{ h: 'ITEM', w: 12 }, { h: 'DESCRIPTION', w: 90, a: 'l' }, { h: 'QTY', w: 18, a: 'r' }, { h: 'UNIT', w: 14 }, { h: 'UNIT COST (PHP)', w: 28, a: 'r' }, { h: 'AMOUNT (PHP)', w: 34, a: 'r' }];
    const rows = [];
    for (const s of Bm.secs) {
      rows.push(SH([s.no + '.0', s.plain, '', '', '', '']));
      s.items.forEach((it, k) => rows.push([s.no + '.' + (k + 1), cut(it.desc, 86), String(it.qty), it.unit, AP.peso(it.price), AP.peso(it.amt)]));
      rows.push(['', 'MATERIALS SUB-TOTAL', '', '', '', AP.peso(s.mat)]);
      rows.push(['', 'LABOR (' + Bm.laborPct + '% OF MATERIALS' + (s.direct > 0 ? ' + LABOR ITEMS' : '') + ')', '', '', '', AP.peso(s.labor)]);
      rows.push(B(['', 'TOTAL - ' + s.plain, '', '', '', AP.peso(s.grand)]));
    }
    rows.push(SH(['', 'TOTAL DIRECT COST (CARRIED TO THE SUMMARY)', '', '', '', AP.peso(Bm.direct)]));
    const per = Math.floor((H - M - 14 - top - rh) / rh);
    for (let i = 0; i < rows.length; i += per) {
      const { d } = page('DETAILED BILL OF MATERIALS', 'ITEM NUMBERS BY DIVISION - MATERIALS, LABOR AND TOTAL OF EVERY DIVISION');
      AP.table(d, M + 7, top, cols, rows.slice(i, i + per), ts);
    }
    const n = pages.length;
    pages.forEach((pg, pi) => {
      pg.drawing.text(W - M - 2, H - M - 3, 'PAGE ' + (pi + 1) + ' OF ' + n, 2, { anchor: 'end' });
      pg.drawing.text(M + 2, H - M - 3, 'Generated with ArkiPlan - Developed by Darvin', 1.8, { fill: '#777777' });
    });
    return pages;
  }
  // PREVIEW of the BOM PDF: its pages as they print (white sheets, 3 to a row); pg = page index, or all
  AP.bomPreview = function (P, pg) {
    const pages = AP.bomPages(P), d = new AP.Drawing(), one = pg != null && pg !== 'all' && pages[+pg];
    const list = one ? [pages[+pg]] : pages, gap = 12, per = 3;
    list.forEach((p, i) => {
      const x = (i % per) * (p.W + gap), y = Math.floor(i / per) * (p.H + gap);
      d.rect(x, y, p.W, p.H, { fill: '#ffffff', stroke: '#bbbbbb', w: 0.3 });
      d.append(p.drawing.transform(1, x, y));
    });
    return d;
  };
  // COST ESTIMATE BY FLOOR AREA: the floor area of every floor (enclosed rooms; porch / balcony / carport apart)
  // x the price per sq.m. the user puts (Settings), else one suggested from the bill of materials (total / area)
  AP.costSqm = function (P) {
    const S = P.settings, rows = [];
    let enc = 0, open = 0;
    P.floors.forEach((f, fi) => {
      if (!f.rooms.length) return;
      const e = f.rooms.filter(r => !AP.isOpen(r)).reduce((a, r) => a + r.w * r.l, 0), o2 = f.rooms.filter(r => AP.isOpen(r)).reduce((a, r) => a + r.w * r.l, 0);
      rows.push([f.name.toUpperCase(), e]); if (o2 > 0) rows.push([f.name.toUpperCase() + ' – PORCH / BALCONY / CARPORT', o2]);
      enc += e; open += o2;
    });
    const area = enc + open, own = +S.costSqm > 0, rate = own ? +S.costSqm : Math.round(AP.bom(P).total / Math.max(1, area) / 100) * 100;
    return { rows, area, rate, own, total: area * rate };
  };
  function sqmRows(C) {
    return [...C.rows.map(r => [r[0], AP.peso(r[1]), 'sq.m.', AP.peso(C.rate), AP.peso(r[1] * C.rate)]),
      ['TOTAL FLOOR AREA', AP.peso(C.area), 'sq.m.', '', ''], ['TOTAL ESTIMATED PROJECT COST (' + AP.peso(C.rate) + ' / SQ.M.)', '', '', '', AP.peso(C.total)]];
  }
  const COLS = [{ h: 'DESCRIPTION', w: 100 }, { h: 'QTY', w: 15 }, { h: 'UNIT', w: 14 }, { h: 'UNIT COST (PHP)', w: 24 }, { h: 'AMOUNT (PHP)', w: 28 }];

  // the bill of materials as a table (part: 1 / 2 = first / second half of the sections, else all), paper mm at ts.
  // Settings › Cost estimate: 'bom' itemized + labor, 'sqm' floor area x price per sq.m. only, 'both' (the per sq.m. after)
  AP.renderBOM = function (P, o) {
    const ts = o.ts, d = new AP.Drawing(), mode = P.settings.costMode || 'bom';
    if (mode === 'sqm') {
      const C = AP.costSqm(P), rows = sqmRows(C);
      AP.table(d, 0, 0, COLS, rows, ts);
      let y = (rows.length + 1) * 6 * ts + 6 * ts;
      ['NOTES:', '1. COST ESTIMATE BY FLOOR AREA: AREA OF EVERY FLOOR x ' + AP.peso(C.rate) + ' PHP PER SQ.M. ' + (C.own ? '(RATE SET BY THE DESIGNER), ' : '(SUGGESTED FROM THE BILL OF MATERIALS), ') + 'MATERIALS & LABOR.',
        '2. EXCLUDES PERMITS, FURNITURE & APPLIANCES. PRELIMINARY ESTIMATE – TO BE CHECKED BY THE ENGINEER / ARCHITECT OF RECORD.']
        .forEach((t, i) => { d.text(0, y, t, (i ? 1.8 : 2.1) * ts, { bold: !i }); y += 3 * ts; });
      return d;
    }
    const Bm = AP.bom(P);
    if (!Bm.secs.length) { d.text(0, 0, 'BILL OF MATERIALS: draw the rooms first', 2.4 * ts, {}); return d; }
    const rowsOf = s => [[s.name, '', '', '', ''], ...s.items.map(it => [it.desc.length > 66 ? it.desc.slice(0, 63) + '...' : it.desc, String(it.qty), it.unit, AP.peso(it.price), AP.peso(it.amt)]), ['SUB-TOTAL – ' + s.name.replace(/^[A-Z]\. /, ''), '', '', '', AP.peso(s.total)]];
    let secs = Bm.secs;
    if (o.part) { // split the sections in two about equal halves (by rows)
      // the second half also carries the totals (5 rows) and the notes (~5 rows): the first half takes that much more
      const n = secs.map(s => s.items.length + 2), all = n.reduce((a, b) => a + b, 0) + 10; let acc = 0, cut = secs.length, best = Infinity;
      for (let i = 0; i < secs.length; i++) { acc += n[i]; const diff = Math.abs(acc - (all - acc)); if (diff < best) { best = diff; cut = i + 1; } }
      secs = o.part === 1 ? secs.slice(0, cut) : secs.slice(cut);
    }
    const rows = secs.flatMap(rowsOf);
    const last = !o.part || o.part === 2;
    if (last) {
      rows.push(['', '', '', '', ''], ['TOTAL COST OF MATERIALS', '', '', '', AP.peso(Bm.mat)], ['LABOR (' + Bm.laborPct + '% OF MATERIALS' + (Bm.simple ? '' : ' + EARTHWORKS') + ')', '', '', '', AP.peso(Bm.labor)]);
      if (Bm.cont > 0) rows.push(['CONTINGENCY (' + Bm.contPct + '%)', '', '', '', AP.peso(Bm.cont)]);
      if (Bm.ocm > 0) rows.push(["OVERHEAD & CONTRACTOR'S PROFIT (" + Bm.ocmPct + '%)', '', '', '', AP.peso(Bm.ocm)]);
      if (Bm.vat > 0) rows.push(['VAT (' + Bm.vatPct + '%)', '', '', '', AP.peso(Bm.vat)]);
      rows.push(['TOTAL ESTIMATED PROJECT COST', '', '', '', AP.peso(Bm.total)]);
    }
    if (last && mode === 'both') { const C = AP.costSqm(P); rows.push(['', '', '', '', ''], ['COST ESTIMATE BY FLOOR AREA (FOR COMPARISON)', '', '', '', ''], ...sqmRows(C)); }
    AP.table(d, 0, 0, COLS, rows, ts);
    if (last) {
      let y = (rows.length + 1) * 6 * ts + 6 * ts;
      ['NOTES:', '1. QUANTITIES ARE TAKEN OFF THE DRAWINGS WITH STANDARD ESTIMATING FACTORS (CONCRETE CLASS A 1:2:4 = 9 BAGS, 0.5 CU.M. SAND,',
        '   1.0 CU.M. GRAVEL PER CU.M.; CLASS B 1:2.5:5; CHB 12.5 PCS/SQ.M.; DEFORMED BARS IN 6.0 M LENGTHS; 5–10% WASTE).',
        '2. UNIT COSTS: PHILIPPINE MARKET AVERAGES, 2026 (DTI/PSA-BASED PRICE LISTS & SUPPLIER LISTS); "EST." = BUDGET PRICE. VERIFY WITH LOCAL SUPPLIERS.',
        '3. LABOR AT ' + Bm.laborPct + '% OF THE COST OF MATERIALS. EXCLUDES PERMITS, EARTHWORKS EQUIPMENT, FURNITURE & APPLIANCES.',
        '4. PRELIMINARY ESTIMATE – TO BE CHECKED AND SIGNED BY THE ENGINEER / ARCHITECT OF RECORD.']
        .forEach((t, i) => { d.text(0, y, t, (i ? 1.8 : 2.1) * ts, { bold: !i }); y += 3 * ts; });
    }
    return d;
  };
})(window.AP);
