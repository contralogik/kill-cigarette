const CACHE = "kill-cigarette-v2-20261030-3";
const SCENES = [
  "mist-lake",
  "morning-coast",
  "bamboo-light",
  "cloud-mountain",
  "rainy-window",
  "forest-path",
  "quiet-night",
  "river-stones",
  "tea-notebook",
  "water-break",
  "new-leaf",
  "paper-boat",
];
const CORE = [
  "./",
  "./index.html",
  "./smoking.html",
  "./app.js",
  "./store.js",
  "./content.js",
  "./styles.css",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.webmanifest",
  "./assets/art/breath-ring.webp",
  ...SCENES.flatMap((id) => [
    `./assets/art/${id}.webp`,
    `./assets/art/${id}-thumb.webp`,
  ]),
  ...["focus", "moment", "persist", "forward", "passion"].map(
    (id) => `./assets/motivation/${id}.png`,
  ),
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
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
            .filter((k) => k.startsWith("kill-cigarette-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(new URL("./", self.location).pathname)
  )
    return;
  const art = url.pathname.includes("/assets/art/");
  if (art) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
  } else {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          if (event.request.mode === "navigate")
            return cache.match("./smoking.html");
          return new Response("Offline", { status: 503 });
        }
      }),
    );
  }
});
