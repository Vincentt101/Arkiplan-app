/* ArkiPlan – plan set sheets (A3 etc.) laid out like a Philippine building-permit set. */
window.AP = window.AP || {};
(function (AP) {
  'use strict';
  AP.SHEET_SIZES = { A3: [420, 297], A2: [594, 420], A1: [841, 594], '20x30': [762, 508] };
  const SCALES = [10, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

  // pick the largest drawing (smallest scale number) that fits a w x h mm box
  function fitScale(render, w, h, minScale) {
    let last = null;
    for (const sc of SCALES) {
      if (sc < (minScale || 20)) continue;
      const ts = sc / 1000, d = render(ts), b = d.bbox();
      if (!b) return { sc, d, b: { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 }, ts };
      last = { sc, d, b, ts };
      if (b.w / ts <= w && b.h / ts <= h) return last;
    }
    // nothing fits: shrink to the exact scale that does
    if (last && last.b.w) {
      const f = Math.max(last.b.w / last.ts / w, last.b.h / last.ts / h) * 1.02;
      const sc = Math.ceil(last.sc * f), ts = sc / 1000, d = render(ts), bb = d.bbox() || last.b;
      // tables/diagrams drawn in paper units don't shrink with the scale: scale them down on placement
      const shrink = Math.min(1, w / (bb.w / ts), h / (bb.h / ts));
      return { sc, d, b: bb, ts, shrink };
    }
    return last;
  }

  function viewTitle(d, cx, y, title, scaleTxt, q, num, sheetNo) {
    const th = 4.2 * q, r = 5 * q;
    const tw = AP.textWidth(title, th) * 0.92;
    const x0 = cx - (tw + 2 * r + 3 * q) / 2;
    d.circle(x0 + r, y, r, { w: 0.35, layer: 'FRAME' });
    d.line(x0, y, x0 + 2 * r + tw + 6 * q, y, { w: 0.35, layer: 'FRAME' });
    if (num != null) d.text(x0 + r, y - 1.3 * q, String(num), 3.0 * q, { anchor: 'middle', bold: true, layer: 'FRAME' });
    if (sheetNo) d.text(x0 + r, y + 3.4 * q, sheetNo, 2.2 * q, { anchor: 'middle', layer: 'FRAME' });
    d.text(x0 + 2 * r + 1.5 * q, y - 1.0 * q, title, th, { layer: 'FRAME' });
    if (scaleTxt) {
      d.text(x0 + 2 * r + 2 * q, y + 2.6 * q, 'SCALE:', 1.6 * q, { layer: 'FRAME' });
      d.text(x0 + 2 * r + tw + 5 * q, y + 2.6 * q, scaleTxt, 1.6 * q, { anchor: 'end', layer: 'FRAME' });
    }
  }

  // scales the user chose for views (by view title), set by buildSheets from P.sheetScales
  let SCALE_FIX = {}, MOVES = {};
  AP.sheetBoxes = {}; // where each drawing ended up on each sheet (for Sheets › Move): { 'A-4': [{ key, title, x0, y0, x1, y1 }] }
  function evaluate(cells, specs, q) {
    const titleH = 13 * q;
    const fits = specs.map((sp, i) => {
      const c = cells[i]; if (!c) return null;
      const fx = !sp.nts && SCALE_FIX[sp.title];
      if (fx) { const ts = fx / 1000, d = sp.render(ts); return { sc: fx, d, b: d.bbox() || { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 }, ts, fixed: true }; }
      if (sp.variants) { // several arrangements: the one drawn biggest in this space
        let best = null;
        for (const r of sp.variants) { const f = fitScale(r, c.w - 6, c.h - titleH - 4, sp.min); if (!best || (f.shrink || 1) > (best.shrink || 1) + 1e-3) best = f; }
        return best;
      }
      return fitScale(sp.render, c.w - 6, c.h - titleH - 4, sp.min);
    });
    const grp = {};
    specs.forEach((sp, i) => { if (sp.group && fits[i] && !fits[i].fixed) grp[sp.group] = Math.max(grp[sp.group] || 0, fits[i].sc); });
    // score: worst scale among drawings that have a real scale (tables/notes excluded)
    let score = 0;
    specs.forEach((sp, i) => { if (!sp.nts) score = Math.max(score, fits[i] ? (sp.group && grp[sp.group] && !fits[i].fixed ? grp[sp.group] : fits[i].sc) : 1e9); });
    return { fits, grp, score };
  }
  // place a list of views in cells; views with the same `group` share one scale
  function place(sheet, cells, specs, q, ev) {
    const titleH = 13 * q;
    const { fits, grp } = ev || evaluate(cells, specs, q);
    const F2 = specs.map((sp, i) => {
      let f = fits[i];
      if (f && sp.group && !f.fixed && grp[sp.group] && grp[sp.group] !== f.sc) { const ts = grp[sp.group] / 1000, d = sp.render(ts); f = { sc: grp[sp.group], ts, d, b: d.bbox() || f.b }; }
      return f;
    });
    // drawings of one group side by side (elevations, sections, plans): the same model level on the same paper line,
    // so their ground lines / floor levels line up across the row (the lowest one sets the line)
    const mates = i => specs.map((s2, j) => j).filter(j => F2[j] && F2[i] && specs[i].group && specs[j].group === specs[i].group && F2[j].ts === F2[i].ts && !specs[j].fill &&
      Math.min(cells[j].y + cells[j].h, cells[i].y + cells[i].h) - Math.max(cells[j].y, cells[i].y) > Math.min(cells[i].h, cells[j].h) / 2);
    const pos = specs.map((sp, i) => {
      const f = F2[i]; if (!f) return null;
      const c = cells[i], b = f.b, ah = c.h - titleH - 4;
      let k = (f.shrink || 1) / f.ts;
      if (sp.fill && b.w && b.h) k = Math.min(k * sp.fill, (c.w - 10) / b.w, (ah - 4) / b.h);
      // nearTitle: sits just above its own title (a small table in a tall space), else centred in the space
      const top = sp.nearTitle ? c.y + 2 + Math.max(0, ah - b.h * k) : sp.nearTop ? c.y + 2 : c.y + 2 + Math.max(0, (ah - b.h * k) / 2);
      return { k, dx: c.x + c.w / 2 - (b.x0 + b.w / 2) * k, top, dy: top - b.y0 * k };
    });
    // tables / notes side by side in one row: their tops lined up with the highest one (nothing moves down)
    specs.forEach((sp, i) => {
      if (!pos[i] || !sp.nts || sp.fill || sp.nearTitle) return;
      const M = specs.map((s2, j) => j).filter(j => pos[j] && specs[j].nts && !specs[j].fill && !specs[j].nearTitle && Math.abs(cells[j].y - cells[i].y) < 1);
      if (M.length < 2) return;
      const t = Math.min(...M.map(j => pos[j].top));
      pos[i].dy -= pos[i].top - t;
    });
    specs.forEach((sp, i) => {
      const M = mates(i); if (M.length < 2 || !pos[i]) return;
      const base = Math.max(...M.map(j => pos[j].dy)); // model y = 0 on the lowest of them
      if (pos[i].dy < base) {
        // only if it still fits in its own cell
        const c = cells[i], b = F2[i].b, bottom = base + (b.y0 + b.h) * pos[i].k;
        if (bottom <= c.y + c.h - titleH - 1) pos[i].dy = base;
      }
    });
    specs.forEach((sp, i) => {
      const f = F2[i];
      if (!f) return;
      const c = cells[i], b = f.b, ah = c.h - titleH - 4;
      // notes pages: enlarge the text to fill the space (up to `fill` times the normal size) – see pos
      void ah; void b;
      const { k, dx, dy } = pos[i];
      // moved by the user (Sheets › Move): drawing and its title together
      const key = sp.sheetNo + '|' + sp.title, mv = MOVES[key] || [0, 0];
      const td = f.d.transform(k, dx + mv[0], dy + mv[1]);
      sheet.append(td);
      // the title shrinks when its space is narrower than it (a narrow column of tables)
      const tw = AP.textWidth(sp.title, 4.2 * q) * 0.92 + 16 * q, qt = Math.min(q, q * (c.w - 4) / tw);
      const tx = c.x + c.w / 2 + mv[0], ty = c.y + c.h - titleH + 5 * q + mv[1];
      viewTitle(sheet, tx, ty, sp.title, sp.nts ? 'N.T.S.' : '1:' + f.sc + 'M', qt, sp.num, sp.sheetNo);
      const bb = td.bbox() || { x0: tx, y0: ty, x1: tx, y1: ty };
      (AP.sheetBoxes[sp.sheetNo] = AP.sheetBoxes[sp.sheetNo] || []).push({ key, title: sp.title, x0: Math.min(bb.x0, tx - tw * qt / q / 2), y0: bb.y0, x1: Math.max(bb.x1, tx + tw * qt / q / 2), y1: Math.max(bb.y1, ty + 6 * q) });
    });
  }

  function frame(P, W, H, meta) {
    const d = new AP.Drawing(), I = P.info;
    const q = Math.min(1.6, W / 420);
    const L = 25 * q, T = 12 * q, Rm = 10 * q, B = 10 * q;
    const fw = W - L - Rm, fh = H - T - B;
    const tbh = 24 * q;
    const thick = { w: 0.6, layer: 'FRAME' }, thin = { w: 0.25, layer: 'FRAME' };
    d.rect(L, T, fw, fh, thick);
    // credit, small, in the margin under the border
    d.text(L + fw, T + fh + 4 * q, 'Generated with ArkiPlan – Developed by Darvin', 1.5 * q, { anchor: 'end', fill: '#777777', layer: 'FRAME' });
    // title block columns (fractions taken from the reference set)
    const fr = [24.5, 65, 69, 58, 51, 26, 17.5, 43, 21], tot = fr.reduce((a, b) => a + b, 0);
    const xs = [L]; for (const f of fr) xs.push(xs[xs.length - 1] + fw * f / tot);
    const y0 = T + fh - tbh, y1 = T + fh;
    d.line(L, y0, L + fw, y0, thick);
    for (let i = 1; i < xs.length - 1; i++) d.line(xs[i], y0, xs[i], y1, thin);
    const hdr = 1.75 * q, txt = 2.4 * q, small = 1.35 * q;
    const rowH = tbh / 6;
    const T1 = (x, y, s, h, o) => d.text(x, y, s, h, Object.assign({ layer: 'FRAME' }, o || {}));
    const wrap = (s, n) => {
      const words = String(s || '').toUpperCase().split(/\s+/), lines = []; let cur = '';
      for (const w of words) { if ((cur + ' ' + w).trim().length > n) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      if (cur) lines.push(cur); return lines;
    };
    // col1: architect / engineer
    const c1 = [xs[1], xs[2]];
    const PROF = { A: ['ARCHITECT', I.architect], S: ['CIVIL ENGINEER', I.engineer], E: ['PROFESSIONAL ELECTRICAL ENGINEER', I.electrical], P: ['MASTER PLUMBER', I.plumber] };
    const [prof, pname] = PROF[meta.disc] || PROF.A;
    d.line(c1[0], y0 + rowH * 2.2, c1[1], y0 + rowH * 2.2, thin);
    d.line(c1[0], y0 + rowH * 3.4, c1[1], y0 + rowH * 3.4, thin);
    d.line(c1[0], y0 + rowH * 4.7, c1[1], y0 + rowH * 4.7, thin);
    d.line((c1[0] + c1[1]) / 2 + 9 * q, y0 + rowH * 3.4, (c1[0] + c1[1]) / 2 + 9 * q, y1, thin);
    if (pname) T1((c1[0] + c1[1]) / 2, y0 + rowH * 1.6, String(pname).toUpperCase(), txt, { anchor: 'middle', bold: true });
    T1((c1[0] + c1[1]) / 2, y0 + rowH * 3.0, prof, hdr, { anchor: 'middle' });
    T1(c1[0] + 1, y0 + rowH * 4.3, 'PTR NO:', small); T1((c1[0] + c1[1]) / 2 + 10 * q, y0 + rowH * 4.3, 'DATE:', small);
    T1(c1[0] + 1, y0 + rowH * 5.6, 'T.I.N.', small); T1((c1[0] + c1[1]) / 2 + 10 * q, y0 + rowH * 5.6, 'PRC. REG. NO.', small);
    // col2: project name & location
    const box = (i, head, main, foot) => {
      const a = xs[i], b = xs[i + 1], m = (a + b) / 2;
      d.line(a, y0 + rowH, b, y0 + rowH, thin);
      T1(a + 1, y0 + rowH * 0.72, head, hdr, { bold: true });
      if (foot != null) { d.line(a, y0 + rowH * 4.7, b, y0 + rowH * 4.7, thin); T1(m, y0 + rowH * 5.6, String(foot).toUpperCase().slice(0, 52), small * 1.15, { anchor: 'middle' }); }
      const ls = wrap(main, Math.floor((b - a) / (txt * 0.6)));
      const top = y0 + rowH * (foot != null ? 2.9 : 3.3) - (ls.length - 1) * txt * 0.6;
      ls.slice(0, 3).forEach((l, j) => T1(m, top + j * txt * 1.2, l, txt, { anchor: 'middle' }));
    };
    box(2, 'PROJECT NAME AND LOCATION :', I.title || 'PROPOSED BUILDING', I.location);
    box(3, 'PROJECT OWNER :', I.owner, I.ownerAddress);
    // col4: sheet contents
    {
      const a = xs[4], b = xs[5], m = (a + b) / 2;
      d.line(a, y0 + rowH, b, y0 + rowH, thin);
      T1(a + 1, y0 + rowH * 0.72, 'SHEET CONTENTS :', hdr, { bold: true });
      const ls = wrap(meta.contents, Math.floor((b - a - 2 * q) / (2.0 * q * 0.68)));
      ls.slice(0, 2).forEach((l, j) => T1(m, y0 + rowH * 1.9 + j * 2.6 * q, l, 2.0 * q, { anchor: 'middle' }));
      d.line(a, y0 + rowH * 3.5, b, y0 + rowH * 3.5, thin);
      const disc = ['DRAWINGS AND COPIES THEREOF, AS INSTRUMENTS OF SERVICE, ARE THE', 'PROPERTY OF THE ARCHITECT, WHETHER THE WORK FOR WHICH THEY ARE', 'MADE MAY BE EXECUTED OR NOT, AND ARE NOT TO BE REPRODUCED OR', 'USED ON OTHER WORK EXCEPT BY WRITTEN AGREEMENT W/ THE ARCHITECT.'];
      disc.forEach((l, j) => T1(m, y0 + rowH * 3.95 + j * 0.95 * q, l, 0.8 * q, { anchor: 'middle' }));
      T1(b - 1, y1 - 0.5 * q, 'REP. ACT 9266', 0.8 * q, { anchor: 'end' });
    }
    // col5: designed/drawn/dates
    {
      const a = xs[5], b = xs[6];
      const lab = ['DESIGNED BY  :', 'DRAWN BY     :', 'DATE STARTED :', 'DATE FINISHED :', 'CHECKED BY   :', 'DATE CHECKED :'];
      const val = [pname, I.drawnBy, '', '', '', ''];
      lab.forEach((l, j) => {
        if (j) d.line(a, y0 + rowH * j, b, y0 + rowH * j, thin);
        T1(a + 0.8, y0 + rowH * (j + 0.7), l, small, { bold: true });
        if (val[j]) T1(b - 0.8, y0 + rowH * (j + 0.7), String(val[j]).toUpperCase().slice(0, 6), small, { anchor: 'end' });
      });
    }
    // col6: revisions
    {
      const a = xs[6], b = xs[7];
      T1(a + 0.8, y0 + rowH * 0.7, 'REVISIONS :', small, { bold: true });
      for (let j = 1; j < 6; j++) d.line(a, y0 + rowH * j, b, y0 + rowH * j, thin);
      d.line(a + (b - a) * 0.3, y0 + rowH, a + (b - a) * 0.3, y1, thin);
    }
    // col7: approved by owner
    box(7, 'APPROVED BY :', I.owner, 'OWNER');
    // col8: project no / sheet no
    {
      const a = xs[8], b = xs[9], m = (a + b) / 2;
      T1(a + 1, y0 + rowH * 0.72, 'PROJECT NO. :', hdr, { bold: true });
      if (I.projectNo) T1(m, y0 + rowH * 1.9, I.projectNo, small * 1.2, { anchor: 'middle' });
      d.line(a, y0 + rowH * 2.4, b, y0 + rowH * 2.4, thin);
      d.line(a, y0 + rowH * 3.4, b, y0 + rowH * 3.4, thin);
      d.line(m, y0 + rowH * 2.4, m, y1, thin);
      T1((a + m) / 2, y0 + rowH * 3.05, 'SHEET NO.', small * 0.95, { anchor: 'middle', bold: true });
      T1((m + b) / 2, y0 + rowH * 3.05, 'OF SHEET', small * 0.95, { anchor: 'middle', bold: true });
      T1((a + m) / 2, y1 - 2.2 * q, meta.no, 5 * q, { anchor: 'middle' });
      T1((m + b) / 2, y1 - 2.2 * q, meta.of, 4.2 * q, { anchor: 'middle' });
    }
    // building official box (top right)
    const bw = 46 * q, bh = 24 * q, bx = L + fw - bw, by = T;
    d.rect(bx, by, bw, bh, thick);
    d.line(bx, by + bh * 0.7, bx + bw, by + bh * 0.7, thin);
    const mid = bx + bw / 2;
    T1(mid, by + 4.5 * q, 'REPUBLIC OF THE PHILIPPINES', 1.6 * q, { anchor: 'middle' });
    T1(mid, by + 8.5 * q, 'PROVINCE OF ' + String(I.province || '________').toUpperCase(), 2.1 * q, { anchor: 'middle' });
    T1(mid, by + 13 * q, 'OFFICE OF THE BUILDING OFFICIAL', 2.1 * q, { anchor: 'middle' });
    T1(mid, by + bh * 0.85 + 1 * q, 'MUNICIPALITY OF ' + String(I.municipality || '________').toUpperCase(), 2.1 * q, { anchor: 'middle' });
    return { d, q, area: { x: L + 2, y: T + 2, w: fw - 4, h: fh - tbh - 4 }, box: { x: bx - 2, y: by, w: bw + 2, h: bh + 2 } };
  }

  // split an area into a grid of cells, keeping clear of the building-official box
  function grid(F, cols, rows, opts) {
    opts = opts || {};
    const A = F.area, cells = [];
    const rh = opts.rowH || Array(rows).fill(A.h / rows);
    let y = A.y;
    for (let r = 0; r < rows; r++) {
      const cw = (opts.colW && opts.colW[r]) || Array(cols).fill(A.w / cols);
      let x = A.x;
      for (let c = 0; c < cw.length; c++) {
        const cell = { x, y, w: cw[c], h: rh[r] };
        if (cell.x + cell.w > F.box.x && cell.y < F.box.y + F.box.h) {
          if (opts.boxW && F.box.x - cell.x > cell.w * 0.5) cell.w = F.box.x - cell.x;
          else { cell.y = F.box.y + F.box.h; cell.h = y + rh[r] - cell.y; }
        }
        cells.push(cell);
        x += cw[c];
      }
      y += rh[r];
    }
    return cells;
  }

  // candidate layouts for n views (the one giving the largest common scale wins)
  function multi4(n) {
    const c = n <= 1 ? [[1, 1]] : n === 2 ? [[2, 1], [1, 2]] : n === 3 ? [[3, 1], [2, 2]] : [[2, 2], [4, 1]];
    return c.flatMap(([a, b]) => [false, true].map(bw => F => grid(F, a, b, { boxW: bw })));
  }

  // first sheet, right side: TABLE OF CONTENTS (every sheet and the drawings on it, by discipline) and, under the
  // building official's box, the review boxes (land use & zoning, line & grade, architectural …). The drawings move left.
  function tocStrip(F, defs) {
    const d = F.d, q = Math.min(1.6, F.area.w / 380), thick = { w: 0.6, layer: 'FRAME' }, thin = { w: 0.25, layer: 'FRAME' };
    const bx = F.box.x + 2, bw = F.box.w - 2, top = F.box.y, bot = F.area.y + F.area.h + 2, tw = 64 * q, tx = bx - tw;
    // review boxes under the official box
    const rv = ['LAND USE AND ZONING :', 'LINE AND GRADE :', 'ARCHITECTURAL :', 'STRUCTURAL :', 'SANITARY :', 'ELECTRICAL :', 'MECHANICAL :'];
    const ry0 = F.box.y + F.box.h, rh = (bot - ry0) / rv.length;
    d.line(bx + bw, ry0, bx + bw, bot, thick); d.line(bx, top, bx, bot, thick);
    rv.forEach((t, i) => { const y = ry0 + i * rh; if (i) d.line(bx, y, bx + bw, y, thick); d.text(bx + 1.5 * q, y + 3.4 * q, t, 1.7 * q, { layer: 'FRAME' }); d.line(bx + 2 * q, y + rh * 0.62, bx + bw - 2 * q, y + rh * 0.62, Object.assign({ dash: [0.8, 0.6] }, thin)); });
    // the table of contents
    d.line(tx, top, tx, bot, thick);
    const NAME = { A: 'ARCHITECTURAL', S: 'STRUCTURAL', E: 'ELECTRICAL', P: 'PLUMBING / SANITARY', B: 'BILL OF MATERIALS' }, lines = [];
    for (const k of ['A', 'S', 'E', 'P', 'B']) {
      const ds = defs.filter(x => x.disc === k); if (!ds.length) continue;
      lines.push({ t: NAME[k], h: true });
      for (const x of ds) x.views.forEach((v, i) => lines.push({ t: (i ? '' : x.no + '.  ') + v.title, no: !i, sub: !!i }));
      lines.push({ gap: true });
    }
    const avail = bot - top - 16 * q, n = lines.reduce((a, l) => a + (l.h ? 1.6 : l.gap ? 0.5 : 1), 0), lh = Math.min(3.2 * q, avail / n), th = Math.min(1.7 * q, lh * 0.62);
    d.text((tx + bx) / 2, top + 7 * q, 'TABLE OF CONTENTS', 3.4 * q, { anchor: 'middle', bold: true, layer: 'FRAME' });
    let y = top + 13 * q;
    for (const l of lines) {
      if (l.gap) { y += lh * 0.5; continue; }
      if (l.h) { y += lh * 0.4; d.text(tx + 2.5 * q, y, l.t + ':', th * 1.35, { bold: true, layer: 'FRAME' }); y += lh * 1.2; continue; }
      const maxc = Math.floor((tw - (l.sub ? 12 : 4) * q) / (th * 0.62)), t = l.t.length > maxc ? l.t.slice(0, maxc - 1) + '…' : l.t;
      d.text(tx + (l.sub ? 9.5 : 3.5) * q, y, t, th, { layer: 'FRAME' });
      y += lh;
    }
    F.area.w = tx - 2 - F.area.x;
  }

  AP.SHEET_SCALES = [20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
  AP.buildSheets = function (P) {
    AP.U = P.settings.units || 'mm';
    SCALE_FIX = P.sheetScales || {}; MOVES = P.sheetMoves || {};
    const TSZ = P.tableSizes || {}; // tables / notes the user made smaller or bigger (by title)
    const [W, H] = AP.SHEET_SIZES[P.info.sheet] || AP.SHEET_SIZES.A3;
    const defs = [];
    const floors = P.floors.map((f, i) => ({ f, i })).filter(e => e.f.rooms.length);
    const multi = floors.length > 1;
    // A: floor plans + roof plan
    const planViews = floors.map(e => ({ title: multi ? e.f.name + ' PLAN' : 'FLOOR PLAN', render: ts => AP.renderPlan(P, e.i, { ts }), group: 'plan', min: 50 }));
    if (floors.length) planViews.push({ title: 'ROOF PLAN', render: ts => AP.renderRoofPlan(P, { ts }), group: 'plan', min: 50 });
    // two plans per sheet keeps them at a readable 1:100 on A3
    const roomSched = { title: 'SCHEDULE OF ROOMS', render: ts => AP.renderRoomSchedule(P, { ts }), min: 1000, nts: true };
    // the general architectural notes go on the sheet with the roof plan, in a column at the right or a band below
    const genNotes = { title: 'GENERAL ARCHITECTURAL NOTES', render: ts => AP.renderNotes(P, 'A', { ts }), min: 1000, nts: true, fill: 1.3 };
    const withNotes = k => {
      const off = (c, F) => { if (c.x + c.w > F.box.x && c.y < F.box.y + F.box.h) { const y1 = c.y + c.h; c.y = F.box.y + F.box.h; c.h = y1 - c.y; } return c; };
      const side = nw => F => { const A = F.area, pw = A.w * (1 - nw) / k; return [...Array.from({ length: k }, (_, i) => off({ x: A.x + i * pw, y: A.y, w: pw, h: A.h }, F)), off({ x: A.x + A.w * (1 - nw), y: A.y, w: A.w * nw, h: A.h }, F)]; };
      const band = fr => F => { const A = F.area, th = A.h * fr, pw = A.w / k; return [...Array.from({ length: k }, (_, i) => off({ x: A.x + i * pw, y: A.y, w: pw, h: th }, F)), { x: A.x, y: A.y + th, w: A.w, h: A.h - th }]; };
      // plan at the left, the other view over the notes at the right (roof plan + schedule of rooms)
      const stack = fr => F => { const A = F.area, lw = A.w * 0.5, rx = A.x + lw, rh = A.h * fr; return [off({ x: A.x, y: A.y, w: lw, h: A.h }, F), off({ x: rx, y: A.y, w: A.w - lw, h: rh }, F), { x: rx, y: A.y + rh, w: A.w - lw, h: A.h - rh }]; };
      // the first layout that gives the best plan scale wins: notes in a band or under the schedule before a narrow column
      return [...(k === 2 ? [stack(0.62), stack(0.55)] : []), band(0.72), band(0.78), side(0.27), side(0.22)];
    };
    for (let i = 0; i < planViews.length; i += 2) {
      const vs = planViews.slice(i, i + 2);
      if (vs.length === 1 && i > 0) vs.push(roomSched);
      const hasRoof = vs.some(v => v.title === 'ROOF PLAN') && (P.settings.genNotesAt || 'dw') === 'plans'; // Settings › General notes
      if (hasRoof) vs.push(genNotes);
      defs.push({ disc: 'A', contents: vs.map(v => v.title === 'GENERAL ARCHITECTURAL NOTES' ? 'GENERAL NOTES' : v.title).join(', '), layout: hasRoof ? withNotes(vs.length - 1) : multi4(vs.length), views: vs });
    }
    const schedOnPlans = planViews.length > 2 && planViews.length % 2 === 1;
    if (floors.length) {
      // numbered finish notes: one numbering for the four elevations, one FINISHES legend in the top left corner
      const ek = (P.settings.finNotesEl || 'keyed') === 'keyed' ? AP.elevKeys(P) : null;
      defs.push({
        corner: ek && ek.length ? (d, x, y) => AP.drawFinishLegend(d, ek, x, y) : null,
        disc: 'A', contents: 'FRONT, REAR, LEFT & RIGHT SIDE ELEVATIONS', layout: [F => grid(F, 2, 2), F => grid(F, 2, 2, { boxW: true })],
        views: ['S', 'N', 'W', 'E'].map(k => ({ title: AP.ELEV[k].title, ref: 'el' + k, render: ts => AP.renderElevation(P, k, { ts, keys: ek }), group: 'el', min: 50 }))
      });
      // numbered finish notes: one numbering for both sections, one FINISHES legend in the sheet's top left corner
      const fkeys = ((P.settings.finNotes || 'keyed') === 'keyed') ? AP.finishKeys(P) : null, crows = AP.clgRows(P);
      const notesDW = (P.settings.genNotesAt || 'dw') === 'dw';
      defs.push({
        // top left corner: the FINISHES legend (numbered notes) and the CEILING HEIGHTS table beside it
        corner: (d, x, y) => {
          const h1 = fkeys && fkeys.length ? AP.drawFinishLegend(d, fkeys, x, y) : 0;
          const w1 = fkeys && fkeys.length ? Math.max(70, ...fkeys.map(t => AP.textWidth(t, 2.3))) + 14 : 0;
          const h2 = crows.length ? AP.drawClgTable(d, crows, x + w1, y, 1) : 0;
          return Math.max(h1, h2);
        },
        disc: 'A', contents: 'SECTIONS, DOORS & WINDOWS SCHEDULE' + (notesDW ? ', GENERAL NOTES' : ''),
        // the general notes (Settings: beside the doors & windows schedule) take the right end of the bottom row
        layout: [0.55, 0.62].flatMap(k => [false, true].flatMap(bw => (notesDW ? [0.7, 0.76] : [1]).map(dw => F => grid(F, 2, 2, { rowH: [F.area.h * k, F.area.h * (1 - k)], colW: [null, dw < 1 ? [F.area.w * dw, F.area.w * (1 - dw)] : [F.area.w]], boxW: bw })))),
        views: [
          { title: 'SECTION A', ref: 'secA', label: 'A', render: ts => AP.renderSection(P, 'A', { ts, keys: fkeys, onSheet: true }), group: 'sec', min: 50 },
          { title: 'SECTION B', ref: 'secB', label: 'B', render: ts => AP.renderSection(P, 'B', { ts, keys: fkeys, onSheet: true }), group: 'sec', min: 50 },
          // 1, 2 or 3 rows: the one that fits its space at the biggest size is used
          { title: 'DOORS & WINDOWS SCHEDULE', render: ts => AP.renderDWSchedule(P, { ts }), variants: [1, 2, 3].map(rows => ts => AP.renderDWSchedule(P, { ts, rows })), min: 1000, nts: true },
          ...(notesDW ? [Object.assign({}, genNotes, { fill: 1.1 })] : [])
        ]
      });
      const tDefs = [], sp2 = (c, k) => [{ x: c.x, y: c.y, w: c.w, h: c.h * k }, { x: c.x, y: c.y + c.h * k, w: c.w, h: c.h * (1 - k) }];
      for (const t of AP.toiletRooms(P)) {
        const nm = (t.room.name || 'TOILET').toUpperCase();
        tDefs.push({
          disc: 'A', contents: nm + ' DETAILS',
          layout: [0.55, 0.62].map(k => F => {
            const A = F.area, lw = A.w * 0.38;
            const left = { x: A.x, y: A.y, w: lw, h: A.h };
            const rr = grid({ area: { x: A.x + lw, y: A.y, w: A.w - lw, h: A.h }, box: F.box }, 2, 2, { boxW: true });
            return [...sp2(left, k), ...rr];
          }),
          views: [
            { title: 'ENLARGED ' + nm + ' PLAN', ref: 'toilet:' + AP.toiletKey(t.room), render: ts => AP.renderToiletPlan(P, t.fi, t.room, { ts }), min: 20 },
            { title: nm + ' FINISHES', render: ts => AP.renderToiletFinishes(P, t.fi, t.room, { ts }), min: 1000, nts: true },
            ...['N', 'E', 'S', 'W'].map(s => ({ title: 'INT. ELEV. ' + AP.SIDE_NAME[s], render: ts => AP.renderToiletElev(P, t.fi, t.room, s, { ts }), group: 'tel', min: 20 }))
          ]
        });
      }
      const finSched = { title: 'SCHEDULE OF FINISHES', render: ts => AP.renderFinishSchedule(P, { ts }), min: 1000, nts: true };
      const scheds = schedOnPlans ? [finSched] : [finSched, roomSched];
      // fewer pages: the schedules go under the last T&B details when they still fit there readably
      // (T&B drawings at 1:50 or larger, tables at 75% or more); else a sheet of their own
      const avoid = (c, F, bw) => { if (c.x + c.w > F.box.x && c.y < F.box.y + F.box.h) { if (bw && F.box.x - c.x > c.w * 0.5) c.w = F.box.x - c.x; else { const y1 = c.y + c.h; c.y = F.box.y + F.box.h; c.h = y1 - c.y; } } return c; };
      // the best of some layouts with every drawing at maxSc or larger and tables at minShr or more (null if none)
      const pick = (def, lays, maxSc, minShr) => {
        let best = null;
        for (const L of lays) {
          const F = frame(P, W, H, def), cells = L(F), ev = evaluate(cells, def.views, F.q);
          const shr = Math.min(1, ...def.views.map((v, i) => (v.nts && ev.fits[i] && ev.fits[i].shrink) || 1));
          if (ev.score <= maxSc && shr >= minShr && (!best || ev.score < best.sc || (ev.score === best.sc && shr > best.shr))) best = { L, sc: ev.score, shr };
        }
        return best && best.L;
      };
      // two T&Bs on one sheet (a row each: plan + 4 interior elevations) when they stay at 1:75 or larger
      const pairLay = [0.5, 0.55, 0.62].flatMap(k => [false, true].map(bw => F => {
        const A = F.area, rh = A.h / 2, pw = A.w * 0.28, ew = (A.w - pw) / 4, cells = [];
        for (let r = 0; r < 2; r++) { const y = A.y + r * rh; cells.push(...sp2(avoid({ x: A.x, y, w: pw, h: rh }, F, bw), k)); for (let i = 0; i < 4; i++) cells.push(avoid({ x: A.x + pw + i * ew, y, w: ew, h: rh }, F, bw)); }
        return cells;
      })).concat([0.72, 0.78].flatMap(fr => [false, true].map(bw => F => {
        // both rows of drawings on top, the two finishes tables side by side in a band below
        const A = F.area, th = A.h * fr, rh = th / 2, pw = A.w * 0.24, ew = (A.w - pw) / 4, cells = [];
        for (let r = 0; r < 2; r++) {
          const y = A.y + r * rh;
          cells.push(avoid({ x: A.x, y, w: pw, h: rh }, F, bw), { x: A.x + r * A.w / 2, y: A.y + th, w: A.w / 2, h: A.h - th });
          for (let i = 0; i < 4; i++) cells.push(avoid({ x: A.x + pw + i * ew, y, w: ew, h: rh }, F, bw));
        }
        return cells;
      })));
      const packed = [];
      for (let i = 0; i < tDefs.length; i++) {
        const a = tDefs[i], b = tDefs[i + 1];
        if (b) {
          const def = { disc: 'A', contents: a.contents.replace(/ DETAILS$/, '') + ' & ' + b.contents, views: [...a.views, ...b.views] };
          const L = pick(def, pairLay, 75, 0.8);
          if (L) { def.layout = L; packed.push(def); i++; continue; }
        }
        packed.push(a);
      }
      tDefs.length = 0; tDefs.push(...packed);
      const last = tDefs[tDefs.length - 1] && tDefs[tDefs.length - 1].views.length === 6 ? tDefs[tDefs.length - 1] : null;
      let merged = null;
      if (last) {
        const lays = [0.42, 0.5, 0.58].flatMap(k => [0.62, 0.7].flatMap(fw => [false, true].flatMap(bw => [
          // top: the enlarged plan + the 4 interior elevations in a row; bottom: the schedules side by side
          F => { const A = F.area, th = A.h * k, pw = A.w * 0.28, ew = (A.w - pw) / 4, by = A.y + th, bh = A.h - th;
            const top = [...sp2(avoid({ x: A.x, y: A.y, w: pw, h: th }, F, bw), 0.6), ...[0, 1, 2, 3].map(i => avoid({ x: A.x + pw + i * ew, y: A.y, w: ew, h: th }, F, bw))];
            const bot = scheds.length > 1 ? [{ x: A.x, y: by, w: A.w * fw, h: bh }, { x: A.x + A.w * fw, y: by, w: A.w * (1 - fw), h: bh }] : [{ x: A.x, y: by, w: A.w, h: bh }];
            return [...top, ...bot]; },
          // top: the plan + the elevations 2 x 2
          F => { const A = F.area, th = A.h * k, pw = A.w * 0.38, by = A.y + th, bh = A.h - th, ew = (A.w - pw) / 2;
            const top = [...sp2(avoid({ x: A.x, y: A.y, w: pw, h: th }, F, bw), 0.6), ...[0, 1, 2, 3].map(i => avoid({ x: A.x + pw + (i % 2) * ew, y: A.y + Math.floor(i / 2) * th / 2, w: ew, h: th / 2 }, F, bw))];
            const bot = scheds.length > 1 ? [{ x: A.x, y: by, w: A.w * fw, h: bh }, { x: A.x + A.w * fw, y: by, w: A.w * (1 - fw), h: bh }] : [{ x: A.x, y: by, w: A.w, h: bh }];
            return [...top, ...bot]; }])));
        const def = { disc: 'A', contents: last.contents + ', ' + scheds.map(v => v.title).join(', '), views: [...last.views, ...scheds] };
        const L = pick(def, lays, 50, 0.75);
        if (L) { def.layout = L; merged = def; }
      }
      tDefs.forEach((d, i) => defs.push(merged && i === tDefs.length - 1 ? merged : d));
      if (!merged) defs.push(schedOnPlans
        ? { disc: 'A', contents: 'SCHEDULE OF FINISHES', layout: F => grid(F, 1, 1), views: [finSched] }
        : { disc: 'A', contents: 'SCHEDULE OF FINISHES, SCHEDULE OF ROOMS', layout: [F => grid(F, 1, 2), F => grid(F, 2, 1)], views: [finSched, roomSched] });
      // S: structural
      const sv = [{ title: 'FOUNDATION PLAN', render: ts => AP.renderFoundation(P, { ts }), group: 'st', min: 50 }];
      for (let i = 1; i < floors.length; i++) sv.push({ title: AP.floorName(i) + ' BEAM PLAN', render: ts => AP.renderBeamPlan(P, i, { ts }), group: 'st', min: 50 });
      sv.push({ title: 'ROOF BEAM PLAN', render: ts => AP.renderBeamPlan(P, floors.length, { ts }), group: 'st', min: 50 });
      if (AP.roofs(P).some(R => R.type !== 'flat')) sv.push({ title: 'ROOF FRAMING PLAN', render: ts => AP.renderRoofFraming(P, { ts }), group: 'st', min: 50 });
      const top = sv.slice(0, 4);
      // S-1: general construction notes, filling the sheet
      defs.push({ disc: 'S', contents: 'GENERAL CONSTRUCTION NOTES', layout: F => grid(F, 1, 1), views: [{ title: 'GENERAL CONSTRUCTION NOTES', render: ts => AP.renderNotes(P, 'S', { ts }), min: 1000, nts: true, fill: 2.4 }] });
      // S-2: plans on top, schedule + truss detail below
      const s2 = [...top, { title: 'STRUCTURAL SCHEDULES', render: ts => AP.renderColumnSchedule(P, { ts }), min: 1000, nts: true }];
      // one detail per truss (type, span & height): FT-1, FT-2 … full trusses, HT-1, HT-2 … half trusses.
      // The first 3 here, the rest on their own TRUSS DETAILS sheet(s)
      const TD = AP.trussDetails(P).map((e, i) => ({ title: (e.kind === 'hip' ? 'HALF TRUSS' : e.kind === 'trunc' ? 'TRUNCATED TRUSS' : e.half ? 'HALF TRUSS' : 'TRUSS') + ' DETAIL ' + e.mark, ref: i ? 'truss' + e.mark : 'truss', render: ts => AP.renderTrussTypeDetail(P, e.T.id, { ts, detail: e }), min: 25 }));
      s2.push(...TD.slice(0, 3));
      const bot = s2.length - top.length;
      defs.push({
        disc: 'S', contents: 'FOUNDATION PLAN, BEAM PLANS, ROOF FRAMING PLAN, SCHEDULES & TRUSS DETAIL',
        layout: [0.55, 0.62].flatMap(k => [false, true].map(bw => F => grid(F, top.length, 2, { rowH: [F.area.h * k, F.area.h * (1 - k)], colW: [null, bot > 3 ? [F.area.w * 0.34, F.area.w * 0.22, F.area.w * 0.22, F.area.w * 0.22] : bot > 2 ? [F.area.w * 0.4, F.area.w * 0.3, F.area.w * 0.3] : bot > 1 ? [F.area.w * 0.45, F.area.w * 0.55] : [F.area.w]], boxW: bw }))),
        views: s2
      });
      if (sv.length > 4) defs.push({ disc: 'S', contents: 'BEAM PLANS', layout: multi4(Math.min(4, sv.length - 4)), views: sv.slice(4, 8) });
      // up to 3 more truss details go on the structural details sheet (fewer pages); more get TRUSS DETAILS sheets
      const tdMore = TD.length - 3 <= 3 ? TD.slice(3) : [];
      for (let i = tdMore.length ? TD.length : 3; i < TD.length; i += 9) {
        const v = TD.slice(i, i + 9), n = v.length, opts = n <= 3 ? [[n, 1]] : n <= 6 ? [[3, 2], [2, 3]] : n <= 8 ? [[4, 2], [3, 3]] : [[3, 3]];
        defs.push({ disc: 'S', contents: 'TRUSS DETAILS', layout: opts.flatMap(([c, r]) => [false, true].map(bw => F => grid(F, c, r, { boxW: bw }))), views: v });
      }
      // S-3: structural details (the gutter detail only when a roof has gutters)
      const hasGut = AP.roofs(P).some(R => R.box || AP.roofEaves(R).length), hasStair = !!AP.stairOf(P);
      defs.push({
        disc: 'S', contents: (hasGut ? 'FOOTING, WALL FOOTING, COLUMN, BEAM & GUTTER DETAILS' : 'FOOTING, WALL FOOTING, COLUMN & BEAM DETAILS') + (hasStair ? ', STAIR DETAIL' : '') + (tdMore.length ? ', TRUSS DETAILS' : ''),
        layout: tdMore.length ? [false, true].flatMap(bw => [F => grid(F, 3, 3, { boxW: bw }), F => grid(F, 4, 2, { boxW: bw }), F => grid(F, 5, 2, { boxW: bw })])
          : [false, true].flatMap(bw => [F => grid(F, 3, 2, { boxW: bw })].concat((hasGut ? 1 : 0) + (hasStair ? 1 : 0) + 4 <= 5 ? [F => grid(F, 5, 1, { boxW: bw })] : [F => grid(F, 4, 2, { boxW: bw })])),
        views: [
          { title: 'FOOTING DETAIL', ref: 'footing', render: ts => AP.renderFootingDetail(P, { ts }), group: 'sd', min: 20 },
          { title: 'WALL FOOTING DETAIL', render: ts => AP.renderWallFootingDetail(P, { ts }), group: 'sd', min: 20 },
          { title: 'COLUMN DETAIL', render: ts => AP.renderColumnDetail(P, { ts }), min: 10 },
          { title: 'BEAM DETAIL', render: ts => AP.renderBeamDetail(P, { ts }), min: 10 },
          { title: 'GUTTER DETAIL', render: ts => AP.renderGutterDetail(P, { ts }), min: 10 },
          { title: 'STAIR DETAIL', render: ts => AP.renderStairDetail(P, { ts }), min: 30 }
        ].filter(v => (v.title !== 'GUTTER DETAIL' || hasGut) && (v.title !== 'STAIR DETAIL' || hasStair)).concat(tdMore)
      });
      // E: electrical – as few sheets as the drawings allow (plans at 1:100 or larger, tables readable):
      //   1 sheet: every lighting & power layout on top, schedule of loads / riser / notes / legend below
      //   2 sheets: all the layouts, then the schedules;  else one sheet per floor + the schedules
      const ePlans = [];
      for (const e of floors) {
        const pre = multi ? e.f.name + ' ' : '';
        ePlans.push({ title: pre + 'LIGHTING LAYOUT', render: ts => AP.renderLighting(P, e.i, { ts }), group: 'el', min: 50 },
                    { title: pre + 'POWER LAYOUT', render: ts => AP.renderPower(P, e.i, { ts }), group: 'el', min: 50 });
      }
      const eTables = [
        { title: 'SCHEDULE OF LOADS', render: ts => AP.renderLoadSchedule(P, { ts }), min: 1000, nts: true },
        { title: 'RISER DIAGRAM', render: ts => AP.renderRiser(P, { ts }), min: 1000, nts: true, fill: 1.6 },
        { title: 'GENERAL NOTES', render: ts => AP.renderElecNotes(P, { ts }), min: 1000, nts: true },
        { title: 'LEGEND', render: ts => AP.renderElecLegend(P, { ts }), min: 1000, nts: true }
      ];
      const tablesDef = {
        disc: 'E', contents: 'SCHEDULE OF LOADS, RISER DIAGRAM, LEGEND & NOTES',
        layout: [false, true].map(bw => F => grid(F, 2, 2, { rowH: [F.area.h * 0.5, F.area.h * 0.5], colW: [[F.area.w * 0.6, F.area.w * 0.4], [F.area.w * 0.6, F.area.w * 0.4]], boxW: bw })),
        views: eTables
      };
      // plans in the top band (one row, or two rows for 3+ floors), the 4 tables in the bottom band
      const oneSheet = (fr, rows) => F => {
        const A = F.area, top = A.h * fr, n = ePlans.length, per = Math.ceil(n / rows);
        const rh = [...Array(rows).fill(top / rows), A.h - top];
        const colW = [...Array(rows).fill(Array(per).fill(A.w / per)), [A.w * 0.36, A.w * 0.24, A.w * 0.22, A.w * 0.18]];
        const cells = grid(F, per, rows + 1, { rowH: rh, colW, boxW: true });
        return [...cells.slice(0, rows * per).slice(0, n), ...cells.slice(rows * per)];
      };
      // plans top-left, schedule of loads + notes under them, riser + legend in a right-hand column
      const sideCol = (fr, lw, rows) => F => {
        const A = F.area, n = ePlans.length, per = Math.ceil(n / rows), Lw = A.w * lw, top = A.h * fr;
        const cells = [];
        for (let i = 0; i < n; i++) { const r = Math.floor(i / per), c = i % per; cells.push({ x: A.x + c * Lw / per, y: A.y + r * top / rows, w: Lw / per, h: top / rows }); }
        const ry = Math.max(A.y, F.box.y + F.box.h), rh = A.y + A.h - ry;
        cells.push({ x: A.x, y: A.y + top, w: Lw * 0.56, h: A.h - top });                 // schedule of loads
        cells.push({ x: A.x + Lw, y: ry, w: A.w - Lw, h: rh * 0.45 });                    // riser
        cells.push({ x: A.x + Lw * 0.56, y: A.y + top, w: Lw * 0.44, h: A.h - top });     // notes
        cells.push({ x: A.x + Lw, y: ry + rh * 0.45, w: A.w - Lw, h: rh * 0.55 });        // legend
        return cells;
      };
      // best (smallest) plan scale a sheet reaches with readable tables; false if none within maxSc
      const fits = (def, maxSc, minShrink) => {
        const F = frame(P, W, H, def), q = F.q;
        let ok = false;
        for (const L of Array.isArray(def.layout) ? def.layout : [def.layout]) {
          const cells = L(F); if (cells.length < def.views.length) continue;
          const ev = evaluate(cells, def.views, q);
          const shr = Math.min(1, ...def.views.map((v, i) => (v.nts && ev.fits[i] && ev.fits[i].shrink) || 1));
          if (ev.score <= maxSc && shr >= minShrink && (!ok || ev.score < ok)) ok = ev.score;
        }
        return ok;
      };
      const rowsFor = ePlans.length > 4 ? [2] : [1, 2];
      const single = {
        disc: 'E', contents: (multi ? 'LIGHTING & POWER LAYOUTS' : 'LIGHTING & POWER LAYOUT') + ', SCHEDULE OF LOADS, RISER DIAGRAM, LEGEND & NOTES',
        layout: rowsFor.flatMap(r => [...[0.58, 0.64, 0.7].map(fr => oneSheet(fr, r)), ...[0.6, 0.66, 0.72].flatMap(fr => [0.68, 0.74].map(lw => sideCol(fr, lw, r)))]), views: [...ePlans, ...eTables]
      };
      const allPlans = { disc: 'E', contents: multi ? 'LIGHTING & POWER LAYOUTS' : 'LIGHTING & POWER LAYOUT', layout: multi4(Math.min(4, ePlans.length)), views: ePlans };
      // two floors: each floor's layouts with two of the tables (schedule + riser, then notes + legend)
      const halfCol = (fr, lw) => F => {
        const A = F.area, Lw = A.w * lw, top = A.h * fr, ry = Math.max(A.y, F.box.y + F.box.h);
        return [{ x: A.x, y: A.y, w: Lw / 2, h: top }, { x: A.x + Lw / 2, y: A.y, w: Lw / 2, h: top },
          { x: A.x, y: A.y + top, w: Lw, h: A.h - top }, { x: A.x + Lw, y: ry, w: A.w - Lw, h: A.y + A.h - ry }];
      };
      // or: the two layouts side by side across the sheet, the two tables in a band below
      const band2 = (fr, sw) => F => {
        const A = F.area, top = A.h * fr, ry = Math.max(A.y, F.box.y + F.box.h);
        return [{ x: A.x, y: ry, w: A.w / 2, h: A.y + top - ry }, { x: A.x + A.w / 2, y: ry, w: A.w / 2, h: A.y + top - ry },
          { x: A.x, y: A.y + top, w: A.w * sw, h: A.h - top }, { x: A.x + A.w * sw, y: A.y + top, w: A.w * (1 - sw), h: A.h - top }];
      };
      const pair = floors.length === 2 ? [0, 1].map(k => ({
        disc: 'E', contents: floors[k].f.name + ' LIGHTING & POWER LAYOUT, ' + (k ? 'GENERAL NOTES & LEGEND' : 'SCHEDULE OF LOADS & RISER DIAGRAM'),
        layout: [...[0.62, 0.68, 0.74].flatMap(fr => [0.66, 0.72].map(lw => halfCol(fr, lw))), ...[0.46, 0.5, 0.54, 0.58, 0.62].flatMap(fr => [0.55, 0.62].map(sw => band2(fr, sw)))],
        views: [ePlans[2 * k], ePlans[2 * k + 1], ...(k ? [eTables[2], eTables[3]] : [eTables[0], eTables[1]])]
      })) : null;
      // a plan may go down to 1:125 so a small project fits fewer sheets; bigger ones get more sheets
      // one storey: everything on one sheet even with the layouts at 1:200 (fewer pages)
      if (ePlans.length <= 6 && fits(single, floors.length === 1 ? 200 : 125, 0.7)) defs.push(single);
      else if (pair && pair.every(dd => fits(dd, 150, 0.7))) {
        // 2-storey: 2 sheets, layouts down to 1:150, both floors at the same scale
        const sc = Math.max(...pair.map(dd => fits(dd, 150, 0.7)));
        for (const v of ePlans) v.min = sc;
        defs.push(...pair);
      }
      else if (ePlans.length <= 4 && fits(allPlans, 100, 1)) defs.push(allPlans, tablesDef);
      else {
        for (let i = 0; i < ePlans.length; i += 2) {
          const vs = ePlans.slice(i, i + 2);
          defs.push({ disc: 'E', contents: (vs[0].title.replace(' LIGHTING LAYOUT', '').replace('LIGHTING LAYOUT', '') + ' LIGHTING & POWER LAYOUT').trim(), layout: multi4(2), views: vs });
        }
        defs.push(tablesDef);
      }
      // P: plumbing – sanitary/storm and water layout per floor, then isometrics & details
      for (const e of floors) {
        const pre = multi ? e.f.name + ' ' : '';
        defs.push({
          disc: 'P', contents: pre + 'SANITARY, STORM DRAINAGE & WATERLINE LAYOUT', layout: multi4(2),
          views: [
            { title: pre + 'SANITARY & STORM DRAINAGE LAYOUT', render: ts => AP.renderSewer(P, e.i, { ts }), group: 'pl', min: 50 },
            { title: pre + 'WATERLINE LAYOUT', render: ts => AP.renderWater(P, e.i, { ts }), group: 'pl', min: 50 }
          ]
        });
        defs.push({
          disc: 'P', contents: 'ISOMETRIC VIEW OF ' + pre + 'WATERLINE & SEWER LINE LAYOUT', layout: multi4(2),
          views: [
            { title: 'ISOMETRIC VIEW OF ' + pre + 'WATERLINE LAYOUT', render: ts => AP.renderIsoWaterPlan(P, e.i, { ts }), group: 'piso', min: 50, nts: true, fill: 1.8 },
            { title: 'ISOMETRIC VIEW OF ' + pre + 'SEWER LINE LAYOUT', render: ts => AP.renderIsoSewerPlan(P, e.i, { ts }), group: 'piso', min: 50, nts: true, fill: 1.8 }
          ]
        });
      }
      defs.push({
        disc: 'P', contents: 'ISOMETRICS, PLUMBING DETAILS, LEGEND, SPECIFICATIONS & CERTIFICATION',
        // top: isometrics, legend, specifications; bottom: septic tank | the plumbing details (wide)
        layout: [false, true].flatMap(bw => [0.34, 0.3].map(sw => F => grid(F, 4, 2, { boxW: bw, rowH: [F.area.h * 0.5, F.area.h * 0.5], colW: [[0.25, 0.25, 0.25, 0.25].map(f => F.area.w * f), [F.area.w * sw, F.area.w * (1 - sw)]] }))),
        views: [
          { title: 'ISOMETRIC - SANITARY LINE', render: ts => AP.renderIsoSewer(P, { ts }), min: 50, nts: true },
          { title: 'ISOMETRIC - WATERLINE', render: ts => AP.renderIsoWater(P, { ts }), min: 50, nts: true },
          { title: 'LEGEND & PLUMBING NOTES', render: ts => AP.renderPlumbLegend(P, { ts }), min: 1000, nts: true },
          { title: 'SPECIFICATIONS & CERTIFICATION', render: ts => AP.renderPlumbSpecs(P, { ts }), min: 1000, nts: true },
          { title: 'SEPTIC TANK DETAIL', render: ts => AP.renderSepticDetail(P, { ts }), min: 30 },
          { title: 'PLUMBING DETAILS', render: ts => AP.renderSmallDetails(P, { ts }), min: 1000, nts: true }
        ]
      });
      // (the bill of materials & cost estimate is a separate PDF – Sheets › BOM (PDF), AP.bomPages)
    }
    // (no sheet index sheet: the table of contents is on A-1; the general notes are on the roof plan sheet)
    // A-1: perspective, vicinity map, lot plan and site development plan (sheet index moves to A-2)
    const hasLoc = !!(P.locmap && P.locmap.img);
    if (floors.length) defs.unshift({
      disc: 'A', contents: 'PERSPECTIVE, VICINITY MAP, ' + (hasLoc ? 'LOCATION MAP, ' : '') + 'LOT PLAN & SITE DEVELOPMENT PLAN',
      // with a location map: perspective / vicinity / location on top, lot plan / site plan below
      // bottom row: lot plan | site plan | a narrow column with the technical description over the area data
      layout: (hasLoc
        ? [false, true].flatMap(bw => [0.5, 0.56].map(pw => F => grid(F, 3, 2, { boxW: bw, colW: [[F.area.w * pw, F.area.w * (1 - pw) / 2, F.area.w * (1 - pw) / 2], [F.area.w * 0.5, F.area.w * 0.5]] })))
        // the perspective gets the bigger part of the top row, the vicinity map the rest
        : [false, true].flatMap(bw => [0.64, 0.68].map(pw => F => grid(F, 2, 2, { boxW: bw, colW: [[F.area.w * pw, F.area.w * (1 - pw)], [F.area.w * 0.5, F.area.w * 0.5]] }))))
        .flatMap(L => [0.2, 0.25].map(cw => F => {
          const c = L(F), a = c[c.length - 2], b = c[c.length - 1], y = Math.min(a.y, b.y), h = Math.max(a.y + a.h, b.y + b.h) - y, A = F.area;
          const pw = A.w * (1 - cw) / 2, tx = A.x + 2 * pw, th = h * 0.58;
          return [...c.slice(0, -2), { x: A.x, y, w: pw, h }, { x: A.x + pw, y, w: pw, h }, { x: tx, y, w: A.w * cw, h: th }, { x: tx, y: y + th, w: A.w * cw, h: h - th }];
        })),
      views: [
        { title: 'PERSPECTIVE', render: ts => AP.renderPerspective(P, { ts }), min: 20, nts: true },
        { title: 'VICINITY MAP', render: ts => AP.renderVicinity(P, { ts }), min: 1000, nts: true },
        ...(hasLoc ? [{ title: 'LOCATION MAP', render: ts => AP.renderLocationMap(P, { ts }), min: 1000, nts: true }] : []),
        { title: 'LOT PLAN', ref: 'lot', render: ts => AP.renderLotPlan(P, { ts, noTable: true }), min: 50 },
        { title: 'SITE DEVELOPMENT PLAN', ref: 'site', render: ts => AP.renderSitePlan(P, { ts, noTable: true }), min: 50 },
        { title: 'TECHNICAL DESCRIPTION', render: ts => AP.renderTechDesc(P, { ts }), min: 1000, nts: true, nearTitle: true },
        { title: 'AREA DATA', render: ts => AP.renderAreaData(P, { ts }), min: 1000, nts: true, nearTitle: true }
      ]
    });
    // number sheets, number the views on each sheet and remember where each view is drawn
    const total = defs.length;
    const cnt = {}, refs = {};
    defs.forEach((s, i) => { cnt[s.disc] = (cnt[s.disc] || 0) + 1; s.no = s.disc + '-' + cnt[s.disc]; s.page = i + 1; s.of = (i + 1) + '-' + total; });
    defs.forEach(s => s.views.forEach((v, i) => {
      // a table / notes block the user resized: drawn at that size (Sheets › Scale)
      if (v.nts && TSZ[v.title] && TSZ[v.title] !== 1 && !v.sized) { const r = v.render, f = TSZ[v.title]; v.render = ts => r(ts * f); if (v.variants) v.variants = v.variants.map(rv => ts => rv(ts * f)); v.sized = true; }
      v.num = v.label || String(i + 1); v.sheetNo = s.no;
      if (v.ref) refs[v.ref] = { num: v.num, sheet: s.no };
    }));
    AP.REFS = refs;
    const out = defs.map(s => ({
      no: s.no, of: s.of, contents: s.contents, W, H, views: s.views.map(v => ({ title: v.title, nts: !!v.nts, group: v.group || null })),
      draw: () => {
        const F = frame(P, W, H, s);
        AP.sheetBoxes[s.no] = [];
        if (s.no === 'A-1') tocStrip(F, defs); // first sheet: table of contents + the building official's review boxes
        // a legend in the top left corner: the drawings start below it
        if (s.corner) { const h = s.corner(F.d, F.area.x + 3, F.area.y + 3) + 6; F.area.y += h; F.area.h -= h; }
        const layouts = Array.isArray(s.layout) ? s.layout : [s.layout];
        let best = null;
        for (const L of layouts) {
          const cells = L(F);
          if (cells.length < s.views.length) continue;
          const ev = evaluate(cells, s.views, F.q);
          if (!best || ev.score < best.ev.score) best = { cells, ev };
        }
        if (best) place(F.d, best.cells, s.views, F.q, best.ev);
        return F.d;
      }
    }));
    out.refs = refs;
    return out;
  };
  // where each view is drawn (sheet number), for tags and callouts in the plans
  AP.sheetRefs = P => AP.buildSheets(P).refs;
})(window.AP);
