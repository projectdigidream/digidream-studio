//
// THE STUDIO'S SERVICE WORKER: serves installed plugins (docs/PLUGINS.md, Installing).
//
// A plugin installed from a .dnpplugin lives in Cache Storage, each file at
// <studio>/x/<id>@<version>/<path> (src/plugins/install.js). This answers
// exactly those addresses from the cache and lets everything else through to
// the network untouched -- it never caches the studio itself, so the studio is
// never stale. It is scoped to the whole studio only so that the studio's own
// page, and the bake Worker it starts, are able to load an installed plugin's
// baker; a request outside x/ is not even looked at.
//
const CACHE = 'dnp-suite-plugins'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  const x = new URL('x/', self.registration.scope).pathname
  if (url.origin !== self.location.origin || !url.pathname.startsWith(x) || e.request.method !== 'GET') return
  e.respondWith((async () => {
    const hit = await (await caches.open(CACHE)).match(url.origin + url.pathname)
    if (!hit) return new Response(`no installed plugin file at ${url.pathname}`, { status: 404, headers: { 'content-type': 'text/plain' } })
    // The studio is cross-origin isolated (COOP/COEP, for its wasm): a page in
    // one of its frames must say the same, or the browser will not show it.
    const headers = new Headers(hit.headers)
    headers.set('cross-origin-embedder-policy', 'require-corp')
    headers.set('cross-origin-opener-policy', 'same-origin')
    headers.set('cross-origin-resource-policy', 'same-origin')
    return new Response(hit.body, { status: 200, headers })
  })())
})
