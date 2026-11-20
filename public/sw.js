const CACHE = 'recordance-v13';
const ASSETS = ['/', '/style.css?v=13', '/app.js?v=13', '/fast-export.js?v=13', '/manifest.json?v=13', '/icon.svg?v=13', '/icon-192.png?v=13', '/icon-512.png?v=13', '/apple-touch-icon.png?v=13'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
