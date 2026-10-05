const SHELL_CACHE = 'engnocrazy-shell-v2';
const DATA_CACHE = 'engnocrazy-data-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/pwa-icon.svg', '/pwa-icon-maskable.svg'];

function isPublicDataRequest(url) {
  return url.pathname === '/api/textbooks' ||
    url.pathname.startsWith('/api/textbooks/') ||
    url.pathname === '/api/vocab' ||
    url.pathname === '/api/senior3/vocabulary';
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isPublicDataRequest(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const network = fetch(request)
            .then(response => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);

          return cached || network;
        })
      )
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
