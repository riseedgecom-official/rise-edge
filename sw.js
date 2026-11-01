// Rise Edge Academy - keeps the app files so it can be installed and open fast.
// Network first: a new version is always picked up when online; the saved copy is used offline.
const C = "rise-v1", SHARE = "rise-share";
const FILES = ["./", "index.html", "app.css", "app.js", "config.js", "logo.jpg", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C && x !== SHARE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  // Android "Share" -> Rise Edge: keep the shared files, then open the app on the share screen
  if (r.method === "POST" && u.origin === location.origin && u.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      try {
        await caches.delete(SHARE);
        const fd = await r.formData(), c = await caches.open(SHARE);
        let i = 0;
        for (const v of fd.getAll("files")) {
          if (v && typeof v !== "string") await c.put(self.registration.scope + "sf" + (i++), new Response(v, { headers: { "Content-Type": v.type || "application/octet-stream", "X-Name": encodeURIComponent(v.name || "file") } }));
        }
      } catch (x) { /* ignore */ }
      return Response.redirect(self.registration.scope + "?share=1", 303);
    })());
    return;
  }
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r, { cache: "no-cache" })
      .then((x) => { if (x.ok) { const y = x.clone(); caches.open(C).then((c) => c.put(r, y)); } return x; })
      .catch(() => caches.match(r).then((m) => m || caches.match("index.html")))
  );
});
