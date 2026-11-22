const CACHE = 'recordance-v23';
const ASSETS = ['/', '/style.css?v=23', '/app.js?v=23', '/fast-export.js?v=23', '/manifest.json?v=23', '/icon.svg?v=23', '/icon-192.png?v=23', '/icon-512.png?v=23', '/apple-touch-icon.png?v=23'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
