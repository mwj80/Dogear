const CACHE = "litloot-epubs-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (url.includes("/api/epub") || url.endsWith(".epub")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok && res.headers.get("content-type")?.includes("epub")) {
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return cached || new Response("Offline", { status: 503 });
        }
      })
    );
  }
});
