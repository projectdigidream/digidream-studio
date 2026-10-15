// A MODULE'S RECORD AND ITS FILES, both ways.
//
// The store keeps a module as one record ({ id, module, docs, assets }); a
// pack, the shells' game tree and a plugin that syncs the module elsewhere
// (GitHub) see it as files:
//
//   module.studio.json         the module document
//   maps/<name>.studio.json    each map document
//   assets/<path>              each picture, track, sheet the module owns
//   sources/<path>             each source a baker makes assets from
//
// recordFromEntries reads them; recordToEntries writes exactly those, and
// nothing baked: no .dnpm, no Lua, no generated bank or screens -- what a
// bake writes changes whenever the bake does, and would look like an edit on
// every sync. The same content gives the same bytes: JSON with its keys in
// order and two-space indent (diffs read line by line), the files in path
// order. recordFromEntries(recordToEntries(rec)) is rec again, and writing
// that out gives the same bytes again.
//
// Pure apart from Blob, which every page and Node have.

/**
 * What emitModule writes into assets/ from the documents, and must not be read
 * back as if it were the module's own: the merged sound bank, the screens.
 */
export function isGenerated (path) { return /^assets\/(sounds\/bank\.sfxproj|ui\/[^/]+\.json)$/.test(path) }

/** The engine's catalogues written beside the assets at every bake: not the module's own either. */
const isCatalogue = (path) => /(^|\/)(props\.txt|index\.json)$/.test(path)

/**
 * A store record from a module's files: module.studio.json, the map documents
 * and the pictures. Paths relative to the module root. Null when it is not a
 * studio module (no documents).
 */
export function recordFromEntries (entries) {
  const dec = new TextDecoder()
  const modEntry = entries.find((e) => e.path === 'module.studio.json')
  if (!modEntry) return null
  const module = JSON.parse(dec.decode(modEntry.bytes))
  const docs = {}
  const assets = {}
  for (const e of entries) {
    const m = /^maps\/(.+)\.studio\.json$/.exec(e.path)
    if (m) docs[m[1]] = JSON.parse(dec.decode(e.bytes))
    else if (e.path.startsWith('assets/') && !isCatalogue(e.path) && !isGenerated(e.path)) assets[e.path.slice(7)] = new Blob([e.bytes])
    // Sources (sound packs) are kept under their own path, as written.
    else if (e.path.startsWith('sources/')) assets[e.path] = new Blob([e.bytes])
  }
  return Object.keys(docs).length ? { id: module.id, module, docs, assets } : null
}

/** JSON with every object's keys in order, two-space indent, a final newline: one text per content. */
export function stableJson (value) {
  const order = (v) => {
    if (Array.isArray(v)) return v.map(order)
    if (v && typeof v === 'object') {
      const out = {}
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = order(v[k])
      return out
    }
    return v
  }
  return JSON.stringify(order(value), null, 2) + '\n'
}

/**
 * The files of a record: [{ path, bytes }] in path order -- what
 * recordFromEntries reads back as the same record. Nothing is baked, so a
 * module that does not bake still has its files.
 */
export async function recordToEntries (rec) {
  const enc = new TextEncoder()
  const out = [{ path: 'module.studio.json', bytes: enc.encode(stableJson(rec.module)) }]
  for (const [name, doc] of Object.entries(rec.docs ?? {})) out.push({ path: `maps/${name}.studio.json`, bytes: enc.encode(stableJson(doc)) })
  for (const [key, blob] of Object.entries(rec.assets ?? {})) {
    const path = key.startsWith('sources/') ? key : `assets/${key}`
    // What the reader would drop is not the module's: never written.
    if (!key.startsWith('sources/') && (isCatalogue(path) || isGenerated(path))) continue
    out.push({ path, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
