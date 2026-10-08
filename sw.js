/* Mi Voz: guarda la app para abrirla rápido y sin conexión.
   Las páginas se piden primero a internet (así siempre ves la última versión) y, si no hay conexión, se usa la copia guardada. */
const CACHE = 'mivoz-v1';
const SHELL = ['./', 'index.html', 'ingles.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\.html$|\/$/.test(url.pathname);
  if (isPage){
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
});
