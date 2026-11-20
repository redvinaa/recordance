const CACHE = 'recordance-v9';
const ASSETS = ['/', '/style.css?v=9', '/app.js?v=9', '/manifest.json?v=9', '/icon.svg?v=9', '/icon-192.png?v=9', '/icon-512.png?v=9', '/apple-touch-icon.png?v=9'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
