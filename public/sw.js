const CACHE = 'recordance-v7';
const ASSETS = ['/', '/style.css?v=7', '/app.js?v=7', '/manifest.json?v=7', '/icon.svg?v=7', '/icon-192.png?v=7', '/icon-512.png?v=7', '/apple-touch-icon.png?v=7'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
