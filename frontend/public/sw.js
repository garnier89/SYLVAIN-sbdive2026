/* SB Drive — Service Worker v1
 * Strategy:
 *   - Static assets (JS/CSS/fonts/images)    : Stale-While-Revalidate (fast + auto-update)
 *   - API GET requests                       : Network-First with 4s timeout fallback to cache
 *   - HTML navigations                       : Network-First with offline fallback
 *   - POST / PUT / DELETE                    : Always network (no caching)
 *   - Map tiles (Leaflet OSM)                : Cache-First (immutable)
 */

const VERSION = 'sb-drive-v2';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const TILE_CACHE = `${VERSION}-tiles`;
const API_CACHE = `${VERSION}-api`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = ['/', '/offline.html', '/manifest.json'];

// ============ INSTALL ============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// ============ ACTIVATE ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ============ FETCH ============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations

  const url = new URL(request.url);

  // Map tiles (Cache-First, very long TTL)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('tile.osm') || url.pathname.startsWith('/tiles/')) {
    event.respondWith(cacheFirst(request, TILE_CACHE));
    return;
  }

  // API requests (Network-First with 4s timeout, fallback to cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, 4000));
    return;
  }

  // HTML navigations (Network-First with offline fallback)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Static assets (Stale-While-Revalidate)
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

// ============ STRATEGIES ============
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const fetchPromise = fetch(req);
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (e) {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match(OFFLINE_URL)) || new Response('Hors ligne', { status: 503 });
  }
}

// ============ PUSH NOTIFICATIONS (ready for FCM later) ============
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { title: 'SB Drive', body: event.data.text() }; }
  const title = data.title || 'SB Drive';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'sb-drive-notif',
    data: data.url ? { url: data.url } : undefined,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const focused = clientsArr.find((c) => c.url.includes(url));
      if (focused) return focused.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ============ MESSAGE (force update from app) ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
