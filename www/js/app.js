/* ArkiPlan – user interface */
(function (AP) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;
  const snap = (v, s) => Math.round(v / s) * s;
  // snap options for every tool that adds or moves something (kept on this device)
  const SNAP0 = { on: true, walls: true, faces: true, grids: true, cols: true, mid: false, inc: 0.05 };
  let SNAP = (() => { try { return Object.assign({}, SNAP0, JSON.parse(localStorage.getItem('arkiplan.snap') || '{}')); } catch (e) { return Object.assign({}, SNAP0); } })();
  const snapInc = v => (SNAP.on && SNAP.inc ? snap(v, SNAP.inc) : v); // free step (50 mm …) when nothing is near

  let P = null;              // current project
  let fi = 0;                // current floor
  let tab = 'plan';
  let sel = null;            // {type:'room'|'op', id}
  let mode = null;           // {kind:'door'|'window', tpl} when placing openings
  let inRoom = null;         // id of the room opened for furnishing (zoomed in, rest dimmed)
  let roomInside = false;    // the opened room's four walls seen from inside
  let undo = [], redo = [];
  // View mode (default): pan / zoom only, nothing can be selected or changed. Edit mode: tap to select & change.
  let editOn = false;
  try { editOn = localStorage.getItem('arkiplan.edit') === '1'; } catch (e) { /* no storage */ }
  const setEdit = on => { editOn = on; try { localStorage.setItem('arkiplan.edit', on ? '1' : '0'); } catch (e) { /* ignore */ } if (!on && !mode) sel = null; refresh(); };
  const sub = { elev: 'S', sect: 'A', det: 'roof', sheet: 0 };
  const views = {};          // per-view pan/zoom
  let sheetsCache = null;

  /* ---------------- utilities ---------------- */
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 2200);
  }
  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }

  function fieldHTML(f, pre) {
    const id = (pre || 'f_') + f.k;
    if (f.type === 'select') {
      return `<label>${esc(f.label)}<select id="${id}">${f.options.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(f.value) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>${f.hint ? `<span class="hintline">${esc(f.hint)}</span>` : ''}</label>`;
    }
    if (f.type === 'checkbox') return `<label class="chk"><input type="checkbox" id="${id}"${f.value ? ' checked' : ''}> ${esc(f.label)}</label>`;
    if (f.type === 'h') return `<h4>${esc(f.label)}</h4>`;
    if (f.type === 'len') // a length: shown and typed in the project unit, stored in metres
      return `<label>${esc(f.label)} (${AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf()})<input type="number" inputmode="decimal" step="${AP.unit().step}" id="${id}" value="${AP.toU(f.value)}">${f.hint ? `<span class="hintline">${esc(f.hint)}</span>` : ''}</label>`;
    const t = f.type === 'number' ? `type="number" inputmode="decimal" step="${f.step || 0.01}"` : 'type="text"';
    return `<label>${esc(f.label)}<input ${t} id="${id}" value="${esc(f.value)}" placeholder="${esc(f.ph || '')}">${f.hint ? `<span class="hintline">${esc(f.hint)}</span>` : ''}</label>`;
  }
  function renderFields(fields, pre) {
    const out = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.pair && fields[i + 1]) { out.push(`<div class="row">${fieldHTML(f, pre)}${fieldHTML(fields[i + 1], pre)}</div>`); i++; }
      else out.push(fieldHTML(f, pre));
    }
    return out.join('');
  }
  function readFields(fields, pre) {
    const o = {};
    for (const f of fields) {
      if (f.type === 'h') continue;
      const el = $((pre || 'f_') + f.k); if (!el) continue;
      o[f.k] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? num(el.value, f.value) : f.type === 'len' ? AP.fromU(num(el.value, AP.toU(f.value))) : el.value;
    }
    return o;
  }
  // modal form -> Promise(values|null)
  function modal(title, fields, okText, extraBtn) {
    return new Promise(res => {
      $('mTitle').textContent = title;
      $('mBody').innerHTML = typeof fields === 'string' ? fields : renderFields(fields, 'm_');
      const btns = $('mBtns'); btns.innerHTML = '';
      const close = v => { $('modal').hidden = true; res(v); };
      const bc = document.createElement('button'); bc.className = 'ghost'; bc.textContent = 'Cancel'; bc.onclick = () => close(null);
      btns.appendChild(bc);
      if (extraBtn) { const b = document.createElement('button'); b.className = extraBtn.cls || 'ghost'; b.textContent = extraBtn.text; b.onclick = () => close(extraBtn.value); btns.appendChild(b); }
      if (okText) { const b = document.createElement('button'); b.className = 'primary'; b.textContent = okText; b.onclick = () => close(typeof fields === 'string' ? true : readFields(fields, 'm_')); btns.appendChild(b); }
      $('modal').hidden = false;
      $('modal').onclick = e => { if (e.target === $('modal')) close(null); };
      const first = $('mBody').querySelector('input,select'); if (first && first.type !== 'checkbox') setTimeout(() => first.focus(), 50);
    });
  }
  function confirmBox(title, msg, okText) {
    return modal(title, `<p>${esc(msg)}</p>`, okText || 'OK');
  }

  // save a file: Android (Capacitor) -> Documents + share sheet, browser -> download
  async function saveFile(name, mime, data) {
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem) {
      let b64;
      if (typeof data === 'string') b64 = btoa(unescape(encodeURIComponent(data)));
      else { let s = ''; for (let i = 0; i < data.length; i += 8192) s += String.fromCharCode.apply(null, data.subarray(i, i + 8192)); b64 = btoa(s); }
      const FS = C.Plugins.Filesystem, SH = C.Plugins.Share;
      const share = async uri => { if (!SH) return; try { await SH.share({ title: name, files: [uri] }); } catch (e1) { try { await SH.share({ title: name, url: uri }); } catch (e2) { /* share closed */ } } };
      // Documents/ArkiPlan works up to Android 10; on newer Android (scoped storage) it is refused (FILE_NOTCREATED):
      // then the file goes to the app's own storage and the share sheet opens – save it to Files / Downloads, Drive, mail…
      try {
        const r = await FS.writeFile({ path: 'ArkiPlan/' + name, data: b64, directory: 'DOCUMENTS', recursive: true });
        toast('Saved to Documents/ArkiPlan/' + name, 3000);
        await share(r.uri);
        return;
      } catch (e) { /* not allowed here – use the app's storage */ }
      for (const dir of ['CACHE', 'EXTERNAL', 'DATA']) {
        try {
          const r = await FS.writeFile({ path: 'exports/' + name, data: b64, directory: dir, recursive: true });
          toast(name + ' ready – choose where to save or send it (Files, Drive, Gmail…)', 3500);
          await share(r.uri);
          return;
        } catch (e) { /* try the next place */ }
      }
      toast('Could not save ' + name + ' on this device – free some storage and try again', 4500);
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const fileBase = () => (P.info.owner || P.info.title || 'project').replace(/[^\w\-]+/g, '_').slice(0, 40);

  /* ---------------- history ---------------- */
  function commit() {
    undo.push(JSON.stringify(P)); if (undo.length > 80) undo.shift();
    redo = [];
  }
  function changed() { AP.store.save(P); sheetsCache = null; bomPrev = null; refresh(); }
  let bomPrev = null; // the BOM preview drawing (its pages), made again after every change
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(P)); P = JSON.parse(undo.pop()); fixSel(); changed(); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(P)); P = JSON.parse(redo.pop()); fixSel(); changed(); }
  function fixSel() {
    fi = Math.min(fi, P.floors.length - 1);
    const fl = P.floors[fi];
    if (sel && sel.type === 'col') { if (!findCol(sel.key)) sel = null; return; }
    if (sel && sel.type === 'roof') { if (!AP.roofSpecs(P).some(s => s.id === sel.id)) sel = null; return; }
    if (sel && sel.type === 'beam') { if (!AP.beams(P, sel.lv).some(b => b.key === sel.key)) sel = null; return; }
    if (sel && sel.type === 'wall') { if (!findWall(sel)) sel = null; return; }
    if (sel && sel.type === 'xwall') { if (!findX(sel.id)) sel = null; return; }
    if (sel && !(sel.type === 'room' ? fl.rooms.some(r => r.id === sel.id) : fl.openings.some(o => o.id === sel.id))) sel = null;
  }

  /* ---------------- HOME ---------------- */
  // (no built-in samples in the store version: copies an older version put on the device are removed once)
  const OLD_SAMPLES = ['sample-bungalow', 'sample-onestorey', 'sample-twostorey'];
  const isSample = () => false;
  function ensureSample() {
    try { if (localStorage.getItem('arkiplan.samplesGone')) return; for (const id of OLD_SAMPLES) if (AP.store.load(id)) AP.store.remove(id); localStorage.setItem('arkiplan.samplesGone', '1'); } catch (e) { /* storage blocked */ }
  }
  ensureSample();

  /* ---------- ArkiPlan Pro: monthly subscription (Google Play Billing), 7-day free trial ----------
   * Drawing, previews and the project backup are always free. After the trial, downloading the PDF plan set,
   * the bill of materials PDF, DXF and PNG needs an active subscription. Product / base plan as set up in
   * Play Console: product 'arkiplan_pro_monthly', base plan 'monthly' (PHP 899 / month). */
  const PRO = { product: 'arkiplan_pro_monthly', plan: 'monthly', trialDays: 7 };
  const pro = { active: false, price: '\u20b1899.00', busy: false };
  const NP = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.NativePurchases ? C.Plugins.NativePurchases : null; };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  function trialStart() { let t = +lsGet('arkiplan.trial0'); if (!t) { t = Date.now(); lsSet('arkiplan.trial0', String(t)); } return t; }
  const trialLeft = () => Math.max(0, PRO.trialDays - (Date.now() - trialStart()) / 864e5);
  // last known subscription state, so a subscriber can still export offline for a few days
  const cachedPro = () => { const c = lsGet('arkiplan.pro'); return !!c && Date.now() - (+c) < 3 * 864e5; };
  async function proRefresh() {
    const np = NP(); if (!np) return;
    try {
      const r = await np.getPurchases({ productType: 'subs' });
      pro.active = (r.purchases || []).some(t => t.productIdentifier === PRO.product && String(t.purchaseState) === '1');
      if (pro.active) lsSet('arkiplan.pro', String(Date.now())); else try { localStorage.removeItem('arkiplan.pro'); } catch (e) { /* */ }
    } catch (e) { /* offline: keep the cached state */ }
    try { const p = await np.getProducts({ productIdentifiers: [PRO.product], productType: 'subs' }); const q = p.products && p.products[0]; if (q && q.priceString) pro.price = q.priceString; } catch (e) { /* product not set up yet */ }
    if ($('home').classList.contains('active')) renderHome();
  }
  // web / test builds (no Google Play) are not locked
  const proOK = () => !NP() || pro.active || cachedPro() || trialLeft() > 0;
  const proLabel = () => !NP() ? '' : pro.active || cachedPro() ? '<b>ArkiPlan Pro</b> \u2713 active' : trialLeft() > 0 ? 'Free trial: <b>' + Math.ceil(trialLeft()) + ' day' + (Math.ceil(trialLeft()) > 1 ? 's' : '') + '</b> left' : 'Free trial ended – downloads need <b>ArkiPlan Pro</b>';
  async function requirePro(run) {
    if (proOK()) return run();
    if (await paywall()) run();
  }
  async function paywall() {
    const html = `<div class="form">
      <h4 style="margin:0">ArkiPlan Pro – ${esc(pro.price)} / month</h4>
      <p class="small">Your ${PRO.trialDays}-day free trial has ended. Subscribe to keep downloading:</p>
      <ul class="small" style="margin:0 0 0 18px;padding:0;line-height:1.6">
        <li>Complete permit plan sets as PDF (architectural, structural, electrical, plumbing)</li>
        <li>Bill of materials &amp; cost estimate PDF</li><li>DXF for AutoCAD and PNG sheets</li><li>Unlimited projects</li></ul>
      <p class="muted small">Drawing, previews and project backups stay free. Billed monthly by Google Play; cancel anytime in Google Play › Payments &amp; subscriptions.</p>
    </div>`;
    const v = await modal('Subscribe to download', html, 'Subscribe', { text: 'Restore purchase', value: 'restore' });
    if (!v) return false;
    const np = NP(); if (!np) return true;
    try {
      if (v === 'restore') { toast('Checking Google Play…', 1500); await np.restorePurchases(); await proRefresh(); toast(proOK() ? 'Subscription restored – thank you!' : 'No active subscription found for this Google account', 2600); return proOK(); }
      toast('Opening Google Play…', 1500);
      const t = await np.purchaseProduct({ productIdentifier: PRO.product, planIdentifier: PRO.plan, productType: 'subs' });
      if (t) { pro.active = true; lsSet('arkiplan.pro', String(Date.now())); }
      await proRefresh(); toast('Welcome to ArkiPlan Pro!', 2200); return true;
    } catch (e) { toast('Purchase not completed' + (e && e.message ? ' – ' + e.message : ''), 3000); return false; }
  }
  async function manageSub() { const np = NP(); if (!np) { toast('Subscriptions are managed in the Google Play version', 2000); return; } try { await np.manageSubscriptions(); } catch (e) { toast('Open Google Play › Payments & subscriptions', 2500); } }
  setTimeout(proRefresh, 1500);
  document.addEventListener('resume', () => proRefresh());

  function renderHome() {
    const list = AP.store.list();
    $('projList').innerHTML = list.length ? list.map(p => `
      <div class="proj${isSample(p.id) ? ' sample' : ''}" data-id="${p.id}">
        <div class="info"><div class="t">${isSample(p.id) ? '<span class="badge">SAMPLE</span> ' : ''}${esc(p.title || 'Untitled project')}</div>
        <div class="s">${esc(p.owner || '')} · ${esc(p.type || '')} · ${new Date(p.updated).toLocaleDateString()}</div></div>
        <button class="primary" data-act="open">Open</button>
        ${isSample(p.id) ? '<button class="ghost" data-act="reset" title="Back to the original sample">&#8634;</button>' : '<button class="ghost" data-act="del" title="Delete">&#128465;</button>'}
      </div>`).join('') : '<p class="muted">No projects yet. Tap <b>New Project</b> to start.</p>';
    const pb = $('proBar');
    if (pb) { const l = proLabel(); pb.style.display = l ? 'flex' : 'none'; pb.innerHTML = l ? l + (pro.active || cachedPro() ? ' <button class="ghost" id="proManage">Manage</button>' : ' <button class="primary" id="proBuy">Subscribe ' + esc(pro.price) + '/mo</button>') : ''; if ($('proBuy')) $('proBuy').onclick = () => paywall(); if ($('proManage')) $('proManage').onclick = () => manageSub(); }
  }
  $('projList').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('.proj').dataset.id;
    if (b.dataset.act === 'open') openProject(AP.store.load(id));
    else if (b.dataset.act === 'reset') {
      if (await confirmBox('Reset the sample?', 'Your changes to this sample house are undone and it goes back to the original.', 'Reset')) { AP.store.remove(id); renderHome(); toast('Sample house restored', 1500); }
    }
    else if (b.dataset.act === 'del') {
      const p = AP.store.list().find(q => q.id === id);
      if (await confirmBox('Delete project?', `"${(p && p.title) || 'Untitled'}" will be removed from this device. Export it first if you need a backup.`, 'Delete')) {
        AP.store.remove(id);
        try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.indexOf('arkiplan.ul.' + id + '.') === 0) localStorage.removeItem(k); } } catch (err) { /* storage blocked */ }
        renderHome();
      }
    }
  });
  $('btnNew').onclick = () => startWizard();
  /* ---------- sketch / hand-drawn plan -> rooms (on the device, no internet: sketch.js) ---------- */
  // the photo of a floor is kept apart from the project (so undo stays light): localStorage 'arkiplan.ul.<project>.<floor>';
  // floor.underlay = { x, y, w, h (metres), op (opacity), hide }
  const ulKey = (p, f) => 'arkiplan.ul.' + p.id + '.' + f.id, ulCache = {};
  const ulGet = (p, f) => { const k = ulKey(p, f); if (!(k in ulCache)) { try { ulCache[k] = localStorage.getItem(k); } catch (e) { ulCache[k] = null; } } return ulCache[k]; };
  const ulSet = (p, f, url) => { const k = ulKey(p, f); ulCache[k] = url; try { if (url) localStorage.setItem(k, url); else localStorage.removeItem(k); return true; } catch (e) { return false; } };
  let sketchFor = 'new';
  if ($('btnSketch')) $('btnSketch').onclick = () => { sketchFor = 'new'; $('fileSketch').value = ''; $('fileSketch').click(); };
  $('fileSketch').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importSketch(f, sketchFor); } catch (err) { toast('Could not read the picture: ' + err.message, 4000); }
  };
  async function importSketch(file, target) {
    toast('Reading the sketch…', 1500);
    const big = await AP.loadSketchImage(file, 1600);
    // detection on a copy at most 1000 px
    const k = Math.min(1, 1000 / Math.max(big.canvas.width, big.canvas.height)), cv = document.createElement('canvas');
    cv.width = Math.round(big.canvas.width * k); cv.height = Math.round(big.canvas.height * k);
    cv.getContext('2d').drawImage(big.canvas, 0, 0, cv.width, cv.height);
    const det = AP.detectPlan(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height));
    const url = big.canvas.toDataURL('image/jpeg', 0.72), n = det.rooms.length;
    const fields = [
      ...(target === 'new' ? [{ k: 'title', label: 'Project title', type: 'text', value: 'A PROPOSED ONE-STOREY RESIDENTIAL BUILDING' }, { k: 'owner', label: 'Owner', type: 'text', value: '' }] : []),
      { k: 'wid', label: n ? 'Real width of the house – outside wall to outside wall, left to right' : 'Real width of the drawing (left to right)', type: 'len', value: 10,
        hint: n ? 'Found ' + n + ' room' + (n > 1 ? 's' : '') + ' and ' + det.doors.length + ' wall gap' + (det.doors.length === 1 ? '' : 's') + '. This one size sets the scale of the whole sketch.' : 'No closed rooms found – the photo is placed under the plan so you can trace it (draw neat, dark, straight walls for automatic rooms).' }
    ];
    const v = await modal(n ? 'Sketch → floor plan' : 'Sketch as a background', fields, n ? 'Make the plan' : 'Place the photo');
    if (!v) return;
    const pxW = det.bbox ? det.bbox.x1 - det.bbox.x0 : cv.width, mpp = Math.max(0.1, v.wid) / pxW;
    const pl = n ? AP.planFromDetection(det, mpp) : { rooms: [], openings: [] };
    const ox = det.bbox ? det.bbox.x0 : 0, oy = det.bbox ? det.bbox.y0 : 0;
    const ul = { x: -ox * mpp, y: -oy * mpp, w: cv.width * mpp, h: cv.height * mpp, op: 0.45 };
    let p = P, flo;
    if (target === 'new') {
      p = AP.newProject({ title: v.title || 'A PROPOSED RESIDENTIAL BUILDING', owner: v.owner || '', type: 'Residential' }, {}, 1);
      flo = p.floors[0];
    } else {
      flo = P.floors[fi];
      if (n && flo.rooms.length && !(await confirmBox('Replace the rooms?', 'The ' + flo.name.toLowerCase() + ' already has rooms. Replace them with the ' + n + ' rooms from the sketch?', 'Replace'))) {
        commit(); flo.underlay = ul; ulSet(P, flo, url) || toast('The photo is too big to keep on this device', 3000); changed(); return;
      }
      commit();
    }
    if (n) { flo.rooms = pl.rooms; flo.openings = pl.openings; flo.furniture = []; }
    flo.underlay = ul;
    if (!ulSet(p, flo, url)) toast('The photo is too big to keep on this device – the rooms are made, the background is not', 3500);
    AP.store.save(p);
    if (target === 'new') openProject(p); else changed();
    toast(n ? 'Made ' + n + ' rooms from the sketch – tap a room to name it (Living, Bedroom…) and fix any size. 📷 Sketch shows / hides the photo.' : 'Photo placed under the plan – 📷 Sketch › Set scale, then draw the rooms over it', 5000);
  }
  async function sketchMenu() {
    const flo = P.floors[fi], u = flo.underlay, has = !!(u && ulGet(P, flo));
    const html = `<div class="btn-col">
      <button data-a="photo" class="primary">&#128247; ${has ? 'New photo / sketch for' : 'Sketch / photo for'} the ${esc(flo.name.toLowerCase())}</button>
      ${has ? `<button data-a="scale">&#128207; Set scale – tap 2 points of a known size</button>
      <button data-a="move">&#10021; Move the photo</button>
      <button data-a="op">&#9681; Lighter / darker (now ${Math.round((u.op || 0.45) * 100)}%)</button>
      <button data-a="hide">${u.hide ? '&#128065; Show the photo' : '&#128584; Hide the photo'}</button>
      <button data-a="del" class="danger">&#128465; Remove the photo</button>` : ''}</div>
      <p class="muted small">Works offline. For automatic rooms draw the walls dark and straight (use a ruler), close the corners, and take the photo from straight above. Room names and handwritten sizes are not read – name the rooms after.</p>`;
    $('mTitle').textContent = 'Sketch / photo of the plan'; $('mBody').innerHTML = html;
    const btns = $('mBtns'); btns.innerHTML = '';
    const bc = document.createElement('button'); bc.className = 'ghost'; bc.textContent = 'Close'; bc.onclick = () => { $('modal').hidden = true; }; btns.appendChild(bc);
    $('modal').hidden = false; $('modal').onclick = e => { if (e.target === $('modal')) $('modal').hidden = true; };
    $('mBody').querySelectorAll('button[data-a]').forEach(b => b.onclick = async () => {
      $('modal').hidden = true;
      const a = b.dataset.a;
      if (a === 'photo') { sketchFor = 'floor'; $('fileSketch').value = ''; $('fileSketch').click(); }
      else if (a === 'scale') { mode = { kind: 'ulScale', pts: [] }; sel = null; refresh(); }
      else if (a === 'move') { mode = { kind: 'ulMove' }; sel = null; refresh(); }
      else if (a === 'op') { commit(); const L = [0.25, 0.45, 0.7], i = L.findIndex(q => Math.abs(q - (u.op || 0.45)) < 0.01); u.op = L[(i + 1) % L.length]; changed(); toast('Photo ' + Math.round(u.op * 100) + '%', 1200); }
      else if (a === 'hide') { commit(); u.hide = !u.hide; changed(); }
      else if (a === 'del') { if (await confirmBox('Remove the photo?', 'The rooms you drew stay.', 'Remove')) { commit(); delete flo.underlay; ulSet(P, flo, null); changed(); } }
    });
  }
  // set scale: two taps on the photo, then the real length between them (the first point stays put)
  async function ulScaleTap(m) {
    mode.pts.push(m); updateOverlay();
    if (mode.pts.length < 2) { toast('Now tap the other end', 1500); return; }
    const [a, b] = mode.pts, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const v = await modal('Set the scale', [{ k: 'L', label: 'Real length between the 2 points', type: 'len', value: d }], 'OK');
    mode = null;
    if (!v || !(v.L > 0) || d < 1e-6) { refresh(); return; }
    const u = P.floors[fi].underlay, f = v.L / d;
    commit();
    u.x = a[0] - (a[0] - u.x) * f; u.y = a[1] - (a[1] - u.y) * f; u.w *= f; u.h *= f;
    changed(); toast('Scale set – the photo now matches the real size', 2000);
  }
  $('btnImport').onclick = () => $('fileImport').click();
  /* ---------- phone / tablet layout (this device's choice, kept in the browser) ---------- */
  const LAYOUTS = { auto: 'Auto', phone: 'Phone', tablet: 'Tablet' };
  const layoutPref = () => { try { return localStorage.getItem('arkiplan.layout') || 'auto'; } catch (e) { return 'auto'; } };
  function applyLayout() {
    const p = layoutPref(), tab2 = p === 'tablet' || (p === 'auto' && window.innerWidth >= 900);
    document.body.classList.toggle('tablet', tab2);
    $('btnLayout').textContent = (tab2 ? '💻 ' : '📱 ') + LAYOUTS[p];
  }
  function cycleLayout() {
    const order = ['auto', 'phone', 'tablet'], n = order[(order.indexOf(layoutPref()) + 1) % 3];
    try { localStorage.setItem('arkiplan.layout', n); } catch (e) { /* private mode */ }
    applyLayout();
    toast('Layout: ' + LAYOUTS[n] + (n === 'auto' ? ' (tablet on wide screens)' : ''), 1800);
    if (P && current) setTimeout(() => refresh(true), 60);
  }
  $('btnLayout').onclick = cycleLayout;
  $('btnLayout2').onclick = cycleLayout;
  applyLayout();
  window.addEventListener('resize', applyLayout);
  $('fileImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (!p.floors || !p.info) throw new Error('not an ArkiPlan file');
      p.id = AP.uid(); AP.store.save(p); renderHome(); toast('Project imported');
    } catch (err) { toast('Import failed: ' + err.message, 3500); }
    e.target.value = '';
  };

  /* ---------------- WIZARD ---------------- */
  let wiz = null;
  const WIZ = [
    { q: 'What is the project?', f: () => [
      { k: 'title', label: 'Project name', value: wiz.info.title, ph: 'A PROPOSED 2-STOREY RESIDENTIAL BUILDING' },
      { k: 'type', label: 'Building type', type: 'select', value: wiz.info.type, options: [['Residential', 'Residential'], ['Commercial', 'Commercial']] },
      { k: 'storeys', label: 'Number of storeys', type: 'number', step: 1, value: wiz.storeys },
      { k: 'units', label: 'Units', type: 'select', value: wiz.s.units || 'mm', options: Object.entries(AP.UNITS).map(([k, u]) => [k, u.label]), hint: 'Millimeters is the default. Used for every size you type and every dimension on the plans.' }
    ] },
    { q: 'Who is the owner?', f: () => [
      { k: 'owner', label: 'Name of owner', value: wiz.info.owner, ph: 'JUAN DELA CRUZ' },
      { k: 'ownerAddress', label: 'Address of owner', value: wiz.info.ownerAddress, ph: 'Brgy., Municipality, Province' }
    ] },
    { q: 'Where will it be built?', f: () => [
      { k: 'location', label: 'Project location / address', value: wiz.info.location, ph: 'Lot 1, Brgy. Poblacion, Tabuelan, Cebu' },
      { k: 'province', label: 'Province', value: wiz.info.province, ph: 'Cebu', pair: true },
      { k: 'municipality', label: 'Municipality / City', value: wiz.info.municipality, ph: 'Tabuelan' }
    ] },
    { q: 'Designer details (title block)', f: () => [
      { k: 'architect', label: 'Architect', value: wiz.info.architect, hint: 'Optional – printed in the title block' },
      { k: 'engineer', label: 'Civil engineer', value: wiz.info.engineer },
      { k: 'electrical', label: 'Electrical engineer (PEE)', value: wiz.info.electrical, pair: true },
      { k: 'plumber', label: 'Master plumber', value: wiz.info.plumber },
      { k: 'drawnBy', label: 'Drawn by (initials)', value: wiz.info.drawnBy, pair: true },
      { k: 'projectNo', label: 'Project no.', value: wiz.info.projectNo }
    ] },
    { q: 'Walls and heights (metres)', f: () => [
      { k: 'extWall', label: 'Exterior wall thickness', type: 'len', value: wiz.s.extWall, hint: '150mm CHB', pair: true },
      { k: 'intWall', label: 'Interior wall thickness', type: 'len', value: wiz.s.intWall, hint: '100mm CHB' },
      { k: 'floorHt', label: 'Floor to top of beam', type: 'len', value: wiz.s.floorHt, pair: true },
      { k: 'ceilingHt', label: 'Ceiling height', type: 'len', value: wiz.s.ceilingHt },
      { k: 'doorHt', label: 'Doors & window head ht.', type: 'len', value: wiz.s.doorHt, pair: true },
      { k: 'plinth', label: 'NGL to FFL', type: 'len', value: wiz.s.plinth }
    ] },
    { q: 'Roof and paper', f: () => [
      { k: 'roofType', label: 'Roof design', type: 'select', value: wiz.s.roofType, options: AP.ROOF_TYPES },
      { k: 'roofPitch', label: 'Roof slope (rise per 1 m run)', type: 'number', value: wiz.s.roofPitch, hint: '0.30 ≈ 17°', pair: true },
      { k: 'overhang', label: 'Roof overhang (eaves)', type: 'len', value: wiz.s.overhang },
      { k: 'sheet', label: 'Sheet size', type: 'select', value: wiz.info.sheet, options: [['A3', 'A3 (420 x 297)'], ['A2', 'A2 (594 x 420)'], ['A1', 'A1 (841 x 594)'], ['20x30', '20" x 30"']] }
    ] }
  ];
  function startWizard() {
    wiz = { step: 0, storeys: 1, info: { title: '', type: 'Residential', owner: '', ownerAddress: '', location: '', province: '', municipality: '', architect: '', engineer: '', electrical: '', plumber: '', drawnBy: '', projectNo: '', sheet: 'A3' }, s: AP.defaultSettings('Residential') };
    show('wizard'); renderWiz();
  }
  function renderWiz() {
    AP.U = wiz.s.units || 'mm';
    const st = WIZ[wiz.step];
    $('wizSteps').innerHTML = WIZ.map((_, i) => `<i class="${i <= wiz.step ? 'on' : ''}"></i>`).join('');
    $('wizTitle').textContent = 'New Project ' + (wiz.step + 1) + '/' + WIZ.length;
    $('wizBody').innerHTML = `<div class="wiz-q">${esc(st.q)}</div>` + renderFields(st.f());
    $('wizPrev').disabled = wiz.step === 0;
    $('wizNext').textContent = wiz.step === WIZ.length - 1 ? 'Start drawing' : 'Next';
    const first = $('wizBody').querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
  }
  function readWiz() {
    const v = readFields(WIZ[wiz.step].f());
    for (const [k, val] of Object.entries(v)) {
      if (k === 'storeys') wiz.storeys = Math.max(1, Math.min(6, Math.round(val)));
      else if (k in wiz.s) wiz.s[k] = val;
      else wiz.info[k] = val;
    }
    if (v.type) { const d = AP.defaultSettings(v.type); wiz.s.roofType = wiz.s._roofTouched ? wiz.s.roofType : d.roofType; }
    if (v.roofType) wiz.s._roofTouched = true;
  }
  $('wizNext').onclick = () => {
    readWiz();
    if (wiz.step === 0 && !wiz.info.title.trim()) wiz.info.title = 'A PROPOSED ' + wiz.storeys + '-STOREY ' + wiz.info.type.toUpperCase() + ' BUILDING';
    if (wiz.step === 1 && !wiz.info.owner.trim()) { toast('Please enter the name of the owner'); return; }
    if (wiz.step < WIZ.length - 1) { wiz.step++; renderWiz(); return; }
    delete wiz.s._roofTouched;
    const p = AP.newProject(wiz.info, wiz.s, wiz.storeys);
    AP.store.save(p);
    openProject(p, true);
  };
  $('wizPrev').onclick = () => { readWiz(); if (wiz.step > 0) { wiz.step--; renderWiz(); } };
  $('wizBack').onclick = () => { show('home'); renderHome(); };

  /* ---------------- EDITOR ---------------- */
  function openProject(p, fresh) {
    if (!p) { toast('Project not found'); return; }
    P = p; fi = 0; sel = null; mode = null; undo = []; redo = []; sheetsCache = null;
    for (const k of Object.keys(views)) delete views[k];
    show('editor'); setTab('plan');
    if (fresh) setTimeout(() => addRoomDialog(), 250);
  }
  $('edBack').onclick = () => { if (P) AP.store.save(P); P = null; show('home'); renderHome(); };
  $('btnUndo').onclick = doUndo; $('btnRedo').onclick = doRedo;
  $('btnSettings').onclick = () => settingsDialog();
  $('floorSel').onchange = e => {
    if (e.target.value === '+') { addFloor(); return; }
    fi = +e.target.value; sel = null; inRoom = null; refresh(true);
  };
  function addFloor() {
    commit();
    P.floors.push({ id: AP.uid(), name: AP.floorName(P.floors.length), rooms: [], openings: [] });
    fi = P.floors.length - 1; sel = null; changed();
    toast(P.floors[fi].name + ' added. The floor below is shown in grey.');
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
  /* ---------- lighting & power layouts: add / move / change / delete lights, switches and outlets ---------- */
  // what + Add places: light types, exhaust fan, switch, exit sign / outlet types and the appliance outlets
  const DEV_KINDS = [...Object.entries(AP.LIGHT_TYPES).map(([k, t]) => ['light:' + k, t.name, 'L']), ['ef', 'Exhaust fan', 'L'], ['sw', 'Switch', 'L'], ['exit', 'Exit sign', 'L'],
    ...Object.entries(AP.OUTLET_TYPES).map(([k, t]) => ['co:' + k, t.name, 'P']), ['acu', 'Aircon outlet', 'P'], ['range', 'Range / oven outlet', 'P'], ['ref', 'Refrigerator outlet', 'P'], ['wh', 'Water heater outlet', 'P'], ['wm', 'Washing machine outlet', 'P']];
  const devKindOf = v => (v.kind === 'light' ? 'light:' + (v.lt || 'recessed') : v.kind === 'co' ? 'co:' + (v.ct || (v.wp ? 'wp' : 'duplex')) : v.kind);
  // where a new / moved device goes: lights to the room's centre (or in line with it, or with another light), outlets & switches onto the nearest wall
  function devSnap(m, kind) {
    const fl = P.floors[fi], k = views[current.key].k, tol = 16 / k;
    const r = fl.rooms.find(q => m[0] >= q.x && m[0] <= q.x + q.w && m[1] >= q.y && m[1] <= q.y + q.l);
    let x = snapInc(m[0]), y = snapInc(m[1]);
    if (!SNAP.on) return [r3(x), r3(y)];
    if (!r) { // outside (under the eaves): in line with the centre of a room, or with another light
      const xs = fl.rooms.map(q => q.x + q.w / 2), ys = fl.rooms.map(q => q.y + q.l / 2);
      for (const v of devsHere()) if (v.kind === 'light' && !(sel && v.key === sel.key)) { xs.push(v.x); ys.push(v.y); }
      const pick = (v, arr) => { let b = null, bd = tol; for (const a of arr) if (Math.abs(a - v) < bd) { bd = Math.abs(a - v); b = a; } return b; };
      const bx = pick(m[0], xs), by = pick(m[1], ys); if (bx != null) x = bx; if (by != null) y = by;
      return [r3(x), r3(y)];
    }
    if (kind === 'light' || kind === 'ef') {
      const xs = [r.x + r.w / 2, r.x + r.w / 4, r.x + r.w * 3 / 4], ys = [r.y + r.l / 2, r.y + r.l / 4, r.y + r.l * 3 / 4];
      for (const v of devsHere()) if (v.room === r.id && (v.kind === 'light' || v.kind === 'ef') && !(sel && v.key === sel.key)) { xs.push(v.x); ys.push(v.y); }
      const pick = (v, arr) => { let b = null, bd = tol; for (const a of arr) if (Math.abs(a - v) < bd) { bd = Math.abs(a - v); b = a; } return b; };
      const bx = pick(m[0], xs), by = pick(m[1], ys);
      if (bx != null) x = bx; if (by != null) y = by;
      return [r3(x), r3(y)];
    }
    if (kind === 'sw' || kind === 'co' || ['acu', 'range', 'ref', 'wh', 'wm'].indexOf(kind) >= 0) {
      // onto the face of the nearest wall when within 600
      const walls = AP.computeWalls(fl, P.settings), off = s => { const si = AP.sideInfo(r, s), w = AP.wallAt(walls, si.o, si.c, si.o === 'h' ? m[0] : m[1]); return (w && w.t ? w.t / 2 : 0) + (kind === 'acu' ? 0.3 : 0.12); };
      const dist = { N: m[1] - r.y, S: r.y + r.l - m[1], W: m[0] - r.x, E: r.x + r.w - m[0] }, sd = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0];
      if (dist[sd] < 0.6) { if (sd === 'N') y = r.y + off('N'); if (sd === 'S') y = r.y + r.l - off('S'); if (sd === 'W') x = r.x + off('W'); if (sd === 'E') x = r.x + r.w - off('E'); }
    }
    return [r3(x), r3(y)];
  }
  const LIGHT_KINDS = ['light', 'ef', 'sw', 'exit'];
  // circuit choices: automatic, every circuit there is, a new one
  const ckOpts = (cur, now) => { const CK = AP.elecLayout(P).ckts; return [['', 'Circuit: automatic' + (now ? ' (now ' + now + ')' : '')], ...CK.map(c => [String(c.no), 'Circuit ' + c.no + ' – ' + c.desc.toLowerCase() + ' (' + c.va + ' VA)']), [String(CK.length + 1), 'New circuit ' + (CK.length + 1)]]
    .map(o => `<option value="${o[0]}"${String(cur) === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join(''); };
  const linkName = key => { if (key === 'lp') return 'panel board LP (home run)'; const t = AP.elecLayout(P).F.flat().find(q => q.key === key); return t ? (DEV_KINDS.find(q => q[0] === devKindOf(t)) || ['', t.kind])[1] + ' · ' + (t.outside ? 'outside' : t.rname || '') + (t.ckt ? ' · circuit ' + t.ckt : '') : '(removed)'; };
  // connect the device being linked to the one tapped: wired from it, on its circuit
  function linkDev(m) {
    const from = mode.from, t = hitDev(m); mode = null;
    if (!t || t.key === from) { refresh(); toast('Not connected', 1200); return; }
    // no loops: the tapped one must not already be fed through this one
    const all = AP.elecLayout(P).F.flat(); let q = t, n = 0;
    while (q && q.to && n++ < 200) { if (q.to === from) { refresh(); toast('That one is already wired from this one', 2000); return; } q = all.find(z => z.key === q.to); }
    commit(); pinCircuits();
    const ch = { to: t.key === 'lp' ? 'lp' : t.key };
    if (t.kind !== 'lp' && t.kind !== 'sw' && t.ckt) ch.cg = t.ckt;
    setDev(from, (a, mine, E) => { if (mine) Object.assign(a, ch); else E.prop[from] = Object.assign(E.prop[from] || {}, ch); });
    sel = { type: 'dev', key: from }; changed();
    toast('Connected' + (ch.cg ? ' – on circuit ' + ch.cg : ''), 1600);
  }
  /* ---------- the panel board opened: main breaker, feeder, every circuit with its breaker, wire, load and what is on it ---------- */
  async function openPanelBoard() {
    const E = AP.elecLayout(P), CT = { L: 'Lighting', C: 'Power', D: 'Appliance' }, CK = E.ckts;
    const what = c => { const n = {}; for (const v of c.devs) { const nm = (DEV_KINDS.find(q => q[0] === devKindOf(v)) || ['', v.kind])[1]; n[nm] = (n[nm] || 0) + 1; } return Object.entries(n).map(([k, q]) => q + ' × ' + k.toLowerCase()).join(', ') || 'nothing yet'; };
    const where = c => [...new Set(c.devs.map(v => (v.outside ? 'outside' : v.rname || '') + (P.floors.length > 1 ? ' (' + P.floors[v.fi].name.toLowerCase() + ')' : '')))].join(', ');
    const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // the panel board drawn: kWh meter, main breaker, bus bar, branch breakers left (odd) and right (even);
    // every label sits in its own space inside the enclosure, names wrapped onto two lines (never cut by the frame)
    const W = 600, cx = W / 2, rh = 60, rows = Math.max(1, Math.ceil(CK.length / 2)), top = 176, H = top + rows * rh + 64;
    const col = { L: '#1c6dd0', C: '#2f8f46', D: '#c4561a' }, tint = { L: '#eaf2fd', C: '#e9f6ec', D: '#fcefe6' };
    const wrap = (s, n) => {
      const out = []; let cur = '';
      for (const w of String(s).split(' ')) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      if (cur) out.push(cur);
      if (out.length > 2) { out.length = 2; out[1] = out[1].slice(0, n - 1) + '…'; }
      return out.map(l => (l.length > n ? l.slice(0, n - 1) + '…' : l));
    };
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:680px;display:block;margin:0 auto;font-family:Segoe UI,Roboto,Arial,sans-serif">
      <defs><linearGradient id="pbBus" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".5" stop-color="#e3b448"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
        <filter id="pbSh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-opacity=".18"/></filter></defs>
      <circle cx="${cx}" cy="26" r="18" fill="#fff" stroke="#334" stroke-width="2"/><text x="${cx}" y="31.5" text-anchor="middle" font-size="15" font-weight="700" fill="#223">M</text>
      <text x="${cx + 28}" y="22" font-size="11" fill="#556">kWh METER</text><text x="${cx + 28}" y="36" font-size="11" fill="#556">2-${xe(E.feeder)}mm² + 1-${xe(E.ground)}mm² (G)</text>
      <line x1="${cx}" y1="44" x2="${cx}" y2="112" stroke="#334" stroke-width="2.5"/>
      <rect x="14" y="66" width="${W - 28}" height="${H - 80}" rx="14" fill="#fbfcfe" stroke="#1d3557" stroke-width="2.5" filter="url(#pbSh)"/>
      <text x="${cx}" y="92" text-anchor="middle" font-size="14" font-weight="700" fill="#1d3557" letter-spacing=".5">PANEL BOARD "LP"</text>
      <text x="${cx}" y="107" text-anchor="middle" font-size="10.5" fill="#667">230V · 1&#966; · 2W + G · ${xe(E.panel ? (E.panel.rname || '').toUpperCase() : '')}</text>
      <rect x="${cx - 54}" y="116" width="108" height="40" rx="8" fill="#1d3557" filter="url(#pbSh)"/>
      <text x="${cx}" y="134" text-anchor="middle" font-size="13.5" font-weight="700" fill="#fff">MAIN ${E.mainAT}AT</text>
      <text x="${cx}" y="149" text-anchor="middle" font-size="10" fill="#c9d8ee">${E.mainAT <= 100 ? 100 : 225}AF · 2P</text>
      <rect x="${cx - 5}" y="156" width="10" height="${rows * rh + 6}" rx="3" fill="url(#pbBus)"/>`;
    CK.forEach((c, i) => {
      const left = i % 2 === 0, y = top + Math.floor(i / 2) * rh, k = col[c.type] || '#555';
      const bw = 70, bh = 30, by = y + 6, bx = left ? cx - 18 - bw : cx + 18;          // breaker
      const nx = left ? bx - 22 : bx + bw + 22;                                         // circuit number
      const tx = left ? nx - 20 : nx + 20, anchor = left ? 'end' : 'start';           // label column, inside the frame
      const lines = wrap(c.desc, 22);
      svg += `<g class="pb-brk" data-no="${c.no}" style="cursor:pointer">
        <rect x="${left ? 18 : cx}" y="${y - 2}" width="${cx - 18}" height="${rh - 4}" rx="8" fill="transparent" class="pb-hit"/>
        <line x1="${left ? cx - 5 : cx + 5}" y1="${by + bh / 2}" x2="${left ? bx + bw : bx}" y2="${by + bh / 2}" stroke="#334" stroke-width="2.5"/>
        <rect class="pb-box" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="${tint[c.type] || '#fff'}" stroke="${k}" stroke-width="2" filter="url(#pbSh)"/>
        <text x="${bx + bw / 2}" y="${by + 19.5}" text-anchor="middle" font-size="13" font-weight="700" fill="${k}">${c.at}AT</text>
        <circle cx="${nx}" cy="${by + bh / 2}" r="13" fill="#fff" stroke="${k}" stroke-width="2"/>
        <text x="${nx}" y="${by + bh / 2 + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#223">${c.no}</text>
        ${lines.map((l, j) => `<text x="${tx}" y="${y + 14 + j * 13}" text-anchor="${anchor}" font-size="11" font-weight="${j ? 600 : 700}" fill="#1f2937">${xe(l)}</text>`).join('')}
        <text x="${tx}" y="${y + 14 + lines.length * 13 + 1}" text-anchor="${anchor}" font-size="10" fill="#6b7280">${c.va} VA · ${c.amps.toFixed(1)} A</text></g>`;
    });
    const ly = H - 26;
    svg += `<line x1="40" y1="${ly - 16}" x2="${W - 40}" y2="${ly - 16}" stroke="#e1e6ee"/>
      <rect x="44" y="${ly - 8}" width="10" height="10" rx="2" fill="${col.L}"/><text x="59" y="${ly + 1}" font-size="10.5" fill="#445">Lighting</text>
      <rect x="120" y="${ly - 8}" width="10" height="10" rx="2" fill="${col.C}"/><text x="135" y="${ly + 1}" font-size="10.5" fill="#445">Power</text>
      <rect x="185" y="${ly - 8}" width="10" height="10" rx="2" fill="${col.D}"/><text x="200" y="${ly + 1}" font-size="10.5" fill="#445">Appliance</text>
      <text x="${W - 44}" y="${ly + 1}" text-anchor="end" font-size="10.5" fill="#445">${CK.length} circuits · ${Math.round(E.total)} VA · ground rod 16mmØ x 3.0m</text></svg>`;
    const card = c => `<div style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center;border:1.5px solid ${col[c.type] || '#555'};border-radius:10px;padding:8px;margin-top:8px">
        <div style="font-size:18px;font-weight:700;text-align:center;border:1.5px solid #333;border-radius:50%;width:34px;height:34px;line-height:31px">${c.no}</div>
        <div><b>${esc(c.desc)}</b> <span class="muted">· ${CT[c.type] || ''}</span><br><span class="small">${c.at}AT · ${esc(c.wire)} · ${c.va} VA · ${c.amps.toFixed(2)} A</span><br>
        <span class="small muted">${esc(what(c))}${c.devs.length ? ' – ' + esc(where(c)) : ''}</span></div>
        <button type="button" id="pbShow" data-no="${c.no}">Show</button></div>`;
    const html = `<div style="font-size:13px">${svg}
      <div class="small muted" style="text-align:center;margin-top:4px">Demand ${Math.round(E.demand)} VA · ${E.amps.toFixed(1)} A on the main breaker</div>
      <div id="pbCard"><p class="muted small" style="text-align:center;margin:10px 0">Tap a breaker to open its circuit</p></div></div>`;
    const pr = modal('Panel board LP', html, 'Close', { text: '⚡ Circuits', value: 'ckts' });
    const open = no => {
      const c = CK.find(q => q.no === no); if (!c) return;
      $('mBody').querySelectorAll('.pb-box').forEach(b => b.setAttribute('stroke-width', b.closest('.pb-brk').dataset.no === String(no) ? '4' : '2'));
      $('pbCard').innerHTML = card(c);
      $('pbShow').onclick = () => {
        sub.hiCkt = no; sel = null;
        // the layout that shows it: lighting for lights, power for outlets; its floor
        const lt = c.devs.some(v => LIGHT_KINDS.indexOf(v.kind) >= 0), fl0 = c.devs.length ? c.devs[0].fi : fi;
        sub.det = lt || (!c.devs.length && c.type === 'L') ? 'eLight' : 'ePower'; fi = fl0;
        [...$('mBtns').querySelectorAll('button')].find(q => q.textContent === 'Close').click(); refresh(true);
        toast('Circuit ' + no + ' – ' + c.desc.toLowerCase() + ' (' + c.devs.length + ' on it)', 2600);
      };
    };
    $('mBody').querySelectorAll('.pb-brk').forEach(g2 => g2.addEventListener('click', () => open(+g2.dataset.no)));
    const v = await pr;
    if (v === 'ckts') circuitsDialog();
  }

  /* ---------- circuits: make lighting / power circuits, name them, change their type, remove the ones you made ---------- */
  const CK_TYPES = [['L', 'Lighting'], ['C', 'Power – convenience outlets'], ['D', 'Power – appliance (dedicated)']];
  async function circuitsDialog() {
    const paint = () => {
      const CK = AP.elecLayout(P).ckts, defs = elecEd().circuits || [];
      $('mBody').innerHTML = `<div class="form">${CK.map(c => `<div class="ck-row" data-no="${c.no}" style="border-top:1px solid #e3e8ef;padding:6px 0">
          <div class="row"><label>Circuit ${c.no} · ${c.qty} on it · ${c.va} VA<input class="ck-desc" value="${esc(c.desc)}"></label>
          <label>Type<select class="ck-type">${CK_TYPES.map(t => `<option value="${t[0]}"${t[0] === c.type ? ' selected' : ''}>${t[1]}</option>`).join('')}</select></label></div>
          ${defs.some(q => q.no === c.no) ? `<button class="ghost ck-del" type="button">&#10005; Remove circuit ${c.no}</button>` : ''}</div>`).join('')}
        <div class="btn-row"><button id="ckAddL" type="button" class="primary">+ Lighting circuit</button><button id="ckAddP" type="button" class="primary">+ Power circuit</button><button id="ckRenum" type="button">Renumber: lighting, power, appliances</button></div>
        <p class="muted small">A new circuit is empty until you put lights / outlets on it: pick it beside + Add, or tap a light › Circuit (tick "Also every light of the room" for a whole room), or 🔗 Connect to a light that is on it. Removing a circuit you made puts its lights / outlets back on the automatic circuits.</p></div>`;
      const add = type => { read(); commit(); pinCircuits(); const E = elecEd(), n = AP.elecLayout(P).ckts.length + 1; (E.circuits = E.circuits || []).push({ no: n, type, desc: type === 'L' ? 'LIGHTING OUTLETS' : 'CONVENIENCE OUTLETS' }); sub.devCkt = String(n); changed(); paint(); toast('Circuit ' + n + ' made – new ' + (type === 'L' ? 'lights' : 'outlets') + ' go on it', 2200); };
      $('ckAddL').onclick = () => add('L'); $('ckAddP').onclick = () => add('C');
      // lighting circuits first, then the convenience outlets, then the appliances – the lights / outlets keep their circuit
      $('ckRenum').onclick = () => {
        read(); commit(); pinCircuits();
        const CK = AP.elecLayout(P).ckts, ord = { L: 0, C: 1, D: 2 }, sorted = CK.slice().sort((a, b) => ord[a.type] - ord[b.type] || a.no - b.no), map = new Map(sorted.map((c, i) => [c.no, i + 1]));
        const E = elecEd();
        for (const a2 of E.add) if (a2.cg) a2.cg = map.get(a2.cg) || a2.cg;
        for (const k of Object.keys(E.prop)) if (E.prop[k].cg) E.prop[k].cg = map.get(E.prop[k].cg) || E.prop[k].cg;
        for (const df of E.circuits || []) df.no = map.get(df.no) || df.no;
        if (sub.devCkt) sub.devCkt = String(map.get(+sub.devCkt) || sub.devCkt);
        changed(); paint(); toast('Circuits renumbered', 1500);
      };
      $('mBody').querySelectorAll('.ck-del').forEach(b => b.onclick = () => {
        const no = +b.closest('.ck-row').dataset.no; read(); commit(); const E = elecEd();
        E.circuits = (E.circuits || []).filter(q => q.no !== no);
        for (const a of E.add) if (a.cg === no) delete a.cg;
        for (const k of Object.keys(E.prop)) if (E.prop[k].cg === no) delete E.prop[k].cg;
        if (sub.devCkt === String(no)) sub.devCkt = '';
        changed(); paint();
      });
    };
    // names / types typed in the dialog
    const read = () => {
      const rows = [...$('mBody').querySelectorAll('.ck-row')]; if (!rows.length) return;
      const CK = AP.elecLayout(P).ckts, E = elecEd(); let ch = false;
      for (const r of rows) {
        const no = +r.dataset.no, c = CK.find(q => q.no === no); if (!c) continue;
        const desc = r.querySelector('.ck-desc').value.trim().toUpperCase(), type = r.querySelector('.ck-type').value;
        if (desc === c.desc && type === c.type) continue;
        if (!ch) { commit(); pinCircuits(); ch = true; }
        E.circuits = E.circuits || []; const df = E.circuits.find(q => q.no === no);
        if (df) Object.assign(df, { desc: desc || df.desc, type }); else E.circuits.push({ no, type, desc: desc || c.desc });
      }
      return ch;
    };
    const pr = modal('Circuits', '<div></div>', 'Save'); paint();
    if (!(await pr)) { refresh(); return; }
    if (read()) changed(); else refresh();
  }
  function pinCircuits() {
    const E = elecEd(), L = AP.elecLayout(P);
    for (const v of L.F.flat()) {
      if (v.cg || v.kind === 'sw' || !v.ckt) continue;
      if (v.added) { const a = E.add.find(q => 'u:' + q.id === v.key); if (a) a.cg = v.ckt; }
      else E.prop[v.key] = Object.assign(E.prop[v.key] || {}, { cg: v.ckt });
    }
  }
  const elecView = () => tab === 'det' && (sub.det === 'eLight' || sub.det === 'ePower');
  /* ---------- plumbing editing (Details › Plumbing – sanitary / waterline): tap a pipe or a symbol to move or
     delete it, + Pipe to draw one, + Symbol to add one; the water meter and the septic tank can be dragged
     (the pipes follow). Kept in P.plumbEd (see AP.plumbLayout) ---------- */
  const plumbView = () => tab === 'det' && (sub.det === 'pSewer' || sub.det === 'pWater');
  const plumbEd = () => { const E = P.plumbEd = P.plumbEd || {}; E.del = E.del || []; E.move = E.move || {}; E.add = E.add || []; return E; };
  const PIPE_KINDS = [['water:20mmØ', 'Cold water 20mmØ'], ['water:13mmØ', 'Cold water 13mmØ'], ['water:25mmØ', 'Cold water 25mmØ'], ['soil:100mmØ', 'Soil pipe 100mmØ'], ['waste:50mmØ', 'Waste pipe 50mmØ'], ['waste:75mmØ', 'Waste pipe 75mmØ'], ['vent:50mmØ', 'Vent pipe 50mmØ'], ['storm:100mmØ', 'Storm drain 100mmØ']];
  const MARK_KINDS = [['co', 'Cleanout (CO)'], ['fd', 'Floor drain (FD)'], ['vs', 'Vent stack (VS)'], ['stack', 'Soil stack (SS)'], ['cb', 'Catch basin / grease trap'], ['ds', 'Downspout (DS)'], ['scb', 'Storm catch basin'], ['wr', 'Water riser (WR)'], ['hb', 'Hose bibb (HB)']];
  const isWaterKind = k => k.startsWith('water') || k === 'wr' || k === 'hb';
  let plDraft = null;
  function plumbItems() {
    const PL = AP.plumbLayout(P), F = PL.floors[fi], W = sub.det === 'pWater', it = [];
    if (W) {
      for (const s of F.water) it.push({ t: 'pipe', key: s.key, s, sys: 'water' });
      for (const m of F.marks) if (m.kind === 'wr' || m.kind === 'hb') it.push({ t: 'mark', key: m.key, m, p: m.p });
      if (fi === 0 && PL.meter) it.push({ t: 'meter', key: 'meter', p: PL.meter, moved: PL.meterMoved });
    } else {
      for (const s of F.sewer) it.push({ t: 'pipe', key: s.key, s, sys: s.type });
      for (const m of F.marks) if (m.kind !== 'wr' && m.kind !== 'hb') it.push({ t: 'mark', key: m.key, m, p: m.p });
      if (fi === 0) {
        for (const s of PL.storm) {
          if (s.kind === 'line') it.push({ t: 'pipe', key: s.key, s, sys: 'storm' });
          else if (s.kind === 'ds' || s.kind === 'scb') it.push({ t: 'mark', key: s.key, m: s, p: s.p });
        }
        if (PL.tank) { const T = PL.tank; it.push({ t: 'tank', key: 'tank', T, p: [(T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2], moved: PL.tankMoved }); }
      }
    }
    return { it, PL };
  }
  const segDist = (m, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / L2)); return Math.hypot(m[0] - a[0] - dx * t, m[1] - a[1] - dy * t); };
  function plHit(m) {
    const k = views[current.key].k, { it } = plumbItems();
    let best = null, bd = 16 / k;
    for (const x of it) {
      if (x.t === 'tank') { const T = x.T; if (m[0] >= T.x0 && m[0] <= T.x1 && m[1] >= T.y0 && m[1] <= T.y1) return x; continue; }
      if (x.p) { const dd = Math.hypot(m[0] - x.p[0], m[1] - x.p[1]); if (dd < bd) { bd = dd; best = x; } }
    }
    if (best) return best;
    bd = 10 / k;
    for (const x of it) if (x.t === 'pipe') { const dd = segDist(m, x.s.a, x.s.b); if (dd < bd) { bd = dd; best = x; } }
    return best;
  }
  const findPl = key => plumbItems().it.find(x => x.key === key);
  // a point for a new pipe end: onto a pipe end / fixture / symbol near the finger, else to the 50 mm grid
  function plSnap(m, from) {
    const k = views[current.key].k, { it, PL } = plumbItems(), pts = [];
    for (const x of it) { if (x.t === 'pipe') pts.push(x.s.a, x.s.b); else if (x.p) pts.push(x.p); }
    for (const f of PL.fx) if (f.fi === fi) { if (f.wp) pts.push(f.wp); if (f.dp) pts.push(f.dp); }
    let best = null, bd = 14 / k;
    for (const p of pts) { const dd = Math.hypot(m[0] - p[0], m[1] - p[1]); if (dd < bd) { bd = dd; best = p; } }
    if (best) return best.slice();
    const q = [Math.round(m[0] / 0.05) * 0.05, Math.round(m[1] / 0.05) * 0.05];
    if (from) { if (Math.abs(q[0] - from[0]) < Math.abs(q[1] - from[1]) * 0.2) q[0] = from[0]; else if (Math.abs(q[1] - from[1]) < Math.abs(q[0] - from[0]) * 0.2) q[1] = from[1]; }
    return [r3(q[0]), r3(q[1])];
  }
  function plMove(g, m) {
    if (!g.committed) { commit(); g.committed = true; }
    const E = plumbEd(), p = [r3(Math.round(m[0] / 0.05) * 0.05), r3(Math.round(m[1] / 0.05) * 0.05)];
    if (g.key === 'meter') E.meter = p;
    else if (g.key === 'tank') E.tank = [r3(p[0] - g.hw), r3(p[1] - g.hh)];
    else if (g.key.startsWith('u:')) { const a = E.add.find(q => 'u:' + q.id === g.key); if (a) a.p = p; }
    else E.move[g.key] = p;
    draw(false);
  }
  function plDelete(key) {
    const E = plumbEd();
    if (key === 'meter') { delete E.meter; return; }
    if (key === 'tank') { delete E.tank; return; }
    if (key.startsWith('u:')) E.add = E.add.filter(a => 'u:' + a.id !== key);
    else { if (E.del.indexOf(key) < 0) E.del.push(key); delete E.move[key]; }
  }
  const PL_NAMES = { water: 'Cold water line', soil: 'Soil pipe', waste: 'Waste pipe', vent: 'Vent pipe', storm: 'Storm drain', co: 'Cleanout', fd: 'Floor drain', vs: 'Vent stack', stack: 'Soil / waste stack', cb: 'Catch basin', ds: 'Downspout', scb: 'Storm catch basin', wr: 'Water riser', hb: 'Hose bibb', meter: 'Water meter', tank: 'Septic tank' };
  function plPanel(pn) {
    const x = findPl(sel.key); if (!x) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    const nm = x.t === 'pipe' ? PL_NAMES[x.sys] + (x.s.size ? ' · ' + x.s.size : '') + ' · ' + AP.len(Math.hypot(x.s.b[0] - x.s.a[0], x.s.b[1] - x.s.a[1])) : x.t === 'mark' ? PL_NAMES[x.m.kind] || x.m.kind : PL_NAMES[x.t];
    const added = x.key.startsWith('u:'), moved = x.moved || (x.m && x.m.moved);
    const canMove = x.t !== 'pipe';
    pn.innerHTML = `<div class="ph"><b>${esc(nm)}${added ? ' · added' : moved ? ' · moved' : ''}</b><button class="ghost" id="pClose">&#10005;</button></div>
      <p class="muted small" style="margin:4px 0">${canMove ? 'Drag it to move it' + (x.t === 'meter' || x.t === 'tank' ? ' – the pipes are routed again from the new place' : '') + '.' : 'Delete it and draw your own with + Pipe, or leave it.'} The P sheets and the isometrics follow.</p>
      <div class="btn-row">${(x.t === 'meter' || x.t === 'tank') ? (moved ? '<button id="plBack">Back to the automatic place</button>' : '') : '<button id="plDel" class="danger">Delete</button>'}${!added && x.t === 'mark' && moved ? '<button id="plBack2">Back to the automatic place</button>' : ''}</div>`;
    if ($('plDel')) $('plDel').onclick = () => { commit(); plDelete(sel.key); sel = null; changed(); toast('Deleted – Reset this layout brings the automatic ones back', 2000); };
    if ($('plBack')) $('plBack').onclick = () => { commit(); plDelete(sel.key); changed(); };
    if ($('plBack2')) $('plBack2').onclick = () => { commit(); delete plumbEd().move[sel.key]; changed(); };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }
  const elecEd = () => { const E = P.elecEd = P.elecEd || {}; E.del = E.del || []; E.move = E.move || {}; E.prop = E.prop || {}; E.add = E.add || []; return E; };
  const devsHere = () => {
    const E = AP.elecLayout(P), L = ((E.F[fi]) || []).filter(v => (LIGHT_KINDS.indexOf(v.kind) >= 0) === (sub.det === 'eLight'));
    if (E.panel && E.panel.fi === fi) L.push({ kind: 'lp', key: 'lp', x: E.panel.x, y: E.panel.y, rname: E.panel.rname, moved: !!E.panel.moved }); // the panel board
    return L;
  };
  // the panel board against the nearest wall, inside the room; the kWh meter outside that wall
  function lpPlace(m) {
    const fl = P.floors[fi], r = fl.rooms.find(q => m[0] >= q.x && m[0] <= q.x + q.w && m[1] >= q.y && m[1] <= q.y + q.l);
    if (!r) return { fi, x: r3(snapInc(m[0])), y: r3(snapInc(m[1])), o: 'h', k: 1, mx: r3(m[0]), my: r3(m[1] - 0.6) };
    const walls = AP.computeWalls(fl, P.settings), dist = { N: m[1] - r.y, S: r.y + r.l - m[1], W: m[0] - r.x, E: r.x + r.w - m[0] };
    const sd = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0], si = AP.sideInfo(r, sd), along = clampV(snapInc(si.o === 'h' ? m[0] : m[1]), si.s0 + 0.3, si.s0 + si.len - 0.3);
    const w = AP.wallAt(walls, si.o, si.c, along), t = w && w.t ? w.t : 0.15, k = sd === 'N' || sd === 'W' ? 1 : -1;
    const P2 = n => (si.o === 'h' ? [along, si.c + k * n] : [si.c + k * n, along]);
    const p = P2(t / 2 + 0.06), mm = P2(-(t / 2 + 0.35));
    return { fi, x: r3(p[0]), y: r3(p[1]), o: si.o, k, mx: r3(mm[0]), my: r3(mm[1]), rname: r.name };
  }
  const clampV = (v, a, b) => Math.min(Math.max(v, a), b);
  const findDev = key => devsHere().find(v => v.key === key);
  function hitDev(m) {
    const k = views[current.key].k; let best = null, bd = 16 / k;
    for (const v of devsHere()) { const dd = Math.hypot(m[0] - v.x, m[1] - v.y); if (dd < bd) { bd = dd; best = v; } }
    return best;
  }
  function addDev(m) {
    const kd = mode.dev, kind = kd.split(':')[0], p = devSnap(m, kind), a = { id: AP.uid(), fi, kind, x: p[0], y: p[1] };
    if (kind === 'light') a.lt = kd.split(':')[1]; if (kind === 'co') { a.ct = kd.split(':')[1]; if (a.ct === 'wp') a.wp = true; }
    if (kind === 'acu') a.hp = 1; if (kind === 'sw') a.gang = 1;
    commit();
    if (sub.devCkt && kind !== 'sw') { pinCircuits(); a.cg = +sub.devCkt; } // the circuit picked beside + Add
    elecEd().add.push(a); sel = { type: 'dev', key: 'u:' + a.id }; changed();
    toast((DEV_KINDS.find(q => q[0] === kd) || ['', 'Device'])[1] + ' added – on circuit with the room it is in', 1800);
  }
  // put a device at (x, y) / change it: an added one changes itself, an automatic one is kept in the edits by its key
  function setDev(key, fn) {
    const E = elecEd();
    if (key.startsWith('u:')) { const a = E.add.find(q => 'u:' + q.id === key); if (a) fn(a, true); return; }
    fn(null, false, E);
  }
  function devMove(g, m) {
    if (!g.committed) { commit(); g.committed = true; }
    if (g.key === 'lp') { elecEd().panel = lpPlace(m); draw(false); return; }
    const v = findDev(g.key), p = devSnap(m, v ? v.kind : 'light');
    setDev(g.key, (a, mine, E) => { if (mine) { a.x = p[0]; a.y = p[1]; } else E.move[g.key] = p; });
    draw(false);
  }
  function devPanel(pn) {
    const v = findDev(sel.key); if (!v) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    if (v.kind === 'lp') {
      pn.innerHTML = `<div class="ph"><b>Panel board LP · ${esc(v.rname || '')}${v.moved ? ' · placed by you' : ''}</b><button class="ghost" id="pClose">&#10005;</button></div>
        <p class="muted small" style="margin:4px 0">Drag it to any wall – it sits on the inside face, the kWh meter goes outside that wall. Every home run points to it.</p>
        <div class="btn-row"><button id="pLpOpen" class="primary">&#128203; Open panel board</button>${v.moved ? '<button id="pLpBack">Back to the automatic place</button>' : ''}</div>`;
      $('pLpOpen').onclick = () => openPanelBoard();
      if ($('pLpBack')) $('pLpBack').onclick = () => { commit(); delete elecEd().panel; changed(); };
      $('pClose').onclick = () => { sel = null; refresh(); };
      pn.classList.add('show'); return;
    }
    const nm = (DEV_KINDS.find(q => q[0] === devKindOf(v)) || ['', v.kind])[1];
    const F = [];
    if (v.kind === 'light') F.push({ k: 'dlt', label: 'Light type', type: 'select', value: v.lt || 'recessed', options: Object.entries(AP.LIGHT_TYPES).map(([k, t]) => [k, t.name + ' – ' + t.va + ' VA']) });
    if (v.kind === 'co') F.push({ k: 'dct', label: 'Outlet type', type: 'select', value: v.ct || (v.wp ? 'wp' : 'duplex'), options: Object.entries(AP.OUTLET_TYPES).map(([k, t]) => [k, t.name]) });
    if (v.kind === 'acu') F.push({ k: 'dhp', label: 'Aircon size', type: 'select', value: String(v.hp || 1), options: [['0.75', '0.75 HP'], ['1', '1 HP'], ['1.5', '1.5 HP'], ['2', '2 HP'], ['2.5', '2.5 HP'], ['3', '3 HP']] });
    if (v.kind === 'sw') F.push({ k: 'dgang', label: 'Switch', type: 'select', value: String(v.gang || 1), options: [['1', 'Single (S)'], ['2', '2-gang (S2)'], ['3', '3-gang (S3)']] });

    // circuit: automatic, or the one the user picks (any existing circuit, or a new one)
    const CK = AP.elecLayout(P).ckts;
    if (v.kind !== 'sw') {
      F.push({ k: 'dcg', label: 'Circuit (moves it off its old circuit)', type: 'select', value: v.cg ? String(v.cg) : '', options: [['', 'Automatic' + (v.cg ? '' : ' (now circuit ' + v.ckt + ')')], ...CK.map(c => [String(c.no), 'Circuit ' + c.no + ' – ' + c.desc.toLowerCase() + ' (' + c.va + ' VA)']), [String(CK.length + 1), 'New circuit ' + (CK.length + 1)]] });
      if (v.room) F.push({ k: 'dall', label: 'Also every ' + (LIGHT_KINDS.indexOf(v.kind) >= 0 ? 'light' : 'outlet') + ' of the ' + (v.rname || 'room').toLowerCase(), type: 'checkbox', value: false });
    }
    pn.innerHTML = `<div class="ph"><b>${esc(nm)} · ${esc(v.outside ? 'outside' : v.rname || '')} · circuit ${v.ckt}${v.added ? ' · added' : v.moved || v.changed ? ' · changed' : ''}</b><button class="ghost" id="pClose">&#10005;</button></div>
      ${F.length ? `<div class="form"><div class="row">${F.map(f => fieldHTML(f, 'p_')).join('')}</div></div>` : ''}
      <p class="muted small" style="margin:4px 0">Drag it to move it. The schedule of loads, the riser and the E sheets follow.</p>
      <p class="small" style="margin:4px 0">${v.to ? '&#128279; Wired from: <b>' + esc(linkName(v.to)) + '</b>' : 'Wired automatically'}</p>
      <div class="btn-row"><button id="pDevLink" class="primary">&#128279; Connect to…</button>${v.to ? '<button id="pDevUnlink">&#9986; Disconnect</button>' : ''}${!v.added && (v.moved || v.changed) ? '<button id="pDevBack">Back to the automatic place</button>' : ''}<button id="pDevDel" class="danger">Delete</button></div>`;
    pn.querySelectorAll('input,select').forEach(el => el.onchange = () => {
      const r = readFields(F, 'p_'), ch = {};
      if (r.dhp != null) ch.hp = +r.dhp; if (r.dgang != null) ch.gang = +r.dgang; if (r.dlt != null) ch.lt = r.dlt; if (r.dct != null) { ch.ct = r.dct; ch.wp = r.dct === 'wp'; }
      if (r.dcg != null) ch.cg = r.dcg ? +r.dcg : 0;
      commit();
      if (el.id === 'p_dcg' || el.id === 'p_dall') pinCircuits(); // keep the other circuits as they are
      const put = (key, c2) => setDev(key, (a, mine, E) => { if (mine) Object.assign(a, c2); else E.prop[key] = Object.assign(E.prop[key] || {}, c2); });
      put(v.key, ch);
      // the whole room's lights (or outlets) to the same circuit
      if (r.dall && r.dcg != null) for (const v2 of devsHere()) if (v2.key !== v.key && v2.room === v.room && v2.kind !== 'lp' && v2.kind !== 'sw') put(v2.key, { cg: ch.cg });
      changed();
      if (el.id === 'p_dcg' || el.id === 'p_dall') toast(ch.cg ? 'On circuit ' + ch.cg + ' – off its old circuit' : 'Back on its automatic circuit', 1800);
    });
    if ($('pDevBack')) $('pDevBack').onclick = () => { commit(); const E = elecEd(); delete E.move[v.key]; delete E.prop[v.key]; changed(); };
    $('pDevLink').onclick = () => { mode = { kind: 'linkDev', from: v.key }; refresh(); toast('Tap the light / outlet (or the switch, or LP) it is wired from – it joins that circuit', 3000); };
    if ($('pDevUnlink')) $('pDevUnlink').onclick = () => { commit(); setDev(v.key, (a, mine, E) => { if (mine) delete a.to; else if (E.prop[v.key]) delete E.prop[v.key].to; }); changed(); toast('Disconnected – wired automatically again', 1600); };
    $('pDevDel').onclick = () => {
      commit(); setDev(v.key, (a, mine, E) => { if (mine) { const E2 = elecEd(); E2.add = E2.add.filter(q => q !== a); } else { E.del.push(v.key); delete E.move[v.key]; delete E.prop[v.key]; } });
      sel = null; changed(); toast(nm + ' deleted', 1400);
    };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }
  function setTab(t) {
    tab = t; mode = null; inRoom = null;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    refresh(true);
  }

  function refresh(fit) {
    if (!P) return;
    if (mode && modeBase == null) modeBase = undo.length; else if (!mode) modeBase = null;
    AP.U = P.settings.units || 'mm';
    AP.REFS = getSheets().refs; // sheet numbers for section / elevation / detail tags
    $('edTitle').textContent = P.info.title || 'Project';
    $('floorSel').innerHTML = P.floors.map((f, i) => `<option value="${i}"${i === fi ? ' selected' : ''}>${esc(f.name)}</option>`).join('') + '<option value="+">+ Add floor</option>';
    $('floorSel').style.display = (tab === 'plan' || (tab === 'det' && /^(beam|toilet|eLight|ePower|pSewer|pWater|pIsoWP|pIsoSP)/.test(sub.det))) ? '' : 'none';
    $('btnUndo').disabled = !undo.length; $('btnRedo').disabled = !redo.length;
    renderSubbar();
    renderPanel();
    draw(fit);
  }

  /* ---------- sub toolbar per tab ---------- */
  function renderSubbar() { renderSubbar0(); snapBtn(); }
  function renderSubbar0() {
    const sb = $('subbar');
    const btn = (id, label, on, cls) => `<button id="${id}" class="${on ? 'on' : ''} ${cls || ''}">${label}</button>`;
    // a tool is on (placing a door / window, walls, columns, furniture): Done / Cancel + what to do, on top
    if (tab === 'plan' && mode && !roofMode() && !levelMode()) { modeBar(sb, btn); return; }
    if (tab === 'plan' && inRoom) {
      const r = P.floors[fi].rooms.find(q => q.id === inRoom);
      sb.innerHTML = btn('sbBack', '&#10003; Done', false, 'primary') + `<span class="lbl"><b>${esc(r ? r.name : '')}</b></span>` + btn('sbFurn', '&#128715; Add furniture', mode && mode.kind === 'furn', 'primary') + btn('sbDoor', '+ Door', mode && mode.kind === 'door') + btn('sbWin', '+ Window', mode && mode.kind === 'window') + btn('sbRFloor', 'Floor') + btn('sbRWalls', 'Walls') + btn('sbRCeil', 'Ceiling') + btn('sbInside', roomInside ? '&#9635; Plan of room' : '&#128065; Inside – all walls', roomInside) + btn('sb3dIn', '&#127968; 3D inside');
      $('sbInside').onclick = () => { roomInside = !roomInside; mode = null; sel = null; refresh(true); };
      $('sb3dIn').onclick = () => { const rr = r; if (!rr) return; sub.inside3d = { fi, x: rr.x + rr.w / 2, y: rr.y + rr.l / 2 }; sub.show3d = fi; sub.ceil3d = false; setTab('3d'); toast('Inside ' + rr.name + ': drag to look around, pinch to step back – 3D / Front … to leave', 3000); };
      $('sbRFloor').onclick = () => r && floorDialog(r);
      $('sbRWalls').onclick = () => r && wallsDialog(r);
      $('sbRCeil').onclick = () => r && ceilingDialog(r);
      $('sbBack').onclick = () => exitRoom();
      $('sbFurn').onclick = () => pickFurniture();
      $('sbDoor').onclick = () => pickTemplate('door');
      $('sbWin').onclick = () => pickTemplate('window');
    } else if (tab === 'plan' && levelMode()) {
      const Lv = curLevel(), L = levelList(), top = Lv.lv >= AP.nLevels(P);
      sb.innerHTML = btn('lvDone', '&#10003; Done', false, 'primary') + `<select id="lvSel">${L.map(q => `<option value="${q.id}"${q.id === Lv.id ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select>` +
        (Lv.edit ? btn('lvAdd', mode.kind === 'addBeam' ? 'Cancel add' : '+ ' + (Lv.lv === 0 ? 'Tie beam' : top ? 'Roof beam' : 'Beam'), mode.kind === 'addBeam') + btn('lvReset', 'Reset beams') : '') + (lvWallOK(Lv) ? btn('lvWall', mode.kind === 'lvWall' ? 'Cancel wall' : '+ Wall', mode.kind === 'lvWall') : '') + (Lv.roof ? btn('lvRoof', '&#8962; Edit roofs') : '') + btn('lvHt', '&#8597; Height');
      if ($('lvWall')) $('lvWall').onclick = () => {
        if (mode.kind === 'lvWall') { mode = { kind: 'levels' }; wallDraft = null; refresh(); return; }
        wallTypeDialog(Lv.id === 'RB', () => {
        mode = { kind: 'lvWall' }; sel = null; wallDraft = null; beamDraft = null;
        if (Lv.id !== 'RB') fi = Lv.floor;
        refresh();
        toast(Lv.id === 'RB' ? 'Drag along the roof beams to draw a wall on them (parapet / fire wall) – snaps to grids & walls' : 'Drag to draw a wall on the ' + P.floors[Lv.floor].name.toLowerCase() + ' – snaps to grids & walls', 2800);
        });
      };
      $('lvHt').onclick = () => levelHeightDialog(Lv);
      $('lvDone').onclick = () => exitLevels();
      $('lvSel').onchange = e => { sub.lvl = e.target.value; mode = { kind: 'levels' }; sel = null; beamDraft = null; wallDraft = null; const nl = curLevel(); if (nl.id !== 'RB' && P.floors[nl.floor]) fi = nl.floor; refresh(true); };
      if ($('lvAdd')) $('lvAdd').onclick = () => { mode = mode.kind === 'addBeam' ? { kind: 'levels' } : { kind: 'addBeam' }; sel = null; beamDraft = null; refresh(); if (mode.kind === 'addBeam') toast('Drag from column to column (snaps to columns & grids)', 2400); };
      if ($('lvReset')) $('lvReset').onclick = async () => {
        if (!(await confirmBox('Reset beams', 'Remove your changes on this level and go back to the automatic beams?', 'Reset'))) return;
        commit(); if (P.beamEd) delete P.beamEd[Lv.lv]; sel = null; changed();
      };
      if ($('lvRoof')) $('lvRoof').onclick = () => enterRoofs();
    } else if (tab === 'plan' && mode && mode.kind === 'trussEdit') {
      const T = AP.trussType(P, tEd.id), isM = sel && sel.type === 'tmem', isN = sel && sel.type === 'tnode';
      sb.innerHTML = btn('sbTeDone', '&#10003; Done', false, 'primary') + `<span class="lbl"><b>${esc(T.mark)} detail</b> – applies to every ${esc(T.mark)}</span>` +
        btn('sbTeAdd', tEd.addFrom != null ? 'Tap the 2nd joint' : '+ Member', tEd.addFrom != null) + (isM ? btn('sbTeSplit', 'Split member') + btn('sbTeDelM', 'Delete member', false, 'danger') : '') + (isN ? btn('sbTeDelN', 'Delete joint', false, 'danger') : '') + btn('sbTeReset', 'Back to the style');
      $('sbTeDone').onclick = () => { mode = { kind: 'trusses' }; sel = null; tEd.addFrom = null; refresh(true); };
      $('sbTeAdd').onclick = () => { if (tEd.addFrom != null) { tEd.addFrom = null; renderSubbar(); return; } if (!sel || sel.type !== 'tnode') { toast('Tap the first joint, then + Member, then the second joint', 2400); return; } tEd.addFrom = sel.i; renderSubbar(); };
      if ($('sbTeSplit')) $('sbTeSplit').onclick = () => { commit(); const c = customOf(), q = c.T.custom.members[sel.i], N = c.T.custom.nodes; N.push([(N[q[0]][0] + N[q[1]][0]) / 2, (N[q[0]][1] + N[q[1]][1]) / 2]); const n = N.length - 1; c.T.custom.members.splice(sel.i, 1, [q[0], n, q[2]], [n, q[1], q[2]]); sel = { type: 'tnode', i: n }; changed(); };
      if ($('sbTeDelM')) $('sbTeDelM').onclick = () => { commit(); const c = customOf(); c.T.custom.members.splice(sel.i, 1); sel = null; changed(); };
      if ($('sbTeDelN')) $('sbTeDelN').onclick = () => {
        const c0 = trussEditInfo(); if (c0 && c0.G.nodes.length <= 3) { toast('A truss needs at least 3 joints'); return; }
        commit(); const c = customOf(), i = sel.i;
        c.T.custom.nodes.splice(i, 1);
        c.T.custom.members = c.T.custom.members.filter(q => q[0] !== i && q[1] !== i).map(q => [q[0] > i ? q[0] - 1 : q[0], q[1] > i ? q[1] - 1 : q[1], q[2]]);
        sel = null; changed();
      };
      $('sbTeReset').onclick = async () => {
        if (!(await confirmBox('Back to the style', 'Forget your changes to the ' + T.mark + ' drawing and use its style (' + (T.style || 'pratt') + ') again?', 'Reset'))) return;
        commit(); const t2 = (P.trussTypes || []).find(t => t.id === tEd.id); if (t2) delete t2.custom; sel = null; changed();
      };
    } else if (tab === 'plan' && trussMode()) {
      const T = curTrussType();
      sb.innerHTML = btn('sbTrBack', '&#10003; Done', false, 'primary') + `<span class="lbl"><b>&#10178; Trusses</b></span>` + `<select id="trType">${typeOpts().map(o => `<option value="${o[0]}"${o[0] === T.id ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` +
        btn('sbTrAdd', mode.kind === 'addTruss' ? 'Cancel add' : '+ Truss', mode.kind === 'addTruss', mode.kind === 'addTruss' ? '' : 'primary') + btn('sbTrTypes', '&#9881; Truss types');
      $('sbTrBack').onclick = () => { mode = { kind: 'roof' }; sel = null; trussDraft = null; refresh(true); };
      $('trType').onchange = e => { sub.trType = e.target.value; };
      $('sbTrAdd').onclick = () => { mode = mode.kind === 'addTruss' ? { kind: 'trusses' } : { kind: 'addTruss' }; sel = null; trussDraft = null; refresh(); if (mode.kind === 'addTruss') toast('Drag across the roof from wall to wall (snaps to columns, walls & grids). A half truss: start at its high end.', 3200); };
      $('sbTrTypes').onclick = () => trussTypesDialog();
    } else if (tab === 'plan' && roofMode()) {
      sb.innerHTML = btn('sbBack', '&#10003; Done', false, 'primary') + `<span class="lbl"><b>&#8962; Roofs · ${esc(P.floors[fi].name)}</b></span>` + btn('sbAddRoof', mode.kind === 'addRoof' ? 'Cancel add' : '+ Add roof', mode.kind === 'addRoof') + btn('sbSketchRoof', '&#9998; Sketch roof', mode.kind === 'sketchRoof') + (mode.kind === 'sketchRoof' ? btn('sbSkUndo', '&#8630; Undo point') + btn('sbSkDone', '&#10003; Close outline', false, 'primary') : '') + btn('sbRoofAuto', 'Automatic roof') + btn('sbTrusses', '&#10178; Trusses');
      $('sbTrusses').onclick = () => { mode = { kind: 'trusses' }; sel = null; roofDraft = null; sketch = null; refresh(true); toast('Trusses: + Truss to place one by hand, tap a truss to change it, ⚙ Truss types for material / style / sizes', 3200); };
      $('sbSketchRoof').onclick = () => {
        if (mode.kind === 'sketchRoof') { mode = { kind: 'roof' }; sketch = null; refresh(); return; }
        sketchOptions().then(opt => {
          if (!opt) return;
          mode = { kind: 'sketchRoof' }; sel = null; roofDraft = null; sketch = { pts: [], opt }; refresh();
          toast('Tap the corners of the roof line along the walls (snaps to the walls) – tap the first point or ✓ Close outline to finish', 3400);
        });
      };
      if ($('sbSkUndo')) $('sbSkUndo').onclick = () => { if (sketch) sketch.pts.pop(); updateOverlay(); };
      if ($('sbSkDone')) $('sbSkDone').onclick = () => { if (sketch) finishSketch(); };
      $('sbBack').onclick = () => exitRoofs();
      $('sbAddRoof').onclick = () => { mode = mode.kind === 'addRoof' ? { kind: 'roof' } : { kind: 'addRoof' }; sel = null; roofDraft = null; refresh(); if (mode.kind === 'addRoof') toast('Drag a rectangle for the new roof, or tap a room to cover it', 2800); };
      $('sbRoofAuto').onclick = () => roofsAuto();
    } else if (tab === 'plan') {
      sb.innerHTML = btn('sbView', '&#9995; View', !editOn && !mode) + btn('sbEdit', '&#9998; Edit', editOn && !mode) + '<span class="sep"></span>' + btn('sbRoom', '+ Room', false, 'primary') + btn('sbDoor', 'Door', mode && mode.kind === 'door') + btn('sbWin', 'Window', mode && mode.kind === 'window') + btn('sbFurn', '&#128715; Furniture', mode && mode.kind === 'furn') + btn('sbWalls', '&#9986; Walls', mode && (mode.kind === 'walls' || mode.kind === 'addWall')) + btn('sbCols', '&#9632; Columns', mode && (mode.kind === 'cols' || mode.kind === 'column')) + btn('sbRoof', '&#8962; Roof', roofMode()) + btn('sbLevels', '&#127959; Levels', levelMode()) + btn('sbElec', '&#9889; Lights & Power') + btn('sbGrid', 'Grids & Columns') + btn('sbList', 'Rooms') + btn('sbLot', '&#9638; Lot / Site') + btn('sbSketch', '&#128247; Sketch');
      $('sbRoom').onclick = () => addRoomDialog();
      $('sbElec').onclick = () => { sub.det = 'eLight'; sel = null; setTab('det'); toast('Lighting layout – pick Power layout at the top for the outlets. Tap a symbol to change it, + Add for a new one', 3200); };
      $('sbView').onclick = () => { mode = null; preview = null; setEdit(false); toast('View mode – pan & zoom only, nothing can change', 1800); };
      $('sbEdit').onclick = () => { mode = null; preview = null; setEdit(true); toast('Edit mode – tap a room, door or window to change it', 1800); };
      $('sbDoor').onclick = () => pickTemplate('door');
      $('sbWin').onclick = () => pickTemplate('window');
      $('sbFurn').onclick = () => furnishWhere();
      $('sbGrid').onclick = () => gridInfo();
      $('sbLot').onclick = () => lotDialog();
      $('sbSketch').onclick = () => sketchMenu();
      // structural edit tools: walls / columns can only be selected (and deleted) while their tool is on
      $('sbWalls').onclick = () => { mode = mode && (mode.kind === 'walls' || mode.kind === 'addWall') ? null : { kind: 'walls' }; sel = null; preview = null; refresh(); };
      $('sbCols').onclick = () => { mode = mode && (mode.kind === 'cols' || mode.kind === 'column') ? null : { kind: 'cols' }; sel = null; preview = null; refresh(); };
      $('sbList').onclick = () => roomList();
      $('sbRoof').onclick = () => enterRoofs();
      $('sbLevels').onclick = () => enterLevels();
    } else if (tab === 'elev') {
      sb.innerHTML = viewEditBtns() + [['S', 'Front'], ['N', 'Rear'], ['W', 'Left'], ['E', 'Right']].map(([k, l]) => btn('el' + k, l, sub.elev === k)).join('');
      bindViewEdit();
      for (const k of 'SNWE') $('el' + k).onclick = () => { sub.elev = k; refresh(true); };
    } else if (tab === 'sect') {
      const cut = AP.sectionCuts(P);
      sb.innerHTML = viewEditBtns() + btn('scA', 'Section A', sub.sect === 'A') + btn('scB', 'Section B', sub.sect === 'B') +
        `<span class="lbl">${sub.sect === 'A' ? 'Cut at Y' : 'Cut at X'} (m)</span><input id="scPos" type="number" step="0.1" inputmode="decimal" style="width:84px" value="${r2(cut[sub.sect])}">` + btn('scAuto', 'Auto');
      bindViewEdit();
      $('scA').onclick = () => { sub.sect = 'A'; refresh(true); };
      $('scB').onclick = () => { sub.sect = 'B'; refresh(true); };
      $('scPos').onchange = e => { commit(); P.sections[sub.sect] = num(e.target.value, null); changed(); };
      $('scAuto').onclick = () => { commit(); P.sections[sub.sect] = null; changed(); };
    } else if (tab === 'det') {
      const opts = [['persp', 'Perspective'], ['lot', 'Lot plan'], ['site', 'Site development plan'], ['vic', 'Vicinity map'], ['loc', 'Location map'], ['perspD', 'Perspective (drawn by the app)'], ['roof', 'Roof plan'], ['dw', 'Doors & windows schedule'], ['found', 'Foundation plan'], ['beam', 'Beam plan (this floor)'], ['cols', 'Column & footing schedule'], ['foot', 'Footing detail'], ['framing', 'Roof framing plan'], ['truss', 'Truss detail'], ['wfoot', 'Wall footing detail'], ['colDet', 'Column detail'], ['beamDet', 'Beam detail'], ['gutter', 'Gutter detail'], ['stairDet', 'Stair detail'], ['rooms', 'Room schedule'], ['finish', 'Schedule of finishes'],
        ['eLight', 'Electrical – lighting layout (this floor)'], ['ePower', 'Electrical – power layout (this floor)'], ['eLoad', 'Electrical – schedule of loads'], ['eRiser', 'Electrical – riser diagram'], ['eLegend', 'Electrical – legend'],
        ['pSewer', 'Plumbing – sanitary & storm (this floor)'], ['pWater', 'Plumbing – waterline (this floor)'], ['pIsoWP', 'Plumbing – isometric view of waterline layout (this floor)'], ['pIsoSP', 'Plumbing – isometric view of sewer line layout (this floor)'], ['pIsoS', 'Plumbing – isometric sanitary'], ['pIsoW', 'Plumbing – isometric waterline'], ['pSeptic', 'Plumbing – septic tank detail'], ['pDet', 'Plumbing – details (catch basin, water meter, floor drain, clean-out)'], ['pLegend', 'Plumbing – legend & notes'], ['bom', 'Bill of materials & cost estimate']];
      AP.toiletRooms(P).forEach((t, i) => {
        opts.push(['toilet' + i + ':P', (t.room.name || 'Toilet') + ' – enlarged plan']);
        for (const s of 'NESW') opts.push(['toilet' + i + ':' + s, (t.room.name || 'Toilet') + ' – ' + AP.SIDE_NAME[s].toLowerCase() + ' wall']);
      });
      sb.innerHTML = `<select id="detSel">${opts.map(o => `<option value="${o[0]}"${o[0] === sub.det ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` +
        (sub.det === 'site' && AP.sitePlacement(P) ? btn('siteFit', '&#10697; Fit in lot') + `<span class="lbl">Drag the building to move it on the lot</span>` : '') +
        (sub.det === 'lot' || sub.det === 'site' ? siteWarnHtml() : '');
      $('detSel').onchange = e => { sub.det = e.target.value; mode = null; sel = null; refresh(true); };
      if ($('siteFit')) $('siteFit').onclick = () => { toast('Finding a place inside the lot…', 1200); setTimeout(siteFitNow, 30); };
      const siteFitNow = () => {
        const f = AP.siteFit(P);
        if (!f) { const C = AP.siteCheck(P); toast(C && C.bigger ? 'The building (' + AP.area(C.foot) + ') is bigger than the lot (' + AP.area(C.lot) + ') – it cannot fit' : 'No place inside the lot fits the building – try Turn in Plan › Lot / Site', 3500); return; }
        commit(); P.lot.setback = f.setback; P.lot.shift = f.shift; changed();
        toast('Inside the lot – front setback ' + AP.len(f.setback) + ', shift ' + AP.len(f.shift), 2500);
      };
      if (sub.det === 'bom') {
        const C = AP.costSqm(P), md = P.settings.costMode || 'bom';
        const nPg = AP.bomPages(P).length, pgSel = sub.bomPg == null ? '0' : sub.bomPg;
        sb.innerHTML += `<select id="bomPg" title="Preview: which page of the BOM PDF">${[['all', 'All ' + nPg + ' pages'], ...Array.from({ length: nPg }, (_, i) => [String(i), 'Page ' + (i + 1) + ' of ' + nPg + (i === 0 && (P.settings.bomTemplate || 'full') !== 'simple' && (P.settings.costMode || 'bom') !== 'sqm' ? ' – summary' : '')])].map(o => `<option value="${o[0]}"${o[0] === pgSel ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>` + btn('bomPdf', '&#128196; BOM (PDF)', false, 'primary') + `<select id="bomTpl" title="Template of the BOM PDF">${BOM_TPL.map(o => `<option value="${o[0]}"${(P.settings.bomTemplate || 'full') === o[0] ? ' selected' : ''}>Template ${esc(o[1].split(':')[0])}</option>`).join('')}</select>` + `<span class="lbl">Labor</span><input id="bomLabor" type="number" min="0" max="200" step="1" inputmode="decimal" style="width:64px" value="${P.settings.laborPct != null ? P.settings.laborPct : 40}" title="Labor, % of the cost of materials"><span class="lbl">%</span>` + btn('bomPrices', '&#8369; Material prices') + btn('bomSqm', '&#8369; Price per sq.m.') +
          `<span class="lbl">${md === 'sqm' ? 'Per sq.m.: ' + AP.peso(C.area) + ' sq.m. x ' + AP.peso(C.rate) + ' = ' + AP.peso(C.total) : 'Quantities from the drawings · labor ' + (P.settings.laborPct != null ? P.settings.laborPct : 40) + '%' + (md === 'both' ? ' · per sq.m. ' + AP.peso(C.rate) : '')} (Settings)</span>`;
        $('bomPdf').onclick = () => exportBOM();
        $('bomPg').onchange = e => { sub.bomPg = e.target.value; refresh(true); };
        $('bomLabor').onchange = e => {
          const v = Math.max(0, Math.min(200, +e.target.value));
          if (!isFinite(v) || e.target.value === '') { e.target.value = P.settings.laborPct != null ? P.settings.laborPct : 40; return; }
          commit(); P.settings.laborPct = v; changed();
          const B = AP.bom(P); toast('Labor ' + v + '% = PHP ' + AP.peso(B.labor) + ' · total PHP ' + AP.peso(B.total), 2600);
        };
        $('bomTpl').onchange = e => { commit(); P.settings.bomTemplate = e.target.value; changed(); toast(e.target.value === 'simple' ? 'Template 2 – simple (earlier version)' : 'Template 1 – detailed', 1600); };
        $('bomSqm').onclick = async () => {
          const v = await modal('Cost estimate per sq.m.', [
            { k: 'costMode', label: 'Cost estimate', type: 'select', value: md, options: [['bom', 'Bill of materials (itemized) + labor'], ['sqm', 'Per sq.m. of floor area'], ['both', 'Both – bill of materials, and per sq.m. to compare']] },
            { k: 'costSqm', label: 'Price per sq.m. (PHP, materials & labor)', type: 'number', step: 100, value: C.own ? C.rate : 0, hint: 'Floor area ' + AP.peso(C.area) + ' sq.m. · 0 = suggested ' + AP.peso(Math.round(AP.bom(P).total / Math.max(1, C.area) / 100) * 100) + ' / sq.m. from the bill of materials' }
          ], 'Save');
          if (!v) return;
          commit(); P.settings.costMode = v.costMode; P.settings.costSqm = Math.max(0, +v.costSqm || 0); changed();
          const C2 = AP.costSqm(P); toast('Per sq.m.: ' + AP.peso(C2.area) + ' sq.m. x ' + AP.peso(C2.rate) + ' = PHP ' + AP.peso(C2.total), 2600);
        };
        $('detSel').onchange = e => { sub.det = e.target.value; mode = null; sel = null; refresh(true); };
        $('bomPrices').onclick = () => bomPricesDialog();
      }
      if (plumbView()) {
        const W = sub.det === 'pWater', pk = PIPE_KINDS.filter(q => isWaterKind(q[0]) === W), mk = MARK_KINDS.filter(q => isWaterKind(q[0]) === W);
        const cp = sub.plPipe && pk.some(q => q[0] === sub.plPipe) ? sub.plPipe : pk[0][0], cm = sub.plMark && mk.some(q => q[0] === sub.plMark) ? sub.plMark : mk[0][0];
        const drawing = mode && mode.kind === 'plPipe', adding = mode && mode.kind === 'plMark';
        sb.innerHTML += `<select id="plPipeK">${pk.map(q => `<option value="${q[0]}"${q[0] === cp ? ' selected' : ''}>${esc(q[1])}</option>`).join('')}</select>` +
          btn('plPipe', drawing ? 'Done drawing' : '+ Pipe', drawing, drawing ? '' : 'primary') +
          `<select id="plMarkK">${mk.map(q => `<option value="${q[0]}"${q[0] === cm ? ' selected' : ''}>${esc(q[1])}</option>`).join('')}</select>` +
          btn('plMark', adding ? 'Done adding' : '+ Symbol', adding, adding ? '' : 'primary') + btn('plClear', '&#128465; Delete layout', false, 'danger') + btn('plReset', 'Reset this layout') +
          `<span class="lbl">${drawing ? 'Drag from one end of the pipe to the other (ends snap to pipes &amp; fixtures)' : adding ? 'Tap where it goes' : 'Tap a pipe or a symbol to move or delete it' + (W ? ' – drag the water meter to move the main' : ' – the septic tank can be dragged')}</span>`;
        $('detSel').onchange = e => { sub.det = e.target.value; mode = null; sel = null; refresh(true); }; // the bar was rebuilt
        $('plPipeK').onchange = e => { sub.plPipe = e.target.value; };
        $('plMarkK').onchange = e => { sub.plMark = e.target.value; if (adding) mode.mark = e.target.value; };
        $('plPipe').onclick = () => { mode = drawing ? null : { kind: 'plPipe' }; sel = null; plDraft = null; refresh(); };
        $('plMark').onclick = () => { mode = adding ? null : { kind: 'plMark', mark: $('plMarkK').value }; sel = null; refresh(); };
        $('plClear').onclick = async () => {
          const { it } = plumbItems(), list = it.filter(x => x.t === 'pipe' || x.t === 'mark');
          if (!list.length) { toast('Nothing to delete on this layout', 1600); return; }
          if (!(await confirmBox('Delete layout', 'Delete all ' + list.length + ' pipes and symbols of the ' + (W ? 'waterline' : 'sanitary & storm') + ' layout on the ' + P.floors[fi].name.toLowerCase() + '? Then draw your own with + Pipe / + Symbol. Reset this layout brings the automatic ones back.', 'Delete all'))) return;
          commit(); for (const x of list) plDelete(x.key); sel = null; changed(); toast('Layout deleted – + Pipe / + Symbol to draw your own', 2400);
        };
        $('plReset').onclick = async () => {
          if (!(await confirmBox('Reset this layout', 'Remove your changes to the ' + (W ? 'waterline' : 'sanitary & storm') + ' layout of the ' + P.floors[fi].name.toLowerCase() + ' and go back to the automatic one?', 'Reset'))) return;
          commit(); const E = plumbEd(), mine = k => k.startsWith(fi + ':') && (/:w:|:m:(wr|hb):/.test(k) === W);
          E.del = E.del.filter(k => !mine(k)); for (const k of Object.keys(E.move)) if (mine(k)) delete E.move[k];
          E.add = E.add.filter(a => !(a.fi === fi && isWaterKind(a.pipe || a.mark) === W));
          if (fi === 0) { if (W) delete E.meter; else delete E.tank; }
          sel = null; changed();
        };
      }
      if (elecView()) {
        const L = sub.det === 'eLight', kinds = DEV_KINDS.filter(q => q[2] === (L ? 'L' : 'P')), cur = mode && mode.kind === 'addDev' ? mode.dev : (sub.devKind && kinds.some(q => q[0] === sub.devKind) ? sub.devKind : kinds[0][0]);
        sb.innerHTML += `<select id="devKind">${kinds.map(q => `<option value="${q[0]}"${q[0] === cur ? ' selected' : ''}>${esc(q[1])}</option>`).join('')}</select>` +
          `<select id="devCkt" title="Circuit of the new ones">${ckOpts(sub.devCkt || '')}</select>` +
          btn('devAdd', mode && mode.kind === 'addDev' ? 'Done adding' : '+ Add', mode && mode.kind === 'addDev', mode && mode.kind === 'addDev' ? '' : 'primary') + btn('devCkts', '&#9889; Circuits') + btn('devClear', '&#128465; Delete layout', false, 'danger') + btn('devReset', 'Reset this layout') +
          `<span class="lbl">${mode && mode.kind === 'linkDev' ? '<b>Tap the one it is wired from</b> (tap empty space to cancel)' : mode && mode.kind === 'addDev' ? 'Tap where it goes' : 'Tap a ' + (L ? 'light / switch' : 'outlet') + ' to change, move or delete it'}</span>`;
        $('detSel').onchange = e => { sub.det = e.target.value; mode = null; sel = null; refresh(true); };
        $('devCkt').onchange = e => { sub.devCkt = e.target.value; };
        $('devCkts').onclick = () => circuitsDialog();
        $('devKind').onchange = e => { sub.devKind = e.target.value; if (mode && mode.kind === 'addDev') mode.dev = e.target.value; };
        $('devAdd').onclick = () => { mode = mode && mode.kind === 'addDev' ? null : { kind: 'addDev', dev: $('devKind').value }; sel = null; refresh(); };
        // delete every light / switch (or every outlet) of this floor, to place your own – Reset brings the automatic ones back
        $('devClear').onclick = async () => {
          const list = devsHere().filter(v => v.kind !== 'lp'); if (!list.length) { toast('Nothing to delete on this layout', 1600); return; }
          if (!(await confirmBox('Delete layout', 'Delete all ' + list.length + (L ? ' lights, exhaust fans, switches and exit signs' : ' outlets') + ' on the ' + P.floors[fi].name.toLowerCase() + '? Then + Add your own. Reset this layout brings the automatic ones back.', 'Delete all'))) return;
          commit(); const E = elecEd();
          for (const v of list) { if (v.added) E.add = E.add.filter(a => 'u:' + a.id !== v.key); else { if (E.del.indexOf(v.key) < 0) E.del.push(v.key); delete E.move[v.key]; delete E.prop[v.key]; } }
          sel = null; changed(); toast((L ? 'Lighting' : 'Power') + ' layout deleted – + Add to place your own', 2400);
        };
        $('devReset').onclick = async () => {
          if (!(await confirmBox('Reset this layout', 'Remove your changes to the ' + (L ? 'lighting' : 'power') + ' layout of the ' + P.floors[fi].name.toLowerCase() + ' and go back to the automatic one?', 'Reset'))) return;
          commit(); const E = elecEd(), mine = k => k.startsWith(fi + ':') && kinds.some(q => k.split(':')[1] === q[0].split(':')[0]);
          E.del = E.del.filter(k => !mine(k)); for (const k of Object.keys(E.move)) if (mine(k)) delete E.move[k]; for (const k of Object.keys(E.prop)) if (mine(k)) delete E.prop[k];
          E.add = E.add.filter(a => !(a.fi === fi && kinds.some(q => q[0].split(':')[0] === a.kind))); sel = null; changed();
        };
      }
    } else if (tab === '3d') {
      const used = P.floors.map((f, i) => ({ f, i })).filter(e => e.f.rooms.length);
      const shw = sub.show3d == null ? 'all' : String(sub.show3d);
      sb.innerHTML = `<select id="s3Show"><option value="all"${shw === 'all' ? ' selected' : ''}>Whole house</option>${used.map(e => `<option value="${e.i}"${shw === String(e.i) ? ' selected' : ''}>Cut at ${esc(e.f.name.toLowerCase())} (no roof above)</option>`).join('')}</select>` +
        btn('s3Ceil', sub.ceil3d ? '&#9635; Ceilings: on' : '&#9634; Ceilings: off', !!sub.ceil3d) + btn('s3Iso', '3D') + btn('s3Front', 'Front') + btn('s3Back', 'Rear') + btn('s3Left', 'Left') + btn('s3Right', 'Right') + btn('s3Top', 'Top');
      $('s3Show').onchange = e => { sub.show3d = e.target.value === 'all' ? null : +e.target.value; refresh(); };
      $('s3Ceil').onclick = () => { sub.ceil3d = !sub.ceil3d; refresh(); if (sub.ceil3d && sub.show3d == null) toast('Ceilings are under the roof – pick "Cut at …" to see them', 2400); };
      for (const [id, v] of [['s3Iso', '3d'], ['s3Front', 'front'], ['s3Back', 'back'], ['s3Left', 'left'], ['s3Right', 'right'], ['s3Top', 'top']]) $(id).onclick = () => AP.view3D.view(v);
    } else if (tab === 'sheets') {
      const S = getSheets();
      sub.sheet = Math.min(sub.sheet, S.length - 1);
      const cur = S[sub.sheet];
      sb.innerHTML = btn('shPrev', '&#9664;') + `<select id="shSel">${S.map((s, i) => `<option value="${i}"${i === sub.sheet ? ' selected' : ''}>${s.no} · ${esc(s.contents.slice(0, 38))}</option>`).join('')}</select>` + btn('shNext', '&#9654;') +
        btn('shScale', '&#128208; Scale') + btn('shMove', '&#10021; Move', !!sub.shMove) + (sub.shMove ? btn('shMoveReset', 'Reset sheet') : '') + btn('shPdf', 'PDF (all)', false, 'primary') + btn('shBom', 'BOM (PDF)') + btn('shDxf', 'DXF (CAD)') + btn('shPng', 'PNG') + btn('shJson', 'Backup') + siteWarnHtml();
      $('shPrev').onclick = () => { sub.sheet = Math.max(0, sub.sheet - 1); refresh(true); };
      $('shNext').onclick = () => { sub.sheet = Math.min(S.length - 1, sub.sheet + 1); refresh(true); };
      $('shSel').onchange = e => { sub.sheet = +e.target.value; refresh(true); };
      $('shPdf').onclick = () => exportPDF();
      $('shBom').onclick = () => exportBOM();
      $('shScale').onclick = () => scaleDialog(cur);
      $('shMove').onclick = () => { sub.shMove = !sub.shMove; refresh(); if (sub.shMove) toast('Drag a drawing to move it on the sheet – tap Move again when done', 2600); };
      if ($('shMoveReset')) $('shMoveReset').onclick = () => {
        const M = P.sheetMoves || {}, ks = Object.keys(M).filter(k2 => k2.indexOf(cur.no + '|') === 0);
        if (!ks.length) { toast('Nothing moved on this sheet', 1500); return; }
        commit(); ks.forEach(k2 => delete M[k2]); changed(); toast(cur.no + ' back to the automatic layout', 1600);
      };
      $('shDxf').onclick = () => exportDXF();
      $('shPng').onclick = () => exportPNG(cur);
      $('shJson').onclick = () => saveFile(fileBase() + '.arkiplan.json', 'application/json', JSON.stringify(P, null, 1));
    }
  }
  let modeBase = null; // undo depth when the current tool was switched on (Cancel goes back to it)
  function modeBar(sb, btn) {
    const k = mode.kind;
    const txt = { walls: '<b>Walls</b>: tap a wall to delete or restore it', addWall: 'Drag to draw a <b>wall</b> – snaps to walls &amp; grids', cols: '<b>Columns</b>: tap a column to resize or delete it',
      column: 'Tap where the new <b>column</b> goes', furn: 'Tap inside the room to place the <b>' + esc((AP.FURN[mode.tpl] || {}).name || '') + '</b>' }[k] || '<b>' + esc(mode.tpl || '') + '</b>: drag along a wall, let go to place it';
    const wd = P.wallDef ? wallDef(false) : null;
    const extra = k === 'walls' ? btn('mbAddWall', '+ Add wall') : k === 'addWall' ? btn('mbWallType', '&#9881; ' + (wd ? AP.wallMat(wd.mat).short + ' ' + AP.mm(wd.t) : 'Wall type')) : k === 'cols' ? btn('mbAddCol', '+ Add column') : '';
    sb.innerHTML = btn('mbDone', '&#10003; Done', false, 'primary') + btn('mbCancel', '&#10005; Cancel') + extra + `<span class="lbl">${txt}</span>`;
    $('mbDone').onclick = () => { mode = k === 'column' ? { kind: 'cols' } : k === 'addWall' ? { kind: 'walls' } : null; sel = null; preview = null; wallDraft = null; refresh(); };
    $('mbCancel').onclick = () => {
      const n = modeBase != null ? undo.length - modeBase : 0;
      if (n > 0) { P = JSON.parse(undo[modeBase]); undo.length = modeBase; redo = []; AP.store.save(P); sheetsCache = null; }
      mode = null; sel = null; preview = null; wallDraft = null; fixSel(); refresh();
      toast(n > 0 ? 'Cancelled – ' + n + ' change' + (n > 1 ? 's' : '') + ' undone' : 'Cancelled', 1600);
    };
    if ($('mbAddWall')) $('mbAddWall').onclick = () => wallTypeDialog(false, () => { mode = { kind: 'addWall' }; sel = null; refresh(); });
    if ($('mbWallType')) $('mbWallType').onclick = () => wallTypeDialog(false, () => refresh());
    if ($('mbAddCol')) $('mbAddCol').onclick = () => { mode = { kind: 'column', tpl: 'Column' }; sel = null; refresh(); };
  }
  // View / Edit switch in the elevation & section tabs: in Edit, tap a door or window to change it
  function viewEditBtns() {
    return `<button id="sbView" class="${!editOn ? 'on' : ''}">&#9995; View</button><button id="sbEdit" class="${editOn ? 'on' : ''}">&#9998; Edit</button><span class="sep"></span>`;
  }
  function bindViewEdit() {
    $('sbView').onclick = () => { setEdit(false); toast('View mode – pan & zoom only', 1500); };
    $('sbEdit').onclick = () => { setEdit(true); toast('Edit mode – tap a door or window: drag sideways to move it, up/down to change the sill', 2600); };
  }
  function getSheets() { if (!sheetsCache) sheetsCache = AP.buildSheets(P); return sheetsCache; }

  /* ---------- drawing the current view ---------- */
  let current = null; // {d, key}
  let elevHits = [];  // doors/windows drawn in the current elevation/section: {fi, id, u0, u1, zA, zB}
  function viewKey() {
    if (tab === 'plan' && levelMode()) return 'lvl:' + curLevel().id;
    if (tab === 'plan' && mode && mode.kind === 'trussEdit') return 'truss:' + tEd.id;
    if (tab === 'plan') return roofMode() ? 'roofs:' + fi : inRoom ? (roomInside ? 'inside:' : 'room:') + inRoom : 'plan';
    if (tab === 'elev') return 'elev' + sub.elev;
    if (tab === 'sect') return 'sect' + sub.sect;
    if (tab === 'det') return 'det' + sub.det;
    return 'sheet' + sub.sheet;
  }
  function buildView() {
    const ts = 0.1;
    if (tab === 'plan' && inRoom && roomInside) { const rr = P.floors[fi].rooms.find(q => q.id === inRoom); if (rr) return AP.renderRoomInside(P, fi, rr, { ts: 0.03 }); }
    if (tab === 'plan' && levelMode()) { const Lv = curLevel(), d = fadePlan(AP.renderPlan(P, Lv.floor, { ts, sections: false })); AP.drawLevelEdit(d, P, Lv, ts, sel && sel.type === 'beam' ? sel.key : null); return d; }
    if (tab === 'plan' && mode && mode.kind === 'trussEdit') return AP.renderTrussTypeDetail(P, tEd.id, { ts: 0.04 });
    if (tab === 'plan' && trussMode()) { const d = fadePlan(AP.renderPlan(P, fi, { ts, sections: false })); d.append(AP.renderRoofFraming(P, { ts })); return d; }
    if (tab === 'plan' && roofMode()) { const d = fadePlan(AP.renderPlan(P, fi, { ts, sections: false })); AP.drawRoofEdit(d, P, fi, ts, sel && sel.type === 'roof' ? sel.id : null); return d; }
    if (tab === 'plan') return AP.renderPlan(P, fi, { ts, editor: true, sel, focus: inRoom });
    elevHits = [];
    if (tab === 'elev') return AP.renderElevation(P, sub.elev, { ts, hits: elevHits });
    if (tab === 'sect') return AP.renderSection(P, sub.sect, { ts, hits: elevHits });
    if (tab === 'det') {
      const k = sub.det;
      if (k === 'roof') return AP.renderRoofPlan(P, { ts });
      if (k === 'persp') return AP.renderPerspective(P, { ts: 0.05 });
      if (k === 'pIsoWP') return AP.renderIsoWaterPlan(P, fi, { ts });
      if (k === 'pIsoSP') return AP.renderIsoSewerPlan(P, fi, { ts });
      if (k === 'lot') return AP.renderLotPlan(P, { ts: 0.2 });
      if (k === 'site') return AP.renderSitePlan(P, { ts: 0.2, edit: true });
      if (k === 'vic') return AP.renderVicinity(P, { ts: 1 });
      if (k === 'loc') return AP.renderLocationMap(P, { ts: 1 });
      if (k === 'perspD') return AP.renderPerspective(P, { ts: 0.05, drawn: true });
      if (k === 'dw') return AP.renderDWSchedule(P, { ts: 0.05 });
      if (k === 'found') return AP.renderFoundation(P, { ts });
      if (k === 'beam') return AP.renderBeamPlan(P, fi + 1, { ts });
      if (k === 'cols') return AP.renderColumnSchedule(P, { ts: 0.05 });
      if (k === 'foot') return AP.renderFootingDetail(P, { ts: 0.025 });
      if (k === 'framing') return AP.renderRoofFraming(P, { ts });
      if (k === 'truss') return AP.renderTrussDetail(P, { ts: 0.05 });
      if (k === 'wfoot') return AP.renderWallFootingDetail(P, { ts: 0.025 });
      if (k === 'colDet') return AP.renderColumnDetail(P, { ts: 0.015 });
      if (k === 'beamDet') return AP.renderBeamDetail(P, { ts: 0.015 });
      if (k === 'gutter') return AP.renderGutterDetail(P, { ts: 0.01 });
      if (k === 'stairDet') return AP.renderStairDetail(P, { ts: 0.03 });
      if (k === 'rooms') return AP.renderRoomSchedule(P, { ts: 0.05 });
      if (k === 'finish') return AP.renderFinishSchedule(P, { ts: 0.05 });
      if (k === 'eLight') return AP.renderLighting(P, fi, { ts });
      if (k === 'ePower') return AP.renderPower(P, fi, { ts });
      if (k === 'eLoad') return AP.renderLoadSchedule(P, { ts: 0.05 });
      if (k === 'eRiser') return AP.renderRiser(P, { ts: 0.05 });
      if (k === 'eLegend') return AP.renderElecLegend(P, { ts: 0.05 });
      if (k === 'pSewer') return AP.renderSewer(P, fi, { ts });
      if (k === 'pWater') return AP.renderWater(P, fi, { ts });
      if (k === 'pIsoS') return AP.renderIsoSewer(P, { ts });
      if (k === 'pIsoW') return AP.renderIsoWater(P, { ts });
      if (k === 'pSeptic') return AP.renderSepticDetail(P, { ts: 0.03 });
      if (k === 'pDet') return AP.renderSmallDetails(P, { ts: 0.02 });
      if (k === 'pLegend') return AP.renderPlumbLegend(P, { ts: 0.05 });
      if (k === 'bom') {
        const pg = sub.bomPg == null ? '0' : sub.bomPg, key = P.id + ':' + P.updated + ':' + pg;
        if (!bomPrev || bomPrev.key !== key) bomPrev = { key, d: AP.bomPreview(P, pg) };
        return bomPrev.d;
      }
      const m = /^toilet(\d+):(\w)$/.exec(k), T = AP.toiletRooms(P);
      if (m && T[+m[1]]) {
        const t = T[+m[1]];
        return m[2] === 'P' ? AP.renderToiletPlan(P, t.fi, t.room, { ts: 0.03 }) : AP.renderToiletElev(P, t.fi, t.room, m[2], { ts: 0.03 });
      }
      sub.det = 'roof'; return AP.renderRoofPlan(P, { ts });
    }
    const S = getSheets()[sub.sheet];
    if (!S.cache) S.cache = S.draw();
    const d = new AP.Drawing();
    d.rect(0, 0, S.W, S.H, { fill: '#ffffff', stroke: '#bbbbbb', w: 0.3 });
    return d.append(S.cache);
  }
  function draw(fit) {
    // 3D tab: three.js view over the canvas
    const in3d = tab === '3d';
    $('v3d').hidden = !in3d;
    if (in3d) {
      $('hint').classList.remove('show');
      if (!AP.view3D || !AP.view3D.supported()) { $('v3d').innerHTML = '<p style="padding:24px;color:#555">3D needs WebGL, which this device does not support. See Details › Perspective.</p>'; return; }
      AP.view3D.show($('v3d'), P, { show: sub.show3d == null ? 'all' : sub.show3d, fit, ceil: !!sub.ceil3d, inside: sub.inside3d });
      sub.inside3d = null;
      return;
    }
    const d = buildView();
    const key = viewKey();
    current = { d, key };
    const svg = $('cv');
    let empty = '';
    if (tab === 'plan' && !P.floors[fi].rooms.length) empty = `<text x="0" y="0" font-size="0.5" text-anchor="middle" fill="#8a96a3" font-family="Arial">Tap “+ Room” to start drawing ${esc(P.floors[fi].name.toLowerCase())}</text>`;
    let under = '';
    const flu = tab === 'plan' && !roofMode() && !levelMode() && P.floors[fi].underlay;
    if (flu && !flu.hide) { const url = ulGet(P, P.floors[fi]); if (url) { under = `<image href="${url}" x="${flu.x}" y="${flu.y}" width="${flu.w}" height="${flu.h}" opacity="${flu.op || 0.45}" preserveAspectRatio="none"/>`; if (!P.floors[fi].rooms.length) empty = ''; } }
    svg.innerHTML = `${under}<g>${AP.toSVG(d)}${empty}</g><g id="ov"></g>`;
    if (fit || !views[key]) fitView(key);
    else applyView();
    updateOverlay();
    $('hint').classList.remove('show');
    if (inRoom && !mode) {
      const r = P.floors[fi].rooms.find(q => q.id === inRoom);
      $('hint').innerHTML = `Inside <b>${esc(r ? r.name.toUpperCase() : '')}</b>: add furniture, doors or windows, or tap one to move / edit / 🔒 lock it <button id="hintBack">Done</button>`;
      $('hintBack').onclick = () => exitRoom();
    }
    if (mode) $('hint').innerHTML =
      mode.kind === 'walls' ? `<b>WALLS</b>: tap a wall to delete or restore it <button id="hintAddWall">+ Add wall</button> <button id="hintDone">Done</button>` :
      mode.kind === 'addWall' ? `Drag to draw a <b>wall</b> – straight, snaps to walls &amp; grids <button id="hintDone">Back</button>` :
      mode.kind === 'cols' ? `<b>COLUMNS</b>: tap a column to resize or delete it <button id="hintAdd">+ Add column</button> <button id="hintDone">Done</button>` :
      mode.kind === 'column' ? `Tap where the new <b>column</b> goes (snaps to grid intersections) <button id="hintDone">Back</button>` :
      mode.kind === 'roof' ? `Tap a roof · drag a <b>side</b> handle to stretch it, a <b>corner</b> to stretch both ways, the roof to move it <button id="hintDone">Done</button>` :
      mode.kind === 'addRoof' ? `Drag a rectangle for the new roof, or tap a room to cover it. It sits on the <b>${esc(P.floors[fi].name.toLowerCase())}</b> walls <button id="hintDone">Back</button>` :
      mode.kind === 'furn' ? `Tap inside the room to place the <b>${esc(AP.FURN[mode.tpl].name)}</b> (its back goes to the nearest wall) <button id="hintDone">Cancel</button>` :
      mode.kind === 'ulScale' ? `<b>SCALE</b>: tap both ends of a size you know on the photo (e.g. a wall you measured) <button id="hintDone">Cancel</button>` :
      mode.kind === 'ulMove' ? `<b>MOVE PHOTO</b>: drag the photo to line it up with the plan <button id="hintDone">Done</button>` :
      `<b>${esc(mode.tpl)}</b>: drag along a wall, release to place <button id="hintDone">Done</button>`;
    const hd = $('hintDone'); if (hd && mode && mode.kind === 'roof') hd.onclick = () => exitRoofs();
    else if (hd) hd.onclick = () => { mode = mode && mode.kind === 'column' ? { kind: 'cols' } : mode && mode.kind === 'addWall' ? { kind: 'walls' } : mode && mode.kind === 'addRoof' ? { kind: 'roof' } : null; sel = null; preview = null; wallDraft = null; roofDraft = null; refresh(); };
    const har = $('hintAddRoof'); if (har) har.onclick = () => { mode = { kind: 'addRoof' }; sel = null; refresh(); };
    const hra = $('hintRoofAuto'); if (hra) hra.onclick = () => roofsAuto();
    const haw = $('hintAddWall'); if (haw) haw.onclick = () => { mode = { kind: 'addWall' }; sel = null; refresh(); };
    const ha = $('hintAdd'); if (ha) ha.onclick = () => { mode = { kind: 'column', tpl: 'Column' }; sel = null; refresh(); };
  }
  function fitView(key) {
    const svg = $('cv'), W = svg.clientWidth || 360, H = svg.clientHeight || 500;
    let b = current.d.bbox();
    if (!b || tab === 'plan' && !P.floors[fi].rooms.length) b = { x0: -5, y0: -4, x1: 5, y1: 4, w: 10, h: 8 };
    const fr = tab === 'plan' && inRoom && !roomInside && P.floors[fi].rooms.find(q => q.id === inRoom);
    if (fr) { const m = 0.6; b = { x0: fr.x - m, y0: fr.y - m, x1: fr.x + fr.w + m, y1: fr.y + fr.l + m, w: fr.w + 2 * m, h: fr.l + 2 * m }; } // zoom into the room
    const k = Math.min(W / (b.w || 1), H / (b.h || 1)) * 0.92;
    views[key || current.key] = { k, x: b.x0 + b.w / 2 - W / 2 / k, y: b.y0 + b.h / 2 - H / 2 / k };
    applyView();
  }
  function applyView() {
    const svg = $('cv'), v = views[current.key], W = svg.clientWidth || 360, H = svg.clientHeight || 500;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${W / v.k} ${H / v.k}`);
    if (dimBox) positionDimBox();
  }
  $('fabFit').onclick = () => (tab === '3d' ? AP.view3D.view('3d') : fitView());
  window.addEventListener('resize', () => { if (P && current) applyView(); });

  /* ---------- pointer: pan, pinch, tap, drag rooms ---------- */
  const pts = new Map();
  let gesture = null;
  const svgEl = $('cv');
  function toModel(cx, cy) {
    const r = svgEl.getBoundingClientRect(), v = views[current.key];
    return [v.x + (cx - r.left) / v.k, v.y + (cy - r.top) / v.k];
  }
  svgEl.addEventListener('pointerdown', e => {
    if (!current) return;
    try { svgEl.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const v = views[current.key];
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      gesture = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: v.k, m0: toModel((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }
    gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    if (plumbView() && mode && mode.kind === 'plPipe') { const m = toModel(e.clientX, e.clientY); gesture = { type: 'plPipe', sx: e.clientX, sy: e.clientY, p0: plSnap(m), moved: false }; return; }
    if (plumbView() && sel && sel.type === 'pl' && !mode) {
      const m = toModel(e.clientX, e.clientY), x = findPl(sel.key);
      if (x && x.p && x.t !== 'pipe' && (x.t === 'tank' ? (m[0] >= x.T.x0 && m[0] <= x.T.x1 && m[1] >= x.T.y0 && m[1] <= x.T.y1) : Math.hypot(m[0] - x.p[0], m[1] - x.p[1]) < 18 / views[current.key].k)) {
        gesture = { type: 'plMove', sx: e.clientX, sy: e.clientY, key: x.key, moved: false, hw: x.T ? (x.T.x1 - x.T.x0) / 2 : 0, hh: x.T ? (x.T.y1 - x.T.y0) / 2 : 0 }; return;
      }
    }
    if (elecView() && sel && sel.type === 'dev' && !(mode && mode.kind === 'addDev')) {
      const m = toModel(e.clientX, e.clientY), v = findDev(sel.key);
      if (v && Math.hypot(m[0] - v.x, m[1] - v.y) < 18 / views[current.key].k) { gesture = { type: 'devMove', sx: e.clientX, sy: e.clientY, key: v.key, moved: false }; return; }
    }
    if (tab === 'det' && sub.det === 'site' && P.lot) {
      const SP = AP.sitePlacement(P), m = toModel(e.clientX, e.clientY);
      if (SP) {
        const q = SP.inv(m[0], m[1]), hit = P.floors[0].rooms.some(r => q[0] >= r.x - 0.2 && q[0] <= r.x + r.w + 0.2 && q[1] >= r.y - 0.2 && q[1] <= r.y + r.l + 0.2);
        if (hit) { gesture = { type: 'siteMove', sx: e.clientX, sy: e.clientY, m0: m, sb0: P.lot.setback != null ? P.lot.setback : 3, sh0: P.lot.shift || 0, n: SP.ow.n, t: SP.ow.t, moved: false }; return; }
      }
    }
    if (tab === 'sheets' && sub.shMove) {
      const cur = getSheets()[sub.sheet], m = toModel(e.clientX, e.clientY);
      const bx = (AP.sheetBoxes[cur.no] || []).filter(b => m[0] >= b.x0 && m[0] <= b.x1 && m[1] >= b.y0 && m[1] <= b.y1)
        .sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0]; // the smallest one under the finger
      if (bx) { gesture = { type: 'shMove', sx: e.clientX, sy: e.clientY, m0: m, box: bx, d0: ((P.sheetMoves || {})[bx.key] || [0, 0]).slice(), moved: false }; return; }
    }
    if (tab === 'plan' && mode && mode.kind === 'ulMove' && P.floors[fi].underlay) { const u = P.floors[fi].underlay; gesture = { type: 'ulMove', sx: e.clientX, sy: e.clientY, x0: u.x, y0: u.y, moved: false }; return; }
    if (tab === 'plan' && mode && (mode.kind === 'walls' || mode.kind === 'levels') && movableWall()) {
      const m = toModel(e.clientX, e.clientY), w = movableWall(), l = hitXLabel(m);
      if (l) { gesture = { type: 'xdim', sx: e.clientX, sy: e.clientY, lab: l, moved: false }; return; }
      if (onMovableWall(w, m)) { gesture = { type: 'dragXWall', sx: e.clientX, sy: e.clientY, w0: { a: w.a, b: w.b, c: w.c }, moved: false }; return; }
    }
    if (tab === 'plan' && mode && (mode.kind === 'addWall' || mode.kind === 'lvWall')) {
      gesture = { type: 'drawWall', sx: e.clientX, sy: e.clientY, p0: snapPt(toModel(e.clientX, e.clientY)), moved: false };
      wallDraft = null; updateOverlay();
      return;
    }
    if (tab === 'plan' && mode && (mode.kind === 'door' || mode.kind === 'window')) {
      gesture = { type: 'place', sx: e.clientX, sy: e.clientY, moved: false };
      setPreview(toModel(e.clientX, e.clientY));
    } else if ((tab === 'elev' || tab === 'sect') && editOn && sel && sel.type === 'op') {
      const h = hitElev(toModel(e.clientX, e.clientY));
      if (h && h.id === sel.id && !h.cut) {
        const fl = P.floors[h.fi], op = fl.openings.find(q => q.id === h.id), Ro = op && AP.resolveOp(fl, op);
        if (Ro && op.locked) gesture.locked = { name: AP.opMarks(P).marks[op.id] || op.tpl };
        else if (Ro) {
          // which way the wall runs on screen: +1 if the view's u grows with the position along the wall
          const pa = AP.wallPt(Ro.o, Ro.c, 0), pb = AP.wallPt(Ro.o, Ro.c, 1);
          const M = AP.ELEV[tab === 'elev' ? sub.elev : (sub.sect === 'A' ? 'S' : 'W')];
          const dir = Math.sign(M.u(pb[0], pb[1]) - M.u(pa[0], pa[1])) || 1;
          gesture = { type: 'dragOpE', sx: e.clientX, sy: e.clientY, op, fi: h.fi, s0: Ro.s, sill0: AP.opSill(op, P.settings), dir, moved: false };
        }
      }
    } else if (tab === 'plan' && mode && mode.kind === 'addBeam') {
      gesture = { type: 'drawBeam', sx: e.clientX, sy: e.clientY, p0: beamSnap(toModel(e.clientX, e.clientY)), moved: false };
      beamDraft = null;
    } else if (tab === 'plan' && mode && mode.kind === 'levels') {
      /* taps only (select a beam) */
    } else if (tab === 'plan' && mode && mode.kind === 'addRoof') {
      gesture = { type: 'drawRoof', sx: e.clientX, sy: e.clientY, p0: roofSnapPt(toModel(e.clientX, e.clientY)), moved: false };
      roofDraft = null;
    } else if (tab === 'plan' && mode && mode.kind === 'addTruss') {
      gesture = { type: 'drawTruss', sx: e.clientX, sy: e.clientY, p0: trussSnap(toModel(e.clientX, e.clientY)), moved: false };
      trussDraft = null;
    } else if (tab === 'plan' && mode && mode.kind === 'trusses') {
      // the selected truss: drag an end to stretch it, drag it to move it
      const m = toModel(e.clientX, e.clientY), tl = sel && sel.type === 'truss' && AP.placedTrusses(P).find(q => q.id === sel.id), k = views[current.key].k;
      if (tl) {
        const end = ['a', 'b'].find(e2 => Math.hypot(m[0] - tl[e2][0], m[1] - tl[e2][1]) < 16 / k);
        if (end) gesture = { type: 'trussEnd', sx: e.clientX, sy: e.clientY, end, moved: false };
        else if (hitTruss(m) === tl) gesture = { type: 'trussMove', sx: e.clientX, sy: e.clientY, a0: tl.a.slice(), b0: tl.b.slice(), moved: false };
      }
    } else if (tab === 'plan' && mode && mode.kind === 'trussEdit') {
      const m = toModel(e.clientX, e.clientY), i = hitNode(m);
      if (i != null && !tEd.addFrom) gesture = { type: 'tnode', sx: e.clientX, sy: e.clientY, i, moved: false };
    } else if (tab === 'plan' && mode && mode.kind === 'sketchRoof') {
      /* pan, taps add corners */
    } else if (tab === 'plan' && mode && mode.kind === 'roof') {
      const m = toModel(e.clientX, e.clientY), gr = hitRoofGrip(m), R = hitRoof(m);
      if (gr) gesture = { type: 'roofEdge', sx: e.clientX, sy: e.clientY, id: sel.id, side: gr, moved: false };
      else if (R && sel && sel.type === 'roof' && sel.id === R.id) gesture = { type: 'dragRoof', sx: e.clientX, sy: e.clientY, id: R.id, moved: false };
    } else if (tab === 'plan') {
      const m = toModel(e.clientX, e.clientY);
      const r = hitRoom(m), ho = (inRoom && hitOpeningInRoom(m)) || hitOpening(m), gr = hitGrip(m);
      const fg = hitFurnGrip(m);
      if (fg && fg.f.locked) gesture.locked = { name: AP.FURN[fg.f.kind].name };
      else if (fg) gesture = { type: 'furnEdge', sx: e.clientX, sy: e.clientY, side: fg.side, f0: Object.assign({}, fg.f), id: fg.f.id, moved: false };
      else if (gr) { gesture = startEdge(P.floors[fi].rooms.find(q => q.id === sel.id), gr, e); if (gesture.blocked) { toast(gesture.blocked, 2500); gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: views[current.key].x, vy: views[current.key].y, moved: false }; } }
      else if (hitTempDim(m)) { /* tap on a temporary dimension: handled on release */ }
      else if (ho && sel && sel.type === 'op' && sel.id === ho.id && ho.locked) gesture.locked = { name: (AP.opMarks(P).marks[ho.id] || ho.tpl) };
      else if (ho && sel && sel.type === 'op' && sel.id === ho.id) gesture = { type: 'dragOp', sx: e.clientX, sy: e.clientY, op: ho, moved: false };
      else if (sel && sel.type === 'furn' && hitFurn(m) && hitFurn(m).id === sel.id && !mode && hitFurn(m).locked) gesture.locked = { name: AP.FURN[hitFurn(m).kind].name };
      else if (sel && sel.type === 'furn' && hitFurn(m) && hitFurn(m).id === sel.id && !mode) { const f = hitFurn(m); gesture = { type: 'dragFurn', sx: e.clientX, sy: e.clientY, f, x0: f.x, y0: f.y, moved: false, room: furnRoom(f) }; }
      else if (r && sel && sel.type === 'room' && sel.id === r.id && !ho && r.locked) gesture.locked = r; // locked: just pan
      else if (r && sel && sel.type === 'room' && sel.id === r.id && !ho) gesture = { type: 'drag', sx: e.clientX, sy: e.clientY, m0: m, x0: r.x, y0: r.y, room: r, moved: false, furn: (P.floors[fi].furniture || []).filter(f => f.x > r.x && f.x < r.x + r.w && f.y > r.y && f.y < r.y + r.l).map(f => ({ id: f.id, x: f.x, y: f.y })) };
      // long press on a room (even on a resize handle): pick the whole room up and move it – the rooms next
      // to it keep their size
      if (r && editOn && !mode && !inRoom && !r.locked && !(gesture.type === 'furnEdge' || gesture.type === 'dragOp' || gesture.type === 'dragFurn')) {
        const g0 = gesture, sx = e.clientX, sy = e.clientY;
        setTimeout(() => {
          if (gesture !== g0 || g0.moved || pts.size !== 1) return;
          sel = { type: 'room', id: r.id };
          gesture = { type: 'drag', sx, sy, m0: m, x0: r.x, y0: r.y, room: r, moved: false, furn: (P.floors[fi].furniture || []).filter(f => f.x > r.x && f.x < r.x + r.w && f.y > r.y && f.y < r.y + r.l).map(f => ({ id: f.id, x: f.x, y: f.y })) };
          renderPanel(); draw(false);
          try { if (navigator.vibrate) navigator.vibrate(25); } catch (err) { /* no vibration */ }
          toast('Moving ' + r.name + ' – drag it and let go to drop it', 1600);
        }, 450);
      }
    }
  });
  svgEl.addEventListener('pointermove', e => {
    // mouse hover while placing: live preview without pressing
    if (!pts.has(e.pointerId) && mode && (mode.kind === 'door' || mode.kind === 'window') && tab === 'plan' && e.pointerType === 'mouse' && current) { setPreview(toModel(e.clientX, e.clientY)); return; }
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const v = views[current.key];
    if (gesture.type === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
      v.k = Math.min(4000, Math.max(2, gesture.k0 * dd / gesture.d0));
      const r = svgEl.getBoundingClientRect(), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      v.x = gesture.m0[0] - (c[0] - r.left) / v.k; v.y = gesture.m0[1] - (c[1] - r.top) / v.k;
      applyView(); return;
    }
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (gesture.type === 'place') { setPreview(toModel(e.clientX, e.clientY)); return; }
    if (gesture.type === 'drawWall') { wallDraft = draftFrom(gesture.p0, snapPt(toModel(e.clientX, e.clientY))); updateOverlay(); return; }
    if (gesture.type === 'drawBeam') { if (gesture.moved) { beamDraft = draftFrom(gesture.p0, beamSnap(toModel(e.clientX, e.clientY))); updateOverlay(); } return; }
    if (gesture.type === 'devMove') { if (gesture.moved) devMove(gesture, toModel(e.clientX, e.clientY)); return; }
    if (gesture.type === 'plMove') { if (gesture.moved) plMove(gesture, toModel(e.clientX, e.clientY)); return; }
    if (gesture.type === 'plPipe') { if (gesture.moved) { plDraft = [gesture.p0, plSnap(toModel(e.clientX, e.clientY), gesture.p0)]; updateOverlay(); } return; }
    if (gesture.type === 'shMove') {
      if (gesture.moved) { const m = toModel(e.clientX, e.clientY); gesture.off = [m[0] - gesture.m0[0], m[1] - gesture.m0[1]]; updateOverlay(); }
      return;
    }
    if (gesture.type === 'siteMove') {
      if (gesture.moved) {
        if (!gesture.committed) { commit(); gesture.committed = true; }
        const m = toModel(e.clientX, e.clientY), dx2 = m[0] - gesture.m0[0], dy2 = m[1] - gesture.m0[1], g = gesture, R5 = v2 => Math.round(v2 / 0.05) * 0.05;
        P.lot.setback = Math.max(0, R5(g.sb0 - (dx2 * g.n[0] + dy2 * g.n[1])));
        P.lot.shift = R5(g.sh0 + dx2 * g.t[0] + dy2 * g.t[1]);
        draw(false);
      }
      return;
    }
    if (gesture.type === 'ulMove') { if (gesture.moved) { if (!gesture.committed) { commit(); gesture.committed = true; } const u = P.floors[fi].underlay; u.x = gesture.x0 + dx / v.k; u.y = gesture.y0 + dy / v.k; draw(false); } return; }
    if (gesture.type === 'dragXWall') { if (gesture.moved) dragXWall(gesture, toModel(e.clientX, e.clientY), dx / v.k, dy / v.k); return; }
    if (gesture.type === 'xdim') return;
    if (gesture.type === 'drawTruss') { if (gesture.moved) { const p = gesture.p0; trussDraft = { a: p, b: angSnap(p, trussSnap(toModel(e.clientX, e.clientY))) }; updateOverlay(); } return; }
    if (gesture.type === 'trussEnd' || gesture.type === 'trussMove') { if (gesture.moved) dragTruss(gesture, toModel(e.clientX, e.clientY), dx / v.k, dy / v.k); return; }
    if (gesture.type === 'tnode') { if (gesture.moved) dragNode(gesture, toModel(e.clientX, e.clientY)); return; }
    if (gesture.type === 'drawRoof') { if (gesture.moved) { const q = roofSnapPt(toModel(e.clientX, e.clientY)), p = gesture.p0; roofDraft = { x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) }; updateOverlay(); } return; }
    if ((gesture.type === 'roofEdge' || gesture.type === 'dragRoof') && gesture.moved) { dragRoof(gesture, toModel(e.clientX, e.clientY), dx / v.k, dy / v.k); return; }
    if (!gesture.moved) return;
    if (gesture.type === 'furnEdge') { stretchFurn(gesture, toModel(e.clientX, e.clientY)); return; }
    if (gesture.type === 'edge') {
      if (!gesture.committed) { commit(); gesture.committed = true; }
      applyEdge(gesture, toModel(e.clientX, e.clientY));
      draw(false);
      showDimBox(gesture.room, gesture.side, false);
      return;
    }
    if (gesture.type === 'dragOpE') { dragOpElev(gesture, dx, dy); return; }
    if (gesture.type === 'dragFurn') {
      if (!gesture.committed) { commit(); gesture.committed = true; }
      const f = (P.floors[fi].furniture || []).find(q => q.id === gesture.f.id);
      if (f) { f.x = r2(snap(gesture.x0 + dx / v.k, 0.05)); f.y = r2(snap(gesture.y0 + dy / v.k, 0.05)); clampFurn(f, gesture.room); draw(false); }
      return;
    }
    if (gesture.type === 'dragOp') {
      const op = P.floors[fi].openings.find(q => q.id === gesture.op.id);
      const pv = op && computeAt(toModel(e.clientX, e.clientY), op.w, op);
      if (pv && pv.ok) {
        if (!gesture.committed) { commit(); gesture.committed = true; }
        op.off = pv.off;
        preview = pv;
        draw(false);
      }
      return;
    }
    if (gesture.type === 'pan') {
      v.x = gesture.vx - dx / v.k; v.y = gesture.vy - dy / v.k; applyView();
      if (gesture.locked && !gesture.told) { gesture.told = true; toast('🔒 ' + gesture.locked.name + ' is locked – unlock it to move or resize', 2000); }
    }
    else if (gesture.type === 'drag') {
      if (!gesture.committed) { commit(); gesture.committed = true; }
      const r = P.floors[fi].rooms.find(q => q.id === gesture.room.id);
      const tol = 14 / v.k;
      r.x = snapEdge(gesture.x0 + dx / v.k, r.w, 'x', r, tol);
      r.y = snapEdge(gesture.y0 + dy / v.k, r.l, 'y', r, tol);
      // furniture in the room moves with it
      for (const q of gesture.furn) { const f = P.floors[fi].furniture.find(z => z.id === q.id); if (f) { f.x = r3(q.x + r.x - gesture.x0); f.y = r3(q.y + r.y - gesture.y0); } }
      draw(false);
    }
  });
  function endPointer(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (gesture && gesture.type === 'pinch') { if (pts.size === 0) gesture = null; preview = null; updateOverlay(); return; }
    if (gesture && gesture.type === 'place') { gesture = null; commitPlacement(); return; }
    if (gesture && gesture.type === 'drawWall') {
      const dr = wallDraft; gesture = null; wallDraft = null;
      if (!dr || Math.abs(dr.b - dr.a) < 0.3) { updateOverlay(); toast('Drag further to draw a wall (min. 300 mm)'); return; }
      commit();
      if (mode && mode.kind === 'lvWall' && curLevel().id === 'RB') { // a wall on the roof beams
        const rw = Object.assign(wallDef(true), { id: AP.uid(), o: dr.o, c: r3(dr.c), a: r3(Math.min(dr.a, dr.b)), b: r3(Math.max(dr.a, dr.b)) });
        if (!rw.finA) delete rw.finA; if (!rw.finB) delete rw.finB;
        (P.roofWalls = P.roofWalls || []).push(rw);
        mode = { kind: 'levels' }; sel = { type: 'rwall', id: rw.id };
        changed(); toast('Wall on the roof beams – ' + AP.len(rw.b - rw.a) + ', ' + AP.mm(rw.h) + ' high. Change it below.', 2600);
        return;
      }
      const lvw = mode && mode.kind === 'lvWall';
      const fl = P.floors[fi], xw = Object.assign(wallDef(false), { id: AP.uid(), o: dr.o, c: r3(dr.c), a: r3(Math.min(dr.a, dr.b)), b: r3(Math.max(dr.a, dr.b)) });
      if (!xw.h) delete xw.h; if (!xw.finA) delete xw.finA; if (!xw.finB) delete xw.finB;
      (fl.extraWalls = fl.extraWalls || []).push(xw);
      mode = lvw ? { kind: 'levels' } : { kind: 'walls' }; sel = { type: 'xwall', id: xw.id };
      changed();
      toast('Wall added – ' + AP.len(xw.b - xw.a) + '. Set the exact length below.', 2500);
      return;
    }
    if (gesture && gesture.type === 'dragOp' && gesture.moved) { gesture = null; preview = null; changed(); return; }
    if (gesture && gesture.type === 'dragOpE' && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && gesture.type === 'dragFurn' && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && gesture.type === 'furnEdge' && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && !gesture.moved && (tab === 'elev' || tab === 'sect')) { gesture = null; onTapElev(toModel(e.clientX, e.clientY)); return; }
    if (gesture && gesture.type === 'devMove' && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && gesture.type === 'plMove' && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && gesture.type === 'plPipe') {
      const dr = plDraft; gesture = null; plDraft = null;
      if (!dr || Math.hypot(dr[1][0] - dr[0][0], dr[1][1] - dr[0][1]) < 0.1) { updateOverlay(); toast('Drag from one end of the pipe to the other', 1600); return; }
      const [sys, size] = (sub.plPipe && PIPE_KINDS.some(q => q[0] === sub.plPipe) && isWaterKind(sub.plPipe) === (sub.det === 'pWater') ? sub.plPipe : PIPE_KINDS.find(q => isWaterKind(q[0]) === (sub.det === 'pWater'))[0]).split(':');
      commit(); const a = { id: AP.uid(), fi, pipe: sys, a: dr[0], b: dr[1], size };
      plumbEd().add.push(a); sel = { type: 'pl', key: 'u:' + a.id }; changed();
      toast(PL_NAMES[sys] + ' ' + size + ' added – ' + AP.len(Math.hypot(dr[1][0] - dr[0][0], dr[1][1] - dr[0][1])), 1800);
      return;
    }
    if (gesture && !gesture.moved && plumbView()) {
      gesture = null; const m = toModel(e.clientX, e.clientY);
      if (mode && mode.kind === 'plMark') {
        const kind = mode.mark || 'co', a = { id: AP.uid(), fi, mark: kind, p: plSnap(m) };
        commit(); plumbEd().add.push(a); sel = { type: 'pl', key: 'u:' + a.id }; changed(); toast((PL_NAMES[kind] || kind) + ' added', 1400); return;
      }
      const h = plHit(m); sel = h ? { type: 'pl', key: h.key } : null; refresh();
      if (!h) toast('Tap a pipe or a symbol – or + Pipe / + Symbol', 1500);
      return;
    }
    if (gesture && gesture.type === 'ulMove') { const g = gesture; gesture = null; if (g.moved) changed(); return; }
    if (gesture && gesture.type === 'shMove') {
      const g = gesture; gesture = null;
      if (!g.moved || !g.off) { updateOverlay(); return; }
      commit(); P.sheetMoves = P.sheetMoves || {};
      P.sheetMoves[g.box.key] = [Math.round((g.d0[0] + g.off[0]) * 2) / 2, Math.round((g.d0[1] + g.off[1]) * 2) / 2];
      changed(); toast(g.box.title + ' moved', 1200);
      return;
    }
    if (gesture && gesture.type === 'siteMove') {
      const g = gesture; gesture = null; if (!g.moved) return;
      changed(); const w = AP.siteWarning(P);
      toast(w ? '\u26a0 Still outside the lot – keep dragging, or tap Fit in lot' : 'Front setback ' + AP.len(P.lot.setback) + ' · shift ' + AP.len(P.lot.shift), w ? 2500 : 1800);
      return;
    }
    if (gesture && !gesture.moved && elecView()) {
      gesture = null; const m = toModel(e.clientX, e.clientY);
      if (mode && mode.kind === 'addDev') { addDev(m); return; }
      if (mode && mode.kind === 'linkDev') { linkDev(m); return; }
      const v = hitDev(m); sel = v ? { type: 'dev', key: v.key } : null; sub.hiCkt = null; refresh();
      if (!v) toast('Tap a symbol – or pick one and + Add', 1500);
      return;
    }
    if (gesture && gesture.type === 'edge') {
      const g = gesture, r = P.floors[fi].rooms.find(q => q.id === g.room.id);
      gesture = null;
      if (g.moved) changed(); else updateOverlay();
      if (r) showDimBox(r, g.side, !g.moved);
      return;
    }
    if (gesture && gesture.type === 'drawBeam') { const g = gesture; gesture = null; finishBeam(g); return; }
    if (gesture && gesture.type === 'drawTruss') { gesture = null; finishTruss(); return; }
    if (gesture && (gesture.type === 'trussEnd' || gesture.type === 'trussMove' || gesture.type === 'tnode') && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && gesture.type === 'dragXWall') { const g = gesture; gesture = null; if (g.moved) changed(); else updateOverlay(); return; }
    if (gesture && gesture.type === 'xdim') { const g = gesture; gesture = null; if (!g.moved) typeXDim(g.lab); return; }
    if (gesture && gesture.type === 'drawRoof') { const g = gesture; gesture = null; finishRoofDraw(g, toModel(e.clientX, e.clientY)); return; }
    if (gesture && (gesture.type === 'roofEdge' || gesture.type === 'dragRoof') && gesture.moved) { gesture = null; changed(); return; }
    if (gesture && !gesture.moved && tab === 'plan') onTap(toModel(e.clientX, e.clientY));
    if (gesture && gesture.type === 'drag' && gesture.moved) changed();
    gesture = null;
  }
  svgEl.addEventListener('pointerup', endPointer);
  svgEl.addEventListener('pointercancel', e => { pts.delete(e.pointerId); gesture = null; });
  svgEl.addEventListener('wheel', e => {
    e.preventDefault();
    const v = views[current.key], m = toModel(e.clientX, e.clientY);
    v.k = Math.min(4000, Math.max(2, v.k * Math.exp(-e.deltaY * 0.0015)));
    const r = svgEl.getBoundingClientRect();
    v.x = m[0] - (e.clientX - r.left) / v.k; v.y = m[1] - (e.clientY - r.top) / v.k;
    applyView();
  }, { passive: false });

  function snapEdge(v, size, ax, self, tol) {
    const edges = [];
    const fls = [P.floors[fi]]; if (fi > 0) fls.push(P.floors[fi - 1]);
    for (const f of fls) for (const r of f.rooms) {
      if (r.id === self.id) continue;
      if (ax === 'x') edges.push(r.x, r.x + r.w); else edges.push(r.y, r.y + r.l);
    }
    let best = null, bd = tol;
    for (const e of edges) {
      if (Math.abs(v - e) < bd) { bd = Math.abs(v - e); best = e; }
      if (Math.abs(v + size - e) < bd) { bd = Math.abs(v + size - e); best = e - size; }
    }
    return best != null ? r2(best) : r2(snap(v, 0.05));
  }
  function hitRoom(m) {
    let best = null;
    for (const r of P.floors[fi].rooms) if (m[0] >= r.x && m[0] <= r.x + r.w && m[1] >= r.y && m[1] <= r.y + r.l) { if (!best || r.w * r.l < best.w * best.l) best = r; }
    return best;
  }
  function hitOpening(m) {
    const fl = P.floors[fi], tol = Math.max(0.25, 18 / views[current.key].k);
    let best = null, bd = Infinity;
    for (const op of fl.openings) {
      const R = AP.resolveOp(fl, op); if (!R) continue;
      const along = R.o === 'h' ? m[0] : m[1], across = R.o === 'h' ? m[1] : m[0];
      if (Math.abs(along - R.s) <= R.w / 2 + 0.05 && Math.abs(across - R.c) < tol) {
        const dd = Math.abs(across - R.c); if (dd < bd) { bd = dd; best = op; }
      }
    }
    return best;
  }
  /* ---------- editing doors & windows in the elevation / section views ---------- */
  function hitElev(m) {
    const pad = 10 / views[current.key].k;
    let best = null; // drawn last = in front
    for (const h of elevHits) if (m[0] >= h.u0 - pad && m[0] <= h.u1 + pad && -m[1] >= h.zA - pad && -m[1] <= h.zB + pad) best = h;
    return best;
  }
  function onTapElev(m) {
    if (!editOn) {
      if (!onTapElev.told) { onTapElev.told = true; toast('View mode – tap ✎ Edit to change walls, doors & windows here', 2200); }
      return;
    }
    const h = hitElev(m);
    if (!h) { if (sel) { sel = null; refresh(); } return; }
    if (h.wall) { wallElevDialog(h); return; }
    fi = h.fi; sel = { type: 'op', id: h.id };
    refresh();
    toast(h.cut ? 'Cut through this opening – edit it below' : 'Drag sideways to move it, up/down to change the sill – or edit below', 2200);
  }
  // a wall tapped in an elevation / section: thickness, height, delete (drawn walls), the storey height (room walls)
  async function wallElevDialog(h) {
    const S = P.settings, fl = P.floors[h.fi];
    if (h.rw) {
      const w = AP.roofWalls(P).find(q => q.id === h.rw); if (!w) return;
      const html = `<div class="form"><div class="row">${lenIn('we_h', 'Height above the roof beam', w.h)}${lenIn('we_t', 'Thickness', w.t)}</div><p class="muted small">Wall standing on the roof beams (parapet / fire wall). Draw more on Plan › Levels › Roof beam level › + Wall.</p></div>`;
      const v = await modal('Wall on the roof beams', html, 'Save', { text: 'Delete wall', value: 'del', cls: 'danger' }); if (!v) return;
      commit();
      if (v === 'del') P.roofWalls = AP.roofWalls(P).filter(q => q.id !== w.id);
      else { const hh = AP.fromU(num($('we_h').value, AP.toU(w.h))), tt = AP.fromU(num($('we_t').value, AP.toU(w.t))); if (hh >= 0.1 && hh <= 6) w.h = r3(hh); if (tt >= 0.05 && tt <= 0.6) w.t = r3(tt); }
      changed(); return;
    }
    const xw = h.xid && (fl.extraWalls || []).find(q => q.id === h.xid);
    const walls = AP.computeWalls(fl, S), w = AP.wallAt(walls, h.o, h.c, (h.a + h.b) / 2); if (!w) return;
    const floorTxt = fl.name.toLowerCase();
    const html = `<div class="form"><div class="row">${lenIn('we_t', 'Wall thickness', w.t)}${xw ? lenIn('we_h', 'Wall height (0 = up to the beam)', xw.h || 0) : lenIn('we_st', 'Storey height of the ' + esc(floorTxt) + ' (floor to top of beam)', AP.floorH(P, h.fi))}</div>
      ${!xw && w.kind === 'ext' && tab === 'elev' ? `<label>Exterior wall finish<select id="we_fin">${AP.FINISHES.exterior.map(q => `<option${q === (S.extFinish || AP.FINISHES.exterior[0]) ? ' selected' : ''}>${esc(q)}</option>`).join('')}</select></label>` : ''}
      <p class="muted small">${xw ? 'A wall you drew.' : (w.kind === 'ext' ? 'Exterior' : 'Interior') + ' wall of the ' + esc(floorTxt) + '. The storey height moves the levels above (as in Plan › Levels › Height).'} Finishes per room side: open the room › Walls.</p></div>`;
    const v = await modal((xw ? 'Drawn wall' : w.kind === 'ext' ? 'Exterior wall' : 'Interior wall') + ' · ' + fl.name, html, 'Save', xw ? { text: 'Delete wall', value: 'del', cls: 'danger' } : null); if (!v) return;
    commit();
    if (v === 'del' && xw) { fl.extraWalls = fl.extraWalls.filter(q => q.id !== xw.id); fl.openings = fl.openings.filter(o => o.wallId !== xw.id); changed(); toast('Wall deleted'); return; }
    const t = AP.fromU(num($('we_t').value, AP.toU(w.t)));
    if (t >= 0.05 && t <= 0.6 && Math.abs(t - w.t) > 0.0005) {
      if (xw) xw.t = r3(t);
      else { fl.wallThk = (fl.wallThk || []).filter(q => !(q.o === w.o && AP.eq(q.c, w.c) && Math.min(q.b, w.b) - Math.max(q.a, w.a) > 0.05)); fl.wallThk.push({ o: w.o, c: r3(w.c), a: r3(w.a), b: r3(w.b), t: r3(t) }); }
    }
    if (xw) { const hh = AP.fromU(num($('we_h').value, 0)); if (hh > 0.05) xw.h = r3(Math.min(hh, AP.floorH(P, h.fi))); else delete xw.h; }
    else { const st2 = AP.fromU(num($('we_st').value, AP.toU(AP.floorH(P, h.fi)))); if (st2 >= 2.2 && st2 <= 8) { if (Math.abs(st2 - S.floorHt) < 0.0005) delete fl.ht; else fl.ht = r3(st2); } }
    if ($('we_fin')) S.extFinish = $('we_fin').value;
    changed(); toast('Wall saved', 1500);
  }
  function dragOpElev(g, dx, dy) {
    const v = views[current.key], fl = P.floors[g.fi], op = fl.openings.find(q => q.id === g.op.id); if (!op) return;
    if (!g.axis) g.axis = Math.abs(dx) >= Math.abs(dy) || op.kind === 'door' ? 'h' : 'v'; // lock to one direction
    if (!g.committed) { commit(); g.committed = true; }
    if (g.axis === 'h') {
      const Ro = AP.resolveOp(fl, op), keep = fi;
      fi = g.fi;
      const pv = Ro && computeAt(AP.wallPt(Ro.o, Ro.c, g.s0 + g.dir * dx / v.k), op.w, op);
      fi = keep;
      if (pv && pv.ok) op.off = pv.off;
    } else {
      const top = AP.floorH(P, g.fi) - P.settings.beamDepth - op.h;
      op.sill = r2(Math.min(Math.max(0, snap(g.sill0 - dy / v.k, 0.05)), Math.max(0, top)));
      op.align = Math.abs(op.sill + op.h - P.settings.doorHt) < 0.001; // dragged back to the door line = aligned again
    }
    draw(false);
  }
  function onTap(m) {
    const fl = P.floors[fi];
    const td = !mode && editOn && hitTempDim(m);
    if (td) { showOpDim(td); return; }
    if (inRoom && roomInside) return; // the wall views are only for looking
    if (inRoom && !mode) { // inside a room: its doors, windows and furniture can be picked
      // furniture under the finger first, then a door / window, then the room's automatic furniture
      let fu = hitFurn(m);
      const op = !fu && hitOpeningInRoom(m);
      if (op) { sel = { type: 'op', id: op.id }; refresh(); toast(op.locked ? '🔒 Locked – unlock it to move or change it' : 'Drag it along the wall to move it', 1500); return; }
      if (!fu) fu = adoptAutoFurniture(m); // an automatic piece: make the room's furniture editable
      sel = fu ? { type: 'furn', id: fu.id } : null; refresh();
      if (fu && fu.locked) toast('🔒 Locked – unlock it to move or change it', 1500);
      return;
    }
    if (mode && mode.kind === 'ulScale') { ulScaleTap(m); return; }
    if (mode && mode.kind === 'ulMove') return;
    if (mode) {
      if (mode.kind === 'column') placeColumn(m);
      else if (mode.kind === 'furn') placeFurniture(m);
      else if (mode.kind === 'walls') { const wl = hitWall(m); sel = wl; refresh(); if (!wl) toast('Tap on a wall (zoom in if it is thin)'); }
      else if (mode.kind === 'levels') {
        const Lv = curLevel(), b = Lv.edit && hitBeam(m);
        // walls of this level when no beam is under the finger
        let wl = null;
        if (!b && Lv.id === 'RB') { const rw = hitRoofWall(m); if (rw) wl = { type: 'rwall', id: rw.id }; }
        else if (!b && lvWallOK(Lv)) { fi = Lv.floor; const h = hitWall(m); if (h && h.type === 'xwall') wl = h; }
        sel = b ? { type: 'beam', lv: Lv.lv, key: b.key } : wl; refresh();
        if (!Lv.edit) toast('This level is for looking – pick a beam level to edit beams', 2000); else if (!b && !wl) toast('Tap on a beam or a wall – or + Beam / + Wall to add one', 1800);
      }
      else if (mode.kind === 'sketchRoof') sketchTap(m);
      else if (mode.kind === 'trussEdit') trussEditTap(m);
      else if (mode.kind === 'trusses') { const tl = hitTruss(m); sel = tl ? { type: 'truss', id: tl.id } : null; refresh(); if (!tl) toast('Tap a truss you placed – or + Truss to add one', 1800); }
      else if (mode.kind === 'roof') { const R = hitRoof(m); sel = R ? { type: 'roof', id: R.id } : null; refresh(); if (!R) toast('Tap inside a roof outline – or + Add roof', 1800); }
      else if (mode.kind === 'cols') { const c = hitColumn(m); sel = c ? { type: 'col', key: AP.colKey(c.x, c.y) } : null; refresh(); if (!c) toast('Tap on a column – or use + Add column'); }
      return;
    }
    if (!editOn) {
      if (!onTap.told) { onTap.told = true; toast('View mode – tap ✎ Edit to select and change things', 2200); }
      return;
    }
    // furniture & fixtures are edited only inside the opened room (Open room); here: doors, windows, rooms
    const op = hitOpening(m);
    if (op) { sel = { type: 'op', id: op.id }; refresh(); toast('Drag it along the wall to move it', 1500); return; }
    const r = hitRoom(m);
    sel = r ? { type: 'room', id: r.id } : null;
    refresh();
    if (r && fl.rooms.length) toast('Long-press and drag to move the room, drag a blue handle to resize it – 🛋 Open room to edit its furniture', 2800);
  }

  /* ---------- rooms ---------- */
  const TYPE_OPTS = Object.entries(AP.ROOM_TYPES).map(([k, v]) => [k, v.label]);
  async function addRoomDialog(prefill) {
    const fl = P.floors[fi];
    const refs = fl.rooms.map(r => [r.id, r.name]);
    if (fi > 0) for (const r of P.floors[fi - 1].rooms) refs.push([r.id, '(' + P.floors[fi - 1].name.toLowerCase() + ') ' + r.name]);
    const last = prefill && prefill.ref ? prefill.ref : (fl.rooms.length ? fl.rooms[fl.rooms.length - 1].id : (refs[0] ? refs[0][0] : ''));
    const isFirst = !refs.length;
    const fields = [
      { k: 'type', label: 'Space type', type: 'select', value: (prefill && prefill.type) || (isFirst ? 'living' : 'bedroom'), options: TYPE_OPTS },
      { k: 'name', label: 'Name (leave blank to use the type)', value: '' },
      { k: 'w', label: 'Width, left–right', type: 'len', value: (prefill && prefill.w) || 4, pair: true },
      { k: 'l', label: 'Length, top–bottom', type: 'len', value: (prefill && prefill.l) || 3 }
    ];
    if (!isFirst) fields.push(
      { k: 'ref', label: 'Place next to', type: 'select', value: last, options: refs },
      { k: 'side', label: 'Which side', type: 'select', value: (prefill && prefill.side) || 'R', options: [['R', 'Right of it'], ['L', 'Left of it'], ['B', 'Below it (front)'], ['T', 'Above it (back)']], pair: true },
      { k: 'align', label: 'Align', type: 'select', value: 'start', options: [['start', 'Top / left edges'], ['center', 'Centered'], ['end', 'Bottom / right edges']] }
    );
    fields.push({ k: 'hint', type: 'h', label: 'Sizes are center-to-center of walls (grid to grid).' });
    const v = await modal(isFirst ? 'First room / area' : 'Add room / area', fields, 'Add');
    if (!v) return;
    if (!(v.w > 0.3 && v.l > 0.3)) { toast('Enter a width and length larger than 0.30 m'); return; }
    const room = { id: AP.uid(), type: v.type, name: (v.name || '').trim() || AP.ROOM_TYPES[v.type].label, w: r2(v.w), l: r2(v.l), x: 0, y: 0 };
    if (!isFirst) {
      const ref = fl.rooms.find(r => r.id === v.ref) || (fi > 0 && P.floors[fi - 1].rooms.find(r => r.id === v.ref));
      if (ref) {
        const al = (a0, aLen, bLen) => v.align === 'center' ? a0 + (aLen - bLen) / 2 : v.align === 'end' ? a0 + aLen - bLen : a0;
        if (v.side === 'R') { room.x = ref.x + ref.w; room.y = al(ref.y, ref.l, room.l); }
        if (v.side === 'L') { room.x = ref.x - room.w; room.y = al(ref.y, ref.l, room.l); }
        if (v.side === 'B') { room.y = ref.y + ref.l; room.x = al(ref.x, ref.w, room.w); }
        if (v.side === 'T') { room.y = ref.y - room.l; room.x = al(ref.x, ref.w, room.w); }
        room.x = r2(room.x); room.y = r2(room.y);
      }
    }
    commit();
    fl.rooms.push(room);
    sel = editOn ? { type: 'room', id: room.id } : null;
    changed();
    fitView();
  }
  function roomList() {
    const fl = P.floors[fi];
    if (!fl.rooms.length) { toast('No rooms on this floor yet'); return; }
    const html = '<div class="proj-list">' + fl.rooms.map(r => `<div class="proj"><div class="info"><div class="t">${esc(r.name)}</div><div class="s">${AP.mm(r.w)} x ${AP.len(r.l)} · ${AP.area(r.w * r.l)}</div></div><button class="ghost" data-id="${r.id}">Select</button></div>`).join('') +
      `</div><p class="muted small">Total floor area: <b>${AP.area(fl.rooms.reduce((a, r) => a + r.w * r.l, 0))}</b></p>`;
    modal(fl.name + ' – rooms', html, null);
    $('mBody').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) { $('modal').hidden = true; sel = { type: 'room', id: b.dataset.id }; setEdit(true); } }; // choosing a room = edit it
  }

  /* ---------- openings ---------- */
  function pickTemplate(kind) {
    const T = kind === 'door' ? AP.DOOR_TPL : AP.WIN_TPL;
    const html = '<div class="tpl-list">' + Object.entries(T).map(([k, t]) =>
      `<button data-k="${k}"><b>${k} · ${esc(t.name)}</b><span>${AP.mm(t.w)} x ${AP.len(t.h)}${t.sill ? ' · sill ' + AP.len(t.sill) : ''}</span></button>`).join('') + '</div>';
    modal(kind === 'door' ? 'Insert door' : 'Insert window', html, null);
    $('mBody').onclick = e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      $('modal').hidden = true;
      mode = { kind, tpl: b.dataset.k }; sel = null; preview = null; refresh();
    };
  }
  /* ---------- furniture: pick from the library, tap in a room to place it ---------- */
  function pickFurniture() {
    const cats = {};
    for (const [k, f] of Object.entries(AP.FURN)) (cats[f.cat] = cats[f.cat] || []).push([k, f]);
    const html = Object.entries(cats).map(([c, list]) => `<p class="small" style="margin:10px 0 4px"><b>${esc(c)}</b></p><div class="tpl-list">` +
      list.map(([k, f]) => `<button data-k="${k}"><b>${esc(f.name)}</b><span>${AP.mm(f.w)} x ${AP.len(f.l)}</span></button>`).join('') + '</div>').join('');
    modal('Add furniture', html, null);
    $('mBody').onclick = e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      $('modal').hidden = true;
      mode = { kind: 'furn', tpl: b.dataset.k }; sel = null; preview = null; refresh();
    };
  }
  // place a piece: inside a room its back goes against the nearest wall
  function placeFurniture(m) {
    const F = AP.FURN[mode.tpl], fl = P.floors[fi];
    const r = inRoom ? fl.rooms.find(q => q.id === inRoom) : hitRoom(m);
    if (!r) { toast('Furniture goes inside a room – tap inside one', 2000); return; }
    if (m[0] < r.x || m[0] > r.x + r.w || m[1] < r.y || m[1] > r.y + r.l) { toast('Tap inside the ' + r.name, 1800); return; }
    const f = { id: AP.uid(), kind: mode.tpl, x: r3(snapInc(m[0])), y: r3(snapInc(m[1])), rot: 0 };
    if (r) {
      const walls = AP.computeWalls(fl, P.settings);
      const half = (o, c, s) => { const w = AP.wallAt(walls, o, c, s); return w && w.t ? w.t / 2 : 0; };
      const dist = { N: m[1] - r.y, S: r.y + r.l - m[1], W: m[0] - r.x, E: r.x + r.w - m[0] };
      const side = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0];
      if (dist[side] < Math.max(1.2, F.l)) {
        f.rot = { N: 0, E: 90, S: 180, W: 270 }[side];
        const g = 0.02; // small gap from the wall face
        if (side === 'N') f.y = r2(r.y + half('h', r.y, m[0]) + F.l / 2 + g);
        if (side === 'S') f.y = r2(r.y + r.l - half('h', r.y + r.l, m[0]) - F.l / 2 - g);
        if (side === 'W') f.x = r2(r.x + half('v', r.x, m[1]) + F.l / 2 + g);
        if (side === 'E') f.x = r2(r.x + r.w - half('v', r.x + r.w, m[1]) - F.l / 2 - g);
      }
    }
    commit();
    clampFurn(f, r);
    (fl.furniture = fl.furniture || []).push(f);
    mode = null; sel = { type: 'furn', id: f.id };
    if (!editOn) { editOn = true; try { localStorage.setItem('arkiplan.edit', '1'); } catch (e) { /* ignore */ } }
    changed();
    toast(F.name + ' added – drag it to move, or Rotate / Delete below', 2500);
  }
  // Furniture button on the plan: open the selected room, or ask which room
  function furnishWhere() {
    const fl = P.floors[fi];
    if (sel && sel.type === 'room') { enterRoom(fl.rooms.find(q => q.id === sel.id)); return; }
    if (!fl.rooms.length) { toast('Add a room first'); return; }
    const html = '<p class="small">Which room do you want to furnish?</p><div class="tpl-list">' + fl.rooms.map(r => `<button data-id="${r.id}"><b>${esc(r.name)}</b><span>${AP.mm(r.w)} x ${AP.len(r.l)}</span></button>`).join('') + '</div>';
    modal('Furnish a room', html, null);
    $('mBody').onclick = e => { const b = e.target.closest('button[data-id]'); if (!b) return; $('modal').hidden = true; enterRoom(fl.rooms.find(q => q.id === b.dataset.id)); };
  }
  function enterRoom(r) {
    if (!r) return;
    inRoom = r.id; mode = null; preview = null; sel = null;
    if (!editOn) { editOn = true; try { localStorage.setItem('arkiplan.edit', '1'); } catch (e) { /* ignore */ } }
    refresh(true);
    toast('Inside ' + r.name + ' – tap 🛋 Add furniture', 1800);
  }
  // Automatic furniture (beds, sofa, tables, car) becomes normal furniture the first time you tap it
  // inside the room view: the room switches to "Auto furniture: off" and keeps the same pieces.
  const AUTO_KIND = { 'SOFA-3': 'sofa3', 'SOFA-2': 'sofa2', BEDQUEEN: 'bedQ', BEDFULL: 'bedF', BEDSINGLE: 'bedS', BEDMAID: 'bedM', 'TABLE-2': 'dine4', 'TABLE-3': 'dine6', 'TABLE-4': 'dine8' };
  const FIX_KIND = { table: 'coffee', bed: 'bedS', sofa: 'sofa3', dtable: 'dine4', wc: 'wc', lav: 'lav', shower: 'shower', sink: 'sink1', stove: 'stove', counter: 'counter', counterL: 'counterL', washer: 'wm', tub: 'ltub', drain: 'fd' };
  function adoptAutoFurniture(m, room) {
    const fl = P.floors[fi], r = room || fl.rooms.find(q => q.id === inRoom); if (!r || r.fixOff) return null;
    const ROT = { N: 0, E: 90, S: 180, W: 270 };
    const conv = [];
    for (const f of AP.fixtures(fl, r, P.settings)) {
      if (r.fxOff && FIX_KIND[f.kind] && !AP.PLUMB_KINDS.includes(f.kind) && f.kind !== 'stove') continue; // its furniture was taken over already
      let kind = (f.block && AUTO_KIND[f.block]) || FIX_KIND[f.kind];
      if (f.kind === 'drain') {
        const p = AP.frame(r, f.side)(f.s0, f.n0);
        conv.push({ kind: 'fd', x: p[0], y: p[1], rot: ROT[f.side] || 0, w: 0.15, l: 0.15, box: [p[0] - 0.15, p[1] - 0.15, p[0] + 0.15, p[1] + 0.15] });
        continue;
      }
      if (f.kind === 'car' && f.world) {
        const [x, y, w, l] = f.world;
        conv.push({ kind: 'car', x: x + w / 2, y: y + l / 2, rot: w > l ? 90 : 0, w: 1.8, l: 4.5, box: [x, y, x + w, y + l] });
        continue;
      }
      if (!kind || f.s0 == null) continue;
      const L = AP.frame(r, f.side), a = L(f.s0, f.n0), b = L(f.s1, f.n1);
      let rot = ROT[f.side] || 0, w = Math.abs(f.s1 - f.s0), l = Math.abs(f.n1 - f.n0);
      if (f.block && /^TABLE/.test(f.block) && f.blockWall === 'top') { rot = (rot + 90) % 360; const t = w; w = l; l = t; } // library dining sets lie along the wall
      conv.push({ kind, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, rot, w, l, mir: f.leg === 'right', d: f.d,
        box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] });
    }
    // small pieces on top of a counter (sink, stove) win over the counter
    conv.sort((p, q) => (q.box[2] - q.box[0]) * (q.box[3] - q.box[1]) - (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]));
    let hit = null;
    for (const c of conv) if (m[0] >= c.box[0] && m[0] <= c.box[2] && m[1] >= c.box[1] && m[1] <= c.box[3]) hit = c; // smallest last
    if (!hit) return null;
    commit();
    fl.furniture = fl.furniture || [];
    let picked = null;
    // big pieces first so the sink / stove are drawn (and tapped) on top of the counter
    for (const c of conv) {
      const f = { id: AP.uid(), kind: c.kind, x: r3(c.x), y: r3(c.y), rot: c.rot, w: r3(c.w), l: r3(c.l) };
      if (c.kind === 'counterL') Object.assign(f, { mir: !!c.mir, d: c.d || 0.6 });
      fl.furniture.push(f);
      if (c === hit) picked = f;
    }
    r.fxOff = true; r.fixOff = true;
    AP.store.save(P); sheetsCache = null;
    toast('Everything in ' + r.name + ' can now be moved, stretched, rotated and deleted', 2400);
    return picked;
  }
  // room view: a door counts from its whole swing, a window from a wide band on its wall
  function hitOpeningInRoom(m) {
    const fl = P.floors[fi]; let best = null, bd = Infinity;
    for (const op of fl.openings) {
      if (!opInRoom(op)) continue;
      const R = AP.resolveOp(fl, op); if (!R) continue;
      const along = R.o === 'h' ? m[0] : m[1], across = Math.abs((R.o === 'h' ? m[1] : m[0]) - R.c);
      const reach = op.kind === 'door' ? Math.max(0.4, R.w) : 0.4;
      if (Math.abs(along - R.s) <= R.w / 2 + 0.1 && across <= reach && across < bd) { bd = across; best = op; }
    }
    return best;
  }
  // a door / window on one of the walls of the opened room
  function opInRoom(op) {
    const fl = P.floors[fi], r = fl.rooms.find(q => q.id === inRoom), R = AP.resolveOp(fl, op);
    if (!r || !R) return false;
    const p = AP.wallPt(R.o, R.c, R.s), e = 0.35;
    return p[0] > r.x - e && p[0] < r.x + r.w + e && p[1] > r.y - e && p[1] < r.y + r.l + e && (R.o === 'h' ? Math.abs(R.c - r.y) < 0.01 || Math.abs(R.c - r.y - r.l) < 0.01 : Math.abs(R.c - r.x) < 0.01 || Math.abs(R.c - r.x - r.w) < 0.01);
  }
  function exitRoom() { inRoom = null; roomInside = false; mode = null; sel = null; refresh(true); }
  // the room a piece stands in (by its centre)
  function furnRoom(f) {
    const fl = P.floors[fi];
    if (inRoom) return fl.rooms.find(q => q.id === inRoom);
    let best = null;
    for (const r of fl.rooms) if (f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.l && (!best || r.w * r.l < best.w * best.l)) best = r;
    return best;
  }
  // keep a piece inside the room's wall faces (centred if it is bigger than the room)
  function clampFurn(f, r) {
    if (!r) return;
    const walls = AP.computeWalls(P.floors[fi], P.settings);
    const half = (o, c, s) => { const w = AP.wallAt(walls, o, c, s); return w && w.t ? w.t / 2 : 0; };
    const [w, l] = AP.furnSize(f), turned = (f.rot || 0) % 180 !== 0;
    const hx = (turned ? l : w) / 2, hy = (turned ? w : l) / 2;
    const x0 = r.x + half('v', r.x, f.y), x1 = r.x + r.w - half('v', r.x + r.w, f.y);
    const y0 = r.y + half('h', r.y, f.x), y1 = r.y + r.l - half('h', r.y + r.l, f.x);
    f.x = x1 - x0 < 2 * hx ? r3((x0 + x1) / 2) : r3(Math.min(Math.max(f.x, x0 + hx), x1 - hx));
    f.y = y1 - y0 < 2 * hy ? r3((y0 + y1) / 2) : r3(Math.min(Math.max(f.y, y0 + hy), y1 - hy));
  }
  function hitFurn(m) {
    let best = null;
    for (const f of P.floors[fi].furniture || []) {
      const [w, l] = AP.furnSize(f), q = AP.furnXf(f).inv(m[0], m[1]);
      if (Math.abs(q[0]) <= w / 2 && Math.abs(q[1]) <= l / 2) best = f; // last drawn = on top
    }
    return best;
  }
  /* stretch handles on the selected piece: back, front, left, right (in the piece's own frame) */
  const furnGripLocal = f => { const [w, l] = AP.furnSize(f); return { B: [0, -l / 2], F: [0, l / 2], L: [-w / 2, 0], R: [w / 2, 0] }; };
  function hitFurnGrip(m) {
    if (!sel || sel.type !== 'furn' || mode) return null;
    const f = (P.floors[fi].furniture || []).find(q => q.id === sel.id); if (!f) return null;
    const k = views[current.key].k, T = AP.furnXf(f).T, G = furnGripLocal(f);
    let best = null, bd = 22 / k;
    for (const [side, p] of Object.entries(G)) { const q = T(...p), dd = Math.hypot(m[0] - q[0], m[1] - q[1]); if (dd < bd) { bd = dd; best = { side, f }; } }
    return best;
  }
  function stretchFurn(g, m) {
    const f = (P.floors[fi].furniture || []).find(q => q.id === g.id); if (!f) return;
    if (!g.committed) { commit(); g.committed = true; }
    const f0 = g.f0, [w0, l0] = AP.furnSize(f0), X = AP.furnXf(f0), q = X.inv(m[0], m[1]), mn = 0.1;
    let w = w0, l = l0, cx = 0, cy = 0;
    const r2s = v => Math.round(v * 100) / 100;
    if (g.side === 'R') { w = Math.max(mn, r2s(q[0] + w0 / 2)); cx = -w0 / 2 + w / 2; }
    if (g.side === 'L') { w = Math.max(mn, r2s(w0 / 2 - q[0])); cx = w0 / 2 - w / 2; }
    if (g.side === 'F') { l = Math.max(mn, r2s(q[1] + l0 / 2)); cy = -l0 / 2 + l / 2; }
    if (g.side === 'B') { l = Math.max(mn, r2s(l0 / 2 - q[1])); cy = l0 / 2 - l / 2; }
    const c = X.T(cx, cy);
    Object.assign(f, { w: r3(w), l: r3(l), x: r3(c[0]), y: r3(c[1]) });
    if (f.kind === 'counterL') f.d = Math.min(f.d || 0.6, f.w, f.l);
    draw(false);
  }
  function furnGrips() {
    const d = new AP.Drawing(), f = (P.floors[fi].furniture || []).find(q => q.id === sel.id);
    if (!f || f.locked) return d;
    const k = views[current.key].k, rad = 8 / k, T = AP.furnXf(f).T, [w, l] = AP.furnSize(f);
    d.poly([T(-w / 2, -l / 2), T(w / 2, -l / 2), T(w / 2, l / 2), T(-w / 2, l / 2)], true, { stroke: '#1677ff', w: 2 / k, fill: 'none', dash: [6 / k, 4 / k] });
    for (const [side, p] of Object.entries(furnGripLocal(f))) {
      const [x, y] = T(...p), on = gesture && gesture.type === 'furnEdge' && gesture.side === side;
      d.circle(x, y, rad * (on ? 1.3 : 1), { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k });
    }
    const t = AP.mm(w) + ' x ' + AP.mm(l), h = 12 / k, tw = AP.textWidth(t, h, true), c = T(0, l / 2 + 0.05), cy = c[1] + 2.2 * h;
    d.rect(c[0] - tw / 2 - h * 0.4, cy - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
    d.text(c[0], cy, t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
    return d;
  }
  function furnPanel(pn) {
    const fl = P.floors[fi], f = (fl.furniture || []).find(q => q.id === sel.id);
    if (!f) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    const F = AP.FURN[f.kind], [w, l] = AP.furnSize(f), isL = f.kind === 'counterL', isC = f.kind === 'counter';
    const fields = [{ k: 'w', label: isL ? 'Length along the wall' : 'Width', type: 'len', value: w }, { k: 'l', label: isL ? 'Length of the leg' : 'Depth', type: 'len', value: l }, { k: 'x', label: 'X (center)', type: 'len', value: f.x }, { k: 'y', label: 'Y (center)', type: 'len', value: f.y }];
    if (isL) fields.push({ k: 'd', label: 'Counter depth', type: 'len', value: f.d || 0.6 });
    pn.innerHTML = `<div class="ph"><b>${esc(F.name)} · ${AP.mm(w)} x ${AP.len(l)}</b>${editBtn()}<button class="ghost" id="pClose">&#10005;</button></div>
      ${panelOpen ? `<div class="form"><div class="row">${fields.map(q => fieldHTML(q, 'p_')).join('')}</div></div>` : ''}
      <div class="btn-row"><button id="pFLock" class="${f.locked ? 'on' : ''}">${f.locked ? '&#128274; Locked' : '&#128275; Lock'}</button><button id="pFRot">&#10227; Rotate 90&deg;</button>${isC ? '<button id="pFL">Make L-shape</button>' : ''}${isL ? '<button id="pFMir">Mirror L</button><button id="pFStr">Straight</button>' : ''}<button id="pFDup">Duplicate</button><button id="pFDel" class="danger">Delete</button></div>`;
    pn.querySelectorAll('input').forEach(el => el.onchange = () => {
      const v = readFields(fields, 'p_');
      if (!(v.w >= 0.1 && v.l >= 0.1)) { toast('Size must be at least ' + AP.len(0.1)); return; }
      commit(); Object.assign(f, { w: r3(v.w), l: r3(v.l), x: r3(v.x), y: r3(v.y) });
      if (isL) f.d = r3(Math.min(Math.max(0.3, v.d), f.w, f.l));
      clampFurn(f, furnRoom(f)); changed();
    });
    // straight counter <-> L-shaped counter (the leg goes down from the left end; Mirror puts it on the right)
    if (isC) $('pFL').onclick = () => { commit(); const d0 = l; const T = AP.furnXf(f).T, L2 = Math.max(1.2, d0 * 2.5), c = T(0, -d0 / 2 + L2 / 2); Object.assign(f, { kind: 'counterL', d: r3(d0), l: r3(L2), x: r3(c[0]), y: r3(c[1]) }); clampFurn(f, furnRoom(f)); changed(); };
    if (isL) {
      $('pFMir').onclick = () => { commit(); f.mir = !f.mir; changed(); };
      $('pFStr').onclick = () => { commit(); const d0 = f.d || 0.6, T = AP.furnXf(f).T, c = T(0, -l / 2 + d0 / 2); Object.assign(f, { kind: 'counter', l: r3(d0), x: r3(c[0]), y: r3(c[1]) }); delete f.d; delete f.mir; changed(); };
    }
    $('pFRot').onclick = () => { commit(); f.rot = ((f.rot || 0) + 90) % 360; clampFurn(f, furnRoom(f)); changed(); };
    $('pFDup').onclick = () => { commit(); const n = Object.assign({}, f, { id: AP.uid(), x: r2(f.x + 0.3), y: r2(f.y + 0.3) }); fl.furniture.push(n); sel = { type: 'furn', id: n.id }; changed(); };
    $('pFDel').onclick = () => { commit(); fl.furniture = fl.furniture.filter(q => q.id !== f.id); sel = null; changed(); toast(F.name + ' deleted', 1500); };
    $('pFLock').onclick = () => { commit(); f.locked = !f.locked; changed(); toast(f.locked ? '🔒 ' + F.name + ' locked' : '🔓 ' + F.name + ' unlocked', 1800); };
    if (f.locked) { pn.querySelectorAll('input').forEach(el => { el.disabled = true; }); ['pFRot', 'pFDel'].forEach(id => { $(id).disabled = true; }); }
    $('pClose').onclick = () => { sel = null; refresh(); };
    $('pEdit').onclick = () => { panelOpen = !panelOpen; renderPanel(); };
    pn.classList.add('show');
  }

  /* ---------- walls: tap to select, delete / restore ---------- */
  // rooms whose side lies on this wall line at point s
  function roomSidesAt(o, c, s) {
    const out = [];
    for (const r of P.floors[fi].rooms) for (const sd of 'NSEW') {
      const si = AP.sideInfo(r, sd);
      if (si.o === o && AP.eq(si.c, c) && s > si.s0 + 1e-3 && s < si.s0 + si.len - 1e-3) out.push({ r, side: sd, si });
    }
    return out;
  }
  function findWall(w) {
    return AP.computeWalls(P.floors[fi], P.settings).find(q => q.o === w.o && AP.eq(q.c, w.c) && w.s >= q.a && w.s <= q.b);
  }
  function hitWall(m) {
    const k = views[current.key].k;
    let best = null, bd = Infinity;
    for (const w of AP.computeWalls(P.floors[fi], P.settings)) {
      const along = w.o === 'h' ? m[0] : m[1], across = w.o === 'h' ? m[1] : m[0];
      if (along < w.a || along > w.b) continue;
      const dd = Math.abs(across - w.c), tol = (w.t || 0) / 2 + 16 / k; // generous finger target
      if (dd < tol && dd < bd) { bd = dd; best = w.id ? { type: 'xwall', id: w.id } : { type: 'wall', o: w.o, c: w.c, s: along }; }
    }
    if (best && best.type === 'wall') { const pc = AP.wallPieceAt(P, fi, best.o, best.c, best.s); if (pc) { best.a = pc.a; best.b = pc.b; } }
    return best;
  }
  function wallPanel(pn) {
    const w = findWall(sel); if (!w) { pn.classList.remove('show'); return; }
    const fl = P.floors[fi];
    const a = sel.a != null ? sel.a : w.a, b = sel.b != null ? sel.b : w.b;
    const rs = roomSidesAt(sel.o, sel.c, (a + b) / 2);
    const isCut = (fl.wallCuts || []).some(k => k.o === sel.o && AP.eq(k.c, sel.c) && (a + b) / 2 > k.a && (a + b) / 2 < k.b);
    const legacy = rs.filter(x => AP.sideOpen(x.r, x.side));
    const removed = isCut || legacy.length;
    const kindTxt = w.kind === 'ext' ? 'Exterior wall' : w.kind === 'int' ? 'Interior wall' : removed ? 'Removed wall (open)' : 'Open side';
    pn.innerHTML = `<div class="ph"><b>${kindTxt}${w.t ? ' · ' + AP.len(w.t) : ''} · this piece ${AP.len(b - a)}</b><button class="ghost" id="pClose">&#10005;</button></div>
      <p class="muted small" style="margin:0 0 6px">${esc(rs.map(x => x.r.name).join(' / '))} – only the highlighted piece (between columns / wall corners) is changed</p>
      <div class="btn-row">${w.t ? '<button id="pWallDel" class="danger">Delete this piece</button>' : removed ? '<button id="pWallBack">Restore this piece</button>' : '<span class="muted small">Open area (porch / carport / balcony) – no wall to restore</span>'}</div>`;
    if ($('pWallDel')) $('pWallDel').onclick = () => {
      commit(); AP.setWallCut(fl, sel.o, sel.c, a, b, true); changed();
      toast('Wall piece deleted (' + AP.len(b - a) + '). Tap the dashed line to restore it.', 2600);
    };
    if ($('pWallBack')) $('pWallBack').onclick = () => {
      commit();
      AP.setWallCut(fl, sel.o, sel.c, a, b, false);
      // older projects removed whole room sides: turn those back on, keeping the rest of that side open as cut pieces
      for (const x of legacy) {
        x.r.noWall = x.r.noWall.filter(q => q !== x.side);
        const s0 = x.si.s0, s1 = x.si.s0 + x.si.len;
        if (a > s0 + 1e-3) AP.setWallCut(fl, sel.o, sel.c, s0, a, true);
        if (b < s1 - 1e-3) AP.setWallCut(fl, sel.o, sel.c, b, s1, true);
      }
      changed(); toast('Wall piece restored', 1800);
    };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }

  /* ---------- wall type for new walls: material, thickness, height, finishes (kept with the project) ---------- */
  const wallDef = roof => {
    const D = P.wallDef || {}, S = P.settings;
    return { mat: D.mat || 'chb', t: D.t || (roof ? S.extWall : S.intWall), h: D.h || (roof ? 1.0 : 0), finA: D.finA || '', finB: D.finB || '' };
  };
  const finOpts = () => [['', 'Same as the room / plain plaster'], ...[...new Set([...AP.FINISHES.wall, ...AP.FINISHES.exterior])].map(v => [v, v])];
  function wallFields(w, roof) {
    return [
      { k: 'wmat', label: 'Material', type: 'select', value: w.mat || 'chb', options: AP.WALL_MATERIALS.map(m => [m.k, m.name]) },
      { k: 'wt', label: 'Thickness', type: 'len', value: w.t },
      { k: 'wh', label: roof ? 'Height (above the roof beam)' : 'Height (0 = up to the beam)', type: 'len', value: w.h || 0 },
      { k: 'wfa', label: 'Finish – side 1 (' + (w.o === 'v' ? 'left' : 'top') + ')', type: 'select', value: w.finA || '', options: finOpts() },
      { k: 'wfb', label: 'Finish – side 2 (' + (w.o === 'v' ? 'right' : 'bottom') + ')', type: 'select', value: w.finB || '', options: finOpts() }
    ];
  }
  // apply the dialog / panel values to a wall (or to the defaults); false if a value is out of range
  function readWall(v, w, roof, maxH) {
    if (!(v.wt >= 0.05 && v.wt <= 0.6)) { toast('Thickness ' + AP.len(0.05) + ' – ' + AP.len(0.6), 2200); return false; }
    w.mat = v.wmat || 'chb'; w.t = r3(v.wt);
    if (roof) { if (v.wh >= 0.1 && v.wh <= 6) w.h = r3(v.wh); }
    else if (v.wh > 0.05) w.h = r3(Math.min(v.wh, maxH || 99)); else delete w.h;
    if (v.wfa) w.finA = v.wfa; else delete w.finA;
    if (v.wfb) w.finB = v.wfb; else delete w.finB;
    return true;
  }
  async function wallTypeDialog(roof, then) {
    const w = wallDef(roof), F = wallFields(w, roof);
    const pr = modal(roof ? 'New wall on the roof beams' : 'New wall', F, 'Draw wall');
    // a new material brings its usual thickness
    setTimeout(() => { const m = $('m_wmat'); if (m) m.onchange = () => { $('m_wt').value = AP.toU(AP.wallMat(m.value).t); }; }, 0);
    const v = await pr; if (!v) return;
    const d = {}; if (!readWall(v, d, roof)) return;
    P.wallDef = { mat: d.mat, t: d.t, h: d.h || 0, finA: d.finA || '', finB: d.finB || '' }; AP.store.save(P);
    then();
  }

  /* ---------- moving a drawn wall, with temporary dimensions to the walls around it (tap a number to type it) ---------- */
  let xwLabels = []; // label boxes of the temporary dimensions, model coordinates
  const movableWall = () => sel && (sel.type === 'xwall' ? findX(sel.id) : sel.type === 'rwall' ? AP.roofWalls(P).find(q => q.id === sel.id) : null);
  // wall lines it can be measured to: the floor's walls (the top floor for a wall on the roof beams) + the other drawn walls
  function xwRefs(w) {
    const rw = sel.type === 'rwall', fl = P.floors[rw ? Math.max(0, AP.nLevels(P) - 1) : fi];
    const L = AP.computeWalls(fl, P.settings).filter(q => q.t && q.id !== w.id).map(q => ({ o: q.o, c: q.c, a: q.a, b: q.b }));
    if (rw) for (const q of AP.roofWalls(P)) if (q.id !== w.id) L.push({ o: q.o, c: q.c, a: Math.min(q.a, q.b), b: Math.max(q.a, q.b) });
    const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b), out = [];
    // across: the nearest parallel wall on each side that runs alongside it
    for (const sg of [-1, 1]) {
      let best = null;
      for (const q of L) if (q.o === w.o && Math.min(q.b, b) - Math.max(q.a, a) > 0.01 && sg * (q.c - w.c) > 0.01 && (!best || Math.abs(q.c - w.c) < Math.abs(best.c - w.c))) best = q;
      if (best) out.push({ kind: 'side', sg, ref: best.c, val: Math.abs(best.c - w.c), s: (Math.max(best.a, a) + Math.min(best.b, b)) / 2 });
    }
    // along: from each end to the nearest crossing wall line beyond it
    for (const [end, sg] of [[a, -1], [b, 1]]) {
      let best = null;
      for (const q of L) if (q.o !== w.o && w.c >= q.a - 0.01 && w.c <= q.b + 0.01 && sg * (q.c - end) >= -0.001 && (!best || Math.abs(q.c - end) < Math.abs(best.c - end))) best = q;
      if (best && Math.abs(best.c - end) > 0.005) out.push({ kind: 'end', sg, ref: best.c, val: Math.abs(best.c - end), end });
    }
    return out;
  }
  function xwDims(d, w, k) {
    xwLabels = [];
    const blue = { stroke: '#1677ff', w: 1.6 / k }, h = 12 / k, P2 = (s, c) => (w.o === 'h' ? [s, c] : [c, s]);
    const lab = (p, t, ref) => {
      const tw = AP.textWidth(t, h, true), box = [p[0] - tw / 2 - h * 0.35, p[1] - h * 1.05, tw + h * 0.7, h * 1.45];
      d.rect(box[0], box[1], box[2], box[3], { fill: '#1677ff', stroke: 'none' });
      d.text(p[0], p[1], t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
      xwLabels.push({ box, ref });
    };
    for (const r of xwRefs(w)) {
      if (r.kind === 'side') {
        const p = P2(r.s, w.c), q = P2(r.s, r.ref);
        d.lineP(p, q, blue);
        for (const e of [p, q]) d.lineP(P2((w.o === 'h' ? e[0] : e[1]) - 5 / k, w.o === 'h' ? e[1] : e[0]), P2((w.o === 'h' ? e[0] : e[1]) + 5 / k, w.o === 'h' ? e[1] : e[0]), blue);
        const m = P2(r.s + 2 * h, (w.c + r.ref) / 2); lab(m, AP.mm(r.val), r);
      } else {
        const p = P2(r.end, w.c), q = P2(r.ref, w.c);
        d.lineP(p, q, blue);
        const m = P2((r.end + r.ref) / 2, w.c - 1.6 * h); lab(m, AP.mm(r.val), r);
      }
    }
  }
  function hitXLabel(m) { return xwLabels.find(l => m[0] >= l.box[0] && m[0] <= l.box[0] + l.box[2] && m[1] >= l.box[1] && m[1] <= l.box[1] + l.box[3]) || null; }
  async function typeXDim(l) {
    const w = movableWall(); if (!w) return;
    const r = l.ref;
    const v = await modal(r.kind === 'side' ? 'Distance to the wall beside it' : 'Distance from the end to the wall', `<div class="form">${`<label>Wall line to wall line (${uLab()})<input id="xd_v" type="number" step="${AP.unit().step}" inputmode="decimal" value="${AP.toU(r.val)}"></label>`}</div>`, 'Move wall');
    if (!v) return;
    const val = AP.fromU(num($('xd_v').value, AP.toU(r.val)));
    if (!(val >= 0)) return;
    commit();
    if (r.kind === 'side') w.c = r3(r.ref - r.sg * val);
    else { const sh = r3(r.ref - r.sg * val - r.end); w.a = r3(w.a + sh); w.b = r3(w.b + sh); }
    changed();
  }
  function dragXWall(g, m, ddx, ddy) {
    const w = movableWall(); if (!w) return;
    if (!g.committed) { commit(); g.committed = true; }
    const along = w.o === 'h' ? ddx : ddy, across = w.o === 'h' ? ddy : ddx;
    if (!g.axis) g.axis = Math.abs(across) >= Math.abs(along) ? 'across' : 'along'; // one direction at a time
    const k = views[current.key].k, tol = 12 / k;
    if (g.axis === 'across') {
      // snap to wall lines and grids
      const fl = P.floors[sel.type === 'rwall' ? Math.max(0, AP.nLevels(P) - 1) : fi], cs = [];
      if (SNAP.on && SNAP.walls) for (const q of AP.computeWalls(fl, P.settings)) if (q.o === w.o && q.id !== w.id) cs.push(q.c);
      // face to face: this wall's face on the other wall's face
      if (SNAP.on && SNAP.faces) for (const q of AP.computeWalls(fl, P.settings)) if (q.o === w.o && q.id !== w.id && q.t) for (const f of [q.c - q.t / 2, q.c + q.t / 2]) cs.push(f - w.t / 2, f + w.t / 2);
      if (SNAP.on && SNAP.grids) for (const gd of (w.o === 'h' ? AP.grids(P).y : AP.grids(P).x)) cs.push(gd.v);
      const v = g.w0.c + across; let best = null, bd = tol;
      for (const c of cs) if (Math.abs(c - v) < bd) { bd = Math.abs(c - v); best = c; }
      w.c = r3(best != null ? best : snapInc(v)); w.a = g.w0.a; w.b = g.w0.b;
    } else {
      const sh = snapInc(along); w.c = g.w0.c; w.a = r3(g.w0.a + sh); w.b = r3(g.w0.b + sh);
    }
    draw(false);
  }
  function onMovableWall(w, m) {
    const k = views[current.key].k, along = w.o === 'h' ? m[0] : m[1], across = w.o === 'h' ? m[1] : m[0];
    return along >= Math.min(w.a, w.b) - 8 / k && along <= Math.max(w.a, w.b) + 8 / k && Math.abs(across - w.c) < (w.t || 0.1) / 2 + 14 / k;
  }

  /* ---------- drawing new walls ---------- */
  let wallDraft = null;   // {o, c, a, b} while dragging
  const findX = id => (P.floors[fi].extraWalls || []).find(w => w.id === id);
  // snap a point to wall lines, grid lines and room edges, else to 50 mm
  function snapPt(m) {
    const k = views[current.key].k, tol = 12 / k, fl = P.floors[fi];
    const xs = [], ys = [];
    if (SNAP.on && SNAP.walls) {
      for (const r of fl.rooms) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.l); }
      for (const w of AP.computeWalls(fl, P.settings)) (w.o === 'v' ? xs : ys).push(w.c);
    }
    if (SNAP.on && SNAP.mid) for (const w of AP.computeWalls(fl, P.settings)) if (w.t) (w.o === 'h' ? xs : ys).push((w.a + w.b) / 2);
    // the faces (edges) of the walls, and their ends
    if (SNAP.on && SNAP.faces) for (const w of AP.computeWalls(fl, P.settings)) if (w.t) { (w.o === 'v' ? xs : ys).push(w.c - w.t / 2, w.c + w.t / 2); (w.o === 'h' ? xs : ys).push(w.a - w.ea, w.b + w.eb); }
    if (SNAP.on && SNAP.grids) { const G = AP.grids(P); for (const g of G.x) xs.push(g.v); for (const g of G.y) ys.push(g.v); }
    if (SNAP.on && SNAP.cols) for (const c of AP.columns(P).cols) { xs.push(c.x); ys.push(c.y); }
    const pick = (v, arr) => { let best = null, bd = tol; for (const a of arr) if (Math.abs(v - a) < bd) { bd = Math.abs(v - a); best = a; } return best != null ? best : snapInc(v); };
    return [r3(pick(m[0], xs)), r3(pick(m[1], ys))];
  }
  function draftFrom(p0, p1) {
    const horiz = Math.abs(p1[0] - p0[0]) >= Math.abs(p1[1] - p0[1]);
    return horiz ? { o: 'h', c: p0[1], a: p0[0], b: p1[0] } : { o: 'v', c: p0[0], a: p0[1], b: p1[1] };
  }
  function xwallPanel(pn) {
    const fl = P.floors[fi], w = findX(sel.id); if (!w) { pn.classList.remove('show'); return; }
    const len = Math.abs(w.b - w.a), nOps = fl.openings.filter(o => o.wallId === w.id).length;
    const WF = wallFields(w, false);
    pn.innerHTML = `<div class="ph"><b>Drawn wall · ${esc(AP.wallMat(w.mat).short)} · ${AP.len(w.t)} · ${AP.len(len)} long${w.h ? ' · ' + AP.mm(w.h) + ' high' : ''}</b>${editBtn()}<button class="ghost" id="pClose">&#10005;</button></div>
      <div class="form"><div class="row">${fieldHTML({ k: 'xlen', label: 'Length', type: 'len', value: len }, 'p_')}
      ${fieldHTML({ k: 'xflip', label: 'Grow from', type: 'select', value: 'start', options: [['start', w.o === 'h' ? 'left end' : 'top end'], ['end', w.o === 'h' ? 'right end' : 'bottom end']] }, 'p_')}
      ${panelOpen ? WF.map(f => fieldHTML(f, 'p_')).join('') : ''}</div></div>
      <div class="btn-row"><button id="pXDel" class="danger">Delete wall${nOps ? ' + ' + nOps + ' opening' + (nOps > 1 ? 's' : '') : ''}</button></div>`;
    $('p_xlen').onchange = e => {
      const v = AP.fromU(num(e.target.value, 0));
      if (!(v >= 0.3)) { toast('Minimum ' + AP.len(0.3)); return; }
      commit();
      if ($('p_xflip').value === 'end') w.a = r3(w.b - v); else w.b = r3(w.a + v);
      changed();
    };
    for (const f of WF) { const el = $('p_' + f.k); if (el) el.onchange = () => {
      if (f.k === 'wmat') $('p_wt').value = AP.toU(AP.wallMat(el.value).t); // the material's usual thickness
      const v = readFields(WF, 'p_'); commit(); if (!readWall(v, w, false, AP.floorH(P, fi))) { undo.pop(); return; } changed();
    }; }
    $('pEdit').onclick = () => { panelOpen = !panelOpen; renderPanel(); };
    $('pXDel').onclick = () => {
      commit();
      fl.extraWalls = fl.extraWalls.filter(q => q.id !== w.id);
      fl.openings = fl.openings.filter(o => o.wallId !== w.id);
      sel = null; changed(); toast('Wall deleted');
    };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }

  /* ---------- columns: select, delete, resize, add ---------- */
  const colEdits = () => (P.colEdits = P.colEdits || { removed: [], added: [], sizes: {} });
  function findCol(key) { return AP.columns(P).cols.find(c => AP.colKey(c.x, c.y) === key); }
  function hitColumn(m) {
    const k = views[current.key].k;
    let best = null, bd = Infinity;
    for (const c of AP.columns(P).cols) {
      if (c.top < fi) continue;
      const tol = Math.max(c.size, c.d || 0) / 2 + 10 / k, dd = Math.max(Math.abs(m[0] - c.x), Math.abs(m[1] - c.y));
      if (dd < tol && dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
  function placeColumn(m) {
    const G = AP.candidateGrids(P), k = views[current.key].k, tol = Math.max(0.4, 30 / k); // any room-edge intersection
    let x = r3(snapInc(m[0])), y = r3(snapInc(m[1])), bd = Infinity;
    if (SNAP.on && (SNAP.grids || SNAP.walls)) for (const gx of G.x) for (const gy of G.y) {
      const dd = Math.hypot(m[0] - gx.v, m[1] - gy.v);
      if (dd < tol && dd < bd) { bd = dd; x = gx.v; y = gy.v; }
    }
    const key = AP.colKey(x, y), CE = colEdits();
    if (AP.columns(P).cols.some(c => AP.colKey(c.x, c.y) === key)) { toast('There is already a column there'); return; }
    commit();
    if (CE.removed.indexOf(key) >= 0) CE.removed = CE.removed.filter(q => q !== key);
    else CE.added.push({ x, y });
    sel = { type: 'col', key }; mode = { kind: 'cols' };
    changed();
    toast('Column added');
  }
  function deleteColumn(c) {
    const key = AP.colKey(c.x, c.y), CE = colEdits();
    commit();
    if (c.manual) CE.added = CE.added.filter(a => AP.colKey(a.x, a.y) !== key);
    else if (CE.removed.indexOf(key) < 0) CE.removed.push(key);
    delete CE.sizes[key];
    sel = null;
    changed();
    toast('Column deleted – nearby columns and footings were re-sized for the longer span', 3000);
  }

  /* ---------- door / window placement with temporary dimensions ----------
   * The blue dimensions only exist while placing or dragging (like Revit's temporary dimensions). */
  let preview = null;
  // nearest wall + room side for a point (op: keep that opening's own room side)
  function locate(m, op) {
    const fl = P.floors[fi];
    if (op) {
      const si = AP.opSideInfo(fl, op); if (!si) return null;
      const r = op.wallId ? null : fl.rooms.find(q => q.id === op.roomId);
      return { r, side: op.side, si, xw: si.wall || null, along: si.o === 'h' ? m[0] : m[1] };
    }
    const walls = AP.computeWalls(fl, P.settings);
    const tol = Math.max(0.35, 28 / views[current.key].k);
    let best = null, bd = tol;
    for (const w of walls) {
      const along = w.o === 'h' ? m[0] : m[1], across = w.o === 'h' ? m[1] : m[0];
      if (along < w.a || along > w.b) continue;
      const dd = Math.abs(across - w.c);
      if (dd < bd) { bd = dd; best = { w, along, across }; }
    }
    if (!best) return null;
    const { w, along, across } = best;
    if (w.id) { // a drawn wall: the door swings to the side the finger is on
      const xw = (fl.extraWalls || []).find(q => q.id === w.id);
      return { r: null, side: null, xw, si: { o: w.o, c: w.c, s0: w.a, len: w.b - w.a, k: across < w.c ? -1 : 1, wall: xw }, along };
    }
    const onSide = (r, side) => { const si = AP.sideInfo(r, side); return si.o === w.o && AP.eq(si.c, w.c) && along > si.s0 && along < si.s0 + si.len; };
    const cand = [];
    for (const r of fl.rooms) for (const sd of 'NSEW') if (onSide(r, sd)) cand.push({ r, s: sd });
    const tapMinus = across < w.c; // finger is north / west of the wall: the door belongs to that room
    const pick = cand.find(c => (tapMinus ? (c.s === 'S' || c.s === 'E') : (c.s === 'N' || c.s === 'W')) && !AP.isOpen(c.r)) || cand.find(c => !AP.isOpen(c.r)) || cand[0];
    if (!pick) return null;
    return { r: pick.r, side: pick.s, si: AP.sideInfo(pick.r, pick.s), along };
  }
  // snapped position + clear distances for an opening of width w at point m
  // minimum clear distance from a door/window to a wall face, column or other opening
  const minClear = kind => (kind === 'door' ? (P.settings.doorClear != null ? P.settings.doorClear : 0.10) : (P.settings.winClear != null ? P.settings.winClear : 0.05));
  function computeAt(m, w, op) {
    const loc = locate(m, op); if (!loc) return null;
    const { si } = loc;
    const sp = AP.clearSpan(P, fi, si.o, si.c, loc.along, op && op.id); if (!sp) return null;
    const L = Math.max(sp.L, si.s0), R = Math.min(sp.R, si.s0 + si.len);
    const walls = AP.computeWalls(P.floors[fi], P.settings);
    const wl = AP.wallAt(walls, si.o, si.c, loc.along);
    const half = w / 2, mid = (L + R) / 2, tolC = Math.max(0.06, 18 / views[current.key].k);
    let s = loc.along, centered = false;
    if (Math.abs(s - mid) < tolC) { s = mid; centered = true; }
    else s = L + half + Math.round((s - half - L) / 0.05) * 0.05;
    const clr = minClear(op ? op.kind : mode.kind), Lc = L + clr, Rc = R - clr;
    const ok = Rc - Lc >= w - 1e-6 && !sp.inside;
    if (Rc - Lc >= w) { s = Math.min(Math.max(s, Lc + half), Rc - half); centered = Math.abs(s - mid) < 1e-6; }
    return { r: loc.r, side: loc.side, xw: loc.xw, si, o: si.o, c: si.c, k: si.k, s, w, L, R, ok, centered, clr, wallT: wl && wl.t ? wl.t : P.settings.extWall, off: r3(s - si.s0) };
  }
  function updateOverlay() {
    const g = $('ov'); if (!g) return;
    if (dimBox) positionDimBox();
    if (tab === 'sheets' && sub.shMove) { // Move mode: every drawing outlined; the one being dragged follows the finger
      const cur = getSheets()[sub.sheet], d = new AP.Drawing(), k = views[current.key].k;
      for (const b of AP.sheetBoxes[cur.no] || []) {
        const dr = gesture && gesture.type === 'shMove' && gesture.box.key === b.key && gesture.off ? gesture.off : null;
        d.rect(b.x0 - 1, b.y0 - 1, b.x1 - b.x0 + 2, b.y1 - b.y0 + 2, { stroke: '#1677ff', w: 1.5 / k, dash: [6 / k, 4 / k], fill: 'none' });
        if (dr) d.rect(b.x0 - 1 + dr[0], b.y0 - 1 + dr[1], b.x1 - b.x0 + 2, b.y1 - b.y0 + 2, { stroke: '#e53935', w: 2 / k, fill: 'rgba(229,57,53,0.08)' });
      }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (tab === 'plan' && mode && mode.kind === 'ulScale') { // the scale points
      const k = views[current.key].k, d = new AP.Drawing(), s = { stroke: '#d62828', w: 2 / k, fill: 'none' };
      for (const p of mode.pts) { d.circle(p[0], p[1], 6 / k, s); d.line(p[0] - 9 / k, p[1], p[0] + 9 / k, p[1], s); d.line(p[0], p[1] - 9 / k, p[0], p[1] + 9 / k, s); }
      if (mode.pts.length === 2) d.lineP(mode.pts[0], mode.pts[1], s);
      g.innerHTML = AP.toSVG(d); return;
    }
    if (tab === 'plan' && !preview && !mode && sel && sel.type === 'room') { g.innerHTML = AP.toSVG(roomGrips()); return; }
    if (tab === 'plan' && !preview && !mode && sel && sel.type === 'furn') { g.innerHTML = AP.toSVG(furnGrips()); return; }
    if (tab === 'plan' && roofMode()) { g.innerHTML = AP.toSVG(roofOverlay()); return; }
    if (tab === 'plan' && levelMode()) { const d = beamOverlay(); d.append(lvWallOverlay()); g.innerHTML = AP.toSVG(d); return; }
    if (tab === 'plan' && (wallDraft || (sel && sel.type === 'xwall'))) {
      const k = views[current.key].k, d = new AP.Drawing();
      const w = wallDraft || findX(sel.id);
      if (w) {
        const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b), h = (w.t || P.settings.intWall) / 2 + (wallDraft ? 0 : 4 / k);
        const pts = w.o === 'h' ? [[a, w.c - h], [b, w.c - h], [b, w.c + h], [a, w.c + h]] : [[w.c - h, a], [w.c + h, a], [w.c + h, b], [w.c - h, b]];
        d.poly(pts, true, { stroke: '#1677ff', w: 3 / k, fill: wallDraft ? 'rgba(22,119,255,0.45)' : 'rgba(22,119,255,0.15)' });
        if (!wallDraft && mode && mode.kind === 'walls') xwDims(d, w, k);
        if (wallDraft) {
          const t = AP.len(b - a) + '', th = 14 / k, mx = w.o === 'h' ? (a + b) / 2 : w.c + 12 / k, my = w.o === 'h' ? w.c - 12 / k : (a + b) / 2;
          const tw = AP.textWidth(t, th, true);
          d.rect(mx - (w.o === 'h' ? tw / 2 : 0) - th * 0.3, my - th * 1.05, tw + th * 0.6, th * 1.4, { fill: '#1677ff', stroke: 'none' });
          d.text(mx - (w.o === 'h' ? 0 : -tw / 2), my, t, th, { anchor: 'middle', bold: true, fill: '#ffffff' });
        }
      }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (tab === 'plan' && !preview && sel && sel.type === 'wall') {
      const w = findWall(sel), k = views[current.key].k, d = new AP.Drawing();
      if (w) {
        const h = Math.max(w.t / 2, 0.02) + 4 / k, a = sel.a != null ? sel.a : w.a, b = sel.b != null ? sel.b : w.b;
        const pts = w.o === 'h' ? [[a, w.c - h], [b, w.c - h], [b, w.c + h], [a, w.c + h]] : [[w.c - h, a], [w.c + h, a], [w.c + h, b], [w.c - h, b]];
        d.poly(pts, true, { stroke: '#1677ff', w: 3 / k, fill: 'rgba(22,119,255,0.15)' });
      }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (plumbView() && ((sel && sel.type === 'pl') || plDraft)) {
      const k = views[current.key].k, d = new AP.Drawing(), hs = { stroke: '#1677ff', w: 4 / k, fill: 'rgba(22,119,255,0.15)' };
      const x = sel && sel.type === 'pl' && findPl(sel.key);
      if (x && x.t === 'pipe') d.lineP(x.s.a, x.s.b, { stroke: 'rgba(22,119,255,0.45)', w: 9 / k });
      else if (x && x.t === 'tank') d.rect2(x.T.x0 - 3 / k, x.T.y0 - 3 / k, x.T.x1 + 3 / k, x.T.y1 + 3 / k, hs);
      else if (x && x.p) d.circle(x.p[0], x.p[1], 14 / k, hs);
      if (plDraft) { d.lineP(plDraft[0], plDraft[1], { stroke: '#e8590c', w: 3 / k }); for (const p of plDraft) d.circle(p[0], p[1], 5 / k, { stroke: '#e8590c', w: 2 / k, fill: '#ffffff' }); }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (elecView() && ((sel && sel.type === 'dev') || sub.hiCkt)) {
      const k = views[current.key].k, d = new AP.Drawing();
      if (sub.hiCkt) for (const v of devsHere()) if (v.ckt === sub.hiCkt) d.circle(v.x, v.y, 12 / k, { stroke: '#e8590c', w: 3 / k, fill: 'rgba(232,89,12,0.18)' });
      const v = sel && sel.type === 'dev' && findDev(sel.key);
      if (v) { d.circle(v.x, v.y, 14 / k, { stroke: '#1677ff', w: 3 / k, fill: 'rgba(22,119,255,0.15)' }); }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (tab === 'plan' && !preview && sel && sel.type === 'col') {
      const c = findCol(sel.key), k = views[current.key].k, d = new AP.Drawing();
      if (c) AP.drawColumn(d, c, { stroke: '#1677ff', w: 3 / k, fill: 'none' }, 6 / k);
      g.innerHTML = AP.toSVG(d); return;
    }
    if ((tab === 'elev' || tab === 'sect') && sel && sel.type === 'op') {
      const k = views[current.key].k, d = new AP.Drawing();
      for (const q of elevHits.filter(z => z.id === sel.id)) {
        d.rect2(q.u0 - 4 / k, -(q.zA - 4 / k), q.u1 + 4 / k, -(q.zB + 4 / k), { stroke: '#1677ff', w: 3 / k, fill: 'rgba(22,119,255,0.12)' });
        if (gesture && gesture.type === 'dragOpE' && gesture.moved) {
          const op = P.floors[gesture.fi].openings.find(z => z.id === sel.id);
          const t = op ? (gesture.axis === 'v' ? 'SILL ' + AP.len(op.sill) + (op.align ? ' · ALIGNED' : '') : AP.mm(op.w) + ' x ' + AP.mm(op.h)) : '';
          const th = 13 / k, tw = AP.textWidth(t, th, true), cx = (q.u0 + q.u1) / 2, cy = -(q.zB + 10 / k);
          d.rect(cx - tw / 2 - th * 0.4, cy - th * 1.05, tw + th * 0.8, th * 1.45, { fill: '#1677ff', stroke: 'none' });
          d.text(cx, cy, t, th, { anchor: 'middle', bold: true, fill: '#ffffff' });
        }
      }
      g.innerHTML = AP.toSVG(d); return;
    }
    if (tab === 'plan' && !preview && !mode && sel && sel.type === 'op') {
      const t = opDims(P.floors[fi].openings.find(q => q.id === sel.id));
      tdLabels = null;
      if (t) {
        const k = views[current.key].k, ts2 = 5.4 / k, d = new AP.Drawing();
        AP.drawTempDims(d, t, ts2);
        tdLabels = tempDimLabels(t, ts2);
        // a box around each number: tap it to type the size
        for (const q of Object.values(tdLabels)) d.rect(q.c[0] - q.w / 2, q.c[1] - q.h / 2, q.w, q.h, { stroke: q.col, w: 1.2 / k, fill: 'rgba(255,255,255,0.75)', layer: 'TEMP' });
        AP.drawTempDims(d, t, ts2);
        g.innerHTML = AP.toSVG(d);
        return;
      }
    }
    if (tab !== 'plan' || !preview) { g.innerHTML = ''; tdLabels = null; return; }
    const ts = 0.1, d = new AP.Drawing(), fl = P.floors[fi];
    if (preview.ghost) AP.drawOpeningPlan(d, fl, AP.computeWalls(fl, P.settings), preview.ghost, ts, null, true);
    // constant on-screen size (about 14 px text) whatever the zoom, like Revit
    AP.drawTempDims(d, preview, 5.4 / views[current.key].k);
    g.innerHTML = AP.toSVG(d);
  }
  /* ---------- structural levels (Plan tab › Levels): NGL, floor levels, beam levels, roof ---------- */
  let beamDraft = null;
  const levelMode = () => tab === 'plan' && !!mode && (mode.kind === 'levels' || mode.kind === 'addBeam' || mode.kind === 'lvWall');
  // levels where walls can be drawn: a floor level (walls of that floor) or the roof beam level (walls on the roof beams)
  const lvWallOK = Lv => Lv.id === 'GFL' || /^F\d+$/.test(Lv.id) || Lv.id === 'RB';
  function levelList() {
    const nF = AP.nLevels(P), S = P.settings, L = [];
    L.push({ id: 'NGL', name: 'NGL – natural grade (footings)', floor: 0, lv: 0, foot: true, edit: false, el: -S.plinth });
    L.push({ id: 'GFL', name: (P.floors[0].name || 'Ground floor') + ' level – tie beams', floor: 0, lv: 0, edit: true, el: 0 });
    for (let k = 1; k < nF; k++) {
      const nm = P.floors[k].name;
      L.push({ id: 'B' + k, name: nm + ' beam level (on ' + P.floors[k - 1].name.toLowerCase() + ')', floor: k - 1, lv: k, edit: true, el: AP.levelZ(P, k) });
      L.push({ id: 'F' + k, name: nm + ' level', floor: k, lv: k, edit: true, el: AP.levelZ(P, k) });
    }
    L.push({ id: 'RB', name: 'Roof beam level', floor: nF - 1, lv: nF, edit: true, el: AP.levelZ(P, nF) });
    L.push({ id: 'RL', name: 'Roof level (top of roof)', floor: nF - 1, lv: nF, roof: true, edit: false, el: (AP.roofGeom(P) || {}).zMax || AP.levelZ(P, nF) });
    return L;
  }
  const curLevel = () => { const L = levelList(); return L.find(q => q.id === sub.lvl) || L[1]; };
  // elevation of a level (Revit-like): moving a level changes the storey under it, the levels above move with it
  async function levelHeightDialog(Lv) {
    const S = P.settings, nF = AP.nLevels(P), k = Lv.id === 'RB' ? nF : /^[BF]\d+$/.test(Lv.id) ? +Lv.id.slice(1) : Lv.id === 'GFL' ? 0 : null;
    if (Lv.id === 'RL') { toast('The top of the roof follows the roof beam level and the roof slope – ⌂ Edit roofs to change the slope', 3200); return; }
    const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);
    let html;
    if (Lv.id === 'NGL') html = `<div class="form">${lenIn('lh_ngl', 'NGL below the ground floor FFL (±0.00)', S.plinth)}<p class="muted small">Natural grade line: EL. ${sgn(-S.plinth)} m. Footings, the plinth and the elevations follow it.</p></div>`;
    else {
      const z = AP.levelZ(P, k), canMove = k > 0;
      html = `<div class="form">${canMove ? lenIn('lh_z', 'Elevation of this level (from ground floor FFL ±0.00)', z) : '<p class="small"><b>Ground floor FFL – EL. ±0.00</b> (the reference level)</p>'}
        ${k < nF ? lenIn('lh_h', 'Height to the next level (floor to top of beam)', AP.floorH(P, k)) : ''}
        <p class="muted small">${canMove ? 'Moving this level changes the height of the ' + esc(P.floors[k - 1].name.toLowerCase()) + ' (now ' + AP.mm(AP.floorH(P, k - 1)) + '); the levels above move with it.' : ''} Sections, elevations, stairs, the 3D view and the level marks follow.</p></div>`;
    }
    if (!(await modal(Lv.name + ' – height', html, 'Save'))) return;
    const bad = v => !(v >= 2.2 && v <= 8);
    if (Lv.id === 'NGL') {
      const v = AP.fromU(num($('lh_ngl').value, AP.toU(S.plinth)));
      if (!(v >= 0 && v <= 2)) { toast('Use 0 – ' + AP.len(2)); return; }
      commit(); S.plinth = r3(v); changed(); return;
    }
    commit();
    if (k > 0 && $('lh_z')) {
      const z = AP.fromU(num($('lh_z').value, 0)), h = z - AP.levelZ(P, k - 1);
      if (bad(h)) { undo.pop(); toast('The ' + P.floors[k - 1].name.toLowerCase() + ' would be ' + AP.mm(h) + ' high – use ' + AP.len(2.2) + ' – ' + AP.len(8), 2800); return; }
      P.floors[k - 1].ht = r3(h);
    }
    if ($('lh_h')) {
      const h = AP.fromU(num($('lh_h').value, AP.toU(AP.floorH(P, k))));
      if (bad(h)) { undo.pop(); toast('Use ' + AP.len(2.2) + ' – ' + AP.len(8)); return; }
      if (Math.abs(h - S.floorHt) < 0.0005) delete P.floors[k].ht; else P.floors[k].ht = r3(h);
    }
    changed(); toast(Lv.name + ' – EL. ' + sgn(k ? AP.levelZ(P, k) : 0) + ' m', 2000);
  }
  function enterLevels() { mode = { kind: 'levels' }; sel = null; preview = null; refresh(true); toast('Pick a level at the top · tap a beam to change it · + Beam to add one', 2600); }
  function exitLevels() { mode = null; sel = null; beamDraft = null; refresh(true); }
  // columns first, then walls / grids
  function beamSnap(m) {
    const k = views[current.key].k, tol = 16 / k;
    let best = null, bd = tol;
    if (SNAP.on && SNAP.cols) for (const c of AP.columns(P).cols) { const dd = Math.hypot(m[0] - c.x, m[1] - c.y); if (dd < bd) { bd = dd; best = [c.x, c.y]; } }
    return best || snapPt(m);
  }
  function hitBeam(m) {
    const k = views[current.key].k; let best = null, bd = Infinity;
    for (const b of AP.beams(P, curLevel().lv)) {
      const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((m[0] - b.a[0]) * dx + (m[1] - b.a[1]) * dy) / L2));
      const dd = Math.hypot(m[0] - (b.a[0] + t * dx), m[1] - (b.a[1] + t * dy));
      if (dd <= Math.max(b.w / 2, 12 / k) && dd < bd) { bd = dd; best = b; }
    }
    return best;
  }
  const beamEd = lv => { P.beamEd = P.beamEd || {}; const E = (P.beamEd[lv] = P.beamEd[lv] || {}); E.del = E.del || []; E.size = E.size || {}; E.add = E.add || []; return E; };
  function finishBeam(g) {
    const dr = beamDraft; beamDraft = null;
    if (!dr || Math.abs(dr.b - dr.a) < 0.4) { updateOverlay(); toast('Drag further – from column to column', 1800); return; }
    commit();
    const Lv = curLevel(), id = AP.uid();
    beamEd(Lv.lv).add.push({ id, a: AP.wallPt(dr.o, dr.c, r3(Math.min(dr.a, dr.b))), b: AP.wallPt(dr.o, dr.c, r3(Math.max(dr.a, dr.b))) });
    mode = { kind: 'levels' }; sel = { type: 'beam', lv: Lv.lv, key: 'u:' + id };
    changed(); toast((Lv.lv === 0 ? 'Tie beam' : 'Beam') + ' added – ' + AP.len(Math.abs(dr.b - dr.a)) + '. Change its size below.', 2400);
    void g;
  }
  // the wall being drawn on a level, the selected wall
  function lvWallOverlay() {
    const k = views[current.key].k, d = new AP.Drawing();
    const w = wallDraft || (sel && sel.type === 'xwall' && findX(sel.id)) || (sel && sel.type === 'rwall' && AP.roofWalls(P).find(q => q.id === sel.id));
    if (!w) return d;
    const a = Math.min(w.a, w.b), b = Math.max(w.a, w.b), h = (w.t || (curLevel().id === 'RB' ? P.settings.extWall : P.settings.intWall)) / 2 + (wallDraft ? 0 : 4 / k);
    const pts = w.o === 'h' ? [[a, w.c - h], [b, w.c - h], [b, w.c + h], [a, w.c + h]] : [[w.c - h, a], [w.c + h, a], [w.c + h, b], [w.c - h, b]];
    d.poly(pts, true, { stroke: '#1677ff', w: 3 / k, fill: wallDraft ? 'rgba(22,119,255,0.45)' : 'rgba(22,119,255,0.15)' });
    if (!wallDraft && mode && mode.kind === 'levels') xwDims(d, w, k);
    if (wallDraft) {
      const t = AP.len(b - a), th = 14 / k, c = AP.wallPt(w.o, w.c, (a + b) / 2), tw = AP.textWidth(t, th, true), cy = c[1] - 14 / k;
      d.rect(c[0] - tw / 2 - th * 0.3, cy - th * 1.05, tw + th * 0.6, th * 1.4, { fill: '#1677ff', stroke: 'none' });
      d.text(c[0], cy, t, th, { anchor: 'middle', bold: true, fill: '#ffffff' });
    }
    return d;
  }
  function hitRoofWall(m) {
    const k = views[current.key].k;
    let best = null, bd = Infinity;
    for (const w of AP.roofWalls(P)) {
      const along = w.o === 'h' ? m[0] : m[1], across = w.o === 'h' ? m[1] : m[0];
      if (along < Math.min(w.a, w.b) || along > Math.max(w.a, w.b)) continue;
      const dd = Math.abs(across - w.c); if (dd < w.t / 2 + 16 / k && dd < bd) { bd = dd; best = w; }
    }
    return best;
  }
  function rwallPanel(pn) {
    const w = AP.roofWalls(P).find(q => q.id === sel.id); if (!w) { pn.classList.remove('show'); return; }
    const len = Math.abs(w.b - w.a);
    pn.innerHTML = `<div class="ph"><b>Wall on the roof beams · ${AP.len(w.t)} · ${AP.len(len)} long · ${AP.mm(w.h)} high</b><button class="ghost" id="pClose">&#10005;</button></div>
      <div class="form"><div class="row">${fieldHTML({ k: 'rwlen', label: 'Length', type: 'len', value: len }, 'p_')}${fieldHTML({ k: 'rwh', label: 'Height (above the roof beam)', type: 'len', value: w.h }, 'p_')}${fieldHTML({ k: 'rwt', label: 'Thickness', type: 'len', value: w.t }, 'p_')}</div>
      <div class="row">${fieldHTML({ k: 'rwmat', label: 'Material', type: 'select', value: w.mat || 'chb', options: AP.WALL_MATERIALS.map(m => [m.k, m.name]) }, 'p_')}${fieldHTML({ k: 'rwfa', label: 'Finish – side 1', type: 'select', value: w.finA || '', options: finOpts() }, 'p_')}${fieldHTML({ k: 'rwfb', label: 'Finish – side 2', type: 'select', value: w.finB || '', options: finOpts() }, 'p_')}</div>
      <div class="row">${fieldHTML({ k: 'rwthru', label: 'Fire wall – goes up through the roof (else it stops under the roof)', type: 'checkbox', value: w.thru === true }, 'p_')}${w.thru === true ? fieldHTML({ k: 'rwab', label: 'Above the roof', type: 'len', value: w.above != null ? w.above : 0.3 }, 'p_') : ''}</div></div>
      <div class="btn-row"><button id="pRwDel" class="danger">Delete wall</button></div>`;
    pn.querySelectorAll('input,select').forEach(el => el.onchange = () => {
      if (el.id === 'p_rwmat') $('p_rwt').value = AP.toU(AP.wallMat(el.value).t);
      const v = readFields([{ k: 'rwlen', type: 'len' }, { k: 'rwh', type: 'len' }, { k: 'rwt', type: 'len' }, { k: 'rwthru', type: 'checkbox' }, { k: 'rwab', type: 'len' }, { k: 'rwmat' }, { k: 'rwfa' }, { k: 'rwfb' }], 'p_');
      if (!(v.rwlen >= 0.3) || !(v.rwh >= 0.1 && v.rwh <= 6) || !(v.rwt >= 0.05 && v.rwt <= 0.6)) { toast('Length min. ' + AP.len(0.3) + ' · height ' + AP.len(0.1) + ' – ' + AP.len(6) + ' · thickness ' + AP.len(0.05) + ' – ' + AP.len(0.6), 2800); return; }
      commit(); const a = Math.min(w.a, w.b); w.a = a; w.b = r3(a + v.rwlen); w.h = r3(v.rwh); w.t = r3(v.rwt);
      if (v.rwthru) w.thru = true; else delete w.thru;
      w.mat = v.rwmat || 'chb'; if (v.rwfa) w.finA = v.rwfa; else delete w.finA; if (v.rwfb) w.finB = v.rwfb; else delete w.finB;
      if ($('p_rwab') && v.rwab >= 0 && v.rwab <= 3) w.above = r3(v.rwab);
      changed();
    });
    $('pRwDel').onclick = () => { commit(); P.roofWalls = AP.roofWalls(P).filter(q => q.id !== w.id); sel = null; changed(); toast('Wall deleted'); };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }
  function beamOverlay() {
    const d = new AP.Drawing(), k = views[current.key].k;
    if (beamDraft) {
      const a = AP.wallPt(beamDraft.o, beamDraft.c, beamDraft.a), b = AP.wallPt(beamDraft.o, beamDraft.c, beamDraft.b);
      d.lineP(a, b, { stroke: '#1677ff', w: 6 / k });
      const t = AP.mm(Math.abs(beamDraft.b - beamDraft.a)), h = 13 / k, tw = AP.textWidth(t, h, true), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14 / k];
      d.rect(c[0] - tw / 2 - h * 0.4, c[1] - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
      d.text(c[0], c[1], t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
    }
    return d;
  }
  function beamPanel(pn) {
    const b = levelMode() && AP.beams(P, sel.lv).find(q => q.key === sel.key);
    if (!b) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), NM = { TB: 'Tie beam', B: 'Beam', RB: 'Roof beam' };
    const fields = [{ k: 'bw', label: 'Width', type: 'len', value: b.w }, { k: 'bh', label: 'Depth', type: 'len', value: b.h }];
    pn.innerHTML = `<div class="ph"><b>${esc(b.mark)} · ${NM[b.kind]} · ${AP.mm(b.w)} x ${AP.mm(b.h)} · L = ${AP.mm(len)}</b><button class="ghost" id="pClose">&#10005;</button></div>
      <div class="form"><div class="row">${fields.map(f => fieldHTML(f, 'p_')).join('')}</div></div>
      <div class="btn-row"><button id="pBAll">Same size for all on this level</button><button id="pBDel" class="danger">Delete ${NM[b.kind].toLowerCase()}</button></div>`;
    const setSize = (q, w, h) => {
      const E = beamEd(q.lv);
      if (q.user) { const u = E.add.find(z => 'u:' + z.id === q.key); if (u) Object.assign(u, { w, h }); }
      else E.size[q.key] = { w, h };
    };
    pn.querySelectorAll('input').forEach(el => el.onchange = () => {
      const v = readFields(fields, 'p_');
      if (!(v.bw >= 0.1 && v.bw <= 1 && v.bh >= 0.15 && v.bh <= 1.5)) { toast('Width ' + AP.len(0.1) + '–' + AP.len(1) + ', depth ' + AP.len(0.15) + '–' + AP.len(1.5)); return; }
      commit(); setSize(b, r3(v.bw), r3(v.bh)); changed();
    });
    $('pBAll').onclick = () => { commit(); for (const q of AP.beams(P, sel.lv)) setSize(q, b.w, b.h); changed(); toast('All beams on this level are ' + AP.mm(b.w) + ' x ' + AP.mm(b.h), 1800); };
    $('pBDel').onclick = () => {
      commit(); const E = beamEd(b.lv);
      if (b.user) E.add = E.add.filter(z => 'u:' + z.id !== b.key); else E.del.push(b.key);
      sel = null; changed(); toast(b.mark + ' deleted', 1500);
    };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }

  /* ---------- roofs: select, reshape, move, add, delete (Plan tab › Roof) ---------- */
  let roofDraft = null; // {x0, y0, x1, y1} while drawing a new roof
  const roofMode = () => tab === 'plan' && !!mode && (mode.kind === 'roof' || mode.kind === 'addRoof' || mode.kind === 'sketchRoof' || trussMode());
  const trussMode = () => tab === 'plan' && !!mode && (mode.kind === 'trusses' || mode.kind === 'addTruss' || mode.kind === 'trussEdit');
  // a line from p towards q: squared when it is within 6° of level or plumb, else at its own angle
  function angSnap(p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], t = Math.tan(6 * Math.PI / 180);
    if (Math.abs(dy) <= Math.abs(dx) * t) return [q[0], p[1]];
    if (Math.abs(dx) <= Math.abs(dy) * t) return [p[0], q[1]];
    return q;
  }
  function dragTruss(g, m, ddx, ddy) {
    const tl = sel && AP.placedTrusses(P).find(q => q.id === sel.id); if (!tl) return;
    if (!g.committed) { commit(); g.committed = true; }
    if (g.type === 'trussEnd') { const o = g.end === 'a' ? 'b' : 'a', q = angSnap(tl[o], trussSnap(m)); if (Math.hypot(q[0] - tl[o][0], q[1] - tl[o][1]) >= 1) tl[g.end] = q.map(r3); }
    else { const sx = snapInc(ddx), sy = snapInc(ddy); tl.a = [r3(g.a0[0] + sx), r3(g.a0[1] + sy)]; tl.b = [r3(g.b0[0] + sx), r3(g.b0[1] + sy)]; }
    draw(false);
  }
  /* ---------- truss detail editor: drag a joint, add / split / delete members – the type's drawing for every truss of it ---------- */
  const tEd = { id: null, addFrom: null };
  function trussEditInfo() {
    const C = AP.trussCtx(P, tEd.id); if (!C.R) return null;
    return { C, G: AP.trussGeom(C.T, C.span, C.pitch, C.half) };
  }
  // the type's own copy of its drawing (made on the first change)
  function customOf() {
    const I = trussEditInfo(); if (!I) return null;
    if (!P.trussTypes || !P.trussTypes.length) P.trussTypes = AP.trussTypes(P).map(t => Object.assign({}, t));
    const T = P.trussTypes.find(t => t.id === tEd.id); if (!T) return null;
    if (!T.custom) T.custom = { nodes: I.G.nodes.map(p => [p[0] / I.C.span, p[1] / I.G.H]), members: I.G.members.map(q => q.slice()) };
    return { T, span: I.C.span, H: I.G.H };
  }
  function hitNode(m) {
    const I = trussEditInfo(); if (!I) return null;
    const k = views[current.key].k; let best = null, bd = 16 / k;
    I.G.nodes.forEach((p, i) => { const dd = Math.hypot(m[0] - p[0], m[1] + p[1]); if (dd < bd) { bd = dd; best = i; } });
    return best;
  }
  function hitMember(m) {
    const I = trussEditInfo(); if (!I) return null;
    const k = views[current.key].k, N = I.G.nodes; let best = null, bd = 12 / k;
    I.G.members.forEach((q, i) => {
      const a = [N[q[0]][0], -N[q[0]][1]], b = [N[q[1]][0], -N[q[1]][1]], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / L2));
      const dd = Math.hypot(m[0] - a[0] - dx * u, m[1] - a[1] - dy * u); if (dd < bd) { bd = dd; best = i; }
    });
    return best;
  }
  function dragNode(g, m) {
    if (!g.committed) { commit(); g.committed = true; }
    const c = customOf(); if (!c) return;
    const x = Math.round(m[0] / 0.01) * 0.01, z = Math.max(0, Math.round(-m[1] / 0.01) * 0.01);
    c.T.custom.nodes[g.i] = [r3(x / c.span * 1000) / 1000, r3(z / c.H * 1000) / 1000];
    draw(false);
  }
  function trussEditTap(m) {
    const i = hitNode(m);
    if (tEd.addFrom != null) {
      if (i == null) { toast('Tap a joint to finish the member', 1600); return; }
      if (i === tEd.addFrom) return;
      commit(); const c = customOf(); c.T.custom.members.push([tEd.addFrom, i, 'web']); tEd.addFrom = null; sel = null; changed(); toast('Member added', 1200); return;
    }
    if (i != null) { sel = { type: 'tnode', i }; refresh(); return; }
    const mi = hitMember(m); sel = mi != null ? { type: 'tmem', i: mi } : null; refresh();
    if (mi == null) toast('Drag a joint to move it · tap a member to split or delete it · + Member to add one', 2400);
  }
  function enterTrussEdit(id) { tEd.id = id; tEd.addFrom = null; mode = { kind: 'trussEdit' }; sel = null; refresh(true); toast('Drag a joint to move it – the change goes to every ' + AP.trussType(P, id).mark + ' truss', 2800); }
  /* ---------- trusses: place by hand (a line across the roof, wall to wall), truss types ---------- */
  let trussDraft = null; // {a, b} while dragging
  const curTrussType = () => { const T = AP.trussTypes(P); return T.find(t => t.id === sub.trType) || T[0]; };
  function trussSnap(m) {
    // columns first, then wall lines & grids
    const k = views[current.key].k;
    if (SNAP.on && SNAP.cols) for (const c of AP.columns(P).cols) if (Math.hypot(m[0] - c.x, m[1] - c.y) < 16 / k) return [c.x, c.y];
    return snapPt(m);
  }
  function finishTruss() {
    const dr = trussDraft; trussDraft = null;
    if (!dr || Math.hypot(dr.b[0] - dr.a[0], dr.b[1] - dr.a[1]) < 1.0) { updateOverlay(); toast('Drag across the roof from wall to wall (min. ' + AP.len(1) + ')', 2200); return; }
    commit();
    const T = curTrussType(), tl = { id: AP.uid(), a: dr.a.map(r3), b: dr.b.map(r3), type: T.id };
    (P.trussLines = P.trussLines || []).push(tl);
    sel = { type: 'truss', id: tl.id };
    changed();
    toast(T.mark + ' placed – ' + AP.len(Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1])) + (T.kind === 'half' ? '. The high end (post) is where you started.' : ''), 2600);
  }
  function hitTruss(m) {
    const k = views[current.key].k;
    let best = null, bd = 14 / k;
    for (const tl of AP.placedTrusses(P)) {
      const dx = tl.b[0] - tl.a[0], dy = tl.b[1] - tl.a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((m[0] - tl.a[0]) * dx + (m[1] - tl.a[1]) * dy) / L2));
      const dd = Math.hypot(m[0] - tl.a[0] - dx * u, m[1] - tl.a[1] - dy * u); if (dd < bd) { bd = dd; best = tl; }
    }
    return best;
  }
  const typeOpts = () => AP.trussTypes(P).map(t => [t.id, t.mark + ' – ' + (t.kind === 'half' ? 'half' : 'full') + ', ' + (t.style || 'pratt') + ', ' + (AP.TRUSS_MATS[t.mat] || AP.TRUSS_MATS.steel).name.toLowerCase()]);
  function trussPanel(pn) {
    const tl = AP.placedTrusses(P).find(q => q.id === sel.id); if (!tl) { pn.classList.remove('show'); return; }
    const T = AP.trussType(P, tl.type), len = Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1]);
    pn.innerHTML = `<div class="ph"><b>Truss ${esc(AP.trussMarkOf(P, tl))} (type ${esc(T.mark)}) · ${T.kind === 'half' ? 'half' : 'full'} · ${AP.len(len)} span</b><button class="ghost" id="pClose">&#10005;</button></div>
      <div class="form"><div class="row">${fieldHTML({ k: 'tltype', label: 'Truss type', type: 'select', value: T.id, options: typeOpts() }, 'p_')}${fieldHTML({ k: 'tllen', label: 'Span (length)', type: 'len', value: len }, 'p_')}</div></div>
      <div class="btn-row"><button id="pTlDet" class="primary">&#128208; View / edit detail</button>${T.kind === 'half' ? '<button id="pTlFlip">Post to the other end</button>' : ''}<button id="pTlDup">Copy next to it</button><button id="pTlDel" class="danger">Delete truss</button></div>`;
    $('pTlDet').onclick = () => enterTrussEdit(tl.type);
    $('p_tltype').onchange = e => { commit(); tl.type = e.target.value; changed(); };
    $('p_tllen').onchange = e => {
      const v = AP.fromU(num(e.target.value, 0)); if (!(v >= 1)) { toast('Minimum ' + AP.len(1)); return; }
      commit(); const u = [(tl.b[0] - tl.a[0]) / len, (tl.b[1] - tl.a[1]) / len]; tl.b = [r3(tl.a[0] + u[0] * v), r3(tl.a[1] + u[1] * v)]; changed();
    };
    if ($('pTlFlip')) $('pTlFlip').onclick = () => { commit(); const a = tl.a; tl.a = tl.b; tl.b = a; changed(); };
    $('pTlDup').onclick = () => {
      // the next one at the roof's truss spacing, square to the truss
      commit(); const R = AP.roofs(P).find(q => q.inside((tl.a[0] + tl.b[0]) / 2, (tl.a[1] + tl.b[1]) / 2)), sp = R ? AP.trussMax(R) : 1.0;
      const n = [-(tl.b[1] - tl.a[1]) / len, (tl.b[0] - tl.a[0]) / len], c = Object.assign({}, tl, { id: AP.uid(), a: [r3(tl.a[0] + n[0] * sp), r3(tl.a[1] + n[1] * sp)], b: [r3(tl.b[0] + n[0] * sp), r3(tl.b[1] + n[1] * sp)] });
      P.trussLines.push(c); sel = { type: 'truss', id: c.id }; changed();
    };
    $('pTlDel').onclick = () => { commit(); P.trussLines = P.trussLines.filter(q => q.id !== tl.id); sel = null; changed(); toast('Truss deleted'); };
    $('pClose').onclick = () => { sel = null; refresh(); };
    pn.classList.add('show');
  }
  // truss types: mark, full / half, web style, material, member sizes (the drawing & notes follow)
  async function trussTypesDialog() {
    let T = AP.trussTypes(P).map(t => Object.assign({}, t));
    const sel2 = (cls, v, opts) => `<select class="${cls}">${opts.map(o => `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    const row = (t, i) => `<div class="tt-row" data-i="${i}" style="border-top:1px solid #e3e8ef;padding:8px 0">
      <div class="row"><label>Mark<input class="tt-mark" value="${esc(t.mark)}"></label><label>Truss${sel2('tt-kind', t.kind, [['full', 'Full truss (two slopes)'], ['half', 'Half truss (one slope, post)']])}</label></div>
      <div class="row"><label>Style${sel2('tt-style', t.style || 'pratt', AP.TRUSS_STYLES)}</label><label>Material${sel2('tt-mat', t.mat || 'steel', Object.entries(AP.TRUSS_MATS).map(([k, m]) => [k, m.name]))}</label></div>
      <div class="row"><label>Chords (size)<input class="tt-chord" value="${esc(t.chord || '')}" placeholder="${esc(AP.trussMembers(t).chord)}"></label><label>Webs (size)<input class="tt-web" value="${esc(t.web || '')}" placeholder="${esc(AP.trussMembers(t).web)}"></label></div>
      <div class="row"><label>Member depth (${uLab()})<input class="tt-depth" type="number" step="${AP.unit().step}" value="${AP.toU(AP.trussMembers(t).depth)}"></label><button class="ghost tt-del" type="button">&#10005; Remove type</button></div></div>`;
    const read = () => [...$('mBody').querySelectorAll('.tt-row')].map((r, i) => Object.assign({}, T[+r.dataset.i], {
      mark: (r.querySelector('.tt-mark').value || 'T-' + (i + 1)).toUpperCase().trim(), kind: r.querySelector('.tt-kind').value, style: r.querySelector('.tt-style').value, mat: r.querySelector('.tt-mat').value,
      chord: r.querySelector('.tt-chord').value.trim().toUpperCase() || undefined, web: r.querySelector('.tt-web').value.trim().toUpperCase() || undefined,
      depth: Math.min(0.4, Math.max(0.03, AP.fromU(num(r.querySelector('.tt-depth').value, AP.toU(0.075)))))
    }));
    const paint = () => {
      $('mBody').innerHTML = `<div class="form">${T.map(row).join('')}<button id="ttAdd" type="button">+ Add truss type</button>
        <p class="muted small">Each type gets its own detail on S-2. Leave the sizes empty to use the material's usual members. Pick a type for a roof's automatic trusses in the roof panel, or place trusses by hand: Roof › ⟂ Trusses › + Truss.</p></div>`;
      $('ttAdd').onclick = () => { T = read(); let n = T.filter(t => t.kind !== 'half').length + 1; while (T.some(t => t.mark === 'T-' + n)) n++; T.push({ id: AP.uid(), mark: 'T-' + n, kind: 'full', style: 'pratt', mat: 'steel' }); paint(); };
      $('mBody').querySelectorAll('.tt-del').forEach(b => b.onclick = () => { T = read(); const i = +b.closest('.tt-row').dataset.i; if (T.length < 2) { toast('Keep at least one type'); return; } T.splice(i, 1); paint(); });
      // a new material brings its usual member depth
      $('mBody').querySelectorAll('.tt-mat').forEach(s2 => s2.onchange = () => { const r = s2.closest('.tt-row'); r.querySelector('.tt-depth').value = AP.toU(AP.TRUSS_MATS[s2.value].depth); r.querySelector('.tt-chord').placeholder = AP.TRUSS_MATS[s2.value].chord; r.querySelector('.tt-web').placeholder = AP.TRUSS_MATS[s2.value].web; });
    };
    const pr = modal('Truss types', '<div></div>', 'Save'); paint();
    if (!(await pr)) return;
    const out = read();
    if (new Set(out.map(t => t.mark)).size !== out.length) { toast('Two types have the same mark', 2200); return; }
    commit(); P.trussTypes = out;
    // trusses of a removed type take the first type
    for (const tl of P.trussLines || []) if (!out.some(t => t.id === tl.type)) tl.type = out[0].id;
    changed(); toast('Truss types saved', 1500);
  }
  // sketch a roof outline like Revit's roof by footprint: tap the corners along the walls, tap the first one to close
  let sketch = null; // {pts: [[x, y] …]} wall-line points
  function sketchTap(m) {
    const k = views[current.key].k, p = roofSnapPt(m), L = sketch.pts;
    if (L.length >= 3 && Math.hypot(m[0] - L[0][0], m[1] - L[0][1]) < 22 / k) { finishSketch(); return; }
    if (L.length) { const q = L[L.length - 1]; if (Math.abs(p[0] - q[0]) >= Math.abs(p[1] - q[1])) p[1] = q[1]; else p[0] = q[0]; } // square to the last line
    if (L.length && Math.hypot(p[0] - L[L.length - 1][0], p[1] - L[L.length - 1][1]) < 0.2) return;
    L.push(p); updateOverlay(); renderSubbar();
  }
  // roof line options (like Revit's roof by footprint): type, slope, offset (overhang), height offset
  async function sketchOptions() {
    const S = P.settings, L = P.sketchDef || {};
    const F = [
      { k: 'stype', label: 'Roof type', type: 'select', value: L.type || '', options: [['', 'Project setting – ' + ((AP.ROOF_TYPES.find(t => t[0] === S.roofType) || ['', ''])[1])], ...AP.ROOF_TYPES] },
      { k: 'spitch', label: 'Slope (rise / run)', type: 'number', value: L.pitch != null ? L.pitch : S.roofPitch },
      { k: 'soh', label: 'Offset – overhang past the line', type: 'len', value: L.oh != null ? L.oh : S.overhang },
      { k: 'szoff', label: 'Height offset (+ up / − down from top of beam)', type: 'len', value: L.zoff || 0 }
    ];
    const v = await modal('Sketch roof line', F, 'Start drawing'); if (!v) return null;
    const o = { type: v.stype || null, pitch: Math.min(1.5, Math.max(0.02, v.spitch)), oh: r2(Math.max(0, v.soh)), zoff: r3(Math.max(-1.5, Math.min(3, v.szoff || 0))) };
    P.sketchDef = o; AP.store.save(P);
    return o;
  }
  function finishSketch() {
    const L = sketch.pts.slice();
    if (L.length < 3) { toast('Tap at least 3 corners', 1800); return; }
    const f = L[0], l = L[L.length - 1];
    if (Math.abs(f[0] - l[0]) > 1e-6 && Math.abs(f[1] - l[1]) > 1e-6) L.push([f[0], l[1]]); // square corner back to the start
    // drop points in the middle of straight lines
    const pts = L.filter((p, i) => { const a = L[(i + L.length - 1) % L.length], b = L[(i + 1) % L.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9; });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    if (pts.length < 4 || Math.max(...xs) - Math.min(...xs) < 0.5 || Math.max(...ys) - Math.min(...ys) < 0.5) { toast('The outline is too small – min. 500 mm each way', 2200); return; }
    commit();
    const top = AP.topFloorIndex(P), o = sketch.opt || {}, sp = { id: AP.uid(), level: fi, fit: false, poly: pts.map(p => [r2(p[0]), r2(p[1])]), type: o.type || (fi < top ? 'shed' : null) };
    if (o.pitch != null) sp.pitch = o.pitch; if (o.oh != null) sp.oh = o.oh; if (o.zoff) sp.zoff = o.zoff;
    ensureRoofs().push(sp);
    sketch = null; mode = { kind: 'roof' }; sel = { type: 'roof', id: sp.id };
    changed();
    toast('Roof sketched – it follows your outline. Drag a blue handle to move one edge.', 3000);
  }
  // handles on the sides of a sketched / L-shaped roof: one per edge, on the eave
  function polyGrips(R, sp) {
    const ext = P.settings.extWall / 2 + R.oh, poly = sp.poly;
    let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = s > 0 ? [t[1], -t[0]] : [-t[1], t[0]];
      return { key: 'e' + i, i, n, p: [(a[0] + b[0]) / 2 + n[0] * ext, (a[1] + b[1]) / 2 + n[1] * ext], o: Math.abs(n[0]) > 0.5 ? 'x' : 'y' };
    });
  }
  // the first change turns the automatic roof into an editable list
  function ensureRoofs() { if (!Array.isArray(P.roofs)) P.roofs = AP.roofSpecs(P).map(s => Object.assign({}, s)); return P.roofs; }
  const roofSpec = id => AP.roofSpecs(P).find(s => s.id === id);
  const roofR = id => AP.roofs(P).find(R => R.id === id);
  // an outline that is reshaped no longer follows the walls
  function freezeRoof(id) {
    const sp = ensureRoofs().find(s => s.id === id); if (!sp) return null;
    if (sp.poly) return sp;
    if (sp.fit || sp.x0 == null) {
      const R = AP.roofs(P).find(q => q.id === id);
      if (R && R.wpoly) { Object.assign(sp, { fit: false, poly: R.wpoly.map(p => [r3(p[0]), r3(p[1])]) }); return sp; }
      const b = AP.roofBox(P, sp); Object.assign(sp, { fit: false, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
    }
    return sp;
  }
  const roofOH = sp => (AP.isBoxRoof(AP.roofType(P, sp)) ? 0 : sp.oh != null ? sp.oh : P.settings.overhang);
  function hitRoof(m) {
    let best = null;
    for (const R of AP.roofs(P)) {
      if (m[0] < R.X0 || m[0] > R.X1 || m[1] < R.Y0 || m[1] > R.Y1 || !R.inside(m[0], m[1])) continue;
      const score = (R.level === fi ? 0 : 1e6) + (R.X1 - R.X0) * (R.Y1 - R.Y0);
      if (!best || score < best.score) best = { R, score };
    }
    return best ? best.R : null;
  }
  const GRIPS = ['N', 'S', 'W', 'E', 'NW', 'NE', 'SW', 'SE'];
  const roofGripPts = R => ({ N: [(R.X0 + R.X1) / 2, R.Y0], S: [(R.X0 + R.X1) / 2, R.Y1], W: [R.X0, (R.Y0 + R.Y1) / 2], E: [R.X1, (R.Y0 + R.Y1) / 2],
    NW: [R.X0, R.Y0], NE: [R.X1, R.Y0], SW: [R.X0, R.Y1], SE: [R.X1, R.Y1] });
  // the roof editor: its own page with the plan faded under the roofs
  let inRoofs = false;
  function enterRoofs() {
    mode = { kind: 'roof' }; preview = null; inRoofs = true;
    const L = AP.roofs(P), R = L.find(q => q.level === fi) || L[0];
    if (R && R.level !== fi) fi = R.level;
    sel = R ? { type: 'roof', id: R.id } : null;
    refresh(true);
    toast(R ? 'Drag a blue handle to stretch the roof, or drag the roof to move it' : 'No roof yet – tap + Add roof', 2600);
  }
  function exitRoofs() { mode = null; sel = null; roofDraft = null; sketch = null; trussDraft = null; inRoofs = false; refresh(true); }
  function fadePlan(src) {
    const d = new AP.Drawing();
    for (const it of src.items) {
      if (it.s && it.s.layer === 'DIMS') continue; // the roof page shows the roof's own dimensions instead
      const s = Object.assign({}, it.s);
      if (s.stroke !== 'none') s.stroke = '#b9c0c8';
      if (s.fill && s.fill !== 'none') s.fill = s.fill === '#ffffff' ? '#ffffff' : '#eef1f4';
      d.add(it.t === 'text' ? Object.assign({}, it, { fill: '#a7b0ba', s }) : Object.assign({}, it, { s }));
    }
    return d;
  }
  function hitRoofGrip(m) {
    if (!sel || sel.type !== 'roof') return null;
    const R = roofR(sel.id); if (!R) return null;
    const k = views[current.key].k;
    let best = null, bd = 24 / k;
    if (R.poly) {
      const sp = roofSpec(R.id), G = sp && sp.poly ? polyGrips(R, sp) : null;
      // an L-shaped roof that follows the walls: its handles appear once you drag one (it then keeps that outline)
      if (!G) { const W = R.wpoly ? polyGrips(R, { poly: R.wpoly }) : []; for (const g of W) { const dd = Math.hypot(m[0] - g.p[0], m[1] - g.p[1]); if (dd < bd) { bd = dd; best = g.key; } } return best; }
      for (const g of G) { const dd = Math.hypot(m[0] - g.p[0], m[1] - g.p[1]); if (dd < bd) { bd = dd; best = g.key; } }
      return best;
    }
    const gp = roofGripPts(R);
    for (const sd of GRIPS) { const dd = Math.hypot(m[0] - gp[sd][0], m[1] - gp[sd][1]); if (dd < bd) { bd = dd; best = sd; } }
    return best;
  }
  // wall lines a roof edge can snap to: room edges on its floor and the floor above
  function roofSnap(v, ax, level, tol) {
    let best = null, bd = tol;
    const near = e => { if (Math.abs(v - e) < bd) { bd = Math.abs(v - e); best = e; } };
    if (SNAP.on && SNAP.walls) for (const f of [P.floors[level], P.floors[level + 1]]) if (f) for (const r of f.rooms) for (const e of ax === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.l]) near(e);
    if (SNAP.on && SNAP.grids) for (const g of ax === 'x' ? AP.grids(P).x : AP.grids(P).y) near(g.v);
    return best != null ? r2(best) : r2(snapInc(v));
  }
  const roofSnapPt = m => [roofSnap(m[0], 'x', fi, 14 / views[current.key].k), roofSnap(m[1], 'y', fi, 14 / views[current.key].k)];
  function dragRoof(g, m, ddx, ddy) {
    if (!g.committed) { commit(); g.committed = true; const sp = freezeRoof(g.id); g.b0 = { x0: sp.x0, y0: sp.y0, x1: sp.x1, y1: sp.y1 }; g.poly0 = sp.poly ? sp.poly.map(p => p.slice()) : null; }
    const sp = P.roofs.find(s => s.id === g.id); if (!sp) return;
    const tol = 14 / views[current.key].k, ext = P.settings.extWall / 2 + roofOH(sp), b = g.b0, lv = sp.level || 0;
    if (g.poly0) {
      if (g.type === 'roofEdge') {
        // move one edge square to itself, both its corners follow
        const R = roofR(g.id), gr = polyGrips(R || { oh: roofOH(sp) }, { poly: g.poly0 }).find(q => q.key === g.side); if (!gr) return;
        const i = gr.i, j = (i + 1) % g.poly0.length, ax = gr.o === 'x' ? 0 : 1, v = roofSnap(m[ax] - gr.n[ax] * ext, gr.o, lv, tol);
        sp.poly = g.poly0.map(p => p.slice()); sp.poly[i][ax] = v; sp.poly[j][ax] = v;
      } else {
        const dx = r2(snap(ddx, 0.05)), dy = r2(snap(ddy, 0.05));
        sp.poly = g.poly0.map(p => [r2(p[0] + dx), r2(p[1] + dy)]);
      }
      draw(false); return;
    }
    if (g.type === 'roofEdge') {
      // the handle sits on the eave: the wall line is one overhang (+ half a wall) inside it
      const min = 0.5;
      if (g.side.includes('N')) sp.y0 = Math.min(roofSnap(m[1] + ext, 'y', lv, tol), b.y1 - min);
      if (g.side.includes('S')) sp.y1 = Math.max(roofSnap(m[1] - ext, 'y', lv, tol), b.y0 + min);
      if (g.side.includes('W')) sp.x0 = Math.min(roofSnap(m[0] + ext, 'x', lv, tol), b.x1 - min);
      if (g.side.includes('E')) sp.x1 = Math.max(roofSnap(m[0] - ext, 'x', lv, tol), b.x0 + min);
    } else {
      // move: snap whichever side comes close to a wall line
      const mv = (a0, a1, d, ax) => {
        const s0 = roofSnap(a0 + d, ax, lv, tol), s1 = roofSnap(a1 + d, ax, lv, tol);
        const e0 = Math.abs(s0 - (a0 + d)), e1 = Math.abs(s1 - (a1 + d));
        return r2(e0 <= e1 ? s0 - a0 : s1 - a1);
      };
      const dx = mv(b.x0, b.x1, ddx, 'x'), dy = mv(b.y0, b.y1, ddy, 'y');
      Object.assign(sp, { x0: r2(b.x0 + dx), x1: r2(b.x1 + dx), y0: r2(b.y0 + dy), y1: r2(b.y1 + dy) });
    }
    draw(false);
  }
  function finishRoofDraw(g, m) {
    let box = null;
    if (!g.moved) { const r = hitRoom(m); if (r) box = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.l }; }
    else if (roofDraft) box = roofDraft;
    roofDraft = null;
    if (!box || box.x1 - box.x0 < 0.5 || box.y1 - box.y0 < 0.5) { updateOverlay(); toast(g.moved ? 'Drag a bigger rectangle (min. 500 mm)' : 'Tap a room, or drag a rectangle', 2000); return; }
    commit();
    const top = AP.topFloorIndex(P);
    const sp = { id: AP.uid(), level: fi, fit: false, x0: r2(box.x0), y0: r2(box.y0), x1: r2(box.x1), y1: r2(box.y1), type: fi < top ? 'shed' : null };
    ensureRoofs().push(sp);
    mode = { kind: 'roof' }; sel = { type: 'roof', id: sp.id };
    changed();
    toast('Roof added on the ' + P.floors[fi].name.toLowerCase() + (sp.type ? ' – a shed roof; change its type below' : '') + '. Drag the handles to reshape it', 3000);
  }
  async function roofsAuto() {
    if (!Array.isArray(P.roofs)) { toast('The roof is already automatic – it follows the top floor', 2200); return; }
    if (!(await confirmBox('Automatic roof', 'Remove your roofs and go back to one roof over the top floor that follows the walls?', 'Use automatic'))) return;
    commit(); delete P.roofs; sel = null; changed();
  }
  function roofOverlay() {
    const d = new AP.Drawing(), k = views[current.key].k;
    if (roofDraft) {
      d.rect2(roofDraft.x0, roofDraft.y0, roofDraft.x1, roofDraft.y1, { stroke: '#1677ff', w: 3 / k, fill: 'rgba(22,119,255,0.2)' });
      const t = AP.mm(roofDraft.x1 - roofDraft.x0) + ' x ' + AP.mm(roofDraft.y1 - roofDraft.y0), h = 13 / k, tw = AP.textWidth(t, h, true), cx = (roofDraft.x0 + roofDraft.x1) / 2, cy = roofDraft.y0 - h;
      d.rect(cx - tw / 2 - h * 0.4, cy - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
      d.text(cx, cy, t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
      return d;
    }
    if (mode && mode.kind === 'trussEdit') {
      const I = trussEditInfo(); if (!I) return d;
      const N = I.G.nodes;
      if (sel && sel.type === 'tmem') { const q = I.G.members[sel.i]; if (q) d.line(N[q[0]][0], -N[q[0]][1], N[q[1]][0], -N[q[1]][1], { stroke: '#1677ff', w: 6 / k }); }
      N.forEach((p, i) => { const on = (sel && sel.type === 'tnode' && sel.i === i) || tEd.addFrom === i; d.circle(p[0], -p[1], (on ? 9 : 7) / k, { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k }); });
      return d;
    }
    if (trussMode()) {
      const tl = trussDraft || (sel && sel.type === 'truss' && AP.placedTrusses(P).find(q => q.id === sel.id));
      if (tl) {
        d.lineP(tl.a, tl.b, { stroke: '#1677ff', w: 5 / k });
        d.circle(tl.a[0], tl.a[1], 6 / k, { fill: '#1677ff', stroke: 'none' });
        if (!trussDraft) for (const e2 of ['a', 'b']) d.circle(tl[e2][0], tl[e2][1], 10 / k, { fill: 'rgba(255,255,255,0.6)', stroke: '#1677ff', w: 2.5 / k }); // drag to stretch
        const t = AP.len(Math.hypot(tl.b[0] - tl.a[0], tl.b[1] - tl.a[1])), h = 13 / k, tw = AP.textWidth(t, h, true), c = [(tl.a[0] + tl.b[0]) / 2 + 12 / k, (tl.a[1] + tl.b[1]) / 2 - 12 / k];
        d.rect(c[0] - tw / 2 - h * 0.4, c[1] - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
        d.text(c[0], c[1], t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
      }
      return d;
    }
    if (mode && mode.kind === 'sketchRoof' && sketch) {
      const L = sketch.pts, blue = { stroke: '#1677ff', w: 3 / k };
      if (L.length > 1) d.poly(L, false, blue);
      if (L.length > 2) d.lineP(L[L.length - 1], L[0], { stroke: '#1677ff', w: 2 / k, dash: [8 / k, 5 / k] });
      L.forEach((p, i) => d.circle(p[0], p[1], (i ? 6 : 11) / k, { fill: i ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k }));
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i], b = L[i + 1], t = AP.mm(Math.hypot(b[0] - a[0], b[1] - a[1])), h = 12 / k, tw = AP.textWidth(t, h, true), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 10 / k];
        d.rect(c[0] - tw / 2 - h * 0.3, c[1] - h * 1.05, tw + h * 0.6, h * 1.4, { fill: '#1677ff', stroke: 'none' });
        d.text(c[0], c[1], t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
      }
      return d;
    }
    const R = sel && sel.type === 'roof' && roofR(sel.id); if (!R) return d;
    const rad = 9 / k;
    if (R.poly) {
      const sp = roofSpec(R.id), G = polyGrips(R, sp && sp.poly ? sp : { poly: R.wpoly });
      for (const g of G) {
        const on = gesture && gesture.type === 'roofEdge' && gesture.side === g.key, [x, y] = g.p;
        d.circle(x, y, rad * (on ? 1.3 : 1), { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k });
        const a = g.o === 'y' ? [[x - rad * 0.5, y - rad * 0.2], [x, y - rad * 0.65], [x + rad * 0.5, y - rad * 0.2]] : [[x - rad * 0.2, y - rad * 0.5], [x - rad * 0.65, y], [x - rad * 0.2, y + rad * 0.5]];
        const b = a.map(p => (g.o === 'y' ? [p[0], 2 * y - p[1]] : [2 * x - p[0], p[1]]));
        d.poly(a, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k }); d.poly(b, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k });
      }
      return d;
    }
    const gp = roofGripPts(R);
    // (the roof's dimension strings are drawn with the roofs, see AP.drawRoofEdit)
    for (const sd of ['NW', 'NE', 'SW', 'SE']) {
      const [x, y] = gp[sd], on = gesture && gesture.type === 'roofEdge' && gesture.side === sd, s = rad * (on ? 1.2 : 0.9);
      d.rect(x - s, y - s, 2 * s, 2 * s, { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k });
      d.line(x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5, { stroke: on ? '#ffffff' : '#1677ff', w: 1.6 / k });
      d.line(x - s * 0.5, y + s * 0.5, x + s * 0.5, y - s * 0.5, { stroke: on ? '#ffffff' : '#1677ff', w: 1.6 / k });
    }
    for (const sd of 'NSEW') {
      const [x, y] = gp[sd], on = gesture && gesture.type === 'roofEdge' && gesture.side === sd;
      d.circle(x, y, rad * (on ? 1.3 : 1), { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k });
      const a = sd === 'N' || sd === 'S' ? [[x - rad * 0.5, y - rad * 0.2], [x, y - rad * 0.65], [x + rad * 0.5, y - rad * 0.2]] : [[x - rad * 0.2, y - rad * 0.5], [x - rad * 0.65, y], [x - rad * 0.2, y + rad * 0.5]];
      const b = a.map(p => (sd === 'N' || sd === 'S' ? [p[0], 2 * y - p[1]] : [2 * x - p[0], p[1]]));
      d.poly(a, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k }); d.poly(b, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k });
    }
    // size between the wall lines, and the eave size
    const t = AP.mm(R.b.x1 - R.b.x0) + ' x ' + AP.mm(R.b.y1 - R.b.y0) + (R.oh > 0 ? '  ·  EAVES ' + AP.mm(R.X1 - R.X0) + ' x ' + AP.mm(R.Y1 - R.Y0) : '');
    const h = 13 / k, tw = AP.textWidth(t, h, true), cx = (R.X0 + R.X1) / 2, cy = R.Y1 + 2.4 * h;
    d.rect(cx - tw / 2 - h * 0.4, cy - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
    d.text(cx, cy, t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
    return d;
  }
  function roofPanel(pn) {
    const R = roofR(sel.id), sp = roofSpec(sel.id);
    if (!R || !sp || !roofMode()) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    const S = P.settings, n = AP.roofSpecs(P).findIndex(q => q.id === sp.id) + 1;
    const dflt = (AP.ROOF_TYPES.find(t => t[0] === S.roofType) || ['', ''])[1];
    const mono = R.type === 'shed' || R.type === 'doubleshed' || R.type === 'clerestory';
    const fields = [
      { k: 'rtype', label: 'Roof type', type: 'select', value: sp.type || '', options: [['', 'Project setting – ' + dflt], ...AP.ROOF_TYPES] },
      { k: 'rlevel', label: 'Sits on', type: 'select', value: String(R.level), options: P.floors.map((f, i) => [String(i), f.name + ' walls']) },
      { k: 'rpitch', label: 'Slope (rise / run)', type: 'number', value: sp.pitch != null ? sp.pitch : S.roofPitch },
      { k: 'roh', label: 'Overhang (offset from the wall line)', type: 'len', value: sp.oh != null ? sp.oh : S.overhang },
      { k: 'rzoff', label: 'Height offset (+ up / − down from top of beam)', type: 'len', value: sp.zoff || 0 },
      ...(R.box && R.type === 'flat' ? [] : [{ k: 'rtruss', label: 'Truss type (automatic trusses)', type: 'select', value: sp.trussType || '', options: [['', 'Automatic – ' + R.tt.mark + (R.tt.kind === 'half' ? ' half truss' : ' full truss')], ...typeOpts()] },
        { k: 'rauto', label: 'Automatic trusses (off: only the ones you place)', type: 'checkbox', value: sp.autoTruss !== false },
        { k: 'rtsp', label: 'Max. truss spacing', type: 'len', value: AP.trussMax(R) }]),
      { k: 'rridge', label: 'Ridge runs', type: 'select', value: sp.ridge || 'auto', options: [['auto', 'Along the long side'], ['x', 'Left – right'], ['y', 'Front – back']] },
      ...(R.poly ? [] : [{ k: 'rw', label: 'Width (wall to wall)', type: 'len', value: R.b.x1 - R.b.x0 },
        { k: 'rl', label: 'Length (wall to wall)', type: 'len', value: R.b.y1 - R.b.y0 }])
    ];
    pn.innerHTML = `<div class="ph"><b>Roof ${n} · ${esc((AP.ROOF_NAME[R.type] || 'ROOF').toLowerCase())} · on ${esc(P.floors[R.level].name.toLowerCase())}</b>${editBtn()}<button class="ghost" id="pClose">&#10005;</button></div>
      ${panelOpen ? `<div class="form"><div class="row two">${fieldHTML(fields[0], 'p_')}${fieldHTML(fields[1], 'p_')}</div><div class="row">${fields.slice(2).map(f => fieldHTML(f, 'p_')).join('')}</div></div>` : ''}
      <div class="btn-row">${mono ? '<button id="pRFlip">Flip slope</button>' : ''}<button id="pRRidge">Turn ridge</button>${R.box ? '' : `<button id="pRGut"${R.gutter ? ' class="on"' : ''}>${R.gutter ? '&#10003; Gutters' : 'No gutters'}</button>`}<button id="pRFit"${(sp.fit || sp.x0 == null) && !sp.poly ? ' class="on"' : ''}>Fit to walls</button><button id="pRDup">Duplicate</button><button id="pRDel" class="danger">Delete roof</button></div>`;
    const upd = fn => { commit(); ensureRoofs(); const s = P.roofs.find(q => q.id === sp.id); if (s) fn(s); changed(); };
    pn.querySelectorAll('input,select').forEach(el => el.onchange = e => {
      const v = readFields(fields, 'p_'), id = e.target.id;
      if (id === 'p_rw' || id === 'p_rl') {
        if (!((id === 'p_rw' ? v.rw : v.rl) >= 0.5)) { toast('Minimum ' + AP.len(0.5)); return; }
        commit(); const s = freezeRoof(sp.id);
        if (id === 'p_rw') s.x1 = r2(s.x0 + v.rw); else s.y1 = r2(s.y0 + v.rl);
        changed(); return;
      }
      upd(s => {
        if (id === 'p_rtype') s.type = v.rtype || null;
        if (id === 'p_rlevel') s.level = +v.rlevel;
        if (id === 'p_rpitch') s.pitch = Math.min(1.5, Math.max(0.02, v.rpitch));
        if (id === 'p_roh') s.oh = r2(Math.max(0, v.roh));
        if (id === 'p_rzoff') { const z = AP.fromU(num($('p_rzoff').value, 0)); if (Math.abs(z) < 0.0005) delete s.zoff; else s.zoff = r3(Math.max(-1.5, Math.min(3, z))); }
        if (id === 'p_rridge') s.ridge = v.rridge === 'auto' ? null : v.rridge;
        if (id === 'p_rtruss') { if (v.rtruss) s.trussType = v.rtruss; else delete s.trussType; delete s.truss; }
        if (id === 'p_rauto') { if (v.rauto) delete s.autoTruss; else s.autoTruss = false; }
        if (id === 'p_rtsp') { if (v.rtsp >= 0.4 && v.rtsp <= 2.5) s.trussSp = r3(v.rtsp); else toast('Use ' + AP.len(0.4) + ' – ' + AP.len(2.5)); }
      });
    });
    if (mono) $('pRFlip').onclick = () => upd(s => { s.flip = !s.flip; });
    $('pRRidge').onclick = () => upd(s => { s.ridge = R.ridgeX ? 'y' : 'x'; });
    if ($('pRGut')) $('pRGut').onclick = () => { upd(s => { s.gutter = !R.gutter; }); toast(R.gutter ? 'No gutters on this roof' : 'Gutters on the eaves of this roof', 1600); };
    $('pRFit').onclick = () => upd(s => { s.fit = true; delete s.x0; delete s.y0; delete s.x1; delete s.y1; delete s.poly; });
    $('pRDup').onclick = () => {
      commit(); const s = freezeRoof(sp.id);
      let c;
      if (s.poly) { const xs = s.poly.map(p => p[0]), w = Math.max(...xs) - Math.min(...xs); c = Object.assign({}, s, { id: AP.uid(), poly: s.poly.map(p => [r2(p[0] + w), p[1]]) }); }
      else { const w = s.x1 - s.x0; c = Object.assign({}, s, { id: AP.uid(), x0: r2(s.x0 + w), x1: r2(s.x1 + w) }); }
      P.roofs.push(c); sel = { type: 'roof', id: c.id }; changed();
    };
    $('pRDel').onclick = () => {
      commit(); ensureRoofs(); P.roofs = P.roofs.filter(q => q.id !== sp.id); sel = null; changed();
      toast(P.roofs.length ? 'Roof deleted' : 'No roof left – + Add roof, or Automatic for the roof over the top floor', 3000);
    };
    $('pClose').onclick = () => { sel = null; refresh(); };
    $('pEdit').onclick = () => { panelOpen = !panelOpen; renderPanel(); };
    pn.classList.add('show');
  }

  /* ---------- temporary dimensions of a selected door / window, tap a number to type it ---------- */
  let tdLabels = null; // {L, R, W}: label boxes in model coordinates
  function opDims(op) {
    if (!op) return null;
    const fl = P.floors[fi], Ro = AP.resolveOp(fl, op), si = AP.opSideInfo(fl, op);
    if (!Ro || !si) return null;
    const sp = AP.clearSpan(P, fi, Ro.o, Ro.c, Ro.s, op.id); if (!sp) return null;
    const L = Math.max(sp.L, si.s0), R = Math.min(sp.R, si.s0 + si.len);
    const wl = AP.wallAt(AP.computeWalls(fl, P.settings), si.o, si.c, Ro.s);
    return { o: si.o, c: si.c, k: si.k, s: Ro.s, w: Ro.w, L, R, ok: true, centered: Math.abs(Ro.s - (L + R) / 2) < 0.001, wallT: wl && wl.t ? wl.t : P.settings.extWall, s0: si.s0, op };
  }
  // where drawTempDims puts its numbers (same offsets)
  function tempDimLabels(t, ts) {
    const P2 = (sv, nn) => (t.o === 'h' ? [sv, t.c + nn] : [t.c + nn, sv]);
    const n = t.k * (t.wallT / 2 + 6 * ts), n2 = n + t.k * 6 * ts, a = t.s - t.w / 2, b = t.s + t.w / 2;
    const lab = (sv, nn, txt, h) => {
      const p = P2(sv, nn), w = AP.textWidth(txt, h, true) + h * 0.8, hh = h * 1.35;
      const c = t.o === 'h' ? [p[0], p[1] - h * 0.35] : [p[0] - h * 0.35, p[1]];
      return { c, w: t.o === 'h' ? w : hh, h: t.o === 'h' ? hh : w, col: '#1677ff' };
    };
    const out = {};
    const nl = n + t.k * (t.k > 0 ? 3.6 : 1.2) * ts;
    if (a - t.L > 0.005) out.L = lab((t.L + a) / 2, nl, AP.mm(a - t.L), 2.6 * ts);
    if (t.R - b > 0.005) out.R = lab((b + t.R) / 2, nl, AP.mm(t.R - b), 2.6 * ts);
    out.W = lab(t.s, n2 + t.k * (t.k > 0 ? 3.4 : 1.0) * ts, t.centered ? 'EQ  ·  CENTERED' : 'W ' + AP.mm(t.w), 2.2 * ts);
    out.W.col = '#5b6672';
    return out;
  }
  function hitTempDim(m) {
    if (!tdLabels || !sel || sel.type !== 'op') return null;
    const pad = 8 / views[current.key].k;
    for (const [key, q] of Object.entries(tdLabels)) if (Math.abs(m[0] - q.c[0]) <= q.w / 2 + pad && Math.abs(m[1] - q.c[1]) <= q.h / 2 + pad) return key;
    return null;
  }
  function showOpDim(which) {
    const op = P.floors[fi].openings.find(q => q.id === sel.id); if (!op) return;
    const t = opDims(op); if (!t) return;
    if (op.locked) { toast('🔒 Locked – unlock it to change it', 1800); return; }
    dimBox = { op: op.id, which };
    const hz = t.o === 'h';
    $('dbLabel').textContent = which === 'W' ? 'Width' : which === 'L' ? (hz ? 'From left' : 'From top') : (hz ? 'From right' : 'From bottom');
    $('dbInput').value = AP.toU(which === 'W' ? t.w : which === 'L' ? t.s - t.w / 2 - t.L : t.R - t.s - t.w / 2);
    dimEl.querySelector('.u').textContent = AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf();
    $('dbInput').step = AP.unit().step;
    dimEl.hidden = false;
    positionDimBox();
    setTimeout(() => { $('dbInput').focus(); $('dbInput').select(); }, 30);
  }
  function applyOpDim() {
    const fl = P.floors[fi], op = fl.openings.find(q => q.id === dimBox.op); if (!op) { hideDimBox(); return; }
    const t = opDims(op), v = AP.fromU(num($('dbInput').value, 0)), clr = minClear(op.kind);
    let s = t.s, w = t.w;
    if (dimBox.which === 'W') w = v; else if (dimBox.which === 'L') s = t.L + v + w / 2; else s = t.R - v - w / 2;
    if (dimBox.which === 'W' && !(w >= 0.3)) { toast('Minimum width ' + AP.len(0.3)); return; }
    if (dimBox.which !== 'W' && v < clr - 1e-6) { toast('Minimum ' + AP.len(clr) + ' from the wall / column', 2200); return; }
    if (s - w / 2 < t.L + clr - 1e-6 || s + w / 2 > t.R - clr + 1e-6) { toast('It does not fit: ' + AP.len(t.R - t.L) + ' clear, needs ' + AP.len(w + 2 * clr) + ' with ' + AP.len(clr) + ' each side', 3000); return; }
    hideDimBox(); $('dbInput').blur();
    if (Math.abs(s - t.s) < 0.0005 && Math.abs(w - t.w) < 0.0005) return;
    commit();
    op.w = r3(w); op.off = r3(op.off + (s - t.s));
    changed();
  }

  /* ---------- resizing rooms by dragging a wall handle ---------- */
  const EDGE = {
    N: { get: r => r.y, set: (r, e) => { r.l = r2(r.y + r.l - e); r.y = r2(e); }, opp: 'S', ax: 'y' },
    S: { get: r => r.y + r.l, set: (r, e) => { r.l = r2(e - r.y); }, opp: 'N', ax: 'y' },
    W: { get: r => r.x, set: (r, e) => { r.w = r2(r.x + r.w - e); r.x = r2(e); }, opp: 'E', ax: 'x' },
    E: { get: r => r.x + r.w, set: (r, e) => { r.w = r2(e - r.x); }, opp: 'W', ax: 'x' }
  };
  function gripPts(r) {
    return { N: [r.x + r.w / 2, r.y], S: [r.x + r.w / 2, r.y + r.l], W: [r.x, r.y + r.l / 2], E: [r.x + r.w, r.y + r.l / 2] };
  }
  function roomGrips() {
    const d = new AP.Drawing(), fl = P.floors[fi], r = fl.rooms.find(q => q.id === sel.id);
    if (!r || r.locked || inRoom) return d; // locked rooms have no resize handles
    const k = views[current.key].k, rad = 9 / k;
    const gp = gripPts(r);
    for (const sd of 'NSEW') {
      const [x, y] = gp[sd], on = gesture && gesture.type === 'edge' && gesture.side === sd;
      d.circle(x, y, rad * (on ? 1.3 : 1), { fill: on ? '#1677ff' : '#ffffff', stroke: '#1677ff', w: 2.5 / k, layer: 'TEMP' });
      const a = sd === 'N' || sd === 'S' ? [[x - rad * 0.5, y - rad * 0.2], [x, y - rad * 0.65], [x + rad * 0.5, y - rad * 0.2]] : [[x - rad * 0.2, y - rad * 0.5], [x - rad * 0.65, y], [x - rad * 0.2, y + rad * 0.5]];
      const b = a.map(p => (sd === 'N' || sd === 'S' ? [p[0], 2 * y - p[1]] : [2 * x - p[0], p[1]]));
      d.poly(a, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k }); d.poly(b, false, { stroke: on ? '#ffffff' : '#1677ff', w: 1.8 / k });
    }
    if (gesture && gesture.type === 'edge') {
      // live size + area of every room being resized
      for (const q of [r, ...gesture.nb.map(n => fl.rooms.find(z => z.id === n.id))]) {
        if (!q) continue;
        const t = AP.mm(q.w) + ' x ' + AP.mm(q.l) + '  =  ' + AP.area(q.w * q.l);
        const h = 13 / k, cx = q.x + q.w / 2, cy = q.y + q.l / 2 + 2.2 * h, tw = AP.textWidth(t, h, true);
        d.rect(cx - tw / 2 - h * 0.4, cy - h * 1.05, tw + h * 0.8, h * 1.45, { fill: '#1677ff', stroke: 'none' });
        d.text(cx, cy, t, h, { anchor: 'middle', bold: true, fill: '#ffffff' });
      }
    }
    return d;
  }
  function hitGrip(m) {
    if (!sel || sel.type !== 'room') return null;
    const r = P.floors[fi].rooms.find(q => q.id === sel.id); if (!r || r.locked || inRoom) return null;
    const k = views[current.key].k, gp = gripPts(r);
    let best = null, bd = Math.max(10 / k, Math.min(24 / k, 0.3)); // zoomed out, a handle must not swallow the fixtures next to it
    for (const sd of 'NSEW') { const dd = Math.hypot(m[0] - gp[sd][0], m[1] - gp[sd][1]); if (dd < bd) { bd = dd; best = sd; } }
    return best;
  }
  // start resizing: remember this room and every room sharing that wall
  function startEdge(r, side, e) {
    const E2 = EDGE[side], e0 = E2.get(r), fl = P.floors[fi];
    const lo = side === 'N' || side === 'S' ? r.x : r.y, hi = lo + (side === 'N' || side === 'S' ? r.w : r.l);
    const nb = [];
    for (const q of fl.rooms) {
      if (q.id === r.id) continue;
      const qlo = side === 'N' || side === 'S' ? q.x : q.y, qhi = qlo + (side === 'N' || side === 'S' ? q.w : q.l);
      if (AP.eq(EDGE[E2.opp].get(q), e0) && Math.min(hi, qhi) - Math.max(lo, qlo) > 0.01) nb.push({ id: q.id, side: E2.opp });
    }
    const snapOrig = JSON.parse(JSON.stringify({ rooms: fl.rooms, openings: fl.openings }));
    const lockedNb = nb.map(n => fl.rooms.find(q => q.id === n.id)).find(q => q && q.locked);
    return { type: 'edge', sx: e.clientX, sy: e.clientY, side, room: r, e0, nb, orig: snapOrig, moved: false,
      blocked: r.locked ? '🔒 ' + r.name + ' is locked' : lockedNb ? '🔒 ' + lockedNb.name + ' shares this wall and is locked – unlock it first' : null };
  }
  function applyEdge(gs, m, exact) {
    const fl = P.floors[fi], E2 = EDGE[gs.side], v = views[current.key];
    const involved = new Set([gs.room.id, ...gs.nb.map(n => n.id)]);
    // restore the starting geometry, then apply the new wall position
    for (const o of gs.orig.rooms) { const q = fl.rooms.find(z => z.id === o.id); if (q) Object.assign(q, o); }
    for (const o of gs.orig.openings) { const q = fl.openings.find(z => z.id === o.id); if (q) q.off = o.off; }
    let e = exact != null ? exact : (E2.ax === 'x' ? m[0] : m[1]);
    if (exact == null) {
      const edges = [];
      for (const q of fl.rooms) if (!involved.has(q.id)) { if (E2.ax === 'x') edges.push(q.x, q.x + q.w); else edges.push(q.y, q.y + q.l); }
      let best = null, bd = Math.min(0.25, 9 / v.k);
      for (const c of edges) if (Math.abs(e - c) < bd) { bd = Math.abs(e - c); best = c; }
      e = best != null ? best : snap(e, 0.05);
    }
    // keep every involved room at least 0.6 m deep
    const MIN = 0.6;
    const lim = (q, sd) => {
      if (sd === 'N') return [-Infinity, q.y + q.l - MIN];
      if (sd === 'S') return [q.y + MIN, Infinity];
      if (sd === 'W') return [-Infinity, q.x + q.w - MIN];
      return [q.x + MIN, Infinity];
    };
    let [a, b] = lim(gs.room, gs.side);
    for (const n of gs.nb) { const q = fl.rooms.find(z => z.id === n.id); const [c, d2] = lim(q, n.side); a = Math.max(a, c); b = Math.min(b, d2); }
    e = r3(Math.min(Math.max(e, a), b));
    const move = (q, sd) => {
      const before = { x: q.x, y: q.y };
      EDGE[sd].set(q, e);
      // keep doors/windows where they were on the walls that did not move
      const dx = q.x - before.x, dy = q.y - before.y;
      for (const op of fl.openings) {
        if (op.roomId !== q.id) continue;
        if (dx && (op.side === 'N' || op.side === 'S')) op.off = r3(op.off - dx);
        if (dy && (op.side === 'W' || op.side === 'E')) op.off = r3(op.off - dy);
      }
    };
    move(fl.rooms.find(z => z.id === gs.room.id), gs.side);
    for (const n of gs.nb) move(fl.rooms.find(z => z.id === n.id), n.side);
  }

  /* ---------- type-in dimension box next to the wall handle ---------- */
  let dimBox = null; // {roomId, side}
  const dimEl = document.createElement('div');
  dimEl.className = 'dim-box'; dimEl.hidden = true;
  dimEl.innerHTML = '<form id="dbForm" autocomplete="off"><span id="dbLabel"></span><input id="dbInput" type="number" inputmode="numeric" step="10" enterkeyhint="done"><span class="u">mm</span><button type="button" id="dbOk" title="Apply">&#10003;</button><button type="button" id="dbX" title="Close">&#10005;</button></form>';
  $('canvasWrap').appendChild(dimEl);
  const roomDim = (r, side) => (side === 'E' || side === 'W' ? r.w : r.l);
  function showDimBox(room, side, focus) {
    dimBox = { roomId: room.id, side };
    $('dbLabel').textContent = (side === 'E' || side === 'W' ? 'Width' : 'Length');
    if (document.activeElement !== $('dbInput')) $('dbInput').value = AP.toU(roomDim(room, side));
    dimEl.querySelector('.u').textContent = AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf();
    $('dbInput').step = AP.unit().step;
    dimEl.hidden = false;
    positionDimBox();
    if (focus) setTimeout(() => { $('dbInput').focus(); $('dbInput').select(); }, 30);
  }
  function hideDimBox() { dimBox = null; dimEl.hidden = true; }
  function positionDimBox() {
    if (!dimBox || !current || !views[current.key]) return;
    if (dimBox.op) { // next to the tapped number
      if (tab !== 'plan' || !sel || sel.id !== dimBox.op || !tdLabels || !tdLabels[dimBox.which]) { hideDimBox(); return; }
      const v = views[current.key], q = tdLabels[dimBox.which].c;
      const W = $('canvasWrap').clientWidth, H = $('canvasWrap').clientHeight, bw = dimEl.offsetWidth || 230, bh = dimEl.offsetHeight || 44;
      let x = (q[0] - v.x) * v.k - bw / 2, y = (q[1] - v.y) * v.k + 18;
      if (y + bh > H - 6) y = (q[1] - v.y) * v.k - bh - 18;
      dimEl.style.left = Math.max(6, Math.min(W - bw - 6, x)) + 'px'; dimEl.style.top = Math.max(6, y) + 'px';
      return;
    }
    const r = P.floors[fi].rooms.find(q => q.id === dimBox.roomId);
    if (!r || tab !== 'plan' || !sel || sel.id !== r.id) { hideDimBox(); return; }
    const v = views[current.key], g = gripPts(r)[dimBox.side];
    const W = $('canvasWrap').clientWidth, H = $('canvasWrap').clientHeight;
    const bw = dimEl.offsetWidth || 230, bh = dimEl.offsetHeight || 44;
    let x = (g[0] - v.x) * v.k + 16, y = (g[1] - v.y) * v.k + 16;
    if (x + bw > W - 6) x = (g[0] - v.x) * v.k - bw - 16;
    if (y + bh > H - 6) y = (g[1] - v.y) * v.k - bh - 16;
    dimEl.style.left = Math.max(6, x) + 'px'; dimEl.style.top = Math.max(6, y) + 'px';
  }
  let applyingDim = false;
  function applyDimInput() {
    if (!dimBox || applyingDim) return;
    applyingDim = true;
    try { applyDimValue(); } finally { applyingDim = false; }
  }
  function applyDimValue() {
    if (!dimBox) return;
    if (dimBox.op) { applyOpDim(); return; }
    const fl = P.floors[fi], r = fl.rooms.find(q => q.id === dimBox.roomId); if (!r) return;
    const side = dimBox.side, v = AP.fromU(num($('dbInput').value, 0));
    if (!(v >= 0.6)) { toast('Minimum ' + AP.len(0.6)); return; }
    if (Math.abs(v - roomDim(r, side)) < 0.0005) { hideDimBox(); $('dbInput').blur(); return; } // already that size: just close
    const e = side === 'E' ? r.x + v : side === 'W' ? r.x + r.w - v : side === 'S' ? r.y + v : r.y + r.l - v;
    const gs = startEdge(r, side, { clientX: 0, clientY: 0 });
    if (gs.blocked) { toast(gs.blocked, 2500); hideDimBox(); $('dbInput').blur(); return; }
    commit();
    applyEdge(gs, null, e);
    const got = roomDim(r, side);
    if (Math.abs(got - v) > 0.0005) toast('Limited to ' + AP.len(got) + ' – a room next to it would become smaller than ' + AP.len(0.6), 3500);
    const names = gs.nb.map(n => (fl.rooms.find(z => z.id === n.id) || {}).name).filter(Boolean);
    if (names.length && Math.abs(got - v) <= 0.0005) toast(r.name + ' set to ' + AP.len(got) + ' – adjusted: ' + names.join(', '), 2500);
    hideDimBox();          // ✓ / Done applies and closes the box
    $('dbInput').blur();
    changed();
  }
  // Act on pointerdown: on a phone the keyboard closes on blur, the canvas resizes and the
  // box moves before 'click' would fire, so the tap would miss the button.
  $('dbOk').addEventListener('pointerdown', e => { e.preventDefault(); applyDimInput(); });
  $('dbX').addEventListener('pointerdown', e => { e.preventDefault(); hideDimBox(); $('dbInput').blur(); });
  // keyboard Enter / Done / Go submits the form
  $('dbForm').addEventListener('submit', e => { e.preventDefault(); applyDimInput(); });
  $('dbInput').addEventListener('keydown', e => { if (e.key === 'Escape') { hideDimBox(); $('dbInput').blur(); } });
  // tapping elsewhere after typing still applies the typed size
  $('dbInput').addEventListener('blur', () => { if (dimBox && !applyingDim) applyDimInput(); });
  dimEl.addEventListener('pointerdown', e => e.stopPropagation());

  function setPreview(m) {
    const T = (mode.kind === 'door' ? AP.DOOR_TPL : AP.WIN_TPL)[mode.tpl];
    const pv = computeAt(m, T.w);
    if (pv) pv.ghost = Object.assign({ id: '_ghost', kind: mode.kind, tpl: mode.tpl, off: pv.off, w: T.w, h: T.h, sill: T.sill || 0, flip: false, hand: false },
      pv.xw ? { wallId: pv.xw.id, kside: pv.k } : { roomId: pv.r.id, side: pv.side });
    preview = pv;
    updateOverlay();
  }
  function commitPlacement() {
    const pv = preview; preview = null;
    updateOverlay();
    if (!pv) { toast('Drag along a wall'); return; }
    if (!pv.ok) { toast('It does not fit there: ' + AP.len(pv.R - pv.L) + ' clear, needs ' + AP.len(pv.w + 2 * pv.clr) + ' (incl. ' + AP.len(pv.clr) + ' each side)', 3500); return; }
    commit();
    const op = Object.assign({}, pv.ghost, { id: AP.uid(), w: r2(pv.w) });
    if (op.kind === 'door' && AP.tplOf(op).exit) { op.flip = true; toast('Exit door – it swings out; an EXIT sign is added on the lighting layout', 2600); }
    P.floors[fi].openings.push(op);
    sel = { type: 'op', id: op.id };
    changed();
  }

  /* ---------- properties panel (collapsed by default so the plan stays visible) ---------- */
  let panelOpen = false;
  const placing = () => mode && (mode.kind === 'door' || mode.kind === 'window' || mode.kind === 'column');
  const editBtn = () => `<button class="ghost" id="pEdit">${panelOpen ? 'Hide ▴' : 'Edit ▾'}</button>`;
  async function snapDialog() {
    const F = [
      { k: 'on', label: 'Snap on', type: 'checkbox', value: SNAP.on },
      { k: 'walls', label: 'Wall lines (centre) & room edges', type: 'checkbox', value: SNAP.walls },
      { k: 'faces', label: 'Wall faces (edges) & wall ends', type: 'checkbox', value: SNAP.faces !== false },
      { k: 'grids', label: 'Grid lines', type: 'checkbox', value: SNAP.grids },
      { k: 'cols', label: 'Columns', type: 'checkbox', value: SNAP.cols },
      { k: 'mid', label: 'Middle of walls', type: 'checkbox', value: SNAP.mid },
      { k: 'inc', label: 'Step when nothing is near', type: 'select', value: String(SNAP.inc || 0), options: [['0', 'Off (free)'], ['0.01', '10 mm'], ['0.025', '25 mm'], ['0.05', '50 mm'], ['0.1', '100 mm'], ['0.25', '250 mm'], ['0.5', '500 mm']] }
    ];
    const v = await modal('Snap', F, 'OK'); if (!v) return;
    SNAP = { on: v.on, walls: v.walls, faces: v.faces, grids: v.grids, cols: v.cols, mid: v.mid, inc: +v.inc || 0 };
    try { localStorage.setItem('arkiplan.snap', JSON.stringify(SNAP)); } catch (e) { /* private mode */ }
    renderSubbar(); toast(SNAP.on ? 'Snap on' : 'Snap off – free placing', 1400);
  }
  const SNAP_MODES = ['addWall', 'lvWall', 'walls', 'levels', 'addBeam', 'addTruss', 'trusses', 'sketchRoof', 'addRoof', 'roof', 'column', 'cols', 'furn'];
  function snapBtn() {
    const sb = $('subbar');
    if (tab !== 'plan' || !mode || SNAP_MODES.indexOf(mode.kind) < 0 || $('sbSnap')) return;
    const b = document.createElement('button'); b.id = 'sbSnap'; b.className = SNAP.on ? 'on' : '';
    b.innerHTML = '&#129522; Snap' + (SNAP.on ? '' : ': off'); b.onclick = () => snapDialog();
    const lbl = sb.querySelector('.lbl'); if (lbl) sb.insertBefore(b, lbl); else sb.appendChild(b);
  }
  // every edit panel with a box to type in gets an OK button (Enter does the same)
  function panelOk() {
    const pn = $('panel');
    if (!pn.classList.contains('show') || $('pOK')) return;
    const ins = [...pn.querySelectorAll('input')].filter(i => i.type !== 'checkbox');
    if (!ins.length) return;
    // apply every box whose value was typed but not applied yet
    const apply = () => { for (const i of ins) if (i.isConnected && i.value !== i.dataset.v0) { i.dataset.v0 = i.value; i.dispatchEvent(new Event('change', { bubbles: true })); } };
    for (const i of ins) {
      i.dataset.v0 = i.value;
      i.addEventListener('change', () => { i.dataset.v0 = i.value; });
      i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); i.blur(); } });
    }
    const b = document.createElement('button'); b.id = 'pOK'; b.className = 'primary'; b.innerHTML = '&#10003; OK'; b.style.cssText = 'background:#1677ff;color:#fff;border-color:#1677ff;font-weight:600';
    b.onclick = () => { apply(); const a = document.activeElement; if (a && a.blur) a.blur(); toast('✓ Applied', 900); };
    let row = pn.querySelector('.btn-row'); if (!row) { row = document.createElement('div'); row.className = 'btn-row'; pn.appendChild(row); }
    row.insertBefore(b, row.firstChild);
  }
  function renderPanel() { renderPanel0(); panelOk(); }
  function renderPanel0() {
    const pn = $('panel');
    const fl = P && P.floors[fi];
    if (!sel || placing() || (tab !== 'plan' && !((tab === 'elev' || tab === 'sect') && sel.type === 'op') && !(elecView() && sel.type === 'dev') && !(plumbView() && sel.type === 'pl'))) { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    if (sel.type === 'dev') { devPanel(pn); return; }
    if (sel.type === 'pl') { plPanel(pn); return; }
    if (sel.type === 'roof') { roofPanel(pn); return; }
    if (sel.type === 'beam') { beamPanel(pn); return; }
    if (sel.type === 'rwall') { rwallPanel(pn); return; }
    if (sel.type === 'truss') { trussPanel(pn); return; }
    if (sel.type === 'tnode' || sel.type === 'tmem') { pn.classList.remove('show'); pn.innerHTML = ''; return; }
    if (sel.type === 'room') {
      const r = fl.rooms.find(q => q.id === sel.id); if (!r) { pn.classList.remove('show'); return; }
      const fields = [
        { k: 'name', label: 'Name', value: r.name },
        { k: 'type', label: 'Type', type: 'select', value: r.type, options: TYPE_OPTS },
        { k: 'w', label: 'Width', type: 'len', value: r.w },
        { k: 'l', label: 'Length', type: 'len', value: r.l },
        { k: 'x', label: 'X position', type: 'len', value: r.x },
        { k: 'y', label: 'Y position', type: 'len', value: r.y }
      ];
      pn.innerHTML = `<div class="ph"><b>${esc(r.name)} · ${AP.area(r.w * r.l)}</b>${editBtn()}<button class="ghost" id="pClose">&#10005;</button></div>
        ${panelOpen ? `<div class="form"><div class="row two">${fieldHTML(fields[0], 'p_')}${fieldHTML(fields[1], 'p_')}</div><div class="row">${fields.slice(2).map(f => fieldHTML(f, 'p_')).join('')}</div></div>` : ''}
        <div class="btn-row"><button id="pLock" class="${r.locked ? 'on' : ''}">${r.locked ? '&#128274; Size locked' : '&#128275; Lock size'}</button><button id="pOpen" class="primary">&#128715; Open room</button><button id="pNext">+ Next room</button><button id="pDoor">+ Door</button><button id="pWin">+ Window</button><button id="pRot">Rotate room</button><button id="pFx">&#10227; Furniture</button><button id="pFxOff">${r.fxOff ? 'Auto furniture: off' : 'Auto furniture: on'}</button><button id="pFloor">Floor</button><button id="pWalls">Walls</button><button id="pCeil">Ceiling</button><button id="pDup">Duplicate</button><button id="pDel" class="danger">Delete</button></div>`;
      if (r.locked) { pn.querySelectorAll('#p_w,#p_l,#p_x,#p_y').forEach(el => { el.disabled = true; }); $('pRot').disabled = true; }
      $('pLock').onclick = () => { commit(); r.locked = !r.locked; changed(); toast(r.locked ? '🔒 ' + r.name + ' locked – its size and position cannot change' : '🔓 ' + r.name + ' unlocked', 2200); };
      $('pOpen').onclick = () => enterRoom(r);
      pn.querySelectorAll('input,select').forEach(el => el.onchange = () => {
        const v = readFields(fields, 'p_');
        if (!(v.w > 0.3 && v.l > 0.3)) { toast('Size must be more than 0.30 m'); return; }
        if (r.locked) Object.assign(v, { w: r.w, l: r.l, x: r.x, y: r.y });
        commit();
        Object.assign(r, { name: v.name, type: v.type, w: r2(v.w), l: r2(v.l), x: r2(v.x), y: r2(v.y) });
        changed();
      });
      $('pNext').onclick = () => addRoomDialog({ ref: r.id });
      $('pDoor').onclick = () => pickTemplate('door');
      $('pWin').onclick = () => pickTemplate('window');
      $('pRot').onclick = () => { if (r.locked) return; commit(); const t = r.w; r.w = r.l; r.l = t; changed(); };
      $('pFloor').onclick = () => floorDialog(r);
      $('pWalls').onclick = () => wallsDialog(r);
      $('pCeil').onclick = () => ceilingDialog(r);
      $('pFx').onclick = () => {
        const cur = (AP.fixtures(fl, r, P.settings)[0] || {}).side || r.fxSide || 'N';
        const order = ['N', 'E', 'S', 'W'];
        commit(); r.fxSide = order[(order.indexOf(cur) + 1) % 4]; changed();
        toast('Furniture turned to the ' + { N: 'top', E: 'right', S: 'bottom', W: 'left' }[r.fxSide] + ' wall', 1500);
      };
      $('pFxOff').onclick = () => { commit(); r.fxOff = !r.fxOff; changed(); toast(r.fxOff ? 'Automatic furniture hidden in ' + r.name + ' – add your own with 🛋 Furniture' : 'Automatic furniture shown again', 2500); };
      $('pDup').onclick = () => { commit(); const n = Object.assign({}, r, { id: AP.uid(), x: r2(r.x + r.w) }); fl.rooms.push(n); sel = { type: 'room', id: n.id }; changed(); };
      $('pDel').onclick = () => { commit(); fl.rooms = fl.rooms.filter(q => q.id !== r.id); fl.openings = fl.openings.filter(o => o.roomId !== r.id); sel = null; changed(); };
    } else if (sel.type === 'wall') {
      wallPanel(pn);
      return;
    } else if (sel.type === 'xwall') {
      xwallPanel(pn);
      return;
    } else if (sel.type === 'furn') {
      furnPanel(pn);
      return;
    } else if (sel.type === 'col') {
      const c = findCol(sel.key); if (!c) { pn.classList.remove('show'); return; }
      const C = AP.columns(P), ov = (colEdits().sizes || {})[sel.key];
      const where = c.gx && c.gy ? 'grid ' + c.gx + '-' + c.gy : AP.mm(c.x) + ', ' + AP.mm(c.y);
      const SHP = [['square', 'Square'], ['rect', 'Rectangular'], ['circle', 'Circular']];
      pn.innerHTML = `<div class="ph"><b>Column ${c.mark} · ${esc(AP.colDesc(c))} · ${esc(where)}</b><button class="ghost" id="pClose">&#10005;</button></div>
        <div class="form"><div class="row">${fieldHTML({ k: 'cshape', label: 'Shape', type: 'select', value: c.shape, options: SHP }, 'p_')}
        ${fieldHTML({ k: 'csize', label: c.shape === 'circle' ? 'Diameter' : c.shape === 'rect' ? 'Width (X)' : 'Size', type: 'len', value: c.size }, 'p_')}
        ${c.shape === 'rect' ? fieldHTML({ k: 'cdepth', label: 'Depth (Y)', type: 'len', value: c.d }, 'p_') : ''}
        <label>Footing<input disabled value="${c.fmark} ${AP.mm(c.foot)} x ${AP.len(c.foot)}"></label><label>Span<input disabled value="${AP.len(c.span)}"></label></div></div>
        <div class="btn-row">${ov ? '<button id="pAuto">Auto size</button>' : ''}<button id="pShapeAll">Make all columns ${esc((SHP.find(q => q[0] === c.shape) || SHP[0])[1].toLowerCase())}</button><button id="pColDel" class="danger">Delete column</button></div>`;
      $('p_cshape').onchange = e => {
        const CE = colEdits(); commit();
        CE.shapes = CE.shapes || {}; CE.shapes[sel.key] = e.target.value;
        delete CE.sizes[sel.key]; if (CE.depths) delete CE.depths[sel.key]; // re-size for the new shape
        changed();
      };
      if ($('p_cdepth')) $('p_cdepth').onchange = e => {
        const v = AP.fromU(num(e.target.value, 0));
        if (!(v >= 0.15 && v <= 2.0)) { toast('Use ' + AP.len(0.15) + ' – ' + AP.len(2.0)); return; }
        const CE = colEdits(); commit(); CE.depths = CE.depths || {}; CE.depths[sel.key] = r2(v); changed();
      };
      $('pShapeAll').onclick = () => {
        const CE = colEdits(); commit(); CE.shapeAll = c.shape; CE.shapes = {};
        if (c.shape === 'rect') { CE.depths = CE.depths || {}; for (const q of AP.columns(P).cols) CE.depths[AP.colKey(q.x, q.y)] = CE.depths[AP.colKey(q.x, q.y)] || c.d; }
        changed(); toast('All columns are now ' + c.shape.replace('rect', 'rectangular').replace('circle', 'circular'), 2000);
      };
      $('p_csize').onchange = e => {
        const v = AP.fromU(num(e.target.value, 0));
        if (!(v >= 0.15 && v <= 1.5)) { toast('Use ' + AP.len(0.15) + ' – ' + AP.len(1.5)); return; }
        commit(); colEdits().sizes[sel.key] = r2(v); changed();
      };
      if (ov) $('pAuto').onclick = () => { commit(); delete colEdits().sizes[sel.key]; changed(); };
      $('pColDel').onclick = () => deleteColumn(c);
      $('pClose').onclick = () => { sel = null; refresh(); };
      pn.classList.add('show');
      return;
    } else {
      const op = fl.openings.find(q => q.id === sel.id); if (!op) { pn.classList.remove('show'); return; }
      const T = op.kind === 'door' ? AP.DOOR_TPL : AP.WIN_TPL;
      const mk = AP.opMarks(P).marks[op.id];
      const fields = [
        { k: 'tpl', label: 'Type', type: 'select', value: op.tpl, options: Object.entries(T).map(([k, t]) => [k, k + ' ' + t.name]) },
        { k: 'w', label: 'Width', type: 'len', value: op.w },
        { k: 'h', label: 'Height', type: 'len', value: op.h },
      ];
      // clear distances to the nearest column / wall / opening on each side (mm)
      const Ro = AP.resolveOp(fl, op), siO = AP.opSideInfo(fl, op);
      const sp = AP.clearSpan(P, fi, Ro.o, Ro.c, Ro.s, op.id) || { L: siO.s0, R: siO.s0 + siO.len };
      const cL = Math.max(sp.L, siO.s0), cR = Math.min(sp.R, siO.s0 + siO.len);
      const nm = Ro.o === 'h' ? ['From left', 'From right'] : ['From top', 'From bottom'];
      fields.push({ k: 'dA', label: nm[0], type: 'len', value: Ro.s - Ro.w / 2 - cL },
                  { k: 'dB', label: nm[1], type: 'len', value: cR - Ro.s - Ro.w / 2 });
      if (op.kind === 'window') {
        const S = P.settings, al = AP.alignsHead(op, S), sill = AP.opSill(op, S);
        fields.push({ k: 'align', label: 'Window head', type: 'select', value: al ? 'door' : 'own', options: [['door', 'Align with door ht. (' + AP.mm(S.doorHt) + ')'], ['own', 'Own sill height']] },
                    { k: 'sill', label: 'Sill height (floor to sill)', type: 'len', value: sill },
                    { k: 'head', label: 'Head height (floor to top)', type: 'len', value: sill + op.h });
      }
      pn.innerHTML = `<div class="ph"><b>${esc(mk || op.tpl)} · ${op.kind === 'door' ? 'Door' : 'Window'}</b>${editBtn()}<button class="ghost" id="pClose">&#10005;</button></div>
        ${panelOpen ? `<div class="form"><div class="row">${fields.map(f => fieldHTML(f, 'p_')).join('')}</div></div>` : ''}
        <div class="btn-row"><button id="pOpLock" class="${op.locked ? 'on' : ''}">${op.locked ? '&#128274; Locked' : '&#128275; Lock'}</button><button id="pCenter">Center it</button>${op.kind === 'door' ? '<button id="pFlip">Flip swing</button><button id="pHand">Flip hinge</button>' : ''}<button id="pDel" class="danger">Delete</button></div>`;
      pn.querySelectorAll('input,select').forEach(el => el.onchange = e => {
        const v = readFields(fields, 'p_');
        commit();
        if (e.target.id === 'p_tpl' && v.tpl !== op.tpl) { const t = T[v.tpl]; op.tpl = v.tpl; op.w = t.w; op.h = t.h; op.sill = t.sill || 0; }
        else if (e.target.id === 'p_align') { op.align = v.align === 'door'; op.sill = AP.opSill(Object.assign({}, op, { align: false }), P.settings); if (op.align && op.h > P.settings.doorHt) toast('This window is taller than the door height – it keeps its own sill', 2500); }
        else if (e.target.id === 'p_sill' || e.target.id === 'p_head') {
          const sill = e.target.id === 'p_sill' ? v.sill : v.head - op.h;
          op.sill = r2(Math.max(0, sill));
          op.align = Math.abs(op.sill + op.h - P.settings.doorHt) < 0.001;
        }
        else if (e.target.id === 'p_dA' || e.target.id === 'p_dB') {
          const clr = minClear(op.kind), want = e.target.id === 'p_dA' ? v.dA : v.dB;
          const dd = Math.max(want, clr);
          if (dd > want + 1e-6) toast('Minimum ' + AP.len(clr) + ' from the wall / column – set to ' + AP.mm(clr), 2500);
          op.off = r3(e.target.id === 'p_dA' ? cL + dd + op.w / 2 - siO.s0 : cR - dd - op.w / 2 - siO.s0);
        }
        else Object.assign(op, { w: r2(Math.max(0.3, v.w)), h: r2(Math.max(0.3, v.h)) }); // an aligned window keeps its head at the door height
        changed();
      });
      $('pCenter').onclick = () => { commit(); op.off = r3((cL + cR) / 2 - siO.s0); changed(); };
      if (op.kind === 'door') {
        $('pFlip').onclick = () => { commit(); op.flip = !op.flip; changed(); };
        $('pHand').onclick = () => { commit(); op.hand = !op.hand; changed(); };
      }
      $('pDel').onclick = () => { commit(); fl.openings = fl.openings.filter(q => q.id !== op.id); sel = null; changed(); };
      $('pOpLock').onclick = () => { commit(); op.locked = !op.locked; changed(); toast(op.locked ? '🔒 ' + (mk || op.tpl) + ' locked – it cannot be moved, changed or deleted' : '🔓 ' + (mk || op.tpl) + ' unlocked', 2200); };
      if (op.locked) { pn.querySelectorAll('input,select').forEach(el => { el.disabled = true; }); ['pCenter', 'pFlip', 'pHand', 'pDel'].forEach(id => { if ($(id)) $(id).disabled = true; }); }
    }
    $('pClose').onclick = () => { sel = null; refresh(); };
    $('pEdit').onclick = () => { panelOpen = !panelOpen; renderPanel(); };
    pn.classList.add('show');
  }

  /* ---------- floor / walls / ceiling of a room ---------- */
  // a list of materials (+ adds one, x removes one), each a pick-or-type field
  const finRow = (k, val) => `<div class="fin-row"><input class="fin_${k}" list="dl_${k}" value="${esc(val)}" placeholder="pick or type"><button type="button" class="fin-x" title="Remove">&#10005;</button></div>`;
  const finGrp = (k, label, val, list) => `<div class="fin-grp" data-k="${k}"><span class="ttl">${label}</span>${(AP.finList(val).length ? AP.finList(val) : ['']).map(v => finRow(k, v)).join('')}<button type="button" class="fin-add" data-k="${k}">+ Add material</button><datalist id="dl_${k}">${list.map(v => `<option value="${esc(v)}">`).join('')}</datalist></div>`;
  const finUp = v => v.trim().toUpperCase().replace(/(\d)\s*MM\b/g, '$1mm').replace(/(\d)\s*X\s*(\d)/g, '$1x$2');
  function bindFinGrps(body) {
    const bx = () => body.querySelectorAll('.fin-x').forEach(b => b.onclick = () => {
      const g = b.closest('.fin-grp'), rowEl = b.closest('.fin-row');
      if (g.querySelectorAll('.fin-row').length > 1) rowEl.remove(); else rowEl.querySelector('input').value = '';
    });
    body.querySelectorAll('.fin-add').forEach(b => b.onclick = () => { b.insertAdjacentHTML('beforebegin', finRow(b.dataset.k, '')); bx(); const ins = b.parentNode.querySelectorAll('.fin-row input'); ins[ins.length - 1].focus(); });
    bx();
  }
  const readFin = (body, k, dflt) => { const v = [...body.querySelectorAll('.fin_' + k)].map(i => finUp(i.value)).filter(Boolean); return v.length ? v.join(AP.FIN_SEP) : dflt; };
  const uLab = () => (AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf());
  const lenIn = (id, label, v, extra) => `<label>${label} (${uLab()})<input id="${id}" type="number" step="${AP.unit().step}" inputmode="decimal" value="${AP.toU(v)}"${extra || ''}></label>`;
  async function floorDialog(r) {
    const f = AP.roomFinish(r);
    const html = `<div class="form">${finGrp('floor', 'Floor materials', f.floor, AP.FINISHES.floor)}
      ${lenIn('fl_drop', 'Floor level from FFL: + raised / − lowered (0 = same level)', -AP.floorDrop(r))}
      ${lenIn('fl_slab', 'Floor slab thickness', AP.slabThk(r, P.settings, fi === 0))}
      <p class="muted small">Use + for more than one material (e.g. "CERAMIC TILES (SHOWER AREA)"). Raise a floor with + (e.g. +150 for a stage, a raised living area or a platform) or lower it with − (e.g. −50 for a T&amp;B, laundry, porch or garage) – shown on the plan (FFL mark), the sections, the finishes schedule and in 3D. The first material's tile size draws the floor pattern.</p></div>`;
    const pr = modal(r.name + ' – floor', html, 'Save'); bindFinGrps($('mBody'));
    if (!(await pr)) return;
    commit();
    r.finish = Object.assign({}, f, { floor: readFin($('mBody'), 'floor', f.floor) });
    const lv = AP.fromU(num($('fl_drop').value, 0)); // + raised, − lowered
    if (Math.abs(lv) > 0.0005) r.floorDrop = r3(-Math.max(-0.5, Math.min(1.5, lv))); else delete r.floorDrop;
    const sl = AP.fromU(num($('fl_slab').value, 0)), sd = AP.slabThk(null, P.settings, fi === 0);
    if (sl >= 0.075 && sl <= 0.4 && Math.abs(sl - sd) > 0.0005) r.slabThk = r3(sl); else delete r.slabThk;
    changed(); toast('Floor of ' + r.name + ' saved', 1500);
  }
  async function wallsDialog(r) {
    const fl = P.floors[fi], walls = AP.computeWalls(fl, P.settings);
    const WH = { N: 'North wall (top)', E: 'East wall (right)', S: 'South wall (bottom)', W: 'West wall (left)' };
    const thk = sd => { const si = AP.sideInfo(r, sd), w = AP.wallAt(walls, si.o, si.c, si.s0 + si.len / 2); return w ? w.t : 0; };
    const html = `<div class="form">${AP.SIDES.map(sd => { const wf = AP.wallFinish(r, sd), t = thk(sd); return `<div style="border-top:1px solid #e3e8ef;padding-top:8px;margin-top:4px"><b>${WH[sd]}</b>${t ? '' : ' <span class="muted small">– open side, no wall</span>'}
        ${finGrp('w' + sd, 'Materials', wf.wall, AP.FINISHES.wall)}
        <div class="row">${lenIn('wt_' + sd, 'Tile height (0 = none)', wf.tileHt)}${t ? lenIn('wk_' + sd, 'Wall thickness', t) : ''}</div></div>`; }).join('')}
      <p class="muted small">Each side can have its own materials and wall tile height (shown in the sections, the T&amp;B wall details and the finishes schedule). The thickness changes that wall line (it is shared with the room next to it).</p></div>`;
    const pr = modal(r.name + ' – walls', html, 'Save'); bindFinGrps($('mBody'));
    if (!(await pr)) return;
    commit();
    const body = $('mBody'), f = AP.roomFinish(r), out = {};
    for (const sd of AP.SIDES) out[sd] = { wall: readFin(body, 'w' + sd, AP.wallFinish(r, sd).wall), tileHt: Math.max(0, AP.fromU(num($('wt_' + sd).value, 0))) };
    const same = AP.SIDES.every(sd => out[sd].wall === out.N.wall && Math.abs(out[sd].tileHt - out.N.tileHt) < 1e-4);
    if (same) { r.finish = Object.assign({}, f, { wall: out.N.wall, tileHt: out.N.tileHt }); delete r.wallFin; }
    else { r.finish = Object.assign({}, f); r.wallFin = out; }
    // wall thickness per side
    for (const sd of AP.SIDES) {
      const el = $('wk_' + sd); if (!el) continue;
      const t = AP.fromU(num(el.value, 0)), cur = thk(sd);
      if (!(t >= 0.05 && t <= 0.6) || Math.abs(t - cur) < 0.0005) continue;
      const si = AP.sideInfo(r, sd);
      fl.wallThk = (fl.wallThk || []).filter(q => !(q.o === si.o && AP.eq(q.c, si.c) && Math.min(q.b, si.s0 + si.len) - Math.max(q.a, si.s0) > 0.05));
      fl.wallThk.push({ o: si.o, c: r3(si.c), a: r3(si.s0), b: r3(si.s0 + si.len), t: r3(t) });
    }
    changed(); toast('Walls of ' + r.name + ' saved', 1500);
  }
  async function ceilingDialog(r) {
    const S = P.settings, f = AP.roomFinish(r), has = AP.hasCeiling(r);
    const html = `<div class="form"><label>Ceiling<select id="cl_type"><option value="flat"${has ? ' selected' : ''}>Flat ceiling</option><option value="none"${has ? '' : ' selected'}>No ceiling – exposed to the roof / slab</option></select></label>
      ${lenIn('cl_ht', 'Ceiling height (floor to ceiling)', AP.ceilHt(r, S))}
      ${finGrp('ceiling', 'Ceiling materials', f.ceiling, AP.FINISHES.ceiling)}
      <p class="muted small">Shown in the sections (ceiling line and CLG. HT.), the finishes schedule, the T&amp;B wall details and in 3D (3D tab › Ceilings).</p></div>`;
    const pr = modal(r.name + ' – ceiling', html, 'Save'); bindFinGrps($('mBody'));
    if (!(await pr)) return;
    commit();
    r.ceilType = $('cl_type').value;
    const h = AP.fromU(num($('cl_ht').value, AP.toU(S.ceilingHt)));
    if (h > 1.8 && h < AP.floorH(P, fi) + 3 && Math.abs(h - S.ceilingHt) > 0.0005) r.ceilHt = r3(h); else delete r.ceilHt;
    r.finish = Object.assign({}, f, { ceiling: readFin($('mBody'), 'ceiling', f.ceiling) });
    changed(); toast('Ceiling of ' + r.name + ' saved', 1500);
  }

  // finishes of a room: pick from common finishes or type your own (datalist)
  async function finishDialog(r) {
    const f = AP.roomFinish(r);
    const dl = (id, arr) => `<datalist id="${id}">${arr.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    // one or more materials per surface: + adds a line, ✕ removes it
    const row = (k, val) => `<div class="fin-row"><input class="fin_${k}" list="dl_${k}" value="${esc(val)}" placeholder="pick or type"><button type="button" class="fin-x" title="Remove">&#10005;</button></div>`;
    const grp = (k, label, val, list) => `<div class="fin-grp" data-k="${k}"><span class="ttl">${label}</span>${(AP.finList(val).length ? AP.finList(val) : ['']).map(v => row(k, v)).join('')}<button type="button" class="fin-add" data-k="${k}">+ Add ${label.toLowerCase()} material</button>${dl('dl_' + k, list)}</div>`;
    const html = `<div class="form">${grp('floor', 'Floor', f.floor, AP.FINISHES.floor)}${grp('wall', 'Wall', f.wall, AP.FINISHES.wall)}
      <label>Wall tile height (${AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf()}, 0 = none)<input id="fin_tileHt" type="number" step="${AP.unit().step}" inputmode="decimal" value="${AP.toU(f.tileHt)}"></label>
      <label>Wall above the tiles<input id="fin_above" list="dl_wall" value="${esc(AP.wallAbove(f))}" placeholder="pick or type"></label>
      ${grp('ceiling', 'Ceiling', f.ceiling, AP.FINISHES.ceiling)}
      <p class="muted small">Tap a field to choose a common finish or type your own. Use <b>+</b> when a floor, wall or ceiling has more than one material, e.g. tiles at the toilet wall and paint above, or vinyl and tiles on one floor (you can add where, e.g. "CERAMIC TILES (SHOWER AREA)"). Shown in the Schedule of Finishes, sections and the floor tile pattern.</p></div>`;
    const pr = modal(r.name + ' – finishes', html, 'Save', { text: 'Defaults', value: 'reset' });
    const body = $('mBody');
    const bindX = () => body.querySelectorAll('.fin-x').forEach(b => b.onclick = () => {
      const g = b.closest('.fin-grp'), rowEl = b.closest('.fin-row');
      if (g.querySelectorAll('.fin-row').length > 1) rowEl.remove(); else rowEl.querySelector('input').value = '';
    });
    body.querySelectorAll('.fin-add').forEach(b => b.onclick = () => {
      b.insertAdjacentHTML('beforebegin', row(b.dataset.k, ''));
      bindX();
      const ins = b.parentNode.querySelectorAll('.fin-row input'); ins[ins.length - 1].focus();
    });
    bindX();
    const ok = await pr;
    if (!ok) return;
    commit();
    if (ok === 'reset') delete r.finish;
    else {
      const up = v => v.trim().toUpperCase().replace(/(\d)\s*MM\b/g, '$1mm').replace(/(\d)\s*X\s*(\d)/g, '$1x$2'); // keep "600x600mm" style units
      const vals = k => { const v = [...body.querySelectorAll('.fin_' + k)].map(i => up(i.value)).filter(Boolean); return v.length ? v.join(AP.FIN_SEP) : f[k]; };
      r.finish = { floor: vals('floor'), wall: vals('wall'), ceiling: vals('ceiling'), tileHt: Math.max(0, AP.fromU(num($('fin_tileHt').value, 0))), wallAbove: up($('fin_above').value) || AP.wallAbove(null) };
    }
    changed();
    toast('Finishes saved for ' + r.name, 1500);
  }

  /* ---------- pictures: upload, shrink to 1400 px JPEG (it goes into the PDF as is), preview, remove ---------- */
  const imgSlot = (k, label, V) => `<div class="img-slot"><div class="btn-row"><button type="button" id="im_up_${k}">&#128247; Upload ${esc(label.toLowerCase())}</button><button type="button" id="im_rm_${k}" class="danger">Remove</button></div>
    <input type="file" id="im_f_${k}" accept="image/*" hidden><img id="im_pv_${k}" alt="${esc(label)}" style="max-width:100%;margin-top:6px;${V && V.img ? '' : 'display:none'}" src="${V && V.img ? V.img : ''}"></div>`;
  function bindImgSlots(pics) {
    for (const k of Object.keys(pics)) {
      if (!$('im_up_' + k)) continue;
      $('im_up_' + k).onclick = () => $('im_f_' + k).click();
      $('im_rm_' + k).onclick = () => { pics[k] = null; $('im_pv_' + k).style.display = 'none'; };
      $('im_f_' + k).onchange = e => {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = () => {
          const im = new Image();
          im.onload = () => {
            const s = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
            cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
            const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
            pics[k] = { img: cv.toDataURL('image/jpeg', 0.82), pw: cv.width, ph: cv.height };
            $('im_pv_' + k).src = pics[k].img; $('im_pv_' + k).style.display = '';
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(file);
      };
    }
  }

  // a red note on the bar when the building is not inside the lot (tap it for the full text)
  function siteWarnHtml() {
    let w = null; try { w = AP.siteWarning(P); } catch (e) { /* no lot yet */ }
    return w ? `<span class="lbl" style="color:#c62828;font-weight:700;cursor:pointer" title="${esc(w)}" onclick="this.textContent=this.title;this.style.whiteSpace='normal'">&#9888; Building outside the lot – tap</span>` : '';
  }
  /* ---------- lot (technical description), site placement, vicinity map ---------- */
  async function lotDialog() {
    const L = P.lot || {}, V = P.vicinity || null;
    const uS = AP.unitSuf() === 'ft-in' ? 'ft' : AP.unitSuf(), step = AP.unit().step;
    const len = (id, label, v) => `<label>${label} (${uS})<input type="number" inputmode="decimal" step="${step}" id="${id}" value="${AP.toU(v)}"></label>`;
    const html = `<div class="form">
      <label>Lot No.<input id="lt_no" value="${esc(L.lotNo || '')}" placeholder="e.g. 12-A, PSD-07-012345"></label>
      <div><b class="small">Technical description</b> <span class="muted small">– bearing &amp; distance (m) of each line, from the title / lot plan</span></div>
      <div id="tdTable" style="overflow-x:auto"></div>
      <div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="tdAdd">+ Add line</button><button type="button" id="tdDel">&minus; Last line</button><button type="button" id="tdText" class="ghost">Edit as text</button></div>
      <label id="tdTextWrap" style="display:none">Technical description as text – one line per course
        <textarea id="lt_text" rows="7" style="width:100%;font-family:monospace;font-size:13px" placeholder="TIE: BLLM No. 1, N 45°30' E, 120.50&#10;1-2  N 45°30' E  20.00&#10;2-3  S 44°30' E  15.00&#10;3-4  S 45°30' W  20.00&#10;4-1  N 44°30' W  15.00">${esc(L.text || '')}</textarea></label>
      <p id="lt_res" class="small"></p>
      <div class="row"><label>Road on line no.<input type="number" id="lt_road" min="1" step="1" value="${L.road || 1}"></label><label>Road name<input id="lt_rname" value="${esc(L.roadName || '')}" placeholder="ROAD"></label>${len('lt_rw', 'Road width', L.roadW || 6)}</div>
      <p class="small">Building on the lot (its front faces the road):</p>
      <div class="row">${len('lt_sb', 'Front setback', L.setback != null ? L.setback : 3)}${len('lt_sh', 'Shift along road', L.shift || 0)}<label>Turn (°)<input type="number" id="lt_rot" step="90" value="${L.rot || 0}"></label></div>
      <p id="lt_warn" class="small" style="color:#c62828;font-weight:600" hidden></p>
      <h4>Vicinity map &amp; location map</h4>
      <p class="small">Open Google Maps at the project location, take screenshots (close up for the vicinity map, zoomed out to the town / province for the location map), then upload them.</p>
      <div class="btn-row"><button type="button" id="lt_gmap">Open Google Maps</button></div>
      ${imgSlot('vic', 'Vicinity map', P.vicinity)}
      ${imgSlot('loc', 'Location map', P.locmap)}
      <h4>Perspective</h4>
      <p class="small">Upload your own rendering / photo of the house for A-1 – or leave it empty to use the perspective the app draws.</p>
      ${imgSlot('per', 'Perspective picture', P.perspImg)}
    </div>`;
    const pr = modal('Lot & site', html, 'Save');
    const pics = { vic: P.vicinity || null, loc: P.locmap || null, per: P.perspImg || null };
    bindImgSlots(pics);
    const upd = () => {
      const G = AP.lotGeom({ lot: { text: $('lt_text').value } });
      const el = $('lt_res');
      if (!G) { el.textContent = 'Type or paste the technical description from the title / lot plan.'; return; }
      const bad = G.bad.length ? ' · line ' + G.bad.join(', ') + ' not understood' : '';
      el.innerHTML = G.ok ? `<b>Lot area: ${AP.area(G.area)}</b> · ${G.courses.length} lines${G.tie ? ' + tie line' : ''} · error of closure ${G.closure.toFixed(3)} m${G.closure > 1e-3 ? ' (1:' + Math.round(G.per / G.closure) + ')' : ''}${bad}` : esc(G.msg) + bad;
    };
    // is the building inside the lot with these inputs?
    const readLot = () => ({ lotNo: $('lt_no').value.trim(), text: $('lt_text').value, road: Math.max(1, Math.round(num($('lt_road').value, 1))), roadName: $('lt_rname').value.trim(),
      roadW: AP.fromU(num($('lt_rw').value, AP.toU(6))), setback: AP.fromU(num($('lt_sb').value, AP.toU(3))), shift: AP.fromU(num($('lt_sh').value, 0)), rot: num($('lt_rot').value, 0) });
    const warnUpd = () => { let w = null; try { w = AP.siteWarning(Object.assign({}, P, { lot: readLot() })); } catch (e) { /* incomplete input */ } $('lt_warn').hidden = !w; $('lt_warn').textContent = w ? '\u26a0 ' + w : ''; };
    $('lt_text').oninput = () => { upd(); warnUpd(); }; upd(); warnUpd();
    // ---- the table: tie line + one row per course; it writes the text the lot is computed from
    const TD = { tie: null, rows: [] };
    const fromText = () => {
      TD.tie = null; TD.rows = [];
      for (const ln of $('lt_text').value.split(/\n/)) {
        if (!ln.trim()) continue;
        const c = AP.parseCourse(ln); if (!c) continue;
        const deg = Math.floor(c.ang + 1e-9), mn = Math.round((c.ang - deg) * 60 * 100) / 100;
        const r = { ns: c.ns, d: deg, m: mn, ew: c.ew, dist: c.d };
        if (c.tie) { const f = /(?:tie\s*:?\s*)?(.*?)\s*,?\s*[NS]\s*\d/i.exec(ln.replace(/^\s*tie\s*:?\s*/i, '')); r.from = (f && f[1] ? f[1] : 'BLLM No. 1').replace(/[,\s]+$/, ''); TD.tie = r; }
        else TD.rows.push(r);
      }
      while (TD.rows.length < 3) TD.rows.push({ ns: 'N', d: '', m: '', ew: 'E', dist: '' });
    };
    const fmtB = r => r.ns + ' ' + (+r.d || 0) + '°' + String(r.m === '' ? 0 : r.m).padStart(2, '0') + "' " + r.ew;
    const toText = () => {
      const n = TD.rows.length, L = [];
      if (TD.tie && TD.tie.dist !== '') L.push('TIE: ' + (TD.tie.from || 'BLLM No. 1') + ', ' + fmtB(TD.tie) + ', ' + (+TD.tie.dist).toFixed(2));
      TD.rows.forEach((r, i) => { if (r.d === '' || r.dist === '') return; L.push((i + 1) + '-' + (i + 2 > n ? 1 : i + 2) + ' ' + fmtB(r) + ' ' + (+r.dist).toFixed(2)); });
      $('lt_text').value = L.join('\n'); upd(); warnUpd();
    };
    const sel = (k, v, a, b) => `<select data-k="${k}" style="width:52px;padding:6px 2px">${[a, b].map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    const numIn = (k, v, w, step, ph) => `<input data-k="${k}" type="number" inputmode="decimal" step="${step}" min="0" value="${v === '' || v == null ? '' : v}" placeholder="${ph}" style="width:${w}px;padding:6px 4px">`;
    const rowHtml = (r, i, tie) => `<tr data-i="${tie ? 'tie' : i}">
        <td style="white-space:nowrap;font-weight:600;padding:2px 4px">${tie ? `<input data-k="from" value="${esc(r.from || '')}" placeholder="BLLM No. 1" style="width:96px;padding:6px 4px">` : (i + 1) + '-' + (i + 2 > TD.rows.length ? 1 : i + 2)}</td>
        <td>${sel('ns', r.ns, 'N', 'S')}</td><td>${numIn('d', r.d, 50, 1, '45')}</td><td>${numIn('m', r.m, 50, 1, '30')}</td>
        <td>${sel('ew', r.ew, 'E', 'W')}</td><td>${numIn('dist', r.dist, 76, 0.01, '20.00')}</td></tr>`;
    const draw = () => {
      $('tdTable').innerHTML = `<table style="border-collapse:collapse;font-size:13px"><thead><tr style="color:#5b6b7a;font-size:12px">
          <th align="left">LINE</th><th>N/S</th><th>DEG °</th><th>MIN '</th><th>E/W</th><th>DIST. (m)</th></tr></thead><tbody>
          <tr><td colspan="6" style="padding:4px 0 2px"><label class="chk" style="font-size:12px"><input type="checkbox" id="tdTieOn"${TD.tie ? ' checked' : ''}> Tie line from a reference monument (BLLM / BBM) to corner 1</label></td></tr>
          ${TD.tie ? rowHtml(TD.tie, 0, true) : ''}
          ${TD.rows.map((r, i) => rowHtml(r, i, false)).join('')}</tbody></table>`;
      $('tdTieOn').onchange = e => { TD.tie = e.target.checked ? { from: 'BLLM No. 1', ns: 'N', d: '', m: '', ew: 'E', dist: '' } : null; draw(); toText(); };
      $('tdTable').querySelectorAll('input[data-k], select[data-k]').forEach(el => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const tr = el.closest('tr'), i = tr.dataset.i, r = i === 'tie' ? TD.tie : TD.rows[+i], k = el.dataset.k;
          r[k] = k === 'ns' || k === 'ew' || k === 'from' ? el.value : (el.value === '' ? '' : +el.value);
          toText();
        });
      });
    };
    fromText(); draw();
    $('tdAdd').onclick = () => { TD.rows.push({ ns: 'N', d: '', m: '', ew: 'E', dist: '' }); draw(); toText(); };
    $('tdDel').onclick = () => { if (TD.rows.length > 3) { TD.rows.pop(); draw(); toText(); } else toast('A lot needs at least 3 lines', 1500); };
    $('tdText').onclick = () => {
      const show = $('tdTextWrap').style.display === 'none';
      $('tdTextWrap').style.display = show ? '' : 'none'; $('tdTable').style.display = show ? 'none' : '';
      $('tdAdd').style.display = $('tdDel').style.display = show ? 'none' : '';
      $('tdText').textContent = show ? 'Back to the table' : 'Edit as text';
      if (!show) { fromText(); draw(); }
    };
    for (const id of ['lt_road', 'lt_sb', 'lt_sh', 'lt_rot']) $(id).addEventListener('input', warnUpd);
    $('lt_gmap').onclick = () => {
      const q = [P.info.location, P.info.municipality, P.info.province, 'Philippines'].filter(Boolean).join(', ');
      const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
      const C = window.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) window.location.href = url; // the app hands outside links to Google Maps / the browser
      else window.open(url, '_blank');
    };
    const ok = await pr;
    if (!ok) return;
    commit();
    P.lot = readLot();
    P.vicinity = pics.vic; P.locmap = pics.loc; P.perspImg = pics.per;
    changed();
    const G = AP.lotGeom(P);
    const sw = G && G.ok ? AP.siteWarning(P) : null;
    toast(sw ? '\u26a0 ' + sw : G && G.ok ? 'Lot saved – ' + AP.area(G.area) + '. See Sheets › A-1 or Details › Lot plan' : 'Saved', sw ? 6000 : 2500);
  }
  function gridInfo() {
    const C = AP.columns(P), G = C.grids;
    const gx = G.x.map(g => g.label + ' = ' + AP.mm(g.v)).join(', '), gy = G.y.map(g => g.label + ' = ' + AP.mm(g.v)).join(', ');
    const html = `<p class="small">Grid lines are generated from the room edges: letters on the vertical lines (left to right) and numbers on the horizontal lines (top to bottom).</p>
      <p class="small"><b>Vertical grids:</b> ${esc(gx || '–')}<br><b>Horizontal grids:</b> ${esc(gy || '–')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th align="left">Column</th><th>Size</th><th>Bars</th><th>Qty</th></tr>
      ${C.ctypes.map(c => `<tr><td>${c.mark}</td><td align="center">${esc(AP.colDesc(c))}</td><td align="center">${c.bars}</td><td align="center">${c.n}</td></tr>`).join('')}
      <tr><th align="left">Footing</th><th>Size</th><th>Thk</th><th>Qty</th></tr>
      ${C.ftypes.map(f => `<tr><td>${f.mark}</td><td align="center">${AP.mm(f.size)}x${AP.mm(f.size)}</td><td align="center">${AP.mm(f.t)}</td><td align="center">${f.n}</td></tr>`).join('')}</table>
      <p class="muted small">Columns sit where walls meet on grid intersections and are sized from spans, number of storeys and a soil bearing of ${P.settings.soil} kPa. Tap a column in the plan to resize or delete it; use + Column to add one. These are preliminary – have a licensed civil engineer verify them.</p>
      ${(colEdits().removed || []).length ? '<h4>Deleted columns</h4>' + colEdits().removed.map(k => `<div class="proj"><div class="info">Column at ${esc(k.split(',').map(v => AP.len(+v)).join(', '))}</div><button class="ghost" data-restore="${esc(k)}">Restore</button></div>`).join('') : ''}`;
    modal('Grids & columns', html, null);
    $('mBody').onclick = e => {
      const b = e.target.closest('button[data-restore]'); if (!b) return;
      commit(); colEdits().removed = colEdits().removed.filter(k => k !== b.dataset.restore);
      $('modal').hidden = true; changed(); toast('Column restored');
    };
  }

  const BOM_TPL = [['full', '1 – Detailed: summary page, labor per division, item nos., earthworks'], ['simple', '2 – Simple: one table, labor at the end (earlier version)']];
  async function settingsDialog() {
    const I = P.info, S = P.settings;
    const fields = [
      { type: 'h', label: 'Project' },
      { k: 'title', label: 'Project name', value: I.title },
      { k: 'type', label: 'Building type', type: 'select', value: I.type, options: [['Residential', 'Residential'], ['Commercial', 'Commercial']] },
      { k: 'owner', label: 'Owner', value: I.owner, pair: true }, { k: 'ownerAddress', label: 'Owner address', value: I.ownerAddress },
      { k: 'location', label: 'Project location', value: I.location },
      { k: 'province', label: 'Province', value: I.province, pair: true }, { k: 'municipality', label: 'Municipality', value: I.municipality },
      { k: 'architect', label: 'Architect', value: I.architect, pair: true }, { k: 'engineer', label: 'Civil engineer', value: I.engineer },
      { k: 'electrical', label: 'Electrical engineer', value: I.electrical || '', pair: true }, { k: 'plumber', label: 'Master plumber', value: I.plumber || '' },
      { k: 'drawnBy', label: 'Drawn by', value: I.drawnBy, pair: true }, { k: 'projectNo', label: 'Project no.', value: I.projectNo },
      { k: 'sheet', label: 'Sheet size', type: 'select', value: I.sheet, options: Object.keys(AP.SHEET_SIZES).map(k => [k, k]) },
      { k: 'units', label: 'Units', type: 'select', value: S.units || 'mm', options: Object.entries(AP.UNITS).map(([k, u]) => [k, u.label]) },
      { type: 'h', label: 'Walls & heights' },
      { k: 'extWall', label: 'Exterior wall thk.', type: 'len', value: S.extWall, pair: true }, { k: 'intWall', label: 'Interior wall thk.', type: 'len', value: S.intWall },
      { k: 'floorHt', label: 'Floor to top of beam', type: 'len', value: S.floorHt, pair: true }, { k: 'ceilingHt', label: 'Ceiling ht.', type: 'len', value: S.ceilingHt },
      { k: 'doorHt', label: 'Door/window head', type: 'len', value: S.doorHt, pair: true }, { k: 'plinth', label: 'NGL to FFL', type: 'len', value: S.plinth },
      { k: 'slab', label: 'Slab thickness', type: 'len', value: S.slab, pair: true }, { k: 'beamDepth', label: 'Beam depth', type: 'len', value: S.beamDepth },
      { k: 'tileHt', label: 'Toilet wall tile ht.', type: 'len', value: S.tileHt },
      { k: 'extFinish', label: 'Exterior wall finish', type: 'select', value: S.extFinish || AP.FINISHES.exterior[0], options: AP.FINISHES.exterior.map(v => [v, v]) },
      { k: 'doorClear', label: 'Min. door to wall/column', type: 'len', value: S.doorClear != null ? S.doorClear : 0.10, pair: true },
      { k: 'winClear', label: 'Min. window to wall/column', type: 'len', value: S.winClear != null ? S.winClear : 0.05 },
      { type: 'h', label: 'Dimensions' },
      { k: 'dimOpenings', label: 'Show the inner dimension string (doors & windows) on the floor plans', type: 'checkbox', value: S.dimOpenings !== false },
      { k: 'gutters', label: 'Gutters on the roof eaves (roof plan, elevations, sections, gutter detail) – each roof can also turn them off', type: 'checkbox', value: S.gutters !== false },
      { k: 'finNotes', label: 'Finish notes in the sections', type: 'select', value: S.finNotes || 'keyed', options: [['keyed', 'Numbered pointers + FINISHES legend (default)'], ['inside', 'Inside the rooms'], ['leader', 'Outside, with leader lines & arrows'], ['off', 'Off – no finish notes']] },
      { type: 'h', label: 'Bill of materials & cost estimate' },
      { k: 'bomTemplate', label: 'Bill of materials template', type: 'select', value: S.bomTemplate || 'full', options: BOM_TPL },
      { k: 'laborPct', label: 'Labor (% of the cost of materials)', type: 'number', step: 1, value: S.laborPct != null ? S.laborPct : 40 },
      { k: 'contPct', label: 'Contingency % (template 1, 0 = none)', type: 'number', step: 1, value: S.contPct || 0, pair: true }, { k: 'ocmPct', label: 'Overhead & profit %', type: 'number', step: 1, value: S.ocmPct || 0 },
      { k: 'vatPct', label: 'VAT % (12 if a contractor bills it, 0 = none)', type: 'number', step: 1, value: S.vatPct || 0 },
      { k: 'bomBy', label: 'Prepared by (blank = the architect / engineer)', value: I.bomBy || '', pair: true }, { k: 'bomRole', label: 'Profession', value: I.bomRole || '' },
      { k: 'prcNo', label: 'PRC no.', value: I.prcNo || '', pair: true }, { k: 'ptrNo', label: 'PTR no.', value: I.ptrNo || '' },
      { k: 'tin', label: 'TIN', value: I.tin || '', pair: true }, { k: 'checkedBy', label: 'Checked by', value: I.checkedBy || '' },
      { k: 'costMode', label: 'Cost estimate', type: 'select', value: S.costMode || 'bom', options: [['bom', 'Bill of materials (itemized) + labor'], ['sqm', 'Per sq.m. of floor area'], ['both', 'Both – bill of materials, and per sq.m. to compare']] },
      { k: 'costSqm', label: 'Price per sq.m. of floor area (PHP, materials & labor; 0 = suggested from the bill of materials)', type: 'number', step: 100, value: S.costSqm || 0 },
      { k: 'genNotesAt', label: 'General architectural notes', type: 'select', value: S.genNotesAt || 'dw', options: [['dw', 'Beside the doors & windows schedule (sections sheet)'], ['plans', 'With the floor plan & roof plan'], ['off', 'Off – not on the drawings']] },
      { k: 'finNotesEl', label: 'Finish notes in the elevations', type: 'select', value: S.finNotesEl || 'keyed', options: [['keyed', 'Numbered pointers + FINISHES legend (default)'], ['leader', 'Beside, with leader lines & arrows'], ['off', 'Off – no finish notes']] },
      { k: 'showFFL', label: 'Show the finish floor level (FFL ±0.00) in every room on the floor plans', type: 'checkbox', value: S.showFFL !== false },
      { k: 'gridBubbles', label: 'Show the grid bubbles (A, B, C / 1, 2, 3) on the plans', type: 'checkbox', value: S.gridBubbles !== false },
      { type: 'h', label: 'Roof' },
      { k: 'roofType', label: 'Roof design', type: 'select', value: S.roofType, options: AP.ROOF_TYPES },
      { k: 'roofPitch', label: 'Slope (rise / run)', type: 'number', value: S.roofPitch, pair: true }, { k: 'overhang', label: 'Overhang', type: 'len', value: S.overhang },
      { k: 'parapet', label: 'Parapet ht. (flat roof)', type: 'len', value: S.parapet },
      { type: 'h', label: 'Structural' },
      { k: 'soil', label: 'Soil bearing (kPa)', type: 'number', value: S.soil, step: 1, pair: true }, { k: 'footDepth', label: 'Footing depth', type: 'len', value: S.footDepth },
      { type: 'h', label: 'ArkiPlan – Developed by Darvin' + (NP() ? ' · ' + (pro.active || cachedPro() ? 'Pro active' : trialLeft() > 0 ? 'trial ' + Math.ceil(trialLeft()) + ' d left' : 'trial ended') : '') }
    ];
    const v = await modal('Project settings', fields, 'Save', P.floors.length > 1 ? { text: 'Delete this floor', value: 'delfloor', cls: 'danger' } : null);
    if (!v) return;
    if (v === 'delfloor') {
      if (!(await confirmBox('Delete ' + P.floors[fi].name + '?', 'All rooms, doors and windows on this floor will be removed.', 'Delete'))) return;
      commit(); P.floors.splice(fi, 1); P.floors.forEach((f, i) => { f.name = AP.floorName(i); }); fi = Math.max(0, fi - 1); sel = null; changed(); return;
    }
    commit();
    const SK = AP.defaultSettings(I.type);
    for (const [k, val] of Object.entries(v)) { if (k in SK || k in S) S[k] = val; else I[k] = val; }
    changed();
  }

  /* ---------- unit prices of the bill of materials (P.bomPrices: only the ones the user changed) ---------- */
  async function bomPricesDialog() {
    const BP = AP.BOM_PRICES, own = P.bomPrices || {}, keys = Object.keys(BP);
    // grouped by division; how much of each this project uses (from the bill of materials)
    const used = {};
    try { for (const s of AP.bom(P).secs) for (const it of s.items) { const u = used[it.key] || (used[it.key] = { q: 0, a: 0 }); u.q += it.qty; u.a += it.amt; } } catch (e) { /* no rooms yet */ }
    const inGroup = new Set(AP.BOM_GROUPS.flatMap(g => g[1]));
    const groups = [...AP.BOM_GROUPS, ['OTHER', keys.filter(k => !inGroup.has(k))]].map(([n, ks]) => [n, ks.filter(k => BP[k])]).filter(g => g[1].length);
    const item = k => {
      const u = used[k], ch = own[k] != null;
      return `<label class="bpItem" data-k="${k}" data-used="${u ? 1 : 0}" data-name="${esc((BP[k][0] + ' ' + BP[k][1]).toLowerCase())}">${esc(BP[k][0])}${ch ? ' <span style="color:var(--accent,#1976d2)">● changed</span>' : ''}
        <span class="muted" style="font-weight:400">per ${esc(BP[k][1])} · default ${AP.peso(BP[k][2])}${u ? ' · this project: ' + (Math.round(u.q * 100) / 100) + ' ' + esc(BP[k][1]) + ' = PHP ' + AP.peso(u.a) : ' · not used in this project'}</span>
        <input type="number" inputmode="decimal" step="0.01" min="0" id="bp_${k}" value="${ch ? own[k] : ''}" placeholder="${BP[k][2]}"></label>`;
    };
    const nOwn = Object.keys(own).length;
    const html = `<div class="form"><p class="muted small">Unit prices in PHP. Defaults: Philippine market averages, 2026 – put your supplier's prices. Blank = default.${nOwn ? ' ' + nOwn + ' price' + (nOwn > 1 ? 's' : '') + ' changed.' : ''}</p>
      <input id="bpFind" type="search" placeholder="Search a material… (e.g. cement, 10mm, tiles)" autocomplete="off">
      <label class="chk"><input type="checkbox" id="bpUsed"> Only the materials used in this project</label>
      ${groups.map(([n, ks]) => `<div class="bpGrp"><h4>${esc(n)}</h4>${ks.map(item).join('')}</div>`).join('')}
      <p class="muted small" id="bpNone" hidden>No material matches.</p></div>`;
    const pv = modal('Bill of materials – unit prices', html, 'Save', { text: 'All defaults', value: 'reset' });
    const filt = () => {
      const q = $('bpFind').value.trim().toLowerCase().split(/\s+/).filter(Boolean), only = $('bpUsed').checked;
      let any = false;
      document.querySelectorAll('#mBody .bpGrp').forEach(g => {
        let vis = 0;
        g.querySelectorAll('.bpItem').forEach(l => { const ok = (!only || l.dataset.used === '1') && q.every(w => l.dataset.name.includes(w) || g.querySelector('h4').textContent.toLowerCase().includes(w)); l.hidden = !ok; if (ok) vis++; });
        g.hidden = !vis; if (vis) any = true;
      });
      $('bpNone').hidden = any;
    };
    $('bpFind').oninput = filt; $('bpUsed').onchange = filt;
    setTimeout(() => $('bpFind').focus(), 60);
    const v = await pv;
    if (!v) return;
    commit();
    if (v === 'reset') delete P.bomPrices;
    else { const o = {}; for (const k of keys) { const el = $('bp_' + k), n = el && el.value !== '' ? +el.value : NaN; if (n >= 0 && n !== BP[k][2]) o[k] = n; } P.bomPrices = o; }
    changed(); toast('Prices saved – the bill of materials is updated', 1800);
  }

  /* ---------- scale of the drawings on a sheet: Auto (largest that fits) or a scale the user picks ---------- */
  async function scaleDialog(sh) {
    const vs = (sh.views || []).filter(v => !v.nts), ns = (sh.views || []).filter(v => v.nts);
    const SC = P.sheetScales || {}, opts = [['', 'Auto (largest that fits)'], ...AP.SHEET_SCALES.map(n => [String(n), '1:' + n])];
    // tables / notes / diagrams (N.T.S.): a size the user picks, 100 % = normal
    const TZ = P.tableSizes || {}, zopts = [50, 60, 70, 80, 90, 100, 110, 125, 150].map(n => [String(n / 100), n + ' %' + (n === 100 ? ' (normal)' : '')]);
    const html = `<div class="form">${vs.map((v, i) => `<label>${esc(v.title)}<select id="sc_${i}">${opts.map(o => `<option value="${o[0]}"${String(SC[v.title] || '') === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>`).join('')}
      ${ns.length ? '<h4>Size of the tables &amp; notes</h4>' + ns.map((v, i) => `<label>${esc(v.title)}<select id="tz_${i}">${zopts.map(o => `<option value="${o[0]}"${String(TZ[v.title] || 1) === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>`).join('') : ''}
      <p class="muted small">Drawings that belong together (e.g. all floor plans, the lighting &amp; power layouts) keep one scale: picking it for one sets the others on this sheet too. A drawing too big for its space at the scale you pick may run over the next one – pick a smaller scale (bigger number) then. A smaller table leaves more room for the drawings; a table too big for its space is made smaller to fit.</p></div>`;
    if (!(await modal(sh.no + ' – drawing scale & table size', html, 'Save', { text: 'All auto', value: 'auto' }).then(v => { if (v === 'auto') { vs.forEach((q, i) => { $('sc_' + i).value = ''; }); ns.forEach((q, i) => { $('tz_' + i).value = '1'; }); return true; } return v; }))) return;
    commit();
    const tz = Object.assign({}, P.tableSizes || {});
    ns.forEach((v, i) => { const f = +$('tz_' + i).value || 1; if (f === 1) delete tz[v.title]; else tz[v.title] = f; });
    P.tableSizes = tz;
    const out = Object.assign({}, P.sheetScales || {});
    vs.forEach((v, i) => {
      const n = +$('sc_' + i).value || 0;
      const same = v.group ? vs.filter(q => q.group === v.group) : [v];
      if (String(n || '') === String(SC[v.title] || '')) return; // unchanged
      for (const q of same) { if (n) out[q.title] = n; else delete out[q.title]; }
    });
    P.sheetScales = out;
    changed();
    toast('Scales saved – ' + sh.no, 1500);
  }

  /* ---------- exports ---------- */
  // PDF (all): first a full-screen preview of every sheet, then Download PDF from there
  function exportPDF() {
    toast('Building the sheets…', 1500);
    setTimeout(() => {
      const S = getSheets();
      const pages = S.map(s => { if (!s.cache) s.cache = s.draw(); return { drawing: s.cache, W: s.W, H: s.H, label: s.no + ' · ' + s.contents }; });
      previewPages('Plan set – preview', pages.length + ' sheet' + (pages.length > 1 ? 's' : '') + ' · ' + (P.info.sheet || 'A3'), pages, () => {
        toast('Saving the PDF…', 1500);
        setTimeout(() => saveFile(fileBase() + '_plans.pdf', 'application/pdf', AP.toPDF(pages)), 30);
      });
    }, 30);
  }
  // the bill of materials & cost estimate: a PDF of its own (A4), not part of the plan set
  // BOM (PDF): first a full-screen preview of every page, then Download PDF from there
  function exportBOM() {
    toast('Building the bill of materials…', 1200);
    setTimeout(openBOMView, 30);
  }
  function openBOMView() {
    const pages = AP.bomPages(P), md = P.settings.costMode || 'bom', total = md === 'sqm' ? AP.costSqm(P).total : AP.bom(P).total, tpl = P.settings.bomTemplate || 'full';
    // template 1 / 2 picked right in the preview: the pages are made again with it
    const pick = `<select id="bvTpl" style="max-width:190px" title="Template of the BOM">${BOM_TPL.map(o => `<option value="${o[0]}"${tpl === o[0] ? ' selected' : ''}>Template ${esc(o[1].split(':')[0])}</option>`).join('')}</select>`;
    previewPages('Bill of materials – preview', pages.length + ' page' + (pages.length > 1 ? 's' : '') + ' · total PHP ' + AP.peso(total), pages, () => {
      toast('Saving the PDF…', 1200);
      setTimeout(() => saveFile(fileBase() + '_bill_of_materials.pdf', 'application/pdf', AP.toPDF(pages)), 30);
    }, pick);
    $('bvTpl').onchange = e => {
      commit(); P.settings.bomTemplate = e.target.value; changed();
      toast(e.target.value === 'simple' ? 'Template 2 – simple (earlier version)' : 'Template 1 – detailed', 1400);
      setTimeout(openBOMView, 30);
    };
  }
  // full-screen viewer of PDF pages (zoom − / +, scroll), Download PDF / Close
  function previewPages(title, info, pages, onSave, extra) {
    let ov = $('bomView');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'bomView';
      ov.style.cssText = 'position:fixed;inset:0;z-index:30;background:#3a4450;display:none;flex-direction:column';
      document.body.appendChild(ov);
    }
    let zoom = 1;
    const land = pages.some(p => p.W > p.H), maxW = land ? 1400 : 900;
    const bar = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top));background:#1d2a36;color:#fff';
    const b = (id, t, cls) => `<button id="${id}" class="${cls || 'ghost'}" style="${cls ? '' : 'background:#2f3f4e;color:#fff;border-color:#45576a'}">${t}</button>`;
    ov.innerHTML = `<div style="${bar}">
        <b style="font-size:15px;margin-right:auto">${esc(title)} <span style="font-weight:400;opacity:.8">· ${esc(info)}</span></b>
        ${extra || ''}${b('bvOut', '&minus;')}<span id="bvZ" style="min-width:44px;text-align:center">100%</span>${b('bvIn', '+')}
        ${b('bvSave', '&#128196; Download PDF', 'primary')}${b('bvClose', '&#10005; Close')}
      </div>
      <div id="bvPages" style="flex:1;overflow:auto;padding:14px;-webkit-overflow-scrolling:touch">
        ${pages.map((p, i) => `<div class="bvPg" style="margin:0 auto 14px;max-width:${maxW}px">
          <svg viewBox="0 0 ${p.W} ${p.H}" style="display:block;width:100%;height:auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)" xmlns="http://www.w3.org/2000/svg">${AP.toSVG(p.drawing)}</svg>
          <div style="color:#cfd8e0;font-size:12px;text-align:center;margin-top:4px">${esc(p.label || 'Page ' + (i + 1))} &nbsp;·&nbsp; ${i + 1} of ${pages.length}</div></div>`).join('')}
      </div>`;
    ov.style.display = 'flex';
    const setZ = z => {
      zoom = Math.max(1, Math.min(4, z)); $('bvZ').textContent = Math.round(zoom * 100) + '%';
      ov.querySelectorAll('.bvPg').forEach(el => { el.style.maxWidth = zoom === 1 ? maxW + 'px' : 'none'; el.style.width = zoom === 1 ? '' : (zoom * 100) + '%'; });
    };
    $('bvIn').onclick = () => setZ(zoom + 0.5); $('bvOut').onclick = () => setZ(zoom - 0.5);
    $('bvClose').onclick = () => { ov.style.display = 'none'; ov.innerHTML = ''; };
    $('bvSave').onclick = () => requirePro(onSave);
  }
  function exportDXF() { requirePro(exportDXFNow); }
  function exportDXFNow() {
    const ts = 0.1, out = new AP.Drawing();
    const views = [];
    P.floors.forEach((f, i) => { if (f.rooms.length) views.push([f.name + ' PLAN', AP.renderPlan(P, i, { ts })]); });
    views.push(['ROOF PLAN', AP.renderRoofPlan(P, { ts })]);
    for (const k of 'SNWE') views.push([AP.ELEV[k].title, AP.renderElevation(P, k, { ts })]);
    views.push(['SECTION A', AP.renderSection(P, 'A', { ts })], ['SECTION B', AP.renderSection(P, 'B', { ts })]);
    views.push(['FOUNDATION PLAN', AP.renderFoundation(P, { ts })]);
    let x = 0, y = 0, rowH = 0, col = 0;
    for (const [title, d] of views) {
      const b = d.bbox(); if (!b) continue;
      out.append(d.transform(1, x - b.x0, y - b.y0));
      out.text(x + b.w / 2, y + b.h + 1.2, title, 0.45, { anchor: 'middle', bold: true });
      rowH = Math.max(rowH, b.h + 3); x += b.w + 4; col++;
      if (col === 3) { col = 0; x = 0; y += rowH; rowH = 0; }
    }
    saveFile(fileBase() + '_model.dxf', 'application/dxf', AP.toDXF(out, 1000));
  }
  function exportPNG(S) { requirePro(() => exportPNGNow(S)); }
  function exportPNGNow(S) {
    if (!S.cache) S.cache = S.draw();
    const dpi = 150, px = S.W / 25.4 * dpi, py = S.H / 25.4 * dpi;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${py}" viewBox="0 0 ${S.W} ${S.H}"><rect width="100%" height="100%" fill="#fff"/>${AP.toSVG(S.cache)}</svg>`;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = px; c.height = py;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, py); g.drawImage(img, 0, 0, px, py);
      c.toBlob(b => {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
          b.arrayBuffer().then(ab => saveFile(fileBase() + '_' + S.no + '.png', 'image/png', new Uint8Array(ab)));
        } else saveFile(fileBase() + '_' + S.no + '.png', 'image/png', b);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // expose for debugging/tests
  window.ArkiPlan = { get project() { return P; }, get preview() { return preview; }, get gesture() { return gesture; }, openProject, refresh, setTab, sub };

  renderHome();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
})(window.AP);
