const CACHE = 'recordance-v31';
const ASSETS = ['/', '/style.css?v=31', '/app.js?v=31', '/fast-export.js?v=31', '/manifest.json?v=31', '/icon.svg?v=31', '/icon-192.png?v=31', '/icon-512.png?v=31', '/apple-touch-icon.png?v=31'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
