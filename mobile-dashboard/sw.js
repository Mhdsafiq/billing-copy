const CACHE_NAME = "iva-dashboard-v3";
const API_CACHE = "iva-api-cache-v3";

// App shell files to cache immediately on install
const SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/sw.js",
];

// External CDN resources to cache
const CDN_FILES = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap",
  "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js",
];

// Install — cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES).catch(() => {
        // Individual fallback for each file
        return Promise.allSettled(SHELL_FILES.map(f => cache.add(f)));
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — smart caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // For API requests: Network-first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the fresh response
          const clone = response.clone();
          caches.open(API_CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Return a JSON error response if nothing cached
            return new Response(
              JSON.stringify({ error: "Offline — no cached data available" }),
              { headers: { "Content-Type": "application/json" }, status: 503 }
            );
          });
        })
    );
    return;
  }

  // For app shell / static files: Cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for future offline use
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // If it's a navigation request and we're offline, serve index.html
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    })
  );
});
