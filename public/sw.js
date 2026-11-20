const CACHE = 'recordance-v10';
const ASSETS = ['/', '/style.css?v=10', '/app.js?v=10', '/fast-export.js?v=10', '/manifest.json?v=10', '/icon.svg?v=10', '/icon-192.png?v=10', '/icon-512.png?v=10', '/apple-touch-icon.png?v=10'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
