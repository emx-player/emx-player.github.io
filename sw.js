// EMX Player: keep the page's own files so it opens offline. Records never pass through here:
// they are read from the device and run from blob: URLs.
const CACHE = 'emx-player-v2';
const FILES = ['./', './index.html', './player.css', './player.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
// Only this player's own older caches go, whatever else this origin keeps.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('emx-player-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
// Network first: online, the player is always the current one, and each response refreshes the copy
// kept for offline. Only when the network fails does the kept copy (this player's own) answer.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  const fresh = fetch(request).then(async response => {
    // A copy that can't be kept (the storage quota is full, say) never costs the fresh response.
    if (response.ok) await caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {});
    return response;
  });
  event.respondWith(fresh.catch(() => caches.open(CACHE).then(async cache => (await cache.match(request, { ignoreSearch: true })) || cache.match('./index.html'))));
});
