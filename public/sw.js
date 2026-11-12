const CACHE = "litloot-epubs-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  // Cache EPUB responses (proxy and static books)
  if (url.includes("/api/epub") || url.endsWith(".epub")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok) {
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return cached || new Response("Offline and book not cached", { status: 503 });
        }
      })
    );
  }
});
