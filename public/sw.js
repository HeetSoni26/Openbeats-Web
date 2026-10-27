/* Openbeats Web — minimal app-shell service worker. Music streams are never
 * cached or proxied here; only the site's own shell. */
const CACHE = "openbeats-shell-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest"])),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Only ever handle same-origin GETs; media/api traffic passes through.
  if (event.request.method !== "GET" || url.origin !== location.origin) return

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put("/", clone))
          return res
        })
        .catch(() => caches.match("/")),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok && res.type === "basic") {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(event.request, clone))
          }
          return res
        }),
    ),
  )
})
