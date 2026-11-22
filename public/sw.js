const CACHE = 'recordance-v26';
const ASSETS = ['/', '/style.css?v=26', '/app.js?v=26', '/fast-export.js?v=26', '/manifest.json?v=26', '/icon.svg?v=26', '/icon-192.png?v=26', '/icon-512.png?v=26', '/apple-touch-icon.png?v=26'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
