const CACHE = 'recordance-v6';
const ASSETS = ['/', '/style.css?v=6', '/app.js?v=6', '/manifest.json?v=6', '/icon.svg?v=6', '/icon-192.png?v=6', '/icon-512.png?v=6', '/apple-touch-icon.png?v=6'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
