const CACHE_NAME = 'itguy-app-5.0';

const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/style.css',
    '/lib/itguy-fixes.js',
    '/lib/staff-shell.js',
    '/js/native-shell.js',
    '/js/local-db.js',
    '/js/firebase-init.js',
    '/js/auth.js',
    '/js/app.js',
    '/js/dashboard.js',
    '/js/repair.js',
    '/js/field.js',
    '/js/tickets.js',
    '/js/quotations.js',
    '/js/invoice.js',
    '/js/pdf.js',
    '/js/customers.js',
    '/js/expenses.js',
    '/js/settings.js',
    '/img/icon.png',
    '/img/logo.png',
    '/img/favicon.ico'
];

const CDN_HOSTS = [
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => Promise.all(
            APP_SHELL.map((url) => cache.add(url).catch(() => {}))
        ))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

function isCdn(url) {
    try {
        return CDN_HOSTS.indexOf(new URL(url).hostname) !== -1;
    } catch (e) {
        return false;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = request.url;

    // Authenticated API responses stay out of the Cache API so a shared browser
    // cannot serve one user's data to another. The page keeps a per-user copy.
    if (url.includes('/api/')) {
        event.respondWith(
            fetch(request).catch(() => new Response(
                JSON.stringify({ error: 'Service temporarily unavailable. Please check your connection or try again later.' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }

    if (isCdn(url)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            const network = fetch(request).then((response) => {
                if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
                return response;
            }).catch(() => null);
            if (cached) {
                network.catch(() => {});
                return cached;
            }
            const fresh = await network;
            if (fresh) return fresh;
            return new Response('', { status: 504, statusText: 'Offline' });
        })());
        return;
    }

    event.respondWith(
        fetch(request).then((response) => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
        }).catch(async () => {
            const cached = await caches.match(request, { ignoreSearch: true });
            if (cached) return cached;
            if (request.mode === 'navigate') {
                return (await caches.match('/index.html')) || (await caches.match('/')) || new Response('Offline', { status: 503 });
            }
            return new Response('', { status: 504, statusText: 'Offline' });
        })
    );
});
