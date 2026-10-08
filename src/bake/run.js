//
// BAKING: a source the module keeps -> the files the game loads (docs/PLUGINS.md, Bakers).
//
// A baker is an ES module exporting `version` and `bake({ kind, key, bytes })`
// -> { files: { path: Uint8Array }, meta, problems }, with no DOM. The studio's
// own (texproj.js, tsprite.js) and the plugins' run the same way: in a Worker
// in a page (worker.js), or imported directly in node (tools/bake.mjs) -- the
// same bytes either way, which is what lets a bake be cached by its source.
//
// The cache key is the source's SHA-256, the baker and its version, and the
// document's key (the files a baker writes are named after it). A new baker
// version is a new key: nothing stale is ever reused.
//

/** The studio's own bakers. A plugin's are added from its plugin.json (registry.bakersFor). */
export const BUILTIN_BAKERS = [
  { id: 'texproj', version: '2', kinds: ['file:texture'], url: new URL('./texproj.js', import.meta.url).href },
  { id: 'tsprite', version: '1', kinds: ['file:tsprite'], url: new URL('./tsprite.js', import.meta.url).href }
]

export async function sha256 (bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class Baker {
  /**
   * @param bakersFor  kind -> [{ id, version, url }], first is used
   * @param cache      { get(key), put(key, value) } or null
   * @param worker     () => Worker, or null to bake on this thread (node, tests)
   */
  constructor ({ bakersFor, cache = null, worker = null }) {
    this.bakersFor = bakersFor
    this.cache = cache
    this.makeWorker = worker
    this.w = null
    this.next = 1
    this.waiting = new Map()
  }

  /** Is there a baker for this kind? */
  has (kind) { return this.bakersFor(kind).length > 0 }

  run (b, kind, key, bytes) {
    if (!this.makeWorker) return import(b.url).then(async (m) => ({ ok: true, ...(await m.bake({ kind, key, bytes })), version: m.version }))
    if (!this.w) {
      this.w = this.makeWorker()
      this.w.onmessage = (e) => { const r = this.waiting.get(e.data.id); this.waiting.delete(e.data.id); r?.(e.data) }
      this.w.onerror = (e) => { for (const r of this.waiting.values()) r({ ok: false, error: e.message ?? 'the baker crashed' }); this.waiting.clear(); this.w = null }
    }
    const id = this.next++
    return new Promise((resolve) => {
      this.waiting.set(id, resolve)
      const copy = bytes.slice()
      this.w.postMessage({ id, url: b.url, kind, key, bytes: copy }, [copy.buffer])
    })
  }

  /**
   * Bake one source. { ok, files, meta, problems, baker, version, hash, cached } or { ok: false, error }.
   */
  async bake (kind, key, bytes) {
    const b = this.bakersFor(kind)[0]
    if (!b) return { ok: false, error: `nothing here bakes a ${kind}` }
    const hash = await sha256(bytes)
    const ck = `${hash}|${b.id}|${b.version}|${key}`
    const hit = await this.cache?.get(ck).catch(() => null)
    if (hit) return { ok: true, ...hit, baker: b.id, version: b.version, hash, cached: true }
    let r
    try { r = await this.run(b, kind, key, bytes) } catch (e) { r = { ok: false, error: String(e?.message ?? e) } }
    if (!r.ok) return { ok: false, error: r.error }
    if (r.version !== undefined && String(r.version) !== String(b.version)) return { ok: false, error: `the ${b.id} baker is version ${r.version}, but says ${b.version}` }
    const out = { files: r.files, meta: r.meta ?? null, problems: r.problems ?? [] }
    await this.cache?.put(ck, out).catch(() => {})
    return { ok: true, ...out, baker: b.id, version: b.version, hash, cached: false }
  }

  close () { this.w?.terminate(); this.w = null }
}
