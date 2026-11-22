const CACHE = 'recordance-v24';
const ASSETS = ['/', '/style.css?v=24', '/app.js?v=24', '/fast-export.js?v=24', '/manifest.json?v=24', '/icon.svg?v=24', '/icon-192.png?v=24', '/icon-512.png?v=24', '/apple-touch-icon.png?v=24'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
