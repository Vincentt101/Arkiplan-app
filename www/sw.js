// Offline cache for ArkiPlan (PWA mode)
const C = 'arkiplan-v109';
const FILES = ['./', 'index.html', 'css/app.css', 'icon.svg', 'manifest.json',
  'js/drawing.js', 'js/model.js', 'js/geometry.js', 'js/blocks.js', 'js/plan.js', 'js/views.js', 'js/mep.js', 'js/site.js', 'js/sheets.js', 'js/sketch.js', 'js/bom.js', 'js/plumbdet.js', 'js/view3d.js', 'js/app.js', 'lib/three.min.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request))));
