const CACHE = 'recordance-v15';
const ASSETS = ['/', '/style.css?v=15', '/app.js?v=15', '/fast-export.js?v=15', '/manifest.json?v=15', '/icon.svg?v=15', '/icon-192.png?v=15', '/icon-512.png?v=15', '/apple-touch-icon.png?v=15'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
