//
// BAKING IN THE STUDIO: when a source changes, what the game loads is made
// from it again, and Play and Export make sure nothing is stale.
//
// The module keeps SOURCES (sources/textures/*.texproj.json, sources/sprites/
// *.tsprite, sources/music/*.msproj) and the files baked from them under their
// usual paths (textures/NAME.png, sprites/NAME.json + .png, music/NAME.mstk),
// so every page of the studio and the emitter go on reading what they always
// read. `module.baked[sourcePath]` says which bytes, which baker and which
// version made them: a source edited elsewhere (a pack imported, a git pull)
// or a newer baker shows up as stale and is baked again before Play.
//
import { Baker, BUILTIN_BAKERS } from './run.js'
import { bakeCache } from './cache.js'
import { SOURCES, sourcesIn } from '../plugins/kinds.js'
import { sheetRecord } from '../sheets.js'

const MIME = { png: 'image/png', json: 'application/json', mstk: 'application/octet-stream' }
const mimeOf = (path) => MIME[path.split('.').pop()] ?? 'application/octet-stream'

export function installBaking (S, { parseAtlas }) {
  // The studio's own bakers first, then the plugins'; for a kind, the first wins.
  const bakersFor = (kind) => [
    ...BUILTIN_BAKERS.filter((b) => b.kinds.includes(kind)),
    ...S.plugins.bakersFor(kind).map((x) => ({ id: `${x.plugin}/${x.baker.id}`, version: x.baker.version, url: new URL(x.url, location.href).href }))
  ]
  const canWork = typeof Worker === 'function'
  S.baker = new Baker({
    bakersFor,
    cache: bakeCache,
    worker: canWork ? () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) : null
  })

  /** Put what a bake made into the module: files, the module document, and the caches pages draw from. */
  function take (kind, key, r) {
    const assets = (S.rec.assets ??= {})
    for (const [path, bytes] of Object.entries(r.files)) assets[path] = new Blob([bytes], { type: mimeOf(path) })
    if (kind === 'file:texture') {
      const meta = (S.module.textures ??= {})[key] ?? {}
      const next = { ...meta, w: r.meta.w, h: r.meta.h }
      if (r.meta.sheet) next.sheet = r.meta.sheet; else delete next.sheet
      S.module.textures[key] = next
      const blob = assets[`textures/${key}.png`]
      if (S.imageUrls.has(key)) URL.revokeObjectURL(S.imageUrls.get(key))
      S.imageUrls.set(key, URL.createObjectURL(blob))
      S.textures?.forget(key)
    } else if (kind === 'file:tsprite') {
      const manifest = r.meta.manifest
      const atlas = parseAtlas(manifest, key)                     // the client's own check: throws on a bad sheet
      ;(S.module.sprites ??= {})[key] = { ...(S.module.sprites[key] ?? {}), ...sheetRecord(manifest) }
      const old = S.sheets.get(key)
      if (old) URL.revokeObjectURL(old.imageUrl)
      S.sheets.set(key, { atlas, imageUrl: URL.createObjectURL(assets[`sprites/${key}.png`]) })
      if (S.spriteUrls.has(key)) URL.revokeObjectURL(S.spriteUrls.get(key))
      S.spriteUrls.set(key, URL.createObjectURL(assets[`sprites/${key}.png`]))
      S.sprites?.forgetAll()
    } else if (kind === 'file:msproj') {
      const blob = assets[`music/${key}.mstk`]
      if (blob) {
        if (S.trackUrls.has(key)) URL.revokeObjectURL(S.trackUrls.get(key))
        S.trackUrls.set(key, URL.createObjectURL(blob))
      }
    }
    ;(S.module.baked ??= {})[SOURCES[kind].path(key)] = { hash: r.hash, baker: r.baker, version: r.version }
  }

  /**
   * Bake one source the record holds. { ok, said } or { ok: false, error }.
   * The caller makes it an undo step (S.moduleChanged); this only changes the record.
   */
  S.bakeSource = async (kind, key) => {
    const path = SOURCES[kind]?.path(key)
    const blob = path && S.rec.assets?.[path]
    if (!blob) return { ok: false, error: `no source for ${kind} ${key}` }
    const r = await S.baker.bake(kind, key, new Uint8Array(await blob.arrayBuffer()))
    if (!r.ok) return { ok: false, error: `${key} did not bake: ${r.error}` }
    try { take(kind, key, r) } catch (e) { return { ok: false, error: `${key} baked into something the game would not take: ${e.message ?? e}` } }
    for (const p of r.problems ?? []) console.warn(`[studio] bake ${key}:`, p)
    return { ok: true, said: `${key}${r.cached ? '' : ' (baked)'}` }
  }

  /** Which sources are not what their baked files were made from (or never were baked). */
  S.staleSources = async () => {
    const out = []
    for (const s of sourcesIn(S.rec.assets)) {
      const b = bakersFor(s.kind)[0]
      if (!b) { out.push({ ...s, why: 'nothing here bakes it' }); continue }
      const had = S.module.baked?.[s.path]
      if (!had || had.baker !== b.id || had.version !== b.version) { out.push({ ...s, why: had ? 'a newer baker' : 'never baked' }); continue }
      const bytes = new Uint8Array(await S.rec.assets[s.path].arrayBuffer())
      const { sha256 } = await import('./run.js')
      if (await sha256(bytes) !== had.hash) out.push({ ...s, why: 'changed' })
    }
    return out
  }

  /**
   * Before Play and Export: every stale source baked. { ok, baked, errors }.
   * Music is baked here too (an edit to a track does not bake it at once).
   */
  S.bakeAll = async () => {
    const stale = await S.staleSources()
    const errors = []
    let baked = 0
    for (const s of stale) {
      if (s.why === 'nothing here bakes it') { errors.push(`${s.path}: nothing in this studio bakes a ${S.docKinds[s.kind]?.label ?? s.kind} (is its plugin switched off?)`); continue }
      S.status?.(`baking ${s.key}…`)
      const r = await S.bakeSource(s.kind, s.key)
      if (r.ok) baked++; else errors.push(r.error)
    }
    if (baked) S.save?.()
    return { ok: errors.length === 0, baked, errors }
  }
}
