const CACHE = 'recordance-v8';
const ASSETS = ['/', '/style.css?v=8', '/app.js?v=8', '/manifest.json?v=8', '/icon.svg?v=8', '/icon-192.png?v=8', '/icon-512.png?v=8', '/apple-touch-icon.png?v=8'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
