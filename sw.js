/* Minimal offline shell. Location, SMS and the siren keep working
   without a network; only the address lookup needs internet. */
var CACHE = 'sakhi-v1';
var SHELL = [
  './', './index.html', './css/styles.css',
  './js/store.js', './js/location.js', './js/alerts.js',
  './js/features.js', './js/app.js', './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('nominatim') > -1) return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
