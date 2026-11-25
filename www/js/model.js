/* ArkiPlan – project data model, templates and local storage. All lengths in metres. */
window.AP = window.AP || {};
(function (AP) {
  'use strict';

  AP.ROOM_TYPES = {
    living:   { label: 'Living Room',     color: '#fdf3d8' },
    dining:   { label: 'Dining',          color: '#fde9d4' },
    kitchen:  { label: 'Kitchen',         color: '#e6f3dc' },
    master:   { label: 'Master Bedroom',  color: '#dbe6f7' },
    bedroom:  { label: 'Bedroom',         color: '#e1ecf8' },
    toilet:   { label: 'Toilet & Bath',   color: '#d6eff2', wet: true },
    laundry:  { label: 'Laundry Area',    color: '#e7eef0', wet: true },
    stairs:   { label: 'Stairs',          color: '#eeeeee' },
    hall:     { label: 'Hallway',         color: '#f4f1ea' },
    office:   { label: 'Office',          color: '#ece4f6' },
    store:    { label: 'Commercial Space', color: '#f6e3ea' },
    storage:  { label: 'Storage',         color: '#efe9e1' },
    garage:   { label: 'Garage',          color: '#ececec' },
    carport:  { label: 'Carport',         color: '#ececec', open: true },
    porch:    { label: 'Porch / Lanai',   color: '#eef5e3', open: true },
    balcony:  { label: 'Balcony',         color: '#eef5e3', open: true },
    open:     { label: 'Open Space',      color: '#f5f5f5', open: true },
    other:    { label: 'Other',           color: '#f5f5f5' }
  };

  AP.DOOR_TPL = {
    D1: { name: 'Main Door (Wood Panel)',  w: 0.90, h: 2.10, style: 'swing',   desc: 'WOOD PANEL DOOR' },
    D2: { name: 'Bedroom Door (Flush)',    w: 0.80, h: 2.10, style: 'swing',   desc: 'FLUSH DOOR, MARINE PLYWOOD' },
    D3: { name: 'Toilet Door (PVC)',       w: 0.70, h: 2.10, style: 'swing',   look: 'pvc', desc: 'PVC DOOR W/ LOUVER & LEVER HANDLE' },
    D4: { name: 'Double Swing Door',       w: 1.50, h: 2.10, style: 'double',  desc: 'DOUBLE PANEL DOOR' },
    D5: { name: 'Sliding Glass Door',      w: 1.80, h: 2.10, style: 'sliding', desc: 'ALUM. SLIDING DOOR W/ 6mm THK. GLASS' },
    D6: { name: 'Roll-up Door',            w: 3.00, h: 2.70, style: 'rollup',  desc: 'STEEL ROLL-UP DOOR' },
    D7: { name: 'Exit Door (fire exit, swings out)', w: 0.90, h: 2.10, style: 'swing', exit: true, desc: 'STEEL FIRE EXIT DOOR W/ PANIC BAR & DOOR CLOSER, SWING OUT' }
  };
  AP.WIN_TPL = {
    W1: { name: 'Sliding Window',         w: 1.20, h: 1.20, sill: 0.90, style: 'sliding',  desc: 'ALUM. POWDER COATED SLIDING WINDOW W/ 6mm THK. GLASS' },
    W2: { name: 'Wide Sliding Window',    w: 2.00, h: 1.20, sill: 0.90, style: 'sliding',  desc: 'ALUM. POWDER COATED SLIDING WINDOW W/ 6mm THK. GLASS' },
    W3: { name: 'Casement Window (Single)', w: 0.60, h: 1.20, sill: 0.90, style: 'casement', desc: 'ALUM. CASEMENT WINDOW W/ 6mm THK. GLASS' },
    W4: { name: 'Awning Window (T&B)',    w: 0.60, h: 0.50, sill: 1.60, style: 'awning',   desc: 'ALUM. AWNING WINDOW W/ FROSTED GLASS' },
    W5: { name: 'Fixed Glass Window',     w: 1.50, h: 1.50, sill: 0.60, style: 'fixed',    desc: 'ALUM. FIXED GLASS WINDOW W/ 6mm THK. GLASS' },
    W6: { name: 'Storefront Glass',       w: 3.00, h: 2.40, sill: 0.30, style: 'fixed',    desc: 'ALUM. STOREFRONT W/ 10mm THK. TEMPERED GLASS' },
    W7: { name: 'Jalousie Window',        w: 0.90, h: 1.20, sill: 0.90, style: 'jalousie', desc: 'ALUM. JALOUSIE WINDOW W/ 6mm THK. CLEAR GLASS BLADES' },
    W8: { name: 'Jalousie Window (T&B)',  w: 0.60, h: 0.60, sill: 1.50, style: 'jalousie', desc: 'ALUM. JALOUSIE WINDOW W/ FROSTED GLASS BLADES' },
    W9: { name: 'Casement Window (Double)', w: 1.20, h: 1.20, sill: 0.90, style: 'casement', desc: 'ALUM. DOUBLE CASEMENT WINDOW W/ 6mm THK. GLASS' },
    W10: { name: 'Awning Window',         w: 1.00, h: 0.60, sill: 1.50, style: 'awning',   desc: 'ALUM. AWNING WINDOW W/ 6mm THK. GLASS' }
  };
  // roof designs common in Philippine houses
  AP.ROOF_TYPES = [
    ['hip', 'Hip roof (most common)'],
    ['gable', 'Gable roof'],
    ['dutch', 'Dutch gable / hip-and-gable'],
    ['kubo', 'Steep hip – Bahay Kubo / Bahay na Bato style'],
    ['shed', 'Shed / mono-slope (modern)'],
    ['clerestory', 'Double shed – OPPOSITE slopes (front & back), clerestory between / split shed'],
    ['doubleshed', 'Double shed – SAME direction, high & low roofs, clerestory between'],
    ['butterfly', 'Butterfly / V-roof (modern)'],
    ['parapet', 'Modern box – roof hidden behind parapet'],
    ['flat', 'Flat R.C. roof deck']
  ];
  AP.isBoxRoof = t => t === 'flat' || t === 'parapet';
  AP.isHalfTruss = t => t === 'shed' || t === 'doubleshed' || t === 'clerestory'; // mono-pitch: half trusses
  /* ---------- truss types (P.trussTypes): mark, full / half, web style, material, member sizes ---------- */
  AP.TRUSS_STYLES = [['pratt', 'Pratt – verticals, diagonals down to the middle'], ['howe', 'Howe – verticals, diagonals down to the ends'], ['warren', 'Warren – zig-zag webs'],
    ['fink', 'Fink / W'], ['king', 'King post'], ['queen', 'Queen post']];
  AP.TRUSS_MATS = {
    steel: { name: 'STEEL C-CHANNEL', chord: '2 - C 75x50x15x2.0mm', web: 'C 75x50x15x1.5mm', joint: 'GUSSET PLATES: 6mm THK. W/ E70 FILLET WELD', depth: 0.075 },
    tubular: { name: 'STEEL TUBULAR', chord: '50x100x1.5mm STEEL TUBE', web: '50x50x1.5mm STEEL TUBE', joint: 'ALL JOINTS FULLY WELDED, E70 ELECTRODE', depth: 0.10 },
    wood: { name: 'WOOD (GOOD LUMBER)', chord: '2"x6" S4S GOOD LUMBER', web: '2"x4" S4S GOOD LUMBER', joint: 'GUSSETS: 12mm MARINE PLYWOOD, NAILED & BOLTED', depth: 0.15 }
  };
  AP.trussTypes = P => (P.trussTypes && P.trussTypes.length ? P.trussTypes : [
    { id: 'T1', mark: 'T-1', kind: 'full', style: 'pratt', mat: 'steel' },
    { id: 'HT1', mark: 'HT-1', kind: 'half', style: 'pratt', mat: 'steel' }]);
  AP.trussType = (P, id) => AP.trussTypes(P).find(t => t.id === id) || AP.trussTypes(P)[0];
  AP.trussMembers = t => { const M = AP.TRUSS_MATS[t.mat] || AP.TRUSS_MATS.steel; return { mat: M.name, chord: t.chord || M.chord, web: t.web || M.web, joint: M.joint, depth: t.depth || M.depth }; };
  // the type of a roof's automatic trusses: the roof's choice, else full / half (old projects), else half on mono-pitch roofs
  AP.roofTrussType = (P, R) => {
    const T = AP.trussTypes(P), sp = R.sp || {};
    if (sp.trussType && T.some(t => t.id === sp.trussType)) return AP.trussType(P, sp.trussType);
    const half = sp.truss ? sp.truss === 'half' : AP.isHalfTruss(R.type);
    return T.find(t => t.kind === (half ? 'half' : 'full')) || T[0];
  };
  AP.halfTruss = R => !!R && (R.tt ? R.tt.kind === 'half' : R.sp && R.sp.truss ? R.sp.truss === 'half' : AP.isHalfTruss(R.type));
  AP.trussMax = R => (R && R.sp && R.sp.trussSp) || 1.0; // max. truss spacing

  /* ---------- wall materials (drawn walls, walls on the roof beams) ----------
   * t = usual thickness, fill = plan colour, c3 = 3D colour, short = plan label */
  AP.WALL_MATERIALS = [
    { k: 'chb', name: 'CHB (CONCRETE HOLLOW BLOCKS), PLASTERED', short: 'CHB', t: 0.10, fill: '#6b6b6b', c3: '#f2efe8' },
    { k: 'conc', name: 'REINFORCED CONCRETE WALL', short: 'RC WALL', t: 0.15, fill: '#3a3a3a', c3: '#d9d6cf' },
    { k: 'brick', name: 'CLAY BRICK, PLASTERED', short: 'BRICK', t: 0.10, fill: '#8a4b3a', c3: '#efe6dc' },
    { k: 'drywall', name: 'GYPSUM BOARD ON METAL STUDS (DRYWALL)', short: 'DRYWALL', t: 0.10, fill: '#b8b8b8', c3: '#fbfbf8' },
    { k: 'fcb', name: 'FIBER CEMENT BOARD ON METAL STUDS', short: 'FCB', t: 0.10, fill: '#a3a39a', c3: '#ecebe4' },
    { k: 'wood', name: 'PLYWOOD / WOOD PANEL ON WOOD STUDS', short: 'WOOD', t: 0.075, fill: '#a0784c', c3: '#c89a68' },
    { k: 'glass', name: 'GLASS BLOCKS', short: 'GLASS BLOCK', t: 0.10, fill: '#9cc3dc', c3: '#cfe3ef' }
  ];
  AP.wallMat = k => AP.WALL_MATERIALS.find(m => m.k === k) || AP.WALL_MATERIALS[0];

  /* ---------- finishes (schedule of finishes) ---------- */
  AP.FINISHES = {
    floor: ['600x600mm POLISHED PORCELAIN TILES', '600x600mm CERAMIC FLOOR TILES', '300x300mm NON-SKID CERAMIC TILES', '400x400mm ANTI-SLIP OUTDOOR TILES',
      'GRANITE TILES', 'LAMINATED WOOD FLOORING', 'VINYL PLANK FLOORING', 'PLAIN CEMENT FINISH', 'BRUSHED CONCRETE FINISH'],
    wall: ['PLAIN CEMENT PLASTER, PAINT FINISH', 'SKIM COAT, PAINT FINISH', '300x600mm GLAZED WALL TILES', 'TILE BACKSPLASH 600mm ABOVE COUNTER, PAINT FINISH',
      'TEXTURED PAINT FINISH', 'EXPOSED FAIR-FACED CHB, PAINTED'],
    ceiling: ['4.5mm FIBER CEMENT BOARD ON METAL FURRING, PAINTED', 'GYPSUM BOARD ON METAL FURRING, PAINTED', 'PVC CEILING PANELS',
      'EXPOSED SLAB SOFFIT, PAINTED', 'NO CEILING / EXPOSED ROOF FRAMING'],
    exterior: ['PLAIN CEMENT PLASTER, PAINT FINISH', 'TEXTURED PAINT FINISH', 'STONE CLADDING ACCENT, PAINT FINISH', 'FIBER CEMENT BOARD CLADDING, PAINTED']
  };
  AP.defaultFinish = function (type) {
    const f = { floor: '600x600mm POLISHED PORCELAIN TILES', wall: 'PLAIN CEMENT PLASTER, PAINT FINISH', ceiling: '4.5mm FIBER CEMENT BOARD ON METAL FURRING, PAINTED', tileHt: 0 };
    switch (type) {
      case 'toilet': return Object.assign(f, { floor: '300x300mm NON-SKID CERAMIC TILES', wall: '300x600mm GLAZED WALL TILES', ceiling: 'PVC CEILING PANELS', tileHt: 1.5 });
      case 'laundry': return Object.assign(f, { floor: '300x300mm NON-SKID CERAMIC TILES', wall: '300x600mm GLAZED WALL TILES', tileHt: 1.2 });
      case 'kitchen': return Object.assign(f, { floor: '600x600mm CERAMIC FLOOR TILES', wall: 'TILE BACKSPLASH 600mm ABOVE COUNTER, PAINT FINISH', tileHt: 0 });
      case 'garage': case 'carport': return Object.assign(f, { floor: 'BRUSHED CONCRETE FINISH', ceiling: type === 'carport' ? 'NO CEILING / EXPOSED ROOF FRAMING' : f.ceiling });
      case 'porch': case 'balcony': return Object.assign(f, { floor: '400x400mm ANTI-SLIP OUTDOOR TILES' });
      case 'storage': return Object.assign(f, { floor: 'PLAIN CEMENT FINISH' });
      case 'stairs': return Object.assign(f, { floor: 'GRANITE TILES' });
      default: return f;
    }
  };
  AP.roomFinish = r => Object.assign(AP.defaultFinish(r.type), r.finish || {});
  // the wall finish above the wall tiles (toilets, laundry): the room's own, else plaster & paint
  AP.wallAbove = f => (f && f.wallAbove) || 'PLAIN CEMENT PLASTER, PAINT FINISH';
  // a room can have more than one floor / wall / ceiling material: stored as "MAT 1 + MAT 2"
  AP.FIN_SEP = ' + ';
  // per room: wall finish of one side (overrides the room's wall finish), ceiling, floor level
  //   r.wallFin = {N: {wall, tileHt}, ...}   r.ceilType 'flat' | 'none'   r.ceilHt (m)   r.floorDrop (m below FFL)
  AP.SIDES = ['N', 'E', 'S', 'W'];
  // storey heights: floor.ht = FFL of that floor to the top of the beam above (else the project setting)
  // slab under a room: its own thickness (uneven floors) or the project's (ground slab on grade 100)
  AP.slabThk = (r, S, ground) => (r && r.slabThk) || (ground ? 0.10 : S.slab);
  // walls standing on the roof beams (parapet, fire wall, upper gable wall): P.roofWalls = [{id, o, c, a, b, t, h}]
  AP.roofWalls = P => P.roofWalls || [];
  // stairs in a 'stairs' room, up along its longer side: a straight flight in a narrow room, a U-type (dog-leg)
  // stair with a landing at the far end when the room is 2.0 m wide or more; treads ~250, risers = floor height / count
  AP.stairGeom = function (r, H) {
    const alongX = r.w >= r.l, run = alongX ? r.w : r.l, wid = alongX ? r.l : r.w;
    if (wid >= 2.0) {
      const fw = (wid - 0.1) / 2, Ld = Math.max(1.0, Math.min(fw, 1.5)), a0 = 0.05, Lf = Math.max(0.5, run - Ld - a0);
      const n = Math.max(2, Math.floor(Lf / 0.25 + 1e-6)), t = Math.min(0.3, Lf / n), risers = 2 * (n + 1);
      return { type: 'U', alongX, run, wid, fw, Ld, a0, n, t, risers, rise: H / risers, treads: 2 * n };
    }
    const a0 = 0.15, n = Math.max(2, Math.floor((run - 0.3) / 0.25)), t = Math.min(0.25, (run - 0.3) / n), risers = n + 1;
    return { type: 'I', alongX, run, wid, a0, n, t, risers, rise: H / risers, treads: n };
  };
  AP.floorH = (P, fi) => ((P.floors[fi] && P.floors[fi].ht) || P.settings.floorHt);
  AP.levelZ = (P, fi) => { let z = 0; for (let k = 0; k < fi; k++) z += AP.floorH(P, k); return z; };
  AP.wallFinish = (r, side) => {
    const f = AP.roomFinish(r), o = (r.wallFin || {})[side] || {};
    return { wall: o.wall || f.wall, tileHt: o.tileHt != null ? o.tileHt : f.tileHt };
  };
  AP.ceilHt = (r, S) => (r.ceilHt != null ? r.ceilHt : S.ceilingHt);
  AP.hasCeiling = r => (r.ceilType === 'none' ? false : r.ceilType === 'flat' ? true : !AP.isOpen(r));
  AP.floorDrop = r => r.floorDrop || 0; // > 0 lowered, < 0 raised (elevated floor, stage, platform)
  AP.flText = r => { const d = AP.floorDrop(r); return Math.abs(d) < 0.001 ? '' : 'FL. ' + (d > 0 ? '-' : '+') + AP.mm(Math.abs(d)); };
  AP.finList = v => String(v || '').split(/\s\+\s/).map(t => t.trim()).filter(Boolean);
  // tile module from a finish text like "600x600mm ..." (metres), or 0
  AP.tileSize = txt => { const m = /(\d{3})\s*x\s*(\d{3})/i.exec(txt || ''); return m ? [+m[1] / 1000, +m[2] / 1000] : null; };
  // Window sill: by default the window head (top) lines up with the door height, so sill = door ht. - window ht.
  // op.align === false keeps the window's own sill (set by hand); windows taller than the doors keep theirs too.
  AP.alignsHead = (op, S) => op.kind === 'window' && op.align !== false && op.h <= S.doorHt + 1e-6;
  AP.opSill = (op, S) => (op.kind === 'door' ? 0 : AP.alignsHead(op, S) ? Math.round((S.doorHt - op.h) * 1000) / 1000 : (op.sill || 0));
  // Furniture you can add yourself (w = width along the wall, l = depth from the wall).
  // block: the user's AGI template block; bw: which block side is its back ('top' or 'left')
  AP.FURN = {
    tv:      { name: 'TV & Console',          w: 1.50, l: 0.45, cat: 'Living' },
    sofa3:   { name: 'Sofa (3-seater)',       w: 2.28, l: 0.95, block: 'SOFA-3', bw: 'left', cat: 'Living' },
    sofa2:   { name: 'Sofa (2-seater)',       w: 1.70, l: 0.77, block: 'SOFA-2', bw: 'left', cat: 'Living' },
    arm:     { name: 'Armchair',              w: 0.80, l: 0.80, cat: 'Living' },
    coffee:  { name: 'Coffee Table',          w: 1.00, l: 0.50, cat: 'Living' },
    cabinet: { name: 'Cabinet / Shelf',       w: 0.90, l: 0.40, cat: 'Living' },
    dine4:   { name: 'Dining Set (4 seats)',  w: 1.99, l: 1.99, block: 'TABLE-2', bw: 'left', cat: 'Dining & Kitchen' },
    dine6:   { name: 'Dining Set (6 seats)',  w: 2.48, l: 1.88, block: 'TABLE-3', bw: 'left', cat: 'Dining & Kitchen' },
    dine8:   { name: 'Dining Set (8 seats)',  w: 2.98, l: 1.98, block: 'TABLE-4', bw: 'left', cat: 'Dining & Kitchen' },
    ref:     { name: 'Refrigerator',          w: 0.75, l: 0.70, block: 'REF-1', bw: 'top', stretch: true, cat: 'Dining & Kitchen' },
    sink2:   { name: 'Kitchen Sink (double)', w: 1.05, l: 0.55, block: 'KS-2', bw: 'top', cat: 'Dining & Kitchen' },
    stove:   { name: 'Stove / Cooktop',       w: 0.60, l: 0.60, block: 'HOB-4', bw: 'top', stretch: true, cat: 'Dining & Kitchen' },
    counter: { name: 'Kitchen Counter',       w: 1.20, l: 0.60, cat: 'Dining & Kitchen' },
    counterL: { name: 'Kitchen Counter (L-shape)', w: 2.40, l: 1.80, cat: 'Dining & Kitchen' },
    sink1:   { name: 'Kitchen Sink (single)', w: 0.80, l: 0.50, block: 'KS-1', bw: 'top', cat: 'Dining & Kitchen' },
    bedQ:    { name: 'Queen Bed + Night Tables', w: 2.68, l: 2.03, block: 'BEDQUEEN', bw: 'top', cat: 'Bedroom' },
    bedF:    { name: 'Full Bed + Night Tables',  w: 2.53, l: 2.03, block: 'BEDFULL', bw: 'top', cat: 'Bedroom' },
    bedS:    { name: 'Single Bed + Night Table', w: 1.82, l: 2.03, block: 'BEDSINGLE', bw: 'top', cat: 'Bedroom' },
    bedM:    { name: 'Single Bed (small)',    w: 0.82, l: 2.03, block: 'BEDMAID', bw: 'top', cat: 'Bedroom' },
    closet:  { name: 'Wardrobe / Closet',     w: 1.20, l: 0.60, cat: 'Bedroom' },
    desk:    { name: 'Study Desk & Chair',    w: 1.20, l: 0.60, cat: 'Bedroom' },
    dresser: { name: 'Dresser / Vanity',      w: 1.00, l: 0.45, cat: 'Bedroom' },
    wm:      { name: 'Washing Machine',       w: 0.60, l: 0.60, block: 'WM-1', bw: 'top', stretch: true, cat: 'Laundry & Bath' },
    tub:     { name: 'Bathtub',               w: 1.69, l: 0.80, block: 'TUB-1', bw: 'left', cat: 'Laundry & Bath' },
    wc:      { name: 'Water Closet',          w: 0.42, l: 0.65, block: 'WC-S', bw: 'top', cat: 'Laundry & Bath' },
    lav:     { name: 'Lavatory',              w: 0.50, l: 0.42, block: 'LAV1-P', bw: 'top', stretch: true, cat: 'Laundry & Bath' },
    shower:  { name: 'Shower Area',           w: 0.90, l: 0.90, block: 'SH-1PLAN', bw: 'top', stretch: true, cat: 'Laundry & Bath' },
    ltub:    { name: 'Laundry Tub',           w: 0.55, l: 0.50, cat: 'Laundry & Bath' },
    fd:      { name: 'Floor Drain',           w: 0.15, l: 0.15, cat: 'Laundry & Bath' },
    car:     { name: 'Car',                   w: 1.80, l: 4.50, cat: 'Outdoor' }
  };
  AP.tplOf = op => (op.kind === 'door' ? AP.DOOR_TPL : AP.WIN_TPL)[op.tpl] || { style: op.kind === 'door' ? 'swing' : 'sliding', name: op.tpl, desc: '' };

  AP.FLOOR_NAMES = ['GROUND FLOOR', 'SECOND FLOOR', 'THIRD FLOOR', 'FOURTH FLOOR', 'FIFTH FLOOR', 'SIXTH FLOOR'];
  AP.floorName = i => AP.FLOOR_NAMES[i] || ((i + 1) + 'TH FLOOR');

  AP.defaultSettings = type => ({
    extWall: 0.15,       // exterior CHB wall thickness
    intWall: 0.10,       // interior partition thickness
    floorHt: 3.00,       // FFL to top of beam / next floor
    ceilingHt: 2.70,     // FFL to ceiling
    doorHt: 2.10,        // doors & window head height
    slab: 0.15,          // suspended slab thickness
    plinth: 0.30,        // NGL to FFL
    beamDepth: 0.40,
    roofType: type === 'Commercial' ? 'shed' : 'hip', // see AP.ROOF_TYPES
    roofPitch: 0.30,     // rise per run
    dimOpenings: true,
    gridBubbles: true,
    showFFL: true,
    finNotes: 'keyed',   // (sections) numbered pointers + FINISHES legend (default); 'inside', 'leader', 'off' = none
    bom: true,           // bill of materials & cost estimate sheet (B-1) in the plan set
    laborPct: 40,        // labor, % of the cost of materials
    bomTemplate: 'full', // bill of materials PDF: 'full' (1 – summary, labor per division) or 'simple' (2 – the earlier one)
    contPct: 0, ocmPct: 0, vatPct: 0, // contingency, overhead & profit, VAT – % (template 1; 0 = not shown)
    costMode: 'bom',     // cost estimate: 'bom' itemized bill of materials + labor, 'sqm' floor area x price per sq.m., 'both'
    costSqm: 0,          // price per sq.m. of floor area, PHP (0 = suggested from the bill of materials)
    genNotesAt: 'dw',    // general architectural notes: 'dw' beside the doors & windows schedule, 'plans' with the floor / roof plans, 'off'
    finNotesEl: 'keyed', // finish notes in the elevations: 'keyed' (numbers + legend, default), 'leader' (beside, arrows), 'off'  // finish notes in the sections: 'inside' the rooms, 'leader' (outside, arrows), 'keyed' (numbers + legend)
    gutters: true,       // gutters + downspouts on the roof eaves (each roof can turn them off)       // finish floor level (FFL +0.00) in every room on the floor plans   // grid bubbles (A, B, C / 1, 2, 3) on the plans   // inner dimension string (doors & windows) on the floor plans
    overhang: 0.85,
    parapet: 1.00,
    soil: 96,            // allowable soil bearing kPa (2000 psf)
    footDepth: 1.50,     // NGL to bottom of footing
    tileHt: 1.50,        // wall tile height in toilets
    doorClear: 0.10,     // min. distance door jamb to wall face / column
    winClear: 0.05,      // min. distance window to wall face / column
    extFinish: 'PLAIN CEMENT PLASTER, PAINT FINISH',
    units: 'mm'          // display / input unit
  });

  AP.uid = () => Math.random().toString(36).slice(2, 10);

  AP.newProject = function (info, settings, nFloors) {
    const floors = [];
    for (let i = 0; i < Math.max(1, nFloors | 0); i++) floors.push({ id: AP.uid(), name: AP.floorName(i), rooms: [], openings: [] });
    return {
      id: AP.uid(), version: 1, created: Date.now(), updated: Date.now(),
      info: Object.assign({
        title: '', owner: '', ownerAddress: '', location: '', province: '', municipality: '',
        type: 'Residential', architect: '', engineer: '', electrical: '', plumber: '', drawnBy: '', projectNo: '', sheet: 'A3'
      }, info),
      settings: Object.assign(AP.defaultSettings(info.type), settings),
      floors,
      sections: { A: null, B: null }
    };
  };

  /* ------------- storage (device-local) ------------- */
  const KI = 'arkiplan.index', KP = 'arkiplan.p.';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  AP.store = {
    list() { try { return JSON.parse(get(KI) || '[]'); } catch (e) { return []; } },
    load(id) { try { return JSON.parse(get(KP + id)); } catch (e) { return null; } },
    save(p) {
      p.updated = Date.now();
      set(KP + p.id, JSON.stringify(p));
      const idx = this.list().filter(e => e.id !== p.id);
      idx.unshift({ id: p.id, title: p.info.title, owner: p.info.owner, type: p.info.type, updated: p.updated });
      set(KI, JSON.stringify(idx));
    },
    remove(id) {
      try { localStorage.removeItem(KP + id); } catch (e) { /* ignore */ }
      set(KI, JSON.stringify(this.list().filter(e => e.id !== id)));
    }
  };

  /* ------------- formatting ------------- */
  /* ---------- units (model is always metres; mm is the default display/input unit) ---------- */
  AP.UNITS = {
    mm: { label: 'Millimeters (mm)', f: 1000, dec: 0, step: 10, suf: 'mm' },
    cm: { label: 'Centimeters (cm)', f: 100, dec: 1, step: 1, suf: 'cm' },
    m:  { label: 'Meters (m)', f: 1, dec: 3, step: 0.01, suf: 'm' },
    in: { label: 'Inches (in)', f: 1 / 0.0254, dec: 2, step: 0.5, suf: 'in' },
    ft: { label: 'Feet-inches (ft-in)', f: 1 / 0.3048, dec: 3, step: 0.1, suf: 'ft' }
  };
  AP.U = 'mm';
  AP.unit = () => AP.UNITS[AP.U] || AP.UNITS.mm;
  AP.imperial = () => AP.U === 'ft' || AP.U === 'in';
  AP.unitSuf = () => (AP.U === 'ft' ? 'ft-in' : AP.unit().suf);
  const trimNum = (v, dec) => String(+v.toFixed(dec));
  const inchTxt = inch => { const r = Math.round(inch * 2) / 2, w = Math.floor(r); return w + (r - w ? ' 1/2' : '') + '"'; };
  // length as shown on drawings, in the current unit (dimension strings carry no suffix, ft-in carries ' and ")
  AP.mm = v => {
    const neg = v < 0 ? '-' : ''; v = Math.abs(v);
    switch (AP.U) {
      case 'cm': return neg + trimNum(v * 100, 1);
      case 'm': return neg + v.toFixed(2);
      case 'in': return neg + inchTxt(v / 0.0254);
      case 'ft': { const t = Math.round(v / 0.0254 * 2) / 2; let ft = Math.floor(t / 12), i = t - ft * 12; if (i >= 12) { ft++; i -= 12; } return neg + ft + "'-" + inchTxt(i); }
      default: return neg + String(Math.round(v * 1000));
    }
  };
  AP.len = v => (AP.imperial() ? AP.mm(v) : AP.mm(v) + ' ' + AP.unit().suf);   // with unit
  AP.toU = v => +(v * AP.unit().f).toFixed(AP.unit().dec);                       // metres -> input number
  AP.fromU = x => x / AP.unit().f;                                                // input number -> metres
  AP.areaLabel = () => (AP.imperial() ? 'SQ.FT.' : 'SQ.M.');
  AP.areaNum = a => (AP.imperial() ? (a * 10.7639).toFixed(2) : AP.m2(a));
  AP.area = a => AP.areaNum(a) + ' ' + AP.areaLabel();
  AP.m2 = v => (Math.round(v * 100) / 100).toFixed(2);
  AP.lvl = v => (v >= 0 ? '+' : '') + (Math.round(v * 1000) / 1000).toFixed(2) + ' M';
})(window.AP);
