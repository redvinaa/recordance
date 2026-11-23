const CACHE = 'recordance-v32';
const ASSETS = ['/', '/style.css?v=32', '/app.js?v=32', '/fast-export.js?v=32', '/manifest.json?v=32', '/icon.svg?v=32', '/icon-192.png?v=32', '/icon-512.png?v=32', '/apple-touch-icon.png?v=32'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
