const CACHE_NAME = "yijing-static-v61";
const CORE_ROUTES = [
  "/",
  "/learn",
  "/trigrams",
  "/hexagrams",
  "/lab/hexagram",
  "/review",
  "/review/session",
  "/self-test",
  ...[
    "yin-yang-lines",
    "five-elements",
    "trigrams",
    "trigram-images",
    "earlier-later-heaven",
    "hexagram-composition",
    "line-positions",
    "king-wen-sequence",
    "changing-lines",
    "relation-hexagrams",
    "content-sources",
    "heavenly-stems",
    "earthly-branches",
    "hetu-luoshu",
    "nine-palaces",
    "active-recall",
  ].map((id) => `/learn/${id}`),
  "/tools/sexagenary-relations",
  "/tools/hetu-luoshu",
  "/tools/calendar",
  "/tools/compass",
  "/stats",
  "/notes",
  "/notes/draft",
  "/tools",
  "/tools/five-elements",
  "/tools/trigrams",
  "/settings/data",
  "/settings/content",
  "/settings/preferences",
  "/settings/ai",
  "/settings",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...Array.from({ length: 64 }, (_, index) => `/hexagrams/${index + 1}`),
  ...["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"].map(
    (id) => `/trigrams/${id}`,
  ),
];
const CORE_ROUTE_SET = new Set(CORE_ROUTES);

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheCoreRoutes()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function matchCachedRequest(request) {
  const url = new URL(request.url);
  // Always read the canonical pathname entry. Query-string entries may have
  // been left by an older worker or injected by a share link; allowing an
  // exact query hit here could serve stale/poisoned HTML instead of the
  // current route shell.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, {
    method: "GET",
  });
  return caches.open(CACHE_NAME).then((cache) => cache.match(cacheKey));
}

async function precacheCoreRoutes() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    CORE_ROUTES.map(async (path) => {
      try {
        const request = new Request(new URL(path, self.location.origin), {
          cache: "no-store",
        });
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
      } catch {
        // A single temporarily unavailable route must not prevent the worker
        // from installing and serving the other cached learning pages.
      }
    }),
  );
}

function cacheSuccessfulResponse(request, response, { navigation = false } = {}) {
  if (!response.ok) return Promise.resolve();
  const url = new URL(request.url);
  // Navigation requests are deliberately limited to the known static surface.
  // A user can open arbitrary URLs (including links with personal query
  // parameters), but those must not grow the offline cache indefinitely.
  if (navigation && !CORE_ROUTE_SET.has(url.pathname)) return Promise.resolve();
  // Store one canonical pathname entry instead of one entry per query string.
  // Client-side pages restore their allow-listed query parameters after the
  // pathname fallback is served, so share links remain usable offline.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, {
    method: "GET",
  });
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(cacheKey, response.clone()))
    .catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).pathname.startsWith("/api/") ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          event.waitUntil(
            cacheSuccessfulResponse(event.request, response, { navigation: true }),
          );
          return response;
        })
        .catch(() =>
          matchCachedRequest(event.request).then(
            (cached) => cached || caches.match("/"),
          ),
        ),
    );
    return;
  }
  if (
    /[.](?:js|css|woff2?|png|svg|ico|webmanifest)$/.test(
      new URL(event.request.url).pathname,
    )
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          event.waitUntil(cacheSuccessfulResponse(event.request, response));
          return response;
        })
        .catch(() => matchCachedRequest(event.request)),
    );
  }
});
