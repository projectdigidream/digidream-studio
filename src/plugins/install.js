//
// INSTALLING A PLUGIN LATER: a .dnpplugin (a zip with plugin.json at its
// root, or in one folder at its root) into the studio, and out again.
//
// The files go into Cache Storage under <studio>/x/<id>@<version>/, which the
// studio's service worker (sw.js) serves; the list of what is installed is one
// more entry there, <studio>/x/installed.json. An installed plugin is trusted:
// it runs on the studio's own origin, with the same reach as the studio --
// which the author is told, once, before it is installed.
//
// Where there is no service worker (a WebView that has none, a custom scheme)
// installing is refused, saying so; bundled plugins are unaffected.
//
import { readPack } from '../pack.js'
import { validateManifest, PROTOCOL } from './manifest.js'

export const CACHE = 'dnp-suite-plugins'
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', wasm: 'application/wasm', png: 'image/png',
  svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2',
  ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json'
}
const typeOf = (p) => TYPES[p.split('.').pop().toLowerCase()] ?? 'application/octet-stream'

/** The installed plugins' base: <studio>/x/. */
export const installBase = (base) => `${base}x/`
export const pluginBase = (base, id, version) => `${installBase(base)}${id}@${version}/`

/** Is installing possible here (a service worker serving <studio>/)? Registers it on the way. */
export async function ensureServiceWorker (base) {
  if (!('serviceWorker' in navigator) || !globalThis.caches) return false
  // The Android shell answers every request itself (shouldInterceptRequest);
  // what a service worker lets through would go to the network instead, where
  // its asset host does not exist. Until the shell serves x/ from its tree,
  // no service worker there -- and no installing (docs/PLUGINS.md, Installing).
  if (location.hostname === 'appassets.androidplatform.net') return false
  try {
    await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
    await navigator.serviceWorker.ready
    return true
  } catch (e) {
    console.warn('[studio] no service worker, so no installed plugins:', e.message ?? e)
    return false
  }
}

/**
 * A .dnpplugin's bytes -> { ok, errors, manifest, files: Map(path -> bytes) }.
 * plugin.json at the root, or in the one folder at the root; every other file
 * is taken relative to it.
 */
export async function readPluginZip (bytes, { suiteVersion, knownKinds }) {
  let entries
  try { entries = await readPack(bytes) } catch (e) { return { ok: false, errors: [`not a zip: ${e.message}`] } }
  const pj = entries.filter((e) => /(^|\/)plugin\.json$/.test(e.path)).sort((a, b) => a.path.length - b.path.length)[0]
  if (!pj) return { ok: false, errors: ['there is no plugin.json in it'] }
  const prefix = pj.path.slice(0, -'plugin.json'.length)
  if (prefix.split('/').length > 2) return { ok: false, errors: ['plugin.json is too deep in it (at the root, or in one folder)'] }
  let json
  try { json = JSON.parse(new TextDecoder().decode(pj.bytes)) } catch (e) { return { ok: false, errors: [`plugin.json is not JSON: ${e.message}`] } }
  const v = validateManifest(json, { suiteVersion, protocol: PROTOCOL, knownKinds })
  if (!v.ok) return { ok: false, errors: v.errors }
  const files = new Map()
  for (const e of entries) {
    if (!e.path.startsWith(prefix) || e.path.endsWith('/')) continue
    const rel = e.path.slice(prefix.length)
    if (rel.split('/').some((s) => s === '..' || s === '.')) return { ok: false, errors: [`${e.path}: a path that leaves the plugin`] }
    files.set(rel, e.bytes)
  }
  for (const e of [...v.plugin.editors, ...v.plugin.bakers, ...v.plugin.sections]) {
    if (!files.has(e.entry)) return { ok: false, errors: [`${e.entry} is named in plugin.json but is not in the package`] }
  }
  return { ok: true, errors: [], manifest: v.plugin, json, files }
}

async function readInstalled (base) {
  const hit = await (await caches.open(CACHE)).match(new URL(`${installBase(base)}installed.json`, location.href).href)
  return hit ? await hit.json() : []
}
async function writeInstalled (base, list) {
  await (await caches.open(CACHE)).put(new URL(`${installBase(base)}installed.json`, location.href).href,
    new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } }))
}

/** Store a read package. Replaces another version of the same plugin. */
export async function installPlugin (base, { json, manifest, files }) {
  const cache = await caches.open(CACHE)
  const list = await readInstalled(base)
  const old = list.find((x) => x.id === manifest.id)
  if (old) await removeFiles(base, old.id, old.version)
  const root = new URL(pluginBase(base, manifest.id, manifest.version), location.href).href
  for (const [path, bytes] of files) await cache.put(root + path, new Response(bytes, { headers: { 'content-type': typeOf(path) } }))
  await cache.put(root + 'plugin.json', new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json' } }))
  await writeInstalled(base, [...list.filter((x) => x.id !== manifest.id), { id: manifest.id, version: manifest.version, name: manifest.name, at: Date.now() }])
  return { id: manifest.id, version: manifest.version, replaced: old?.version ?? null }
}

async function removeFiles (base, id, version) {
  const cache = await caches.open(CACHE)
  const root = new URL(pluginBase(base, id, version), location.href).href
  for (const req of await cache.keys()) if (req.url.startsWith(root)) await cache.delete(req)
}

export async function uninstallPlugin (base, id) {
  const list = await readInstalled(base)
  const it = list.find((x) => x.id === id)
  if (!it) return false
  await removeFiles(base, it.id, it.version)
  await writeInstalled(base, list.filter((x) => x.id !== id))
  return true
}

/** At boot: every installed plugin into the registry (a refused one is listed with why). */
export async function loadInstalled (registry, { base }) {
  if (!globalThis.caches) return 0
  let n = 0
  for (const it of await readInstalled(base).catch(() => [])) {
    const at = pluginBase(base, it.id, it.version)
    const hit = await (await caches.open(CACHE)).match(new URL(`${at}plugin.json`, location.href).href)
    if (!hit) { registry.refused.push({ id: it.id, source: 'installed', errors: ['its files are gone (the browser cleared its storage?): install it again'] }); continue }
    const r = registry.add(await hit.json(), { baseUrl: at, source: 'installed' })
    if (r.ok) n++
  }
  return n
}
