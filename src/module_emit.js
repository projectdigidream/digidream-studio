//
// A whole module, as files, from the module document and its map documents.
//
// This is the one place that knows the layout of a module on disk
// (docs/MODULES.md) and what the studio adds to it:
//
//   module.txt                     name / id / about
//   module.studio.json             the module document (props, mobs, textures)
//   maps/<map>.studio.json         the map document -- THE source
//   maps/<map>.map                 generated, so a checkout can re-bake it
//   maps/<map>.dnpm                baked, what the server loads
//   maps/<map>.lua                 generated: placed things and triggers
//   maps/mobs.lua                  generated: the module's monsters (if any)
//   maps/*.lua                     mapc's copies of the runtime scripts
//   assets/props.txt               generated: bodies for the module's kinds
//   assets/textures/index.json     generated: sizes of every texture used
//   assets/textures/*.png          the module's own pictures
//   assets/sprites/*               the module's own sheets
//
// Every map declares, in order: the mob vocabulary and runtime, the module's
// mobs, the trigger vocabulary and runtime, the module's own scripts, and the
// map's own file. The runtime scripts are declared by the repository-relative
// path a checkout has them at, so the same .map bakes with desktop mapc.
//
import { normalize, derive } from './topology.js'
import { emitMap } from './mapfmt.js'
import { emitMapLua } from './lua_emit.js'
import { emitMobsLua, MOBS_FILE } from './mobs_emit.js'
import { emitProps } from './props_emit.js'
import { CAP } from './doc.js'

export const RUNTIME_SCRIPTS = ['mob_vocab.lua', 'mobs.lua', 'trigger_vocab.lua', 'triggers.lua']
// Where the runtime lives, as a map declares it: the engine's folder in the
// repository (engine/maps/scripts), and the same path in the virtual tree a
// bake here is given, so the two agree.
const RUNTIME_DIR = 'engine/maps/scripts'

export function newModule (id, name = id) {
  return {
    version: 1,
    id,
    name,
    about: '',
    propIdBase: 1000,
    props: [],
    mobs: { missiles: {}, mobs: {} },
    scripts: {},              // { 'name.lua': text } -- the module's own Lua, declared by every map
    textures: {},             // { NAME: { w, h, cutout } } -- pictures live as files beside this
    sprites: {}               // { SHEET: { image: 'SHEET.png' } } -- ThreeSprite manifests
  }
}

export function moduleTxt (module) {
  const L = [`name    ${module.name}`, `id      ${module.id}`]
  for (const line of (module.about ?? '').split('\n')) if (line.trim()) L.push(`about   ${line}`)
  return L.join('\n') + '\n'
}

/** The script declarations a map in this module carries, in order. */
/**
 * The key a map's music is filed under: its content hash, the trailing eight
 * bytes of the .dnpm, little-endian, as lowercase hex with no padding --
 * what the client's own `map.hash.toString(16)` produces when it looks the
 * track up (client/src/main.js, musicFor) and what tools/wad/music_all.js
 * writes for the DOOM soundtrack. A rebake changes it, which is why the
 * index is generated beside the bake rather than kept.
 */
export function musicKey (dnpm) {
  const b = dnpm instanceof Uint8Array ? dnpm : new Uint8Array(dnpm)
  if (b.byteLength < 8) throw new Error('not a baked map')
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(b.byteLength - 8, true).toString(16)
}

/**
 * assets/music/index.json: { mapKey: { cue: 'track.mstk' } } for every baked
 * map with cues (doc.music). `tracks` is the set of track names the module
 * holds, or null when unknown (the workstation tool); a cue naming a track
 * that is not there is a warning, and the entry is written anyway so the
 * game says which file it lacked.
 */
export function musicIndex (baked, tracks = null) {
  const index = {}
  const warnings = []
  for (const { doc, dnpm } of baked) {
    const cues = Object.entries(doc.music ?? {}).filter(([, track]) => track)
    if (!cues.length) continue
    const table = {}
    for (const [cue, track] of cues) {
      table[cue] = `${track}.mstk`
      if (tracks && !tracks.has(track)) warnings.push({ map: doc.name, msg: `cue '${cue}' names track '${track}', which is not in the module` })
    }
    if (!table.default) warnings.push({ map: doc.name, msg: `no cue called 'default': the game starts with that one (has ${Object.keys(table).join(', ')})` })
    index[musicKey(dnpm)] = table
  }
  return { index, warnings }
}

export function scriptDecls (module, hasMobs) {
  const decls = []
  decls.push(`../../../${RUNTIME_DIR}/mob_vocab.lua`, `../../../${RUNTIME_DIR}/mobs.lua`)
  if (hasMobs) decls.push(MOBS_FILE)
  decls.push(`../../../${RUNTIME_DIR}/trigger_vocab.lua`, `../../../${RUNTIME_DIR}/triggers.lua`)
  for (const name of Object.keys(module.scripts ?? {})) decls.push(`../scripts/${name}`)
  return decls
}

/**
 * Emit one map: the .map text, its Lua, and the bake.
 *
 * @param bake     studio/src/bake.js's bake()
 * @param runtime  { 'mobs.lua': text, ... } the four runtime scripts
 * @returns { ok, mapText, luaText, dnpm, copies, errors, warnings, emitted }
 */
export async function emitLevel (module, doc, { bake, runtime }) {
  normalize(doc)
  const derived = derive(doc)
  const mobsLua = emitMobsLua(module)
  const decls = scriptDecls(module, mobsLua !== null)
  const errors = []
  if (decls.length + 1 > CAP.scripts) {
    errors.push({ line: 0, msg: `a map can declare ${CAP.scripts} scripts and this module needs ${decls.length + 1}; remove a module script` })
  }
  const emitted = emitMap(derived, doc, [...decls, `${doc.name}.lua`])
  const lua = emitMapLua(doc, emitted)
  for (const p of lua.problems) errors.push({ line: 0, msg: p })
  if (errors.length) return { ok: false, mapText: emitted.text, luaText: lua.text, dnpm: null, copies: {}, errors, warnings: derived.warnings, emitted }

  const files = {}
  for (const name of RUNTIME_SCRIPTS) files[`${RUNTIME_DIR}/${name}`] = runtime[name]
  const mapsDir = `modules/${module.id}/maps`
  if (mobsLua !== null) files[`${mapsDir}/${MOBS_FILE}`] = mobsLua
  for (const [name, text] of Object.entries(module.scripts ?? {})) files[`modules/${module.id}/scripts/${name}`] = text
  files[`${mapsDir}/${doc.name}.lua`] = lua.text

  const r = await bake({ mapPath: `${mapsDir}/${doc.name}.map`, mapText: emitted.text, files })
  return { ok: r.ok, mapText: emitted.text, luaText: lua.text, dnpm: r.dnpm, copies: r.copies,
           errors: r.errors, warnings: derived.warnings, emitted, hash: r.hash }
}

/**
 * Every file of the module, ready to write or pack: [{ path, bytes }], with
 * paths relative to the module root.
 *
 * @param docs     the module's map documents
 * @param assets   { 'textures/NAME.png': Uint8Array, 'sprites/SPIR.json': ..., ... }
 * @param textureSizes  (name) => { w, h } | null, for index.json
 * @returns { ok, files, problems: [{ map, errors, warnings }] }
 */
export async function emitModule (module, docs, { bake, runtime, assets = {}, textureSizes = () => null }) {
  const files = []
  const problems = []
  const used = new Set()
  files.push({ path: 'module.txt', bytes: moduleTxt(module) })
  files.push({ path: 'module.studio.json', bytes: JSON.stringify(module, null, 2) })
  const props = emitProps(module)
  files.push({ path: 'assets/props.txt', bytes: props })
  const mobsLua = emitMobsLua(module)
  if (mobsLua !== null) files.push({ path: `maps/${MOBS_FILE}`, bytes: mobsLua })
  for (const [name, text] of Object.entries(module.scripts ?? {})) files.push({ path: `scripts/${name}`, bytes: text })

  let ok = true
  const baked = []
  for (const doc of docs) {
    const r = await emitLevel(module, doc, { bake, runtime })
    files.push({ path: `maps/${doc.name}.studio.json`, bytes: JSON.stringify(doc, null, 2) })
    files.push({ path: `maps/${doc.name}.map`, bytes: r.mapText })
    files.push({ path: `maps/${doc.name}.lua`, bytes: r.luaText })
    if (r.ok) {
      baked.push({ doc, dnpm: r.dnpm })
      files.push({ path: `maps/${doc.name}.dnpm`, bytes: r.dnpm })
      for (const [name, bytes] of Object.entries(r.copies)) {
        if (name === `${doc.name}.lua`) continue
        if (!files.some((f) => f.path === `maps/${name}`)) files.push({ path: `maps/${name}`, bytes })
      }
    } else ok = false
    if (r.errors.length || r.warnings.length) problems.push({ map: doc.name, errors: r.errors, warnings: r.warnings })
    for (const sid of doc.order) {
      const s = doc.sectors[sid]
      for (const t of [s.floorTex, s.ceilTex]) if (t) used.add(t)
      for (const v of s.verts) for (const t of [v.edge.middle, v.edge.upper, v.edge.lower]) if (t) used.add(t)
    }
  }

  const index = { sizes: {}, cutout: {} }
  for (const name of [...used].sort()) {
    const size = module.textures?.[name] ?? textureSizes(name)
    if (!size) continue
    index.sizes[name] = [size.w, size.h]
    if (size.cutout) index.cutout[name] = true
  }
  files.push({ path: 'assets/textures/index.json', bytes: JSON.stringify(index, null, 1) })
  // The soundtrack's table, keyed by the bakes just made. Only when a map has
  // music: an empty table would shadow another module's in a shell that
  // serves the first file it finds.
  const trackNames = Object.keys(assets).filter((p) => /^music\/[^/]+\.mstk$/.test(p)).map((p) => p.slice(6, -5))
  const music = musicIndex(baked, Object.keys(assets).length ? new Set(trackNames) : null)
  for (const w of music.warnings) problems.push({ map: w.map, errors: [], warnings: [{ sector: 'music', msg: w.msg }] })
  if (Object.keys(music.index).length) files.push({ path: 'assets/music/index.json', bytes: JSON.stringify(music.index, null, 1) })
  for (const [path, bytes] of Object.entries(assets)) files.push({ path: `assets/${path}`, bytes })
  return { ok, files, problems }
}
