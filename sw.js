// Einfacher Offline-Cache: App-Dateien zuerst aus dem Netz, sonst aus dem Cache.
const CACHE = 'fame-v66'; // gleich wie APP_VERSION in js/app.js
const ASSETS = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/data.js', 'js/ui.js', 'js/fx.js', 'js/diamond3d.js', 'js/gem3d.js', 'js/gems.js', 'js/refraction.js', 'js/particles.js', 'js/share.js', 'js/cardfx.js', 'js/connect.js', 'js/config.js', 'js/auth.js', 'js/i18n.js', 'js/i18n-en.js', 'js/gems-en.js',
  'vendor/three.module.min.js', 'vendor/supabase.js', 'vendor/three-mesh-bvh.module.js', 'assets/icon.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/img/cash.jpg', 'assets/img/ranking.jpg', 'assets/img/pin.jpg', 'assets/img/animals.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Eigene Dateien immer frisch vom Server holen (am Browser-Cache vorbei), damit Updates sofort ankommen
  const own = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    (own ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request))
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
