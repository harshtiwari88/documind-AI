// Harsh AI Service Worker v5 (Safe PWA & DWA Support)
const CACHE_NAME = 'harsh-ai-cache-v5';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Non-intercepting fetch listener: fulfills PWA criteria without intercepting Vite dynamic imports or dev server requests
self.addEventListener('fetch', () => {
  // Pass-through to native browser network fetch
  return;
});
