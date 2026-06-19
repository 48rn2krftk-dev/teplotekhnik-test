const CACHE_PREFIX = "teplotekhnik-test-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const APP_SHELL = new URL("./", self.registration.scope).href;
const STATIC_FILES = [
  "manifest.webmanifest",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
].map((path) => new URL(path, self.registration.scope).href);

async function precacheApp() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch(APP_SHELL, { cache: "no-store" });

  if (!shellResponse.ok) {
    throw new Error("Unable to cache the application shell");
  }

  const html = await shellResponse.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], APP_SHELL))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);

  await cache.put(APP_SHELL, shellResponse);
  await cache.addAll([...new Set([...assetUrls, ...STATIC_FILES])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApp());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .match(APP_SHELL)
        .then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
    )
  );
});
