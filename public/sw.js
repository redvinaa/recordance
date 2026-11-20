const CACHE = 'recordance-v19';
const ASSETS = ['/', '/style.css?v=19', '/app.js?v=19', '/fast-export.js?v=19', '/manifest.json?v=19', '/icon.svg?v=19', '/icon-192.png?v=19', '/icon-512.png?v=19', '/apple-touch-icon.png?v=19'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
