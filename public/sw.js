const CACHE = 'recordance-v20';
const ASSETS = ['/', '/style.css?v=20', '/app.js?v=20', '/fast-export.js?v=20', '/manifest.json?v=20', '/icon.svg?v=20', '/icon-192.png?v=20', '/icon-512.png?v=20', '/apple-touch-icon.png?v=20'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
