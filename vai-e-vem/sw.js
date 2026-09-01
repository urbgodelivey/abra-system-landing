const CACHE = 'vai-e-vem-shell-v3';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './pix.js',
  './supabase-client.js',
  './manifest.webmanifest',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // config.js precisa ser buscado na rede para evitar prender uma configuração antiga.
  if (url.origin === self.location.origin && url.pathname.endsWith('/config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
