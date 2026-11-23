const CACHE = 'recordance-v30';
const ASSETS = ['/', '/style.css?v=30', '/app.js?v=30', '/fast-export.js?v=30', '/manifest.json?v=30', '/icon.svg?v=30', '/icon-192.png?v=30', '/icon-512.png?v=30', '/apple-touch-icon.png?v=30'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
