const CACHE_NAME = 'itguy-app-1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/local-db.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/repair.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // If request is an API call to our backend, use Network First, fallback to nothing
  if (event.request.url.includes('/api/')) {
      event.respondWith(
          fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), { headers: { 'Content-Type': 'application/json' } }))
      );
      return;
  }
  
  // For static assets, Cache First, fallback to Network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
    const cacheAllowlist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheAllowlist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
