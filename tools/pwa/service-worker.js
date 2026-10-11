// Build injects a digest of the application and offline shell. No game assets are cached.
const CACHE = 'rondo-offline-__BUILD_ID__';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/player-192.png'])));
  // A new version waits until the player chooses to update or closes every tab.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('rondo-offline-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      await caches.match('/offline.html') || new Response('Please reconnect to play Project Rondo.', {headers:{'Content-Type':'text/plain; charset=utf-8'}})
    ));
  } else if (new URL(request.url).pathname === '/icons/player-192.png') {
    event.respondWith(caches.match('/icons/player-192.png').then(cached => cached || fetch(request)));
  }
});
