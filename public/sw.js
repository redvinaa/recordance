const CACHE = 'recordance-v18';
const ASSETS = ['/', '/style.css?v=18', '/app.js?v=18', '/fast-export.js?v=18', '/manifest.json?v=18', '/icon.svg?v=18', '/icon-192.png?v=18', '/icon-512.png?v=18', '/apple-touch-icon.png?v=18'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
