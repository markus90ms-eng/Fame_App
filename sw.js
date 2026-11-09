// Die App liegt jetzt unter /app/ und hat dort ihren eigenen Service Worker.
// Dieser Stub ersetzt den alten Worker von der Hauptadresse, räumt dessen Zwischenspeicher auf und meldet sich ab.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => { try { c.navigate(c.url); } catch (err) { /* ignorieren */ } })),
  );
});
