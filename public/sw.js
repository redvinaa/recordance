const CACHE = 'recordance-v14';
const ASSETS = ['/', '/style.css?v=14', '/app.js?v=14', '/fast-export.js?v=14', '/manifest.json?v=14', '/icon.svg?v=14', '/icon-192.png?v=14', '/icon-512.png?v=14', '/apple-touch-icon.png?v=14'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
