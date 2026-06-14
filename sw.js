/**
 * sw.js — Service Worker
 * Collab Match Creator PWA
 * Strategi: Cache-first untuk aset statis, Network-first untuk data dinamis
 */

const APP_VERSION   = 'v1.0.0';
const CACHE_STATIC  = `cmk-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `cmk-dynamic-${APP_VERSION}`;
const CACHE_IMAGES  = `cmk-images-${APP_VERSION}`;

// Aset yang di-precache saat install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/settings.js',
  '/offline.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

// Batas ukuran dynamic cache
const CACHE_DYNAMIC_LIMIT = 50;
const CACHE_IMAGES_LIMIT  = 30;

// ─────────────────────────────────────────────
// INSTALL — precache aset inti
// ─────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing…', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Precache gagal (beberapa URL mungkin belum ada):', err))
  );
});

// ─────────────────────────────────────────────
// ACTIVATE — hapus cache lama
// ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating…', APP_VERSION);
  const validCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_IMAGES];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => {
            console.log('[SW] Menghapus cache lama:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────
// FETCH — strategi caching
// ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Abaikan request non-GET dan browser-extension
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 1. Aset statis → Cache First
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 2. Google Fonts → Cache First (stale-while-revalidate ringan)
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 3. Gambar → Cache First dengan fallback
  if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request, CACHE_IMAGES, CACHE_IMAGES_LIMIT));
    return;
  }

  // 4. Navigasi HTML → Network First, fallback ke offline.html
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // 5. Semua lainnya → Network First dengan fallback cache
  event.respondWith(networkFirst(request, CACHE_DYNAMIC, CACHE_DYNAMIC_LIMIT));
});

// ─────────────────────────────────────────────
// PUSH NOTIFICATION
// ─────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || 'Collab Match';
  const options = {
    body:    data.body    || 'Ada notifikasi baru untukmu!',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-96.png',
    tag:     data.tag     || 'cmk-notif',
    data:    data.data    || { url: '/' },
    vibrate: [200, 100, 200],
    actions: data.actions || [
      { action: 'open',    title: 'Buka App' },
      { action: 'dismiss', title: 'Tutup' },
    ],
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const existing = clientList.find(c => c.url === targetUrl && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow(targetUrl);
      })
  );
});

// ─────────────────────────────────────────────
// BACKGROUND SYNC (opsional — kirim pesan offline)
// ─────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'cmk-sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
  if (event.tag === 'cmk-sync-applications') {
    event.waitUntil(syncPendingApplications());
  }
});

async function syncPendingMessages() {
  // Implementasi: kirim pesan yang tersimpan di IndexedDB saat offline
  console.log('[SW] Background sync: pesan pending…');
  // TODO: baca dari IndexedDB, POST ke API, hapus jika berhasil
}

async function syncPendingApplications() {
  console.log('[SW] Background sync: lamaran pending…');
  // TODO: sinkronisasi lamaran collab/job yang dibuat saat offline
}

// ─────────────────────────────────────────────
// MESSAGE dari klien (mis. skip waiting)
// ─────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});

// ─────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────

function isStaticAsset(url) {
  return (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.json') ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/offline.html'
  );
}

function isImageRequest(request) {
  return (
    request.destination === 'image' ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(new URL(request.url).pathname)
  );
}

/** Cache First: ambil dari cache, jika tidak ada fetch dan simpan */
async function cacheFirst(request, cacheName, limit = null) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (limit) trimCache(cacheName, limit);
    }
    return response;
  } catch {
    return caches.match('/offline.html');
  }
}

/** Network First: coba network, simpan ke cache, fallback ke cache */
async function networkFirst(request, cacheName, limit = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (limit) trimCache(cacheName, limit);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ offline: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/** Network First untuk navigasi, fallback ke offline.html */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/offline.html');
  }
}

/** Pangkas cache agar tidak melebihi batas */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}
