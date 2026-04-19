const CACHE_NAME = 'sys-cache-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  // Always ignore non-GET requests (like POST or WebSockets)
  if (event.request.method !== 'GET') return;
  
  // Ignore Next.js development and internal paths
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/_next/') || url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
      .catch(() => {
        // Fallback for failed fetches (e.g. offline)
        return caches.match('/');
      })
  );
});
