const CACHE = 'recordance-v17';
const ASSETS = ['/', '/style.css?v=17', '/app.js?v=17', '/fast-export.js?v=17', '/manifest.json?v=17', '/icon.svg?v=17', '/icon-192.png?v=17', '/icon-512.png?v=17', '/apple-touch-icon.png?v=17'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
