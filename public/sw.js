const CACHE = 'recordance-v16';
const ASSETS = ['/', '/style.css?v=16', '/app.js?v=16', '/fast-export.js?v=16', '/manifest.json?v=16', '/icon.svg?v=16', '/icon-192.png?v=16', '/icon-512.png?v=16', '/apple-touch-icon.png?v=16'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
