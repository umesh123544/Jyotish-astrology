const DEBUG = true;
const CACHE_NAME = 'jotishi-v4'; // Updated version
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
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  // Add font files
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-brands-400.woff2'
];

function log(message) {
  if (DEBUG) {
    console.log(`[ServiceWorker] ${message}`);
  }
}

// Enhanced caching strategy
self.addEventListener('install', event => {
  log('Install event v4');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        log('Caching core assets');
        return Promise.all(
          PRECACHE_URLS.map(url => {
            return fetch(url, {
              credentials: 'omit',
              mode: 'no-cors'
            }).then(response => {
              if (response.ok) return cache.put(url, response);
            }).catch(err => {
              log(`Failed to cache ${url}: ${err}`);
            });
          })
        ).then(() => {
          log('Core assets cached');
          return cache.add(OFFLINE_URL);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Aggressive cache cleanup
self.addEventListener('activate', event => {
  log('Activate event v4');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            log(`Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim())
    .then(() => {
      // Refresh all open clients
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

// Improved fetch handler with CORS support
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const requestUrl = new URL(event.request.url);
  const isCoreAsset = PRECACHE_URLS.includes(requestUrl.href);
  const isFontRequest = requestUrl.origin === 'https://cdnjs.cloudflare.com';
  
  // Handle font requests with CORS
  if (isFontRequest) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request, { 
          mode: 'cors',
          credentials: 'omit'
        }).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Generic network-first strategy
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Cache any GET request that's not in the exclusion list
        if (isCacheable(event.request)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        // Return cached assets
        return caches.match(event.request);
      })
  );
});

// Enhanced cache validation
function isCacheable(request) {
  const url = new URL(request.url);
  return request.method === 'GET' &&
         !url.pathname.endsWith('.html') &&
         !url.searchParams.has('nocache') &&
         (url.origin === location.origin ||
          url.hostname === 'cdnjs.cloudflare.com' ||
          url.hostname === 'fonts.googleapis.com');
}

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
