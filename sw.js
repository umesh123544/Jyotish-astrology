const DEBUG = true;
const CACHE_NAME = 'jotishi-v3';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/app.js',
  '/offline.html',
  'https://i.ibb.co/yFHs1wVD/2d5cd37b975293e90767b59c12ad586d.png',
  'https://i.ibb.co/PG2SRstT/Picsart-25-05-17-08-27-21-322.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

function log(message) {
  if (DEBUG) {
    console.log(`[ServiceWorker] ${message}`);
  }
}

// Install event - cache core assets
self.addEventListener('install', event => {
  log('Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        log('Caching assets');
        return cache.addAll(PRECACHE_URLS)
          .then(() => cache.add(new Request(OFFLINE_URL, {cache: 'reload'})))
          .then(() => {
            log('All assets cached');
            return self.skipWaiting();
          });
      })
      .catch(err => {
        log(`Cache addAll failed: ${err}`);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  log('Activate event');
  
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            log(`Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      log('Claiming clients');
      return self.clients.claim();
    })
    .then(() => {
      // Start periodic updates
      if ('periodicSync' in self.registration) {
        self.registration.periodicSync.register('content-update', {
          minInterval: 86400000 // 24 hours
        }).then(() => log('Periodic sync registered'))
         .catch(err => log(`Periodic sync failed: ${err}`));
      }
    })
  );
});

// Fetch event - cache-first with network fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Skip cross-origin requests unless they're in PRECACHE_URLS
  const requestUrl = new URL(event.request.url);
  const isExternal = requestUrl.origin !== location.origin;
  if (isExternal && !PRECACHE_URLS.includes(event.request.url)) return;

  log(`Fetching: ${event.request.url}`);
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if available
        if (cachedResponse) {
          log(`Serving from cache: ${event.request.url}`);
          
          // Update cache in background
          if (isCacheable(event.request)) {
            fetchAndCache(event.request);
          }
          
          return cachedResponse;
        }

        // For navigation requests, try network first
        if (event.request.mode === 'navigate') {
          return fetchAndCache(event.request)
            .catch(() => caches.match(OFFLINE_URL));
        }

        // For other requests, try network
        return fetchAndCache(event.request);
      })
  );
});

// Push notification event
self.addEventListener('push', event => {
  log('Push event received');
  
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Jotishi Astrology', body: event.data.text() };
  }

  const options = {
    body: data.body || 'New update available',
    icon: 'https://i.ibb.co/PG2SRstT/Picsart-25-05-17-08-27-21-322.png',
    badge: 'https://i.ibb.co/PG2SRstT/Picsart-25-05-17-08-27-21-322.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Jotishi', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  log('Notification click');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(windowClients => {
        const url = event.notification.data.url;
        
        // Focus on existing window if available
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background sync event
self.addEventListener('sync', event => {
  if (event.tag === 'content-update') {
    log('Background sync: content-update');
    event.waitUntil(updateCache());
  }
});

// Message event (for skipWaiting)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Skip waiting message received');
    self.skipWaiting();
  }
});

// Helper functions
function isCacheable(request) {
  return request.method === 'GET' && 
         !request.url.includes('sockjs') && 
         !request.url.includes('chrome-extension');
}

function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      // Don't cache opaque responses
      if (response.type === 'opaque') return response;
      
      const responseToCache = response.clone();
      
      if (isCacheable(request)) {
        caches.open(CACHE_NAME)
          .then(cache => cache.put(request, responseToCache))
          .then(() => log(`Cached: ${request.url}`));
      }
      
      return response;
    })
    .catch(err => {
      log(`Fetch failed: ${err}`);
      throw err;
    });
}

async function updateCache() {
  log('Updating cache');
  
  const cache = await caches.open(CACHE_NAME);
  const updatedUrls = [];
  
  for (const url of PRECACHE_URLS) {
    try {
      const response = await fetch(url, {cache: 'reload'});
      if (response.ok) {
        await cache.put(url, response);
        updatedUrls.push(url);
      }
    } catch (err) {
      log(`Failed to update ${url}: ${err}`);
    }
  }
  
  log(`Updated ${updatedUrls.length} assets`);
  return updatedUrls;
}

// Periodic cache updates
setInterval(() => {
  updateCache();
}, 86400000); // 24 hours
