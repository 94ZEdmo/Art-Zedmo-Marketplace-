const CACHE_NAME = "art-zedmo-v2";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Installation - met en cache les fichiers
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Cache ART-ZEDMO ouvert");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Requêtes - sert depuis cache puis réseau
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Si en cache, retourne le cache
      if (response) {
        return response;
      }
      // Sinon va sur le réseau et met en cache
      return fetch(event.request).then(networkResponse => {
        // Ne met en cache que les requêtes http/https
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      // Si hors ligne et pas en cache, page offline simple
      return caches.match("/index.html");
    })
  );
});

// Activation - nettoie les anciens caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Suppression ancien cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
