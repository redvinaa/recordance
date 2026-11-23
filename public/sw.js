const CACHE = 'recordance-v27';
const ASSETS = ['/', '/style.css?v=27', '/app.js?v=27', '/fast-export.js?v=27', '/manifest.json?v=27', '/icon.svg?v=27', '/icon-192.png?v=27', '/icon-512.png?v=27', '/apple-touch-icon.png?v=27'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
