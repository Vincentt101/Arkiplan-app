/* ArkiPlan – vector drawing core.
 * A Drawing is a list of primitives in model units (Y axis pointing down).
 * The same primitives are serialized to SVG (screen), DXF (AutoCAD) and PDF (print).
 */
window.AP = window.AP || {};
(function (AP) {
  'use strict';

  class Drawing {
    constructor() { this.items = []; }
    add(it) { this.items.push(it); return it; }
    line(x1, y1, x2, y2, s) { return this.add({ t: 'line', x1, y1, x2, y2, s: s || {} }); }
    lineP(p, q, s) { return this.line(p[0], p[1], q[0], q[1], s); }
    poly(pts, closed, s) { return this.add({ t: 'poly', pts, closed: !!closed, s: s || {} }); }
    rect(x, y, w, h, s) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, s); }
    rect2(x0, y0, x1, y1, s) {
      return this.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), s);
    }
    circle(cx, cy, r, s) { return this.add({ t: 'circle', cx, cy, r, s: s || {} }); }
    // arc from angle a0 to a1 (radians, a1 > a0), positive direction in Y-down space
    arc(cx, cy, r, a0, a1, s) { return this.add({ t: 'arc', cx, cy, r, a0, a1, s: s || {} }); }
    text(x, y, str, h, o) {
      o = o || {};
      const rot = o.rot || 0;
      if (o.v === 'middle') {
        const a = rot * Math.PI / 180;
        x += -Math.sin(a) * 0.36 * h; y += Math.cos(a) * 0.36 * h;
      } else if (o.v === 'top') {
        const a = rot * Math.PI / 180;
        x += -Math.sin(a) * 0.75 * h; y += Math.cos(a) * 0.75 * h;
      }
      return this.add({
        t: 'text', x, y, str: String(str), h, anchor: o.anchor || 'start', rot,
        bold: !!o.bold, fill: o.fill || '#000000', s: { layer: o.layer || 'TEXT' }
      });
    }
    // raster image (JPEG data URL) filling the box x, y, w, h; pw / ph = its pixel size
    image(x, y, w, h, src, pw, ph) { return this.add({ t: 'image', x, y, w, h, src, pw, ph, s: { layer: 'IMAGE' } }); }
    append(other) { for (const it of other.items) this.items.push(it); return this; }
    // keep only what is inside(x, y): lines and open polylines are cut, the rest kept by its middle
    clipTo(inside) {
      const out = new Drawing(), N = 48;
      const runs = (pts, s) => {
        const fine = [];
        for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < N; k++) { const f = k / N; fine.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]); }
        fine.push(pts[pts.length - 1]);
        let run = [];
        for (const p of fine) { if (inside(p[0], p[1])) run.push(p); else { if (run.length > 1) out.poly(run, false, s); run = []; } }
        if (run.length > 1) out.poly(run, false, s);
      };
      for (const it of this.items) {
        if (it.t === 'line') runs([[it.x1, it.y1], [it.x2, it.y2]], it.s);
        else if (it.t === 'poly' && !it.closed) runs(it.pts, it.s);
        else if (it.t === 'poly') { const c = it.pts.reduce((a, p) => [a[0] + p[0] / it.pts.length, a[1] + p[1] / it.pts.length], [0, 0]); if (inside(c[0], c[1])) out.add(it); }
        else out.add(it);
      }
      return out;
    }

    bbox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const P = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (const it of this.items) {
        switch (it.t) {
          case 'line': P(it.x1, it.y1); P(it.x2, it.y2); break;
          case 'poly': for (const p of it.pts) P(p[0], p[1]); break;
          case 'circle': case 'arc': P(it.cx - it.r, it.cy - it.r); P(it.cx + it.r, it.cy + it.r); break;
          case 'image': P(it.x, it.y); P(it.x + it.w, it.y + it.h); break;
          case 'text': {
            const w = textWidth(it.str, it.h, it.bold);
            const a = it.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
            const off = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0;
            for (const [u, v] of [[off, 0], [off + w, 0], [off, -it.h], [off + w, -it.h]])
              P(it.x + u * ca - v * sa, it.y + u * sa + v * ca);
            break;
          }
        }
      }
      if (x0 === Infinity) return null;
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    }

    // uniform scale k then translate (dx,dy)
    transform(k, dx, dy) {
      const d = new Drawing();
      const S = s => {
        const n = Object.assign({}, s);
        if (n.w != null) n.w *= k;
        if (n.dash) n.dash = n.dash.map(v => v * k);
        return n;
      };
      const X = x => x * k + dx, Y = y => y * k + dy;
      for (const it of this.items) {
        switch (it.t) {
          case 'line': d.add({ t: 'line', x1: X(it.x1), y1: Y(it.y1), x2: X(it.x2), y2: Y(it.y2), s: S(it.s) }); break;
          case 'poly': d.add({ t: 'poly', pts: it.pts.map(p => [X(p[0]), Y(p[1])]), closed: it.closed, s: S(it.s) }); break;
          case 'circle': d.add({ t: 'circle', cx: X(it.cx), cy: Y(it.cy), r: it.r * k, s: S(it.s) }); break;
          case 'arc': d.add({ t: 'arc', cx: X(it.cx), cy: Y(it.cy), r: it.r * k, a0: it.a0, a1: it.a1, s: S(it.s) }); break;
          case 'text': d.add(Object.assign({}, it, { x: X(it.x), y: Y(it.y), h: it.h * k })); break;
          case 'image': d.add(Object.assign({}, it, { x: X(it.x), y: Y(it.y), w: it.w * k, h: it.h * k })); break;
        }
      }
      return d;
    }
  }
  AP.Drawing = Drawing;

  // Helvetica advance widths (1/1000 em) for ASCII 32..126
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  function textWidth(str, h, bold) {
    let w = 0;
    for (const ch of String(str)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126) ? HW[c - 32] : 600; }
    return w / 1000 * h * (bold ? 1.06 : 1);
  }
  AP.textWidth = textWidth;
  // typographic dashes / quotes -> plain ASCII for PDF (WinAnsi) and DXF
  const plain = s => String(s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  AP.plainText = plain;

  // draw an arc between two points around a center, the short way
  AP.arcShort = function (d, c, P1, P2, s) {
    const r = Math.hypot(P1[0] - c[0], P1[1] - c[1]);
    const a1 = Math.atan2(P1[1] - c[1], P1[0] - c[0]);
    const a2 = Math.atan2(P2[1] - c[1], P2[0] - c[0]);
    let diff = a2 - a1; while (diff < 0) diff += 2 * Math.PI; while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;
    if (diff <= Math.PI) d.arc(c[0], c[1], r, a1, a1 + diff, s);
    else d.arc(c[0], c[1], r, a2, a2 + (2 * Math.PI - diff), s);
  };

  /* ---------------- SVG ---------------- */
  const f = v => (Math.round(v * 10000) / 10000).toString();
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function svgStyle(s, isText) {
    let a = '';
    const stroke = s.stroke === undefined ? '#000000' : s.stroke;
    a += ` stroke="${stroke}"`;
    if (stroke !== 'none') {
      a += ` stroke-width="${f(s.w || 0.01)}"`;
      if (s.dash) a += ` stroke-dasharray="${s.dash.map(f).join(' ')}"`;
    }
    a += ` fill="${s.fill || 'none'}"`;
    if (s.op != null) a += ` opacity="${s.op}"`;
    return a;
  }
  AP.toSVG = function (d) {
    const out = [];
    for (const it of d.items) {
      switch (it.t) {
        case 'line':
          out.push(`<line x1="${f(it.x1)}" y1="${f(it.y1)}" x2="${f(it.x2)}" y2="${f(it.y2)}"${svgStyle(it.s)} stroke-linecap="round"/>`); break;
        case 'poly':
          out.push(`<${it.closed ? 'polygon' : 'polyline'} points="${it.pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}"${svgStyle(it.s)} stroke-linejoin="round"/>`); break;
        case 'circle':
          out.push(`<circle cx="${f(it.cx)}" cy="${f(it.cy)}" r="${f(it.r)}"${svgStyle(it.s)}/>`); break;
        case 'image':
          out.push(`<image href="${it.src}" x="${f(it.x)}" y="${f(it.y)}" width="${f(it.w)}" height="${f(it.h)}" preserveAspectRatio="none"/>`); break;
        case 'arc': {
          const x0 = it.cx + it.r * Math.cos(it.a0), y0 = it.cy + it.r * Math.sin(it.a0);
          const x1 = it.cx + it.r * Math.cos(it.a1), y1 = it.cy + it.r * Math.sin(it.a1);
          const large = (it.a1 - it.a0) > Math.PI ? 1 : 0;
          out.push(`<path d="M${f(x0)} ${f(y0)} A${f(it.r)} ${f(it.r)} 0 ${large} 1 ${f(x1)} ${f(y1)}"${svgStyle(it.s)}/>`); break;
        }
        case 'text': {
          const anc = it.anchor === 'middle' ? 'middle' : it.anchor === 'end' ? 'end' : 'start';
          const tr = it.rot ? ` transform="rotate(${f(it.rot)} ${f(it.x)} ${f(it.y)})"` : '';
          out.push(`<text x="${f(it.x)}" y="${f(it.y)}" font-size="${f(it.h)}" font-family="Arial, Helvetica, sans-serif"${it.bold ? ' font-weight="bold"' : ''} text-anchor="${anc}" fill="${it.fill}"${tr}>${esc(it.str)}</text>`); break;
        }
      }
    }
    return out.join('');
  };

  /* ---------------- DXF (R12, units mm) ---------------- */
  const LAYER_COLORS = { ELEC: 5, WIRING: 5, SANITARY: 30, WATER: 4, STORM: 3, WALLS: 7, COLUMNS: 1, GRID: 8, DIMS: 3, DOORS: 4, WINDOWS: 5, TEXT: 7, FIXTURES: 6, HATCH: 9, ROOF: 2, CUT: 7, GHOST: 9, FRAME: 7, SLAB: 8, FOOTING: 1 };
  AP.toDXF = function (d, unit) {
    unit = unit || 1000; // model metres -> mm
    const L = [];
    const g = (c, v) => { L.push(String(c)); L.push(String(v)); };
    const X = x => (x * unit).toFixed(3), Y = y => (-y * unit).toFixed(3);
    const head = (type, s) => {
      g(0, type); const layer = (s && s.layer) || '0'; g(8, layer);
      if (s && s.dash) g(6, 'DASHED');
      g(62, LAYER_COLORS[layer] || 7);
    };
    g(999, 'ArkiPlan - Developed by Darvin');
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2); g(40, 300); g(49, 200); g(49, -100);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYER_COLORS).length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    for (const [n, c] of Object.entries(LAYER_COLORS)) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const it of d.items) {
      const s = it.s || {};
      switch (it.t) {
        case 'line':
          head('LINE', s); g(10, X(it.x1)); g(20, Y(it.y1)); g(30, 0); g(11, X(it.x2)); g(21, Y(it.y2)); g(31, 0); break;
        case 'poly': {
          if (s.fill && s.fill !== 'none' && s.fill !== '#ffffff' && it.closed && it.pts.length === 4) {
            const p = it.pts;
            head('SOLID', s);
            g(10, X(p[0][0])); g(20, Y(p[0][1])); g(30, 0); g(11, X(p[1][0])); g(21, Y(p[1][1])); g(31, 0);
            g(12, X(p[3][0])); g(22, Y(p[3][1])); g(32, 0); g(13, X(p[2][0])); g(23, Y(p[2][1])); g(33, 0);
          }
          if (s.stroke === 'none') break;
          head('POLYLINE', s); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, it.closed ? 1 : 0);
          for (const p of it.pts) { g(0, 'VERTEX'); g(8, s.layer || '0'); g(10, X(p[0])); g(20, Y(p[1])); g(30, 0); }
          g(0, 'SEQEND'); g(8, s.layer || '0');
          break;
        }
        case 'image': {
          head('POLYLINE', { layer: 'FRAME' }); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
          for (const p of [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]]) { g(0, 'VERTEX'); g(8, 'FRAME'); g(10, X(p[0])); g(20, Y(p[1])); g(30, 0); }
          g(0, 'SEQEND'); g(8, 'FRAME');
          break;
        }
        case 'circle':
          head('CIRCLE', s); g(10, X(it.cx)); g(20, Y(it.cy)); g(30, 0); g(40, (it.r * unit).toFixed(3)); break;
        case 'arc': {
          head('ARC', s); g(10, X(it.cx)); g(20, Y(it.cy)); g(30, 0); g(40, (it.r * unit).toFixed(3));
          g(50, (-it.a1 * 180 / Math.PI).toFixed(4)); g(51, (-it.a0 * 180 / Math.PI).toFixed(4)); break;
        }
        case 'text': {
          head('TEXT', s); g(10, X(it.x)); g(20, Y(it.y)); g(30, 0); g(40, (it.h * unit * 0.8).toFixed(3));
          g(1, plain(it.str).replace(/[^\x20-\x7e]/g, c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')));
          if (it.rot) g(50, (-it.rot).toFixed(3));
          const ha = it.anchor === 'middle' ? 1 : it.anchor === 'end' ? 2 : 0;
          if (ha) { g(72, ha); g(11, X(it.x)); g(21, Y(it.y)); g(31, 0); }
          break;
        }
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n');
  };

  /* ---------------- PDF (vector, mm drawings) ---------------- */
  function rgb(c) {
    if (!c || c === 'none') return null;
    if (c === 'white') return [1, 1, 1];
    if (c === 'black') return [0, 0, 0];
    let h = c.replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const pn = v => (Math.round(v * 100) / 100).toString();
  // WinAnsi = Latin-1 for ² and Ø, written as octal escapes so the stream stays ASCII
  const pdfStr = s => '(' + plain(s).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[\xa0-\xff]/g, c => '\\' + c.charCodeAt(0).toString(8)) + ')';

  function arcBeziers(cx, cy, r, a0, a1, X, Y, first) {
    // returns PDF path ops for arc in drawing space
    let ops = '';
    const n = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 2)));
    const step = (a1 - a0) / n;
    const k = 4 / 3 * Math.tan(step / 4);
    for (let i = 0; i < n; i++) {
      const t0 = a0 + i * step, t1 = t0 + step;
      const p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)];
      const p3 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
      const p1 = [p0[0] - k * r * Math.sin(t0), p0[1] + k * r * Math.cos(t0)];
      const p2 = [p3[0] + k * r * Math.sin(t1), p3[1] - k * r * Math.cos(t1)];
      if (i === 0 && first) ops += `${pn(X(p0[0]))} ${pn(Y(p0[1]))} m `;
      ops += `${pn(X(p1[0]))} ${pn(Y(p1[1]))} ${pn(X(p2[0]))} ${pn(Y(p2[1]))} ${pn(X(p3[0]))} ${pn(Y(p3[1]))} c `;
    }
    return ops;
  }

  function pageContent(d, H, imgs) {
    const k = 72 / 25.4;
    const X = x => x * k, Y = y => (H - y) * k;
    const out = ['1 J 1 j'];
    const setStroke = s => {
      const c = rgb(s.stroke === undefined ? '#000000' : s.stroke);
      if (!c) return false;
      out.push(`${pn(c[0])} ${pn(c[1])} ${pn(c[2])} RG ${pn((s.w || 0.1) * k)} w ` + (s.dash ? `[${s.dash.map(v => pn(v * k)).join(' ')}] 0 d` : '[] 0 d'));
      return true;
    };
    const setFill = s => {
      const c = rgb(s.fill);
      if (!c) return false;
      out.push(`${pn(c[0])} ${pn(c[1])} ${pn(c[2])} rg`);
      return true;
    };
    for (const it of d.items) {
      const s = it.s || {};
      switch (it.t) {
        case 'line':
          if (setStroke(s)) out.push(`${pn(X(it.x1))} ${pn(Y(it.y1))} m ${pn(X(it.x2))} ${pn(Y(it.y2))} l S`);
          break;
        case 'poly': {
          const path = it.pts.map((p, i) => `${pn(X(p[0]))} ${pn(Y(p[1]))} ${i ? 'l' : 'm'}`).join(' ') + (it.closed ? ' h' : '');
          const hf = it.closed && setFill(s), hs = setStroke(s);
          if (hf && hs) out.push(path + ' B'); else if (hf) out.push(path + ' f'); else if (hs) out.push(path + ' S');
          break;
        }
        case 'circle': {
          const path = arcBeziers(it.cx, it.cy, it.r, 0, 2 * Math.PI, X, Y, true) + 'h';
          const hf = setFill(s), hs = setStroke(s);
          if (hf && hs) out.push(path + ' B'); else if (hf) out.push(path + ' f'); else if (hs) out.push(path + ' S');
          break;
        }
        case 'arc':
          if (setStroke(s)) out.push(arcBeziers(it.cx, it.cy, it.r, it.a0, it.a1, X, Y, true) + 'S');
          break;
        case 'image': {
          if (!imgs || !/^data:image\/jpeg;base64,/.test(it.src || '')) break;
          let i = imgs.findIndex(q => q.src === it.src);
          if (i < 0) { imgs.push({ src: it.src, pw: it.pw, ph: it.ph }); i = imgs.length - 1; }
          out.push(`q ${pn(it.w * k)} 0 0 ${pn(it.h * k)} ${pn(X(it.x))} ${pn(Y(it.y + it.h))} cm /Im${i} Do Q`);
          break;
        }
        case 'text': {
          const c = rgb(it.fill) || [0, 0, 0];
          const w = textWidth(it.str, it.h, it.bold);
          const a = -it.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
          const off = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0;
          const x = X(it.x) + off * k * ca, y = Y(it.y) + off * k * sa;
          out.push(`BT /${it.bold ? 'F2' : 'F1'} ${pn(it.h * k)} Tf ${pn(c[0])} ${pn(c[1])} ${pn(c[2])} rg ${pn(ca)} ${pn(sa)} ${pn(-sa)} ${pn(ca)} ${pn(x)} ${pn(y)} Tm ${pdfStr(it.str)} Tj ET`);
          break;
        }
      }
    }
    return out.join('\n');
  }

  // pages: [{drawing, W, H}] in mm
  AP.toPDF = function (pages) {
    const k = 72 / 25.4;
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const kids = [];
    let n = 5;
    const b64 = typeof atob === 'function' ? atob : s => Buffer.from(s, 'base64').toString('latin1');
    for (const pg of pages) {
      const imgs = [];
      const content = pageContent(pg.drawing, pg.H, imgs);
      const pid = n++, cid = n++;
      kids.push(pid + ' 0 R');
      let xo = '';
      imgs.forEach((im, i) => {
        const bin = b64(im.src.split(',')[1]), oid = n++;
        objs[oid] = `<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bin.length} >>\nstream\n${bin}\nendstream`;
        xo += ` /Im${i} ${oid} 0 R`;
      });
      objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pn(pg.W * k)} ${pn(pg.H * k)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ' /XObject <<' + xo + ' >>' : ''} >> /Contents ${cid} 0 R >>`;
      objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    }
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    const info = objs.length; // document properties
    objs[info] = '<< /Producer (ArkiPlan - Developed by Darvin) /Creator (ArkiPlan - Developed by Darvin) >>';
    let pdf = '%PDF-1.4\n';
    const offs = [];
    for (let i = 1; i < objs.length; i++) {
      offs[i] = pdf.length;
      pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) pdf += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return bytes;
  };
})(window.AP);
