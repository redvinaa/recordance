const CACHE = 'recordance-v12';
const ASSETS = ['/', '/style.css?v=12', '/app.js?v=12', '/fast-export.js?v=12', '/manifest.json?v=12', '/icon.svg?v=12', '/icon-192.png?v=12', '/icon-512.png?v=12', '/apple-touch-icon.png?v=12'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
