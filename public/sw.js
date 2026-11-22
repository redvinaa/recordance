const CACHE = 'recordance-v21';
const ASSETS = ['/', '/style.css?v=21', '/app.js?v=21', '/fast-export.js?v=21', '/manifest.json?v=21', '/icon.svg?v=21', '/icon-192.png?v=21', '/icon-512.png?v=21', '/apple-touch-icon.png?v=21'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
