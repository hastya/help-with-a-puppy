// Offline cache. Pre-caches the app shell so it launches without network.
const CACHE = 'hwp-shell-v1';
const ASSETS = [
  '.', 'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'vendor/chart.umd.js',
  'js/calc.js', 'js/breeds.js', 'js/store.js', 'js/api-local.js',
  'js/ui.js', 'js/views.js', 'js/views-sections.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache-first for app-shell assets (all app data lives in localStorage, not here).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
