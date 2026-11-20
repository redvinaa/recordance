const CACHE = 'recordance-v11';
const ASSETS = ['/', '/style.css?v=11', '/app.js?v=11', '/fast-export.js?v=11', '/manifest.json?v=11', '/icon.svg?v=11', '/icon-192.png?v=11', '/icon-512.png?v=11', '/apple-touch-icon.png?v=11'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
