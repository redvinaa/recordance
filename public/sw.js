const CACHE = 'recordance-v28';
const ASSETS = ['/', '/style.css?v=28', '/app.js?v=28', '/fast-export.js?v=28', '/manifest.json?v=28', '/icon.svg?v=28', '/icon-192.png?v=28', '/icon-512.png?v=28', '/apple-touch-icon.png?v=28'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
