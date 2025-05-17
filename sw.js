const CACHE_NAME = 'jotishi-v2'; // Changed version to force update
const OFFLINE_URL = '/offline.html'; // Add this fallback page
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/app.js',
  'https://i.ibb.co/yFHs1wVD/2d5cd37b975293e90767b59c12ad586d.png',
  'https://i.ibb.co/sJ3vWsvz/Picsart-25-05-17-01-07-39-140.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching assets');
        return cache.addAll(urlsToCache)
          .then(() => {
            // Cache offline fallback page
            return cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
          });
      })
      .catch(err => {
        console.error('[Service Worker] Cache addAll failed:', err);
      })
  );
  // Force the waiting service worker to become active
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Skip cross-origin requests like analytics
  if (event.request.url.startsWith('http') && 
      new URL(event.request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // For navigation requests, use offline page
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then(response => {
            // Check if valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // If fetch fails and it's a navigation request
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            return;
          });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    // Enable navigation preload if supported
    .then(() => {
      if (self.registration.navigationPreload) {
        return self.registration.navigationPreload.enable();
      }
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
