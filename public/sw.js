const CACHE = 'recordance-v25';
const ASSETS = ['/', '/style.css?v=25', '/app.js?v=25', '/fast-export.js?v=25', '/manifest.json?v=25', '/icon.svg?v=25', '/icon-192.png?v=25', '/icon-512.png?v=25', '/apple-touch-icon.png?v=25'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
