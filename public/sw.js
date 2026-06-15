const CACHE = 'violence-app-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/manifest.webmanifest',
        '/icon-192.svg',
        '/icon-512.svg',
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/JS/CSS (Vite hashed assets); cache fallback for offline shell
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (
          url.pathname.endsWith('.html')
          || url.pathname.endsWith('.js')
          || url.pathname.endsWith('.css')
          || url.pathname.startsWith('/assets/')
        )) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
