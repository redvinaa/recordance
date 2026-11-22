const CACHE = 'recordance-v22';
const ASSETS = ['/', '/style.css?v=22', '/app.js?v=22', '/fast-export.js?v=22', '/manifest.json?v=22', '/icon.svg?v=22', '/icon-192.png?v=22', '/icon-512.png?v=22', '/apple-touch-icon.png?v=22'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
